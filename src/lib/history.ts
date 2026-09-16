import type { CashTxn, Trade } from './types'

/**
 * 월별 자산 추이.
 *
 * 과거 시세를 보관하지 않으므로 "그 달의 평가금액" 은 만들 수 없다.
 * 대신 **모은 돈** 을 그린다 — 가족이 넣은 돈에서 쓴 돈을 뺀 값이다.
 *
 *   현금  = 현금 잔액 (매매로 나간 돈은 여기서 빠져 있다)
 *   투자  = 매수 금액 합 − 매도 금액 합 (원가 기준)
 *   합계  = 현금 + 투자 = 입금 − 지출
 *
 * 매수·매도는 두 주머니 사이의 이동이라 합계에서 상쇄된다. 그래서 막대의 총높이는
 * "실제로 모은 돈" 이 되고, 주식값이 오르내려도 흔들리지 않는다.
 * 평가손익은 지금 시점 값만 따로 보여준다 (홈 화면).
 *
 * 아이에게 보여줄 그래프로 이게 맞다. 시세 등락이 섞이면
 * "열심히 모았는데 그래프가 내려간" 날이 생긴다.
 */

export type MonthPoint = {
  /** 'YYYY-MM' */
  month: string
  /** 화면 표시용 '9월' */
  label: string
  cash: number
  invest: number
  total: number
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string): string {
  const m = Number(key.split('-')[1])
  return `${m}월`
}

/**
 * 거래 이력을 월별 누적으로 바꾼다.
 *
 * @param maxMonths 최근 몇 달까지 보여줄지. 좁은 화면에서 막대가 뭉개지지 않게 자른다.
 */
export function monthlyHistory(
  cash: CashTxn[],
  trades: Trade[],
  maxMonths = 12,
  now = new Date(),
): MonthPoint[] {
  if (cash.length === 0 && trades.length === 0) return []

  const dates = [
    ...cash.map((t) => t.occurred_on),
    ...trades.map((t) => t.occurred_on),
  ].filter(Boolean)
  if (dates.length === 0) return []

  const firstKey = monthKey(dates.reduce((a, b) => (a < b ? a : b)))
  const lastKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // 첫 거래부터 이번 달까지의 월 목록
  const keys: string[] = []
  let k = firstKey
  while (k <= lastKey && keys.length < 600) {
    keys.push(k)
    k = addMonths(k, 1)
  }
  const window = keys.slice(-maxMonths)

  // 월별 증감을 먼저 모은 뒤 누적한다
  const cashDelta = new Map<string, number>()
  const investDelta = new Map<string, number>()

  for (const t of cash) {
    const key = monthKey(t.occurred_on)
    const v = t.direction === 'in' ? t.amount : -t.amount
    cashDelta.set(key, (cashDelta.get(key) ?? 0) + v)
  }
  for (const t of trades) {
    const key = monthKey(t.occurred_on)
    // 매수하면 현금이 투자로 옮겨가고, 매도하면 돌아온다.
    // 현금 쪽 증감은 cash_txn 에 이미 들어 있으므로 여기서는 투자만 다룬다.
    const amount = Math.round(t.quantity * t.price)
    const v = t.direction === 'buy' ? amount + t.fee : -(amount - t.fee)
    investDelta.set(key, (investDelta.get(key) ?? 0) + v)
  }

  let cashSum = 0
  let investSum = 0
  const out: MonthPoint[] = []

  for (const key of keys) {
    cashSum += cashDelta.get(key) ?? 0
    investSum += investDelta.get(key) ?? 0
    if (!window.includes(key)) continue
    out.push({
      month: key,
      label: monthLabel(key),
      cash: Math.max(0, Math.round(cashSum)),
      invest: Math.max(0, Math.round(investSum)),
      total: Math.max(0, Math.round(cashSum + investSum)),
    })
  }

  return out
}

/** 처음 달과 마지막 달을 비교해 얼마나 늘었는지 */
export function growth(points: MonthPoint[]): { amount: number; pct: number } | null {
  if (points.length < 2) return null
  const first = points[0].total
  const last = points[points.length - 1].total
  const amount = last - first
  return { amount, pct: first > 0 ? (amount / first) * 100 : 0 }
}
