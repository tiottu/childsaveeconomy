import type {
  CashTxn,
  Child,
  ChildAsset,
  Goal,
  NewCashTxn,
  NewTrade,
  Position,
  Quote,
  Reward,
  Settings,
  Stamp,
  Trade,
} from './types'

/**
 * 데이터 접근 계층.
 *
 * 구현이 두 개다.
 *  - mockDb      : localStorage. Supabase 설정 없이도 앱이 돌아간다.
 *  - supabaseDb  : 실제 클라우드 동기화.
 *
 * .env 에 VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 가 있으면 supabaseDb 를 쓴다.
 * 화면 코드는 어느 쪽인지 알 필요가 없다.
 */
export type Db = {
  readonly kind: 'mock' | 'supabase'

  listChildren(): Promise<Child[]>
  listAssets(): Promise<ChildAsset[]>
  listCashTxns(childId: string): Promise<CashTxn[]>
  listPositions(childId: string): Promise<Position[]>
  listTrades(childId: string, ticker?: string): Promise<Trade[]>
  listGoals(childId?: string): Promise<Goal[]>
  listQuotes(): Promise<Quote[]>
  getSettings(): Promise<Settings>

  /** 아이를 등록한다. 등록된 아이의 id 를 돌려준다. */
  addChild(input: {
    name: string
    birth_year: number | null
    weekly_allowance: number
    payday: number
  }): Promise<string>
  updateChild(id: string, patch: Partial<Omit<Child, 'id'>>): Promise<void>

  addCashTxn(txn: NewCashTxn): Promise<void>
  /**
   * 현금 거래 수정.
   * 매매로 생긴 행은 금액·방향을 바꿀 수 없다 (주식 기록과 어긋난다).
   */
  updateCashTxn(id: string, patch: NewCashTxn): Promise<void>
  /** 현금 거래 삭제. 매매로 생긴 행은 매매 쪽에서 지워야 한다. */
  deleteCashTxn(id: string): Promise<void>

  /** 매매 + 현금 거래 + 평균단가 재계산을 한 번에. 실패하면 아무것도 바뀌지 않는다. */
  applyTrade(trade: NewTrade): Promise<void>
  /** 매매 삭제. 연결된 현금 거래도 사라지고 보유 수량·평균단가를 다시 계산한다. */
  deleteTrade(id: string): Promise<void>
  addGoal(goal: { child_id: string; title: string; target_amount: number; basis: 'cash' | 'total'; status: Goal['status'] }): Promise<void>
  setGoalStatus(id: string, status: Goal['status']): Promise<void>

  // ---------------------------------------------------------------- 칭찬도장
  listStamps(childId?: string): Promise<Stamp[]>
  listRewards(childId?: string): Promise<Reward[]>
  /** 부모가 바로 찍어준다 */
  giveStamp(childId: string, reason: string | null): Promise<void>
  /** 아이가 신청한다. 부모 승인을 기다린다. */
  requestStamp(childId: string, reason: string): Promise<void>
  /** 신청을 승인하거나 돌려보낸다 */
  decideStamp(id: string, approve: boolean): Promise<void>
  /** 잘못 찍은 도장이나 신청을 지운다 */
  deleteStamp(id: string): Promise<void>
  /**
   * 모인 도장을 보상으로 바꾼다. 오래된 것부터 쓴다.
   * 도장 소진과 보상 기록이 함께 일어나야 하므로 한 번에 처리한다.
   */
  redeemStamps(childId: string, title: string): Promise<void>
  setManualQuote(ticker: string, name: string, price: number): Promise<void>
  /** 시세 서버에서 받아온 값을 저장한다. 평가금액 계산이 최신 값을 쓰게 된다. */
  saveQuote(quote: Quote): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>

  /** 데이터가 바뀌면 콜백을 부른다. 해제 함수를 돌려준다. */
  subscribe(onChange: () => void): () => void
}

import { hasSupabaseConfig } from './config'

export { hasSupabaseConfig }

let cached: Db | null = null

export async function getDb(): Promise<Db> {
  if (cached) return cached

  if (hasSupabaseConfig) {
    const { createSupabaseDb } = await import('./supabaseDb')
    cached = createSupabaseDb()
  } else {
    const { createMockDb } = await import('./mockDb')
    cached = createMockDb()
  }
  return cached
}
