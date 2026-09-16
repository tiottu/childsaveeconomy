import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Membership } from '../lib/auth'
import { getDb, hasSupabaseConfig, type Db } from '../lib/db'
import type { DeviceRole } from '../lib/device'
import type {
  CashTxn,
  Child,
  ChildAsset,
  Goal,
  Position,
  Quote,
  Settings,
  Trade,
} from '../lib/types'

type Data = {
  children: Child[]
  assets: ChildAsset[]
  cash: Record<string, CashTxn[]>
  positions: Record<string, Position[]>
  /** 아이별 매매 이력. 자산 추이 차트가 투자 원가를 계산할 때 쓴다. */
  trades: Record<string, Trade[]>
  goals: Goal[]
  quotes: Quote[]
  settings: Settings
}

type StoreValue = {
  db: Db | null
  data: Data | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  usingSupabase: boolean
  /** 클라우드 모드에서 이 기기가 어느 가족의 누구인지. 로컬 모드에서는 null. */
  membership: Membership | null
  /**
   * 기기 등록. 이메일 하나를 가족이 공유하므로 membership 만으로는 기기를 구분할 수 없다.
   * 이 값이 있으면 모드를 이쪽이 정한다 (마이그레이션 0009 적용 시).
   */
  deviceRole: DeviceRole | null
  /** 클라우드 모드인데 아직 가족에 붙지 않았다 */
  needsJoin: boolean
  /** 가입을 마친 뒤 부른다 */
  refreshMembership: () => Promise<void>
}

const empty: Data = {
  children: [],
  assets: [],
  cash: {},
  positions: {},
  trades: {},
  goals: [],
  quotes: [],
  settings: {
    interest_rate: 5,
    interest_cycle: 'monthly',
    quote_refresh_min: 15,
    invest_cap_pct: 70,
    dividend_to_cash: true,
  },
}

const StoreContext = createContext<StoreValue>({
  db: null,
  data: null,
  loading: true,
  error: null,
  reload: async () => {},
  usingSupabase: false,
  membership: null,
  deviceRole: null,
  needsJoin: false,
  refreshMembership: async () => {},
})

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null)
  const [needsJoin, setNeedsJoin] = useState(false)

  const load = useCallback(async (instance: Db) => {
    try {
      const [kids, assets, goals, quotes, settings] = await Promise.all([
        instance.listChildren(),
        instance.listAssets(),
        instance.listGoals(),
        instance.listQuotes(),
        instance.getSettings(),
      ])

      const cash: Record<string, CashTxn[]> = {}
      const positions: Record<string, Position[]> = {}
      const trades: Record<string, Trade[]> = {}
      await Promise.all(
        kids.map(async (k) => {
          const [c, p, t] = await Promise.all([
            instance.listCashTxns(k.id),
            instance.listPositions(k.id),
            instance.listTrades(k.id),
          ])
          cash[k.id] = c
          positions[k.id] = p
          trades[k.id] = t
        }),
      )

      setData({ children: kids, assets, cash, positions, trades, goals, quotes, settings })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshMembership = useCallback(async () => {
    if (!hasSupabaseConfig) return
    // 로컬 모드에서는 supabase-js 를 아예 내려받지 않도록 동적으로 가져온다
    const { currentUserId, getMembership } = await import('../lib/auth')
    const userId = await currentUserId()
    const m = userId ? await getMembership() : null
    setMembership(m)

    // 이메일을 공유하는 가족이면 기기 등록이 모드를 정한다.
    // 0009 가 아직 안 올라간 서버에서는 null 이고, membership 이 모드를 정한다.
    const role = m ? await (await import('../lib/device')).myDeviceRole() : null
    setDeviceRole(role)

    // 부모는 가족 연결 후에도 기기 등록이 남아 있으면 그때까지 가입 화면에 머문다
    setNeedsJoin(m === null)
  }, [])

  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false

    void (async () => {
      try {
        // 클라우드 모드는 세션이 없으면 아무것도 못 읽는다.
        // 부모는 이메일 인증으로 로그인하므로 여기서 계정을 만들지 않는다.
        // 세션이 없으면 가입 화면이 뜨고, 거기서 이메일 인증이나 익명 로그인을 한다.
        if (hasSupabaseConfig) {
          const { currentUserId, getMembership } = await import('../lib/auth')
          const userId = await currentUserId()
          const m = userId ? await getMembership() : null
          if (cancelled) return
          setMembership(m)
          if (m) {
            const { myDeviceRole } = await import('../lib/device')
            const role = await myDeviceRole()
            if (cancelled) return
            setDeviceRole(role)
          }
          setNeedsJoin(m === null)
          if (m === null) {
            // 아직 가족에 붙지 않았다. 데이터를 읽어봐야 전부 빈 결과다.
            setLoading(false)
            return
          }
        }

        const instance = await getDb()
        if (cancelled) return
        setDb(instance)
        await load(instance)
        // 부모가 기록하면 아이 핸드폰이 새로고침 없이 갱신된다
        dispose = instance.subscribe(() => void load(instance))
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
      dispose?.()
    }
    // membership 이 생기면 데이터를 다시 읽어야 하므로 needsJoin 을 의존성에 둔다
  }, [load, needsJoin])

  const reload = useCallback(async () => {
    if (db) await load(db)
  }, [db, load])

  const value = useMemo<StoreValue>(
    () => ({
      db,
      data,
      loading,
      error,
      reload,
      usingSupabase: hasSupabaseConfig,
      membership,
      deviceRole,
      needsJoin,
      refreshMembership,
    }),
    [db, data, loading, error, reload, membership, deviceRole, needsJoin, refreshMembership],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}

/** 데이터가 준비된 뒤에만 쓰는 편의 훅. 로딩 중에는 빈 구조를 돌려준다. */
export function useData(): Data {
  const { data } = useStore()
  return data ?? empty
}
