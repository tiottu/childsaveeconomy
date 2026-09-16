import { assetOf, buildPositions } from './compute'
import type { Db } from './db'
import type {
  CashTxn,
  Child,
  Goal,
  Holding,
  NewCashTxn,
  NewTrade,
  Quote,
  Settings,
  Trade,
} from './types'

/**
 * localStorage 기반 구현. Supabase 없이 앱 전체를 돌려볼 수 있게 하는 용도.
 * 스키마와 계산 규칙은 supabase/migrations/0001_init.sql 과 같게 유지한다.
 */

const KEY = 'jjbank.mock.v1'

type Store = {
  children: Child[]
  cash: CashTxn[]
  trades: Trade[]
  holdings: Holding[]
  quotes: Quote[]
  goals: Goal[]
  settings: Settings
}

function id(): string {
  return crypto.randomUUID()
}

/**
 * 처음 실행하면 비어 있다. 아이 이름은 로그인할 때 직접 정한다.
 * 예시 데이터를 심어두면 지우는 게 일이고, 실제 금액과 섞일 위험도 있다.
 */
function seed(): Store {
  return {
    children: [],
    cash: [],
    trades: [],
    holdings: [],
    quotes: [],
    goals: [],
    settings: {
      interest_rate: 5,
      interest_cycle: 'monthly',
      quote_refresh_min: 15,
      invest_cap_pct: 70,
      dividend_to_cash: true,
    },
  }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : seed()
  } catch {
    return seed()
  }
}

