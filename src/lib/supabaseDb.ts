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
  Reward,
  Settings,
  Stamp,
  Trade,
  TradeRequest,
} from './types'

/** 실시간 구독 대상. 하나라도 바뀌면 화면을 다시 읽는다. */
const WATCHED = [
  'cash_txn',
  'trade',
  'holding',
  'quote',
  'goal',
  'child',
  // 부모가 도장을 찍으면 아이 핸드폰이 새로고침 없이 바뀐다. 그 반대도 마찬가지다.
  'stamp',
  'reward',
  // 아이가 매매를 신청하면 부모 화면에 바로 뜬다. 승인하면 아이 화면도 바로 바뀐다.
  'trade_request',
] as const

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}

const MIGRATION_HINT = '매매 신청 기능이 아직 서버에 올라가지 않았습니다 (마이그레이션 0014)'

/** 아직 만들지 않은 표를 읽었을 때. 42P01 은 postgres, PGRST205 는 스키마 캐시. */
function missingTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /does not exist|Could not find the table/i.test(error.message)
  )
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
          .select(
            'interest_rate, interest_cycle, quote_refresh_min, invest_cap_pct, stamp_goal',
          )
          .limit(1),
      )
      return (
        rows[0] ?? {
          interest_rate: 5,
          interest_cycle: 'monthly',
          quote_refresh_min: 15,
          invest_cap_pct: 70,
          stamp_goal: 5,
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

    async setEmblem(id, emblem) {
      // 아이 기기는 이 함수로만 고칠 수 있다. 부모는 표를 직접 고쳐도 되지만,
      // 같은 길을 쓰면 분기가 하나 줄고 서버가 값도 검사해 준다.
      const { error } = await sb.rpc('set_my_emblem', { p_emblem: emblem })
      if (!error) return

      const missing =
        error.code === 'PGRST202' || /Could not find the function/i.test(error.message)
      if (missing) {
        throw new Error('엠블럼 기능이 아직 서버에 올라가지 않았습니다 (set_my_emblem)')
      }

      // 부모 계정은 app_child_id() 가 없어서 위 함수가 거부한다. 그때는 직접 고친다.
      const { error: direct } = await sb.from('child').update({ emblem }).eq('id', id)
      if (direct) throw new Error(direct.message)
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

    // ---------------------------------------------------------------- 매매 신청

    async listTradeRequests(childId) {
      let q = sb.from('trade_request').select('*')
      if (childId) q = q.eq('child_id', childId)
      const res = await q.order('created_at', { ascending: false })
      if (res.error) {
        // 마이그레이션 0014 를 아직 안 돌렸으면 표가 없다. 그 하나 때문에 앱 전체가
        // 안 열리면 안 된다 — 신청 기능만 비어 보이게 두고 넘어간다.
        if (missingTable(res.error)) return []
        throw new Error(res.error.message)
      }
      return (res.data ?? []) as TradeRequest[]
    },

    async requestTrade(req) {
      // 아이 기기는 이 insert 만 허용된다 (정책 trade_request_child).
      // status 를 'approved' 로 바꿔 넣으면 서버가 거부한다.
      const { error } = await sb.from('trade_request').insert({ ...req, status: 'requested' })
      if (error) {
        if (missingTable(error)) throw new Error(MIGRATION_HINT)
        throw new Error(error.message)
      }
    },

    async decideTradeRequest(id, approve, price) {
      // 승인은 '상태 바꾸기 + 실제 매매' 가 함께 일어나야 한다. 나눠 부르면
      // 매매만 되고 신청이 남거나(두 번 승인) 그 반대가 된다. DB 함수 한 번으로 묶는다.
      const { error } = await sb.rpc('decide_trade_request', {
        p_id: id,
        p_approve: approve,
        p_price: price ?? null,
      })
      if (error) {
        if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
          throw new Error(MIGRATION_HINT)
        }
        throw new Error(error.message)
      }
    },

    async cancelTradeRequest(id) {
      const { error } = await sb
        .from('trade_request')
        .update({ status: 'canceled', decided_at: new Date().toISOString() })
        .eq('id', id)
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

    // ---------------------------------------------------------------- 칭찬도장

    async listStamps(childId) {
      let q = sb.from('stamp').select('*')
      if (childId) q = q.eq('child_id', childId)
      return unwrap<Stamp[]>(await q.order('created_at', { ascending: false }))
    },

    async listRewards(childId) {
      let q = sb.from('reward').select('*')
      if (childId) q = q.eq('child_id', childId)
      return unwrap<Reward[]>(await q.order('created_at', { ascending: false }))
    },

    async giveStamp(childId, reason) {
      const { error } = await sb.from('stamp').insert({
        child_id: childId,
        reason,
        status: 'given',
        asked_by: 'parent',
        decided_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
    },

    async requestStamp(childId, reason) {
      // 아이 기기는 이 insert 만 허용된다 (정책 stamp_child_request).
      // status 나 asked_by 를 바꿔 넣으면 서버가 거부한다.
      const { error } = await sb.from('stamp').insert({
        child_id: childId,
        reason,
        status: 'requested',
        asked_by: 'child',
      })
      if (error) throw new Error(error.message)
    },

    async decideStamp(id, approve) {
      const { error } = await sb
        .from('stamp')
        .update({
          status: approve ? 'given' : 'rejected',
          decided_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw new Error(error.message)
    },

    async deleteStamp(id) {
      const { error } = await sb.from('stamp').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },

    async redeemStamps(childId, title) {
      // 도장 소진과 보상 기록이 함께 일어나야 한다. DB 함수 한 번으로 처리한다.
      const { error } = await sb.rpc('redeem_stamps', {
        p_child_id: childId,
        p_title: title,
      })
      if (error) {
        if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
          throw new Error('칭찬도장 기능이 아직 서버에 올라가지 않았습니다 (마이그레이션 0013)')
        }
        throw new Error(error.message)
      }
    },

    async setManualQuote(ticker, name, price, currency = 'KRW') {
      const { error } = await sb.from('quote').upsert(
        {
          ticker,
          name,
          price,
          currency,
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
