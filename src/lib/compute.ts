import type { CashTxn, ChildAsset, Child, Holding, Position, Quote, Trade } from './types'

/** 원/달러 환율 티커. 네이버 reutersCode 기준. */
export const FX_TICKER = 'FX_USDKRW'

/** 원화가 아닌 종목은 환율로 환산한다. 환율을 못 받았으면 0 처리해서 금액을 부풀리지 않는다. */
export function toKrw(amount: number, currency: string, quotes: Quote[]): number {
  if (currency === 'KRW') return amount
  const fx = quotes.find((q) => q.ticker === FX_TICKER)
  return fx ? amount * fx.price : 0
}

/**
 * 이 가족이 쓰는 종목 코드.
 *
 * quote 표에는 가족 구분이 없다 — 한 종목을 누가 한 번 받아오면 모두가 그 값을
 * 같이 쓰는 공용 캐시다 (시세는 어느 집에서나 같은 값이고, 한 번만 받는 게 맞다).
 *
 * 그래서 그 표를 그대로 늘어놓으면 **다른 집이 조회한 종목까지 다 보인다.**
 * 화면에는 우리 집이 지금 들고 있거나 한 번이라도 거래한 것만 보여준다.
 * 팔아서 지금은 없는 종목도 남긴다 — 다시 사고 싶을 수 있다.
 */
export function familyTickers(
  positions: Record<string, Position[]>,
  trades: Record<string, Trade[]>,
): Set<string> {
  const mine = new Set<string>()
  let foreign = false

  for (const list of Object.values(positions)) {
    for (const p of list) {
      mine.add(p.ticker)
      if (p.currency !== 'KRW') foreign = true
    }
  }
  for (const list of Object.values(trades)) {
    for (const t of list) {
      mine.add(t.ticker)
      // 네이버 reutersCode 는 국내가 숫자 6자리, 해외는 AAPL.O 처럼 점이 들어간다
      if (t.ticker.includes('.')) foreign = true
    }
  }

  // 해외 종목이 있으면 환율도 우리 것이다. 원화 환산에 쓰니 화면에 보여야 한다.
  if (foreign) mine.add(FX_TICKER)
  return mine
}

export function cashBalance(txns: CashTxn[]): number {
  return txns.reduce((sum, t) => sum + (t.direction === 'in' ? t.amount : -t.amount), 0)
}

/**
 * 이번 달 **모은 돈**. 넣은 돈에서 쓴 돈을 뺀 값이다.
 *
 * 주식을 사서 나간 돈은 빼지 않는다. 그건 쓴 게 아니라 현금 주머니에서 투자 주머니로
 * 옮긴 것이고, 총자산은 그대로다. 빼면 "용돈 40만 받고 주식 25만 샀는데 이번달 모은 돈이
 * 15만" 처럼 나와서, 아이 눈에는 돈을 써버린 것처럼 읽힌다. 실제로 그렇게 나왔다.
 *
 * 매매로 생긴 현금 기록은 trade_id 를 갖고 있으니 그것만 걸러내면 된다.
 * 월별 차트(history.ts)도 같은 규칙으로 그린다.
 */
export function monthlyChange(txns: CashTxn[], now = new Date()): number {
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return txns
    .filter((t) => t.occurred_on.startsWith(prefix) && !t.trade_id)
    .reduce((sum, t) => sum + (t.direction === 'in' ? t.amount : -t.amount), 0)
}

/** 보유 종목 + 시세 → 화면용 포지션. 비중은 이 아이의 투자 평가금액 기준. */
export function buildPositions(holdings: Holding[], quotes: Quote[]): Position[] {
  const rows = holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const q = quotes.find((x) => x.ticker === h.ticker)
      // 시세를 모르는 종목은 매입가로 본다. 0 으로 두면 보유가 자산에서 사라져서
      // 현금만 줄어든 것처럼 보인다 — 원금이 없어진 것처럼 읽히는 게 더 나쁘다.
      const price = q?.price ?? h.avg_price
      const currency = q?.currency ?? 'KRW'
      const value = toKrw(h.quantity * price, currency, quotes)
      const cost = toKrw(h.quantity * h.avg_price, currency, quotes)
      const pnl = value - cost
      return {
        ticker: h.ticker,
        name: h.name,
        quantity: h.quantity,
        avgPrice: h.avg_price,
        price,
        currency,
        asOf: q?.as_of ?? '',
        value,
        cost,
        pnl,
        pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
        weight: 0,
      }
    })

  const total = rows.reduce((s, r) => s + r.value, 0)
  for (const r of rows) {
    r.weight = total > 0 ? (r.value / total) * 100 : 0
  }
  return rows.sort((a, b) => b.value - a.value)
}

export function assetOf(
  child: Child,
  txns: CashTxn[],
  positions: Position[],
): ChildAsset {
  const cash = cashBalance(txns)
  const invest = positions.reduce((s, p) => s + p.value, 0)
  const cost = positions.reduce((s, p) => s + p.cost, 0)
  return {
    child_id: child.id,
    name: child.name,
    cash,
    invest: Math.round(invest),
    invest_cost: Math.round(cost),
    total: cash + Math.round(invest),
    pnl: Math.round(invest - cost),
  }
}

/** 현금 비중 (0~100). 총자산이 0이면 100으로 둔다. */
export function cashWeight(asset: ChildAsset): number {
  if (asset.total <= 0) return 100
  return (asset.cash / asset.total) * 100
}

export function pnlPct(asset: ChildAsset): number {
  return asset.invest_cost > 0 ? (asset.pnl / asset.invest_cost) * 100 : 0
}

/** 목표 진행률 (0~100). basis 에 따라 현금 또는 총자산을 기준으로 한다. */
export function goalProgress(
  target: number,
  basis: 'cash' | 'total',
  asset: ChildAsset,
): number {
  const have = basis === 'cash' ? asset.cash : asset.total
  if (target <= 0) return 0
  return Math.min((have / target) * 100, 100)
}

/**
 * 목표까지 남은 주 수. 주간 용돈으로만 모을 때의 추정치.
 * 용돈이 0이면 계산할 수 없으므로 null.
 */
export function weeksToGoal(
  target: number,
  basis: 'cash' | 'total',
  asset: ChildAsset,
  weeklyAllowance: number,
): number | null {
  if (weeklyAllowance <= 0) return null
  const have = basis === 'cash' ? asset.cash : asset.total
  const remain = target - have
  if (remain <= 0) return 0
  return Math.ceil(remain / weeklyAllowance)
}
