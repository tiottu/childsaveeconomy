import { buildXlsx, XLSX_MIME, type SheetSpec } from './xlsx'
import type { CashTxn, Child, Goal, Holding, Reward, Settings, Stamp, Trade } from './types'

/**
 * 백업 — 지금 보이는 기록을 파일로 남긴다.
 *
 * 서버가 죽거나 계정을 잃어도 아이의 3년치 통장이 남아 있어야 한다. 그래서
 * **화면에 이미 불려온 데이터로** 파일을 만든다. 따로 서버를 부르지 않으니
 * 지하철에서도 되고, 권한 문제로 실패할 일도 없다.
 *
 * 두 가지를 만든다.
 *   · 엑셀(.xlsx) — 사람이 읽는 용도. 핸드폰에서도 눌러서 바로 열린다.
 *   · JSON        — 되돌릴 때 쓰는 용도. 빠진 값이 하나도 없다.
 *
 * 처음에는 엑셀 대신 CSV 를 내보냈는데, 카카오톡으로 보내면 열리지 않았다.
 * 카톡·핸드폰 엑셀은 .csv 를 문서로 다루지 않는다. 그래서 진짜 엑셀 파일을 만든다.
 */

export type BackupInput = {
  children: Child[]
  cash: Record<string, CashTxn[]>
  trades: Record<string, Trade[]>
  holdings?: Record<string, Holding[]>
  goals: Goal[]
  stamps: Stamp[]
  rewards: Reward[]
  settings: Settings
}

const TXN_COLUMNS: SheetSpec['columns'] = [
  { header: '아이', width: 8, kind: 'text' },
  { header: '날짜', width: 12, kind: 'text' },
  { header: '종류', width: 8, kind: 'text' },
  { header: '구분', width: 7, kind: 'text' },
  { header: '금액', width: 12, kind: 'money' },
  { header: '종목', width: 12, kind: 'text' },
  { header: '수량', width: 7, kind: 'number' },
  { header: '단가', width: 12, kind: 'money' },
  { header: '분류', width: 10, kind: 'text' },
  { header: '메모', width: 28, kind: 'text' },
  { header: '주식거래', width: 9, kind: 'text' },
]

/**
 * 거래내역 시트.
 *
 * 입출금과 매매를 한 표에 날짜순으로 담는다. 시트를 둘로 나누면 "이 돈이
 * 어디로 갔나" 를 볼 때 두 장을 번갈아 봐야 한다.
 *
 * 주식을 산 돈은 입출금에도 한 줄, 매매에도 한 줄 남는다 — 같은 돈이 두 번
 * 나온 게 아니라, 통장에서 나간 기록과 무엇을 샀는지의 기록이다. 헷갈리지 않게
 * 마지막 칸에 표시해 둔다.
 */
function txnSheet(input: BackupInput): SheetSpec {
  const nameOf = new Map(input.children.map((c) => [c.id, c.name]))
  const rows: { key: string; row: (string | number | null)[] }[] = []

  for (const [childId, list] of Object.entries(input.cash)) {
    for (const t of list) {
      rows.push({
        key: `${t.occurred_on}-0`,
        row: [
          nameOf.get(childId) ?? childId,
          t.occurred_on,
          '입출금',
          t.direction === 'in' ? '입금' : '출금',
          t.amount,
          null,
          null,
          null,
          t.category,
          t.memo,
          t.trade_id ? '연동' : null,
        ],
      })
    }
  }

  for (const [childId, list] of Object.entries(input.trades)) {
    for (const t of list) {
      rows.push({
        key: `${t.occurred_on}-1`,
        row: [
          nameOf.get(childId) ?? childId,
          t.occurred_on,
          '매매',
          t.direction === 'buy' ? '매수' : '매도',
          null,
          t.name,
          t.quantity,
          t.price,
          t.ticker,
          t.fee ? `수수료 ${t.fee}원` : null,
          '연동',
        ],
      })
    }
  }

  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { name: '거래내역', columns: TXN_COLUMNS, rows: rows.map((r) => r.row) }
}

function holdingSheet(input: BackupInput): SheetSpec {
  const nameOf = new Map(input.children.map((c) => [c.id, c.name]))
  const rows: (string | number | null)[][] = []
  for (const [childId, list] of Object.entries(input.holdings ?? {})) {
    for (const h of list) {
      rows.push([
        nameOf.get(childId) ?? childId,
        h.name,
        h.ticker,
        h.quantity,
        h.avg_price,
        Math.round(h.quantity * h.avg_price),
      ])
    }
  }
  return {
    name: '보유종목',
    columns: [
      { header: '아이', width: 8, kind: 'text' },
      { header: '종목', width: 14, kind: 'text' },
      { header: '코드', width: 12, kind: 'text' },
      { header: '수량', width: 8, kind: 'number' },
      { header: '평균단가', width: 12, kind: 'money' },
      { header: '매입금액', width: 14, kind: 'money' },
    ],
    rows,
  }
}

