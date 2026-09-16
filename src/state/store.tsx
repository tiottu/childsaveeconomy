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
  Reward,
  Settings,
  Stamp,
  Trade,
  TradeRequest,
} from '../lib/types'

type Data = {
  children: Child[]
  assets: ChildAsset[]
  cash: Record<string, CashTxn[]>
  positions: Record<string, Position[]>
  /** 아이별 매매 이력. 자산 추이 차트가 투자 원가를 계산할 때 쓴다. */
  trades: Record<string, Trade[]>
  goals: Goal[]
  /** 칭찬도장. 신청·받음·쓴 것이 다 들어 있고 화면에서 상태로 걸러 쓴다. */
  stamps: Stamp[]
  rewards: Reward[]
  /** 아이가 올린 매매 신청. 부모가 승인해야 실제 거래가 된다. */
  tradeRequests: TradeRequest[]
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
  /** 가입을 마친 뒤 부른다. 이 기기가 쓸 준비가 됐으면 true. */
  refreshMembership: () => Promise<boolean>
}

const empty: Data = {
  children: [],
  assets: [],
  cash: {},
  positions: {},
  trades: {},
  goals: [],
  stamps: [],
  rewards: [],
  tradeRequests: [],
  quotes: [],
  settings: {
    interest_rate: 5,
    interest_cycle: 'monthly',
    quote_refresh_min: 15,
    invest_cap_pct: 70,
    stamp_goal: 5,
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
  refreshMembership: async () => true,
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
      const [kids, assets, goals, quotes, settings, stamps, rewards, tradeRequests] =
        await Promise.all([
          instance.listChildren(),
          instance.listAssets(),
          instance.listGoals(),
          instance.listQuotes(),
          instance.getSettings(),
          instance.listStamps(),
          instance.listRewards(),
          instance.listTradeRequests(),
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

      setData({
        children: kids,
        assets,
        cash,
        positions,
        trades,
        goals,
        stamps,
        rewards,
        tradeRequests,
        quotes,
        settings,
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  /** 이 기기가 쓸 준비가 됐는지 돌려준다. false 면 가입 화면으로 보내야 한다. */
  const refreshMembership = useCallback(async (): Promise<boolean> => {
    if (!hasSupabaseConfig) return true
    // 로컬 모드에서는 supabase-js 를 아예 내려받지 않도록 동적으로 가져온다
    const { currentUserId, getMembership } = await import('../lib/auth')
    const userId = await currentUserId()
    const m = userId ? await getMembership() : null
    setMembership(m)

    // 이메일을 공유하는 가족이면 기기 등록이 모드를 정한다.
    const device = await import('../lib/device')
    const role = m ? await device.myDeviceRole() : null
    setDeviceRole(role)

    /**
     * 기기 등록이 필요한가.
     *
     * 부모는 이메일 계정 하나를 가족이 공유한다. 그래서 member 행도 하나뿐이고,
     * 그것만으로는 이 핸드폰이 엄마인지 아빠인지 알 수 없다. 등록이 없으면
     * "이 핸드폰은 누구예요?" 로 보내야 한다.
     *
     * 이 검사가 없었을 때 이렇게 됐다: 엄마 폰에서 엄마로, 아빠 폰에서 아빠로 붙은 뒤
     * 엄마 폰을 다시 열면 **아빠 모드로 보였다.** 등록이 없는 기기가 그냥 들어가서
     * 공유된 member.label(마지막에 합류한 사람 = 아빠)을 자기 이름표로 쓴 탓이다.
     *
     * 아이가 가족 코드로 붙은 경우는 익명 계정이라 계정 자체가 그 기기 것이다.
     * 그쪽은 member 만으로 충분하고, 등록을 요구하면 들어갈 방법이 없어진다.
     */
    const sharedAccount = m?.email != null
    const needsDevice =
      sharedAccount && role === null && (await device.deviceFeatureAvailable())

    const join = m === null || needsDevice
    setNeedsJoin(join)
    return !join
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
          // 가입 여부 판단은 refreshMembership 한 곳에만 둔다.
          // 예전에는 이 초기 경로가 같은 일을 따로 구현하고 있었고, 그래서 한쪽만
          // 고치면 다른 쪽이 옛 규칙으로 돌았다 — 등록 없는 기기가 그냥 들어가 버렸다.
          const joined = await refreshMembership()
          if (cancelled) return
          if (!joined) {
            // 아직 이 기기가 가족에 붙지 않았다. 데이터를 읽어봐야 전부 빈 결과다.
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
