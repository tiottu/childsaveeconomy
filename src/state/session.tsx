import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Mode } from '../lib/types'
import { useStore } from './store'

const MODE_KEY = 'jjbank.mode'
const PIN_KEY = 'jjbank.pins'
const LEGACY_PIN_KEY = 'jjbank.parentPin'

/** 부모·아이 모드 잠금 PIN 자릿수 */
export const PIN_LENGTH = 6

/** 부모 PIN 의 저장 키. 아이는 childId 를 키로 쓴다. */
export const PARENT_KEY = 'parent'

const DEFAULT_PARENT_PIN = '0'.repeat(PIN_LENGTH)

/**
 * 사람별 PIN (로컬 모드에서만 쓴다).
 *  - 'parent'  : 항상 있어야 한다. 처음에는 기본값(000000).
 *  - childId   : null 이면 PIN 없이 바로 들어간다. 부모가 켜고 끌 수 있다.
 *
 * 클라우드 모드에서는 부모 PIN 을 기기에 저장하지 않는다. 해시가 서버에만 있고
 * 확인은 verify_parent_pin RPC 가 한다. 아이 PIN 은 기기별 편의 잠금이라 로컬에 둔다.
 */
type PinMap = Record<string, string | null>

type SessionValue = {
  mode: Mode | null
  /** 현재 모드가 PIN 을 통과했는지 */
  unlocked: boolean
  enterParent: () => void
  enterChild: (childId: string) => void
  /** 현재 모드의 PIN 을 검사한다 */
  unlock: (pin: string) => Promise<boolean>
  /** 로컬 모드: 모드 선택으로 되돌린다. 클라우드 모드: 이 기기의 가족 등록을 해제한다. */
  signOut: () => Promise<void>

  /** PIN 설정·재설정. null 을 주면 PIN 을 없앤다 (아이만 가능). */
  setPin: (key: string, pin: string | null) => Promise<void>
  hasPin: (key: string) => boolean
  isDefaultPin: (key: string) => boolean
  /** 클라우드 모드에서는 모드를 기기 등록이 정한다 — 사용자가 고르지 않는다 */
  modeIsFixed: boolean
  /**
   * 이미 PIN 을 확인한 직후에 부른다 (가입 화면에서 부모 PIN 을 맞춘 경우).
   * 이게 없으면 같은 PIN 을 연달아 두 번 입력하게 된다.
   */
  markUnlocked: () => void
}

const SessionContext = createContext<SessionValue>({
  mode: null,
  unlocked: false,
  enterParent: () => {},
  enterChild: () => {},
  unlock: async () => false,
  signOut: async () => {},
  setPin: async () => {},
  hasPin: () => false,
  isDefaultPin: () => true,
  modeIsFixed: false,
  markUnlocked: () => {},
})

function readMode(): Mode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Mode
    if (parsed.kind === 'parent') return parsed
    if (parsed.kind === 'child' && typeof parsed.childId === 'string') return parsed
    return null
  } catch {
    return null
  }
}