function stampSheet(input: BackupInput): SheetSpec {
  const nameOf = new Map(input.children.map((c) => [c.id, c.name]))
  const label: Record<Stamp['status'], string> = {
    requested: '기다림',
    given: '받음',
    rejected: '다음에',
    used: '보상으로 바꿈',
  }
  const rows: (string | number | null)[][] = [
    ...input.stamps.map((s) => [
      nameOf.get(s.child_id) ?? s.child_id,
      s.created_at.slice(0, 10),
      '칭찬도장',
      s.reason,
      label[s.status],
      s.asked_by === 'child' ? '아이 신청' : '부모가 찍음',
    ]),
    ...input.rewards.map((r) => [
      nameOf.get(r.child_id) ?? r.child_id,
      r.created_at.slice(0, 10),
      '보상',
      r.title,
      `도장 ${r.stamps}개`,
      null,
    ]),
  ]
  rows.sort((a, b) => (String(a[1]) < String(b[1]) ? -1 : 1))
  return {
    name: '칭찬도장',
    columns: [
      { header: '아이', width: 8, kind: 'text' },
      { header: '날짜', width: 12, kind: 'text' },
      { header: '종류', width: 10, kind: 'text' },
      { header: '내용', width: 30, kind: 'text' },
      { header: '상태', width: 14, kind: 'text' },
      { header: '누가', width: 12, kind: 'text' },
    ],
    rows,
  }
}

function goalSheet(input: BackupInput): SheetSpec {
  const nameOf = new Map(input.children.map((c) => [c.id, c.name]))
  const label: Record<Goal['status'], string> = {
    requested: '신청 중',
    active: '진행 중',
    achieved: '달성',
    canceled: '내림',
  }
  return {
    name: '목표',
    columns: [
      { header: '아이', width: 8, kind: 'text' },
      { header: '목표', width: 24, kind: 'text' },
      { header: '금액', width: 12, kind: 'money' },
      { header: '기준', width: 10, kind: 'text' },
      { header: '상태', width: 10, kind: 'text' },
    ],
    rows: input.goals.map((g) => [
      nameOf.get(g.child_id) ?? g.child_id,
      g.title,
      g.target_amount,
      g.basis === 'cash' ? '현금' : '총자산',
      label[g.status],
    ]),
  }
}

/** 엑셀 파일. 거래내역·보유종목·칭찬도장·목표 네 장이다. */
export function buildWorkbook(input: BackupInput): Blob {
  return buildXlsx([txnSheet(input), holdingSheet(input), stampSheet(input), goalSheet(input)])
}

/** 전체 백업 JSON. 되돌릴 때 필요한 값을 하나도 빼지 않는다. */
export function buildJsonBlob(input: BackupInput): Blob {
  const text = JSON.stringify(
    {
      app: '우리아이통장관리',
      format: 1,
      exported_at: new Date().toISOString(),
      children: input.children,
      cash: input.cash,
      trades: input.trades,
      holdings: input.holdings ?? {},
      goals: input.goals,
      stamps: input.stamps,
      rewards: input.rewards,
      settings: input.settings,
    },
    null,
    2,
  )
  return new Blob([text], { type: 'application/json;charset=utf-8' })
}

export { XLSX_MIME }

/** 파일 이름에 넣을 오늘 날짜 (20260916) */
export function stamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
}

export type SaveResult = 'shared' | 'downloaded' | 'canceled'

/**
 * 파일을 핸드폰에 남긴다.
 *
 * 핸드폰에서 a[download] 만 쓰면 파일이 어디로 갔는지 찾기 어렵다. 공유 시트를
 * 띄우면 사용자가 직접 둘 곳을 고른다. 공유를 지원하지 않는 브라우저(데스크톱
 * 사파리 등)에서는 내려받기로 돌아간다.
 */
export async function saveFile(filename: string, blob: Blob): Promise<SaveResult> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
  }
  if (typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], filename, { type: blob.type })
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename })
        return 'shared'
      } catch (e) {
        // 사용자가 공유 시트를 닫은 것은 실패가 아니다. 성공했다고 말하지도 않는다.
        if (e instanceof Error && e.name === 'AbortError') return 'canceled'
        // 그 밖의 오류는 내려받기로 시도해 본다
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // 곧바로 해제하면 내려받기가 취소되는 브라우저가 있다
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