export function createMockDb(): Db {
  let store = load()
  const listeners = new Set<() => void>()

  /**
   * 메모리에 들고 있던 스냅샷을 쓰면, 같은 데이터를 보는 인스턴스가 둘 생겼을 때
   * (탭 두 개, 개발 중 HMR) 오래된 쪽이 새 기록을 덮어써 버린다.
   * 모든 읽기·쓰기 앞에서 저장소를 다시 읽어 그 사고를 막는다.
   */
  function sync() {
    store = load()
  }

  function commit() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      // 저장 실패해도 메모리 상태는 유효하므로 화면은 계속 동작한다
    }
    for (const fn of listeners) fn()
  }

  // 다른 탭에서 기록하면 이 화면도 갱신된다
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    sync()
    for (const fn of listeners) fn()
  }
  window.addEventListener('storage', onStorage)

  const childCash = (childId: string) => store.cash.filter((t) => t.child_id === childId)

  function positionsOf(childId: string) {
    return buildPositions(
      store.holdings.filter((h) => h.child_id === childId),
      store.quotes,
    )
  }

  return {
    kind: 'mock',

    async listChildren() {
      return [...store.children].sort((a, b) => a.sort_order - b.sort_order)
    },

    async listAssets() {
      return [...store.children]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => assetOf(c, childCash(c.id), positionsOf(c.id)))
    },

    async listCashTxns(childId) {
      return childCash(childId).sort((a, b) =>
        a.occurred_on === b.occurred_on ? 0 : a.occurred_on < b.occurred_on ? 1 : -1,
      )
    },

    async listPositions(childId) {
      return positionsOf(childId)
    },

    async listTrades(childId, ticker) {
      return store.trades
        .filter((t) => t.child_id === childId && (!ticker || t.ticker === ticker))
        .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : -1))
    },

    async listGoals(childId) {
      return store.goals.filter((g) => !childId || g.child_id === childId)
    },

    async listQuotes() {
      return [...store.quotes]
    },

    async getSettings() {
      return { ...store.settings }
    },

    async addChild(input) {
      const childId = id()
      store.children.push({
        id: childId,
        name: input.name,
        birth_year: input.birth_year,
        weekly_allowance: input.weekly_allowance,
        payday: input.payday,
        sort_order: store.children.length + 1,
      })
      commit()
      return childId
    },

    async updateChild(childId, patch) {
      const c = store.children.find((x) => x.id === childId)
      if (c) {
        Object.assign(c, patch)
        commit()
      }
    },

    async addCashTxn(txn: NewCashTxn) {
      if (txn.direction === 'out') {
        const balance = childCash(txn.child_id).reduce(
          (s, t) => s + (t.direction === 'in' ? t.amount : -t.amount),
          0,
        )
        if (balance < txn.amount) {
          throw new Error(`현금이 부족합니다. 잔액 ${balance.toLocaleString('ko-KR')}원`)
        }
      }
      store.cash.push({ id: id(), trade_id: null, ...txn })
      commit()
    },

    async updateCashTxn(id, patch) {
      sync()
      const row = store.cash.find((t) => t.id === id)
      if (!row) throw new Error('그런 거래가 없습니다')
      // 매매 연동 행은 금액·방향을 바꾸면 주식 기록과 어긋난다
      if (row.trade_id && (patch.amount !== row.amount || patch.direction !== row.direction)) {
        throw new Error('주식투자로 생긴 기록입니다. 금액은 투자 화면에서 고쳐 주세요')
      }
      Object.assign(row, patch)
      commit()
    },

    async deleteCashTxn(id) {
      sync()
      const row = store.cash.find((t) => t.id === id)
      if (!row) throw new Error('그런 거래가 없습니다')
      if (row.trade_id) {
        throw new Error('주식투자로 생긴 기록입니다. 투자 화면에서 그 매매를 지워 주세요')
      }
      store.cash = store.cash.filter((t) => t.id !== id)
      commit()
    },

    async deleteTrade(tradeId) {
      sync()
      const trade = store.trades.find((t) => t.id === tradeId)
      if (!trade) throw new Error('그런 매매 기록이 없습니다')

      store.trades = store.trades.filter((t) => t.id !== tradeId)
      // 매매로 생긴 현금 거래도 함께 사라진다 (서버의 on delete cascade 와 같게)
      store.cash = store.cash.filter((t) => t.trade_id !== tradeId)

      // 보유 수량·평균단가를 남은 이력에서 다시 계산한다.
      // 평균단가는 매수만 반영한다 (매도는 남은 주식의 평단을 바꾸지 않는다).
      const rest = store.trades
        .filter((t) => t.child_id === trade.child_id && t.ticker === trade.ticker)
        .sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : 1))

      let qty = 0
      let bought = 0
      let cost = 0
      let name = trade.name
      for (const t of rest) {
        name = t.name || name
        if (t.direction === 'buy') {
          qty += t.quantity
          bought += t.quantity
          cost += t.quantity * t.price
        } else {
          qty -= t.quantity
        }
      }

      store.holdings = store.holdings.filter(
        (h) => !(h.child_id === trade.child_id && h.ticker === trade.ticker),
      )
      if (qty > 0) {
        store.holdings.push({
          child_id: trade.child_id,
          ticker: trade.ticker,
          name,
          quantity: qty,
          avg_price: bought > 0 ? cost / bought : 0,
        })
      }
      commit()
    },

    async applyTrade(t: NewTrade) {
      sync()
      // 현금 통장에서 빠지는 금액은 언제나 원화다. 미국 종목이면 환율로 환산한다.
      const amount =
        Math.round(t.quantity * t.price * t.fx) + (t.direction === 'buy' ? t.fee : -t.fee)
      const existing = store.holdings.find(
        (h) => h.child_id === t.child_id && h.ticker === t.ticker,
      )

      if (t.direction === 'buy') {
        const balance = childCash(t.child_id).reduce(
          (s, x) => s + (x.direction === 'in' ? x.amount : -x.amount),
          0,
        )
        if (balance < amount) {
          throw new Error(
            `현금이 부족합니다. 잔액 ${balance.toLocaleString('ko-KR')}원, 필요 ${amount.toLocaleString('ko-KR')}원`,
          )
        }
      } else {
        if (!existing || existing.quantity < t.quantity) {
          throw new Error(`보유 수량이 부족합니다. 보유 ${existing?.quantity ?? 0}주`)
        }
      }

      const tradeId = id()
      // fx 는 현금 환산에만 쓰고 거래 기록에는 남기지 않는다 (단가는 종목 통화 기준)
      const { fx: _fx, ...tradeRow } = t
      store.trades.push({ id: tradeId, ...tradeRow })
      store.cash.push({
        id: id(),
        child_id: t.child_id,
        direction: t.direction === 'buy' ? 'out' : 'in',
        amount: Math.abs(amount),
        category: '투자',
        memo: `${t.name} ${t.quantity}주 ${t.direction === 'buy' ? '매수' : '매도'}`,
        occurred_on: t.occurred_on,
        trade_id: tradeId,
      })

      if (t.direction === 'buy') {
        if (existing) {
          const total = existing.quantity + t.quantity
          existing.avg_price =
            (existing.quantity * existing.avg_price + t.quantity * t.price) / total
          existing.quantity = total
          existing.name = t.name
        } else {
          store.holdings.push({
            child_id: t.child_id,
            ticker: t.ticker,
            name: t.name,
            quantity: t.quantity,
            avg_price: t.price,
          })
        }
        // 새로 산 종목의 시세가 없으면 매수가를 임시 시세로 넣어둔다
        if (!store.quotes.some((q) => q.ticker === t.ticker)) {
          store.quotes.push({
            ticker: t.ticker,
            name: t.name,
            price: t.price,
            prev_close: t.price,
            change_pct: 0,
            currency: 'KRW',
            as_of: new Date().toISOString(),
            source: 'manual',
          })
        }
      } else if (existing) {
        // 매도는 평균단가를 바꾸지 않는다
        existing.quantity -= t.quantity
        if (existing.quantity <= 0) {
          store.holdings = store.holdings.filter((h) => h !== existing)
        }
      }

      commit()
    },

    async addGoal(goal) {
      store.goals.push({ id: id(), ...goal })
      commit()
    },

    async setGoalStatus(goalId, status) {
      const g = store.goals.find((x) => x.id === goalId)
      if (g) {
        g.status = status
        commit()
      }
    },

    async setManualQuote(ticker, name, price) {
      const q = store.quotes.find((x) => x.ticker === ticker)
      const now = new Date().toISOString()
      if (q) {
        q.price = price
        q.as_of = now
        q.source = 'manual'
      } else {
        store.quotes.push({
          ticker,
          name,
          price,
          prev_close: null,
          change_pct: null,
          currency: 'KRW',
          as_of: now,
          source: 'manual',
        })
      }
      commit()
    },

    async saveQuote(quote) {
      // 부모가 손으로 넣은 값은 자동 조회가 덮지 않는다
      const existing = store.quotes.find((q) => q.ticker === quote.ticker)
      if (existing?.source === 'manual') return
      store.quotes = [...store.quotes.filter((q) => q.ticker !== quote.ticker), quote]
      commit()
    },

    async updateSettings(patch) {
      store.settings = { ...store.settings, ...patch }
      commit()
    },

    subscribe(onChange) {
      listeners.add(onChange)
      return () => {
        listeners.delete(onChange)
        if (listeners.size === 0) window.removeEventListener('storage', onStorage)
      }
    },
  }
}