function readPins(): PinMap {
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PinMap
      // 자릿수를 바꾼 뒤 예전 길이의 PIN 이 남아 있으면 무효로 본다
      const cleaned: PinMap = {}
      for (const [k, v] of Object.entries(parsed)) {
        cleaned[k] = typeof v === 'string' && v.length === PIN_LENGTH ? v : null
      }
      if (!cleaned[PARENT_KEY]) cleaned[PARENT_KEY] = DEFAULT_PARENT_PIN
      return cleaned
    }

    const legacy = localStorage.getItem(LEGACY_PIN_KEY)
    return {
      [PARENT_KEY]: legacy && legacy.length === PIN_LENGTH ? legacy : DEFAULT_PARENT_PIN,
    }
  } catch {
    return { [PARENT_KEY]: DEFAULT_PARENT_PIN }
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { usingSupabase, membership, deviceRole, refreshMembership } = useStore()

  const [localMode, setLocalMode] = useState<Mode | null>(() => readMode())
  const [pins, setPins] = useState<PinMap>(() => readPins())
  /*
    새로고침하면 저장된 모드로 바로 돌아오는데, 잠금 상태는 저장하지 않으니 여기서
    다시 정해야 한다. 부모는 언제나 PIN 을 다시 묻는다. 아이는 PIN 을 걸어 둔 경우만
    묻는다 — 안 걸어 둔 아이에게 물으면 맞출 수 있는 PIN 이 없어서 영영 못 들어간다
    (실제로 그렇게 갇혔다). 클라우드 모드는 아래 effect 가 다시 정한다.
  */
  const [unlocked, setUnlocked] = useState(() => {
    if (usingSupabase) return false
    const m = readMode()
    if (!m || m.kind === 'parent') return false
    const p = readPins()[m.childId]
    return !(typeof p === 'string')
  })

  // 클라우드 모드에서는 기기 등록이 모드를 정한다.
  // 이메일을 가족이 공유하면 membership 은 모두 parent 이므로 device 쪽이 우선이다.
  const cloudMode: Mode | null = useMemo(() => {
    if (!usingSupabase || !membership) return null

    if (deviceRole) {
      return deviceRole.kind === 'parent'
        ? { kind: 'parent' }
        : { kind: 'child', childId: deviceRole.childId }
    }

    // 0009 적용 전, 또는 아이가 익명 + 가족코드로 붙은 경우
    return membership.role === 'parent'
      ? { kind: 'parent' }
      : membership.childId
        ? { kind: 'child', childId: membership.childId }
        : null
  }, [usingSupabase, membership, deviceRole])

  const mode = usingSupabase ? cloudMode : localMode
  const modeIsFixed = usingSupabase

  useEffect(() => {
    if (usingSupabase) return
    try {
      if (localMode) localStorage.setItem(MODE_KEY, JSON.stringify(localMode))
      else localStorage.removeItem(MODE_KEY)
    } catch {
      // 저장 실패는 무시한다. 이번 세션 동안은 메모리 상태로 동작한다.
    }
  }, [localMode, usingSupabase])

  useEffect(() => {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pins))
      localStorage.removeItem(LEGACY_PIN_KEY)
    } catch {
      // 무시
    }
  }, [pins])

  /**
   * 클라우드 모드에서 부모 PIN 이 설정돼 있는지. 서버에만 해시가 있으므로 물어봐야 한다.
   * null 은 아직 확인 전. 확인 전에 잠금 화면을 띄우면 깜빡이므로 구분한다.
   */
  const [cloudPinSet, setCloudPinSet] = useState<boolean | null>(null)

  useEffect(() => {
    const isParentDevice = deviceRole ? deviceRole.kind === 'parent' : membership?.role === 'parent'
    if (!usingSupabase || !isParentDevice) {
      setCloudPinSet(null)
      return
    }
    void (async () => {
      const { parentPinIsSet } = await import('../lib/auth')
      setCloudPinSet(await parentPinIsSet())
    })()
  }, [usingSupabase, membership, deviceRole])

  const hasPin = useCallback(
    (key: string) => {
      // 이메일 인증이 부모임을 보증하므로 PIN 은 선택 사항이다.
      // 설정해 둔 가족만 잠금 화면을 본다.
      if (usingSupabase && key === PARENT_KEY) return cloudPinSet === true
      return typeof pins[key] === 'string' && pins[key] !== null
    },
    [pins, usingSupabase, cloudPinSet],
  )

  /**
   * 가입 화면에서 부모 PIN 을 이미 맞췄다는 표시.
   *
   * ref 에 담고 effect 에서 소비하는 방식은 안 된다 — StrictMode 가 개발 중 effect 를
   * 두 번 실행해서, 첫 실행이 플래그를 쓰고 두 번째가 다시 잠가 버린다.
   * 상태로 두고 effect 는 읽기만 하게 해서 몇 번 실행돼도 같은 결과가 나오게 한다.
   * 새로고침하면 상태가 사라져 다시 잠긴다 — 의도한 동작이다.
   */
  const [justJoined, setJustJoined] = useState(false)
  const markUnlocked = useCallback(() => {
    setJustJoined(true)
    setUnlocked(true)
  }, [])

  // 클라우드 모드에서는 기기 등록이 바뀔 때마다 잠금을 다시 확인한다
  useEffect(() => {
    if (!usingSupabase) return
    if (!membership) {
      setUnlocked(false)
      return
    }
    if (membership.role === 'parent') {
      // PIN 이 설정돼 있지 않으면 잠그지 않는다. 확인 전(null)에는 판단을 미룬다.
      if (cloudPinSet === null) return
      setUnlocked(justJoined || cloudPinSet === false)
      return
    }
    // 아이 기기: 로컬 아이 PIN 이 걸려 있으면 물어본다
    setUnlocked(!(membership.childId && hasPin(membership.childId)))
  }, [usingSupabase, membership, hasPin, justJoined, cloudPinSet])

  const enterParent = useCallback(() => {
    if (usingSupabase) return
    setLocalMode({ kind: 'parent' })
    setUnlocked(false)
  }, [usingSupabase])

  const enterChild = useCallback(
    (childId: string) => {
      if (usingSupabase) return
      setLocalMode({ kind: 'child', childId })
      setUnlocked(!hasPin(childId))
    },
    [hasPin, usingSupabase],
  )

  const unlock = useCallback(
    async (input: string) => {
      if (!mode) return false

      // 클라우드 + 부모: 해시가 서버에만 있으므로 서버가 판단한다
      if (usingSupabase && mode.kind === 'parent') {
        try {
          const { verifyParentPin } = await import('../lib/auth')
          const ok = await verifyParentPin(input)
          if (ok) setUnlocked(true)
          return ok
        } catch {
          return false
        }
      }

      const key = mode.kind === 'parent' ? PARENT_KEY : mode.childId
      if (input === pins[key]) {
        setUnlocked(true)
        return true
      }
      return false
    },
    [mode, pins, usingSupabase],
  )

  const signOut = useCallback(async () => {
    setUnlocked(false)
    setJustJoined(false)
    if (usingSupabase) {
      // 이 기기의 등록을 해제한다. 다시 처음부터 시작한다.
      // 기기 등록(device)과 가족 등록(member)을 모두 지운다.
      const [{ leaveFamily }, { releaseDevice }] = await Promise.all([
        import('../lib/auth'),
        import('../lib/device'),
      ])
      try {
        await releaseDevice()
      } catch {
        // 0009 미적용 서버에서는 없는 기능이다. 무시하고 계속.
      }
      await leaveFamily()
      await refreshMembership()
      return
    }
    setLocalMode(null)
  }, [usingSupabase, refreshMembership])

  const setPin = useCallback(
    async (key: string, pin: string | null) => {
      if (usingSupabase && key === PARENT_KEY) {
        const mod = await import('../lib/auth')
        if (pin === null) {
          // 화면 잠금만 끈다. 로그인에 쓰는 PIN(계정 비밀번호)은 그대로 남는다 —
          // 그걸 같이 지우면 새 기기에서 들어올 방법이 사라진다.
          await mod.clearParentPin()
          setCloudPinSet(false)
        } else {
          // 부모 PIN 은 두 군데에 쓰인다: 새 기기 로그인, 그리고 이 기기 화면 잠금.
          // 하나만 바뀌면 기억할 숫자가 둘로 갈라진다. 계정 비밀번호를 먼저 바꾸고,
          // 그게 성공했을 때만 잠금 PIN 을 바꾼다 (실패 시 둘이 어긋나지 않게).
          await mod.updateParentPassword(pin)
          await mod.setParentPin(pin)
          setCloudPinSet(true)
        }
        return
      }

      // 로컬 모드의 부모 PIN 은 유일한 방어선이라 없앨 수 없다
      if (key === PARENT_KEY && pin === null) return
      setPins((prev) => ({ ...prev, [key]: pin }))
    },
    [usingSupabase],
  )

  const isDefaultPin = useCallback(
    (key: string) => {
      // 클라우드 모드에는 기본 PIN 이 없다. 설정에서 직접 정한다.
      if (usingSupabase && key === PARENT_KEY) return false
      return pins[key] === DEFAULT_PARENT_PIN
    },
    [pins, usingSupabase],
  )

  const value = useMemo<SessionValue>(
    () => ({
      mode,
      unlocked,
      enterParent,
      enterChild,
      unlock,
      signOut,
      setPin,
      hasPin,
      isDefaultPin,
      modeIsFixed,
      markUnlocked,
    }),
    [
      mode,
      unlocked,
      enterParent,
      enterChild,
      unlock,
      signOut,
      setPin,
      hasPin,
      isDefaultPin,
      modeIsFixed,
      markUnlocked,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}
