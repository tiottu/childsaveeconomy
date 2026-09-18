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
  /** 아이가 고른 엠블럼. 안 골랐으면 null — 이름으로 하나 정해서 보여준다. */
  emblem: string | null
  /**
   * 보상으로 받고 싶은 것. 아이가 칭찬도장 화면에서 직접 적는다.
   * 부모가 보상을 줄 때 이 값을 그대로 쓰거나 참고해서 정한다.
   */
  reward_wish: string | null
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

/**
 * 아이가 올린 매매 신청.
 *
 * 아이는 사고 싶다/팔고 싶다까지만 할 수 있다. **부모가 승인해야 실제 거래가 된다.**
 * 승인되면 trade 한 줄과 현금 기록이 만들어지고 trade_id 가 채워진다.
 *
 * price 는 아이가 신청할 때 화면에 보였던 값이다. 승인 시점의 시세와 다를 수 있어
 * 부모가 고쳐서 승인할 수 있다.
 */
export type TradeRequest = {
  id: string
  child_id: string
  direction: 'buy' | 'sell'
  ticker: string
  name: string
  quantity: number
  price: number
  /** 원화 환산 환율. 국내 종목은 1 */
  fx: number
  /** 아이가 적은 이유 */
  reason: string | null
  status: 'requested' | 'approved' | 'rejected' | 'canceled'
  trade_id: string | null
  created_at: string
  decided_at: string | null
}

export type NewTradeRequest = {
  child_id: string
  direction: 'buy' | 'sell'
  ticker: string
  name: string
  quantity: number
  price: number
  fx: number
  reason: string | null
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
  /**
   * 목표까지 필요한 값. basis 가 'stamps' 면 원이 아니라 도장 개수다.
   * 같은 칸을 재사용한다 — 어차피 정수라 둘 다 담을 수 있고, 표만 하나 더 늘리는 건
   * basis 하나 늘리는 것보다 훨씬 큰 변경이다.
   */
  target_amount: number
  /**
   * 'cash'/'total' : 돈 목표 — 현금 또는 총자산과 비교한다.
   * 'stamps'       : 칭찬도장 목표 — 지금까지 받은 도장 총합(레벨 계산과 같은 수)과 비교한다.
   *                  보상으로 도장을 써도(redeem) 이 목표는 줄지 않는다 — 그때그때 받는
   *                  작은 보상과, 오래 모아서 이루는 큰 목표를 같은 숫자로 묶으면 안 된다.
   */
  basis: 'cash' | 'total' | 'stamps'
  status: 'requested' | 'active' | 'achieved' | 'canceled'
}

export type Settings = {
  interest_rate: number
  interest_cycle: 'monthly' | 'quarterly' | 'yearly'
  quote_refresh_min: number
  invest_cap_pct: number
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
