import type { CashTxn, Child, Goal, Holding, Reward, Settings, Stamp, Trade } from './types'

/**
 * 백업 — 지금 보이는 기록을 파일로 내려받는다.
 *
 * 서버가 죽거나 계정을 잃어도 아이의 3년치 통장이 남아 있어야 한다. 그래서
 * **화면에 이미 불려온 데이터로** 파일을 만든다. 따로 서버를 부르지 않으니
 * 지하철에서도 되고, 권한 문제로 실패할 일도 없다.
 *
 * 두 가지를 만든다.
 *   · CSV  — 엑셀에서 바로 열어 보는 용도. 사람이 읽는다.
 *   · JSON — 되돌릴 때 쓰는 용도. 빠진 값이 없다.
 *
 * 핸드폰에서는 '공유' 로 내보낸다. 사파리·크롬 모두 파일 공유를 지원하면
 * 카카오톡·드라이브·파일앱 어디로든 보낼 수 있다. 안 되면 그냥 내려받는다.
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

const CSV_HEADER = [
  '아이',
  '날짜',
  '종류',
  '구분',
  '금액',
  '종목',
  '수량',
  '단가',
  '분류',
  '메모',
  '주식거래연동',
]

/** 엑셀은 큰따옴표만 알아본다. 안에 들어 있는 따옴표는 두 번 적는다. */
function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(',')
}

/**
 * 거래내역 CSV.
 *
 * 입출금과 매매를 한 표에 날짜순으로 담는다. 파일이 둘로 나뉘면 핸드폰에서
 * 관리하기 번거롭다.
 *
 * 주식을 산 돈은 입출금에도 한 줄, 매매에도 한 줄 남는다 — 같은 돈이 두 번
 * 보이는 게 아니라, 통장에서 나간 기록과 무엇을 샀는지의 기록이다.
 * 헷갈리지 않게 마지막 칸에 표시해 둔다.
 */
export function buildCsv(input: BackupInput): string {
  const nameOf = new Map(input.children.map((c) => [c.id, c.name]))
  const lines: { key: string; text: string }[] = []

  for (const [childId, list] of Object.entries(input.cash)) {
    for (const t of list) {
      lines.push({
        key: `${t.occurred_on}-0`,
        text: row([
          nameOf.get(childId) ?? childId,
          t.occurred_on,
          '입출금',
          t.direction === 'in' ? '입금' : '출금',
          t.amount,
          '',
          '',
          '',
          t.category,
          t.memo,
          t.trade_id ? '예' : '아니오',
        ]),
      })
    }
  }

  for (const [childId, list] of Object.entries(input.trades)) {
    for (const t of list) {
      lines.push({
        key: `${t.occurred_on}-1`,
        text: row([
          nameOf.get(childId) ?? childId,
          t.occurred_on,
          '매매',
          t.direction === 'buy' ? '매수' : '매도',
          '',
          t.name,
          t.quantity,
          t.price,
          t.ticker,
          t.fee ? `수수료 ${t.fee}` : '',
          '예',
        ]),
      })
    }
  }

  lines.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

  // 앞의 ﻿ 는 엑셀이 한글을 깨지 않고 읽게 하는 표시(BOM)다. 빼면 안 된다.
  const body = lines.map((l) => `${l.text}\n`).join('')
  return `﻿${CSV_HEADER.join(',')}\n${body}`
}

/** 전체 백업 JSON. 되돌릴 때 필요한 값을 하나도 빼지 않는다. */
export function buildJson(input: BackupInput): string {
  return JSON.stringify(
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
}

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
export async function saveTextFile(
  filename: string,
  mime: string,
  text: string,
): Promise<SaveResult> {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
  }
  if (typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], filename, { type: mime })
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
