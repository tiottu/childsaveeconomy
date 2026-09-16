export type Role = 'parent' | 'child'

/** 로그인 후의 앱 모드. 부모는 전체, 아이는 자기 계좌만. */
export type Mode =
  | { kind: 'parent' }
  | { kind: 'child'; childId: string }

export type Child = {
  id: string
  name: string
  birth_year: number | null
  weekly_allowance: number
  payday: number
  sort_order: number
}

export type CashTxn = {
  id: string
  child_id: string
  direction: 'in' | 'out'
  amount: number
  category: string | null
  memo: string | null
  occurred_on: string
  trade_id: string | null
}

export type Trade = {
  id: string
  child_id: string
  direction: 'buy' | 'sell'
  ticker: string
  name: string
  quantity: number
  price: number
  fee: number
  occurred_on: string
}

export type Holding = {
  child_id: string
  ticker: string
  name: string
  quantity: number
  avg_price: number
}

export type Quote = {
  ticker: string
  name: string | null
  price: number
  prev_close: number | null
  change_pct: number | null
  currency: string
  as_of: string
  source: 'api' | 'manual'
}

export type Goal = {
  id: string
  child_id: string
  title: string
  target_amount: number
  basis: 'cash' | 'total'
  status: 'requested' | 'active' | 'achieved' | 'canceled'
}

export type Settings = {
  interest_rate: number
  interest_cycle: 'monthly' | 'quarterly' | 'yearly'
  quote_refresh_min: number
  invest_cap_pct: number
  dividend_to_cash: boolean
  /** 보상 하나에 필요한 칭찬도장 수 */
  stamp_goal: number
}

/**
 * 칭찬도장.
 *
 * requested : 아이가 신청했고 부모를 기다린다
 * given     : 도장판에 붙어 있다
 * rejected  : 부모가 이번엔 아니라고 했다
 * used      : 보상으로 바꿔 썼다
 */
export type Stamp = {
  id: string
  child_id: string
  reason: string | null
  status: 'requested' | 'given' | 'rejected' | 'used'
  asked_by: 'child' | 'parent'
  created_at: string
  decided_at: string | null
}

export type Reward = {
  id: string
  child_id: string
  title: string
  /** 그때 도장 몇 개로 받았는지 */
  stamps: number
  created_at: string
}

/** child_asset 뷰. 홈 화면은 이것만 있으면 그려진다. */
export type ChildAsset = {
  child_id: string
  name: string
  cash: number
  invest: number
  invest_cost: number
  total: number
  pnl: number
}

/** 보유 종목 + 시세를 합친 화면용 형태 */
export type Position = {
  ticker: string
  name: string
  quantity: number
  avgPrice: number
  price: number
  currency: string
  asOf: string
  /** 원화 환산 평가금액 */
  value: number
  /** 원화 환산 매입금액 */
  cost: number
  pnl: number
  pnlPct: number
  /** 이 아이의 투자 평가금액 중 비중 (0~100) */
  weight: number
}

export type NewCashTxn = {
  child_id: string
  direction: 'in' | 'out'
  amount: number
  category: string | null
  memo: string | null
  occurred_on: string
}

export type NewTrade = {
  child_id: string
  direction: 'buy' | 'sell'
  ticker: string
  name: string
  quantity: number
  /** 단가. 종목의 거래 통화 기준 (미국 종목이면 USD) */
  price: number
  /** 수수료. 원화 */
  fee: number
  /**
   * 원화 환산 환율. 국내 종목은 1, 미국 종목은 원/달러.
   * 현금 통장에서 빠지는 금액은 언제나 원화이므로 이 값이 필요하다.
   */
  fx: number
  occurred_on: string
}
