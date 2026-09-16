import { buildPositions } from './compute'
import { supabase } from './supabaseClient'
import type { Db } from './db'
import type {
  CashTxn,
  Child,
  ChildAsset,
  Goal,
  Holding,
  NewCashTxn,
  NewTrade,
  Quote,
  Settings,
  Trade,
} from './types'

/** 실시간 구독 대상. 하나라도 바뀌면 화면을 다시 읽는다. */
const WATCHED = ['cash_txn', 'trade', 'holding', 'quote', 'goal', 'child'] as const

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}

export function createSupabaseDb(): Db {
  const maybe = supabase()
  if (!maybe) throw new Error('Supabase 설정이 없습니다')
  const sb = maybe

  async function quotes(): Promise<Quote[]> {
    return unwrap<Quote[]>(await sb.from('quote').select('*'))
  }

  return {
    kind: 'supabase',

    async listChildren() {
      return unwrap<Child[]>(
        await sb.from('child').select('*').order('sort_order', { ascending: true }),
      )
    },

    async listAssets() {
      // child_asset 뷰가 현금·투자·평가손익을 이미 계산해서 준다
      return unwrap<ChildAsset[]>(
        await sb
          .from('child_asset')
          .select('child_id, name, cash, invest, invest_cost, total, pnl'),
      )
    },

    async listCashTxns(childId) {
      return unwrap<CashTxn[]>(
        await sb
          .from('cash_txn')
          .select('*')
          .eq('child_id', childId)
          .order('occurred_on', { ascending: false })
          .order('created_at', { ascending: false }),
      )
    },

    async listPositions(childId) {
      const [holdings, qs] = await Promise.all([
        unwrap<Holding[]>(await sb.from('holding').select('*').eq('child_id', childId)),
        quotes(),
      ])
      return buildPositions(holdings, qs)
    },

    async listTrades(childId, ticker) {
      let q = sb.from('trade').select('*').eq('child_id', childId)
      if (ticker) q = q.eq('ticker', ticker)
      return unwrap<Trade[]>(await q.order('occurred_on', { ascending: false }))
    },

    async listGoals(childId) {
      let q = sb.from('goal').select('*')
      if (childId) q = q.eq('child_id', childId)
      return unwrap<Goal[]>(await q.order('created_at', { ascending: true }))
    },

    listQuotes: quotes,

    async getSettings() {
      const rows = unwrap<Settings[]>(
        await sb
          .from('settings')
          .select('interest_rate, interest_cycle, quote_refresh_min, invest_cap_pct, dividend_to_cash')
          .limit(1),
      )
      return (
        rows[0] ?? {
          interest_rate: 5,
          interest_cycle: 'monthly',
          quote_refresh_min: 15,
          invest_cap_pct: 70,
          dividend_to_cash: true,
        }
      )
    },

    async addChild(input) {
      // 아이는 반드시 어느 가족에 속해야 한다. 로그인한 구성원의 가족을 쓴다.
      const { data: me } = await sb.from('member').select('family_id').limit(1)
      const familyId = me?.[0]?.family_id
      if (!familyId) throw new Error('가족 정보를 찾을 수 없습니다. 부모 모드로 먼저 설정해 주세요')

      const { count } = await sb
        .from('child')
        .select('id', { count: 'exact', head: true })
        .eq('family_id', familyId)

      const { data, error } = await sb
        .from('child')
        .insert({ ...input, family_id: familyId, sort_order: (count ?? 0) + 1 })
        .select('id')
        .single()

      if (error) throw new Error(error.message)
      return data.id as string
    },

    async updateChild(id, patch) {
      const { error } = await sb.from('child').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },

    async addCashTxn(txn: NewCashTxn) {
      const { error } = await sb.from('cash_txn').insert(txn)
      if (error) throw new Error(error.message)
    },

    async updateCashTxn(id, patch) {
      const { error } = await sb.rpc('update_cash_txn', {
        p_id: id,
        p_direction: patch.direction,
        p_amount: patch.amount,
        p_category: patch.category,
        p_memo: patch.memo,
        p_occurred_on: patch.occurred_on,
      })
      if (error) throw new Error(error.message)
    },

    async deleteCashTxn(id) {
      const { error } = await sb.rpc('delete_cash_txn', { p_id: id })
      if (error) throw new Error(error.message)
    },

    async deleteTrade(id) {
      // 보유 수량·평균단가까지 다시 계산해야 하므로 DB 함수로만 지운다
      const { error } = await sb.rpc('delete_trade', { p_trade_id: id })
      if (error) throw new Error(error.message)
    },

    async applyTrade(t: NewTrade) {
      // trade 삽입 + cash_txn 삽입 + 평균단가 재계산을 DB 함수 한 번으로 처리한다.
      // 나눠 호출하면 중간 실패 시 장부가 어긋난다.
      const { error } = await sb.rpc('apply_trade', {
        p_child_id: t.child_id,
        p_direction: t.direction,
        p_ticker: t.ticker,
        p_name: t.name,
        p_quantity: t.quantity,
        p_price: t.price,
        p_fee: t.fee,
        p_fx: t.fx,
        p_occurred_on: t.occurred_on,
      })
      if (error) throw new Error(error.message)
    },

    async addGoal(goal) {
      const { error } = await sb.from('goal').insert(goal)
      if (error) throw new Error(error.message)
    },

    async setGoalStatus(id, status) {
      const { error } = await sb.from('goal').update({ status }).eq('id', id)
      if (error) throw new Error(error.message)
    },

    async setManualQuote(ticker, name, price) {
      const { error } = await sb.from('quote').upsert(
        {
          ticker,
          name,
          price,
          currency: 'KRW',
          as_of: new Date().toISOString(),
          source: 'manual',
        },
        { onConflict: 'ticker' },
      )
      if (error) throw new Error(error.message)
    },

    async saveQuote(quote) {
      // 수동 입력 값은 지키고, 그 외에는 최신 시세로 덮는다
      const { data: existing } = await sb
        .from('quote')
        .select('source')
        .eq('ticker', quote.ticker)
        .maybeSingle()
      if (existing?.source === 'manual') return

      const { error } = await sb.from('quote').upsert(quote, { onConflict: 'ticker' })
      if (error) throw new Error(error.message)
    },

    async updateSettings(patch) {
      const { data } = await sb.from('settings').select('family_id').limit(1)
      const familyId = data?.[0]?.family_id
      if (!familyId) throw new Error('가족 설정을 찾을 수 없습니다')
      const { error } = await sb.from('settings').update(patch).eq('family_id', familyId)
      if (error) throw new Error(error.message)
    },

    subscribe(onChange) {
      const channel = sb.channel('jjbank')
      for (const table of WATCHED) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      }
      channel.subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },
  }
}
