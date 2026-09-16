import { useState } from 'react'
import { Field, Toggle, colorOf } from '../components/ui'
import type { ChildOption, ParentLabel } from '../lib/auth'
import type { OpenSlot } from '../lib/device'
import { useSession } from '../state/session'
import { useStore } from '../state/store'

const WEEKDAYS = [
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
  { value: 7, label: '일요일' },
]

// 이 화면은 클라우드 모드에서만 열린다.
// 로컬 모드 사용자가 supabase-js 를 내려받지 않도록 호출 시점에 가져온다.
const auth = () => import('../lib/auth')

type Step =
  /** 부모인지 아이인지 */
  | { at: 'who' }
  /** 부모: 이메일 + PIN */
  | { at: 'email' }
  /** 부모: 가족을 만들지 합류할지 */
  | { at: 'family' }
  /** 개발용: 이메일 없이 가족 코드 + PIN 으로 부모 들어가기 */
  | { at: 'testParent' }
  /** 가족은 이미 있다. 이 기기가 누구인지 고른다 (엄마/아빠/아이) */
  | { at: 'slots'; slots: OpenSlot[] }
  /** 아이: 가족 코드 */
  | { at: 'childCode' }
  /** 아이: 이름 선택 */
  | { at: 'childPick'; code: string; kids: ChildOption[] }
  /** 아이: 새 이름 등록 */
  | { at: 'childNew'; code: string }

/**
 * 기기를 가족에 붙이는 화면. 기기마다 한 번만 한다.
 *
 * 부모는 **이메일 + PIN 6자리**로 계정을 만든다. 이메일로 코드를 받아 확인하는 방식은
 * 없앴다 — 메일 템플릿 설정에 매달리고, 기기를 추가할 때마다 메일함을 열어야 했다.
 *
 * 그래서 **이메일은 비밀이 아니다.** 어느 집인지 가리키는 이름표일 뿐이고, 진짜 비밀은
 * PIN 이다. 이메일만 알고 PIN 을 모르면 아무것도 못 한다.
 *
 * 아이는 이메일이 없으니 익명 계정 + 가족 코드를 쓴다. 익명 토큰에는 RLS 가 쓰기를
 * 완전히 막아 두어서, 아이 기기가 금액을 고칠 수 없다.
 *
 * 엄마와 아빠는 권한이 같다. 서로 다른 기기를 구분해 보여주기 위한 이름표일 뿐이다.
 */
/**
 * 마지막으로 쓴 가족 코드. 기기를 해제했다가 다시 붙일 때 또 외워 넣지 않게 한다.
 * 코드는 비밀이 아니다 — 부모가 아이에게 알려주는 값이고, 이것만으로는 아무 권한도 없다.
 * (아이는 조회 전용이고, 부모가 되려면 이메일 인증이나 부모 PIN 이 따로 필요하다.)
 */
const LAST_CODE_KEY = 'jjbank.lastFamilyCode'

function rememberFamilyCode(c: string) {
  try {
    localStorage.setItem(LAST_CODE_KEY, c)
  } catch {
    // 저장 못 해도 그냥 다시 입력하면 된다
  }
}

function lastFamilyCode(): string {
  try {
    return localStorage.getItem(LAST_CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function FamilyJoin() {
  const { refreshMembership } = useStore()
  const { markUnlocked } = useSession()

  const [step, setStep] = useState<Step>({ at: 'who' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [familyName, setFamilyName] = useState('우리집')
  const [label, setLabel] = useState<ParentLabel>('엄마')
  const [joinCode, setJoinCode] = useState(lastFamilyCode)
  const [mode, setMode] = useState<'create' | 'join'>('create')
  /** 부모 입구: 처음 등록인지 이미 있는 계정인지. 처음일 때만 PIN 을 두 번 받는다. */
  const [parentMode, setParentMode] = useState<'signup' | 'signin'>('signup')
  const [pinConfirm, setPinConfirm] = useState('')
  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [allowance, setAllowance] = useState('')
  const [payday, setPayday] = useState(1)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : String(e))
  }

  // ---------------------------------------------------------------- 부모: 이메일 + PIN

  /**
   * 부모 경로 시작.
   *
   * 이미 이 기기가 부모 계정으로 로그인돼 있으면 (앱을 지웠다 깔았거나, 가족 등록만
   * 풀었던 경우) 이메일을 다시 물어볼 이유가 없다. 바로 다음 단계로 보낸다.
   */
  async function startParent() {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { signedInEmail, getMembership } = await auth()
      const addr = await signedInEmail()
      if (!addr) {
        setStep({ at: 'email' })
        return
      }

      setNotice(`${addr} 으로 로그인돼 있습니다`)
      const existing = await getMembership()
      if (existing) {
        await goToSlots()
        return
      }
      setStep({ at: 'family' })
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  /**
   * 이메일 + PIN 으로 부모 계정에 들어간다.
   *
   * 처음 등록이면 PIN 을 두 번 받는다. 오타 하나로 다시는 못 들어가는 계정이 생기면
   * 곤란하다. 이미 있는 계정은 틀려도 다시 넣으면 그만이라 한 번만 받는다.
   */
  async function submitParent() {
    setError(null)
    setNotice(null)

    const addr = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError('이메일 주소를 확인해 주세요')
    if (!/^\d{6}$/.test(code)) return setError('PIN 6자리(숫자)를 입력해 주세요')
    if (parentMode === 'signup' && code !== pinConfirm) {
      return setError('두 PIN 이 서로 다릅니다. 다시 확인해 주세요')
    }

    setBusy(true)
    try {
      const { signInParent, getMembership } = await auth()
      await signInParent(addr, code)

      // 이미 가족이 있으면 (배우자가 먼저 만들어 둔 경우) 이 기기가 누구인지만 고른다
      const existing = await getMembership()
      if (existing) {
        await goToSlots()
        return
      }
      setStep({ at: 'family' })
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  /**
   * 개발용 우회 — 이메일 인증 없이 부모로 들어간다.
   *
   * 메일 템플릿 설정과 시간당 2통 제한 때문에 이메일 인증은 테스트 비용이 크다.
   * 다른 기능(거래·차트·기기 등록)을 확인하는 동안에는 이 길로 들어간다.
   *
   * 새로 만든 통로가 아니라 0002 부터 있던 join_as_parent(가족코드, PIN) 을 그대로 쓴다.
   * 서버 권한 모델에 구멍을 내지 않는다 — 여전히 PIN 을 맞춰야 부모가 된다.
   *
   * import.meta.env.DEV 로 막아 두어 배포본에는 이 화면이 아예 없다.
   */
  async function testParentLogin() {
    setError(null)
    const c = joinCode.trim().toUpperCase()
    if (c.length < 4) return setError('가족 코드를 입력해 주세요')
    if (!/^\d{6}$/.test(code)) return setError('부모 PIN 6자리를 입력해 주세요')

    setBusy(true)
    try {
      const { ensureAnonymousSession, joinAsParent } = await auth()
      await ensureAnonymousSession()
      await joinAsParent(c, code)
      rememberFamilyCode(c)
      markUnlocked()
      await goToSlots()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  /** 가족은 이미 있다. 이 기기가 엄마인지 아빠인지 아이인지 고른다. */
  async function goToSlots() {
    try {
      const { openSlots } = await import('../lib/device')
      const slots = await openSlots()
      setStep({ at: 'slots', slots })
    } catch (e) {
      // 0009 미적용 서버 — 기기 등록 없이 그대로 들어간다 (부모로 동작)
      if (e instanceof Error && /Could not find the function|PGRST202/.test(e.message)) {
        setNotice('기기 구분 기능은 마이그레이션 0009 적용 후 켜집니다')
        markUnlocked()
        await refreshMembership()
        return
      }
      fail(e)
    }
  }

  async function claim(slot: OpenSlot) {
    setError(null)
    setBusy(true)
    try {
      const { claimDevice } = await import('../lib/device')
      await claimDevice(
        slot.kind === 'parent'
          ? { kind: 'parent', label: slot.label }
          : { kind: 'child', childId: slot.childId },
      )
      if (slot.kind === 'parent') markUnlocked()
      await refreshMembership()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- 부모: 가족

  async function finishParent() {
    setError(null)
    setBusy(true)
    try {
      const { createFamily, joinFamilyAsParent, setParentPin } = await auth()
      if (mode === 'create') {
        await createFamily(familyName, label)
        // 가족을 새로 만든 사람만 화면 잠금 PIN 을 정한다. 로그인 PIN 과 같은 번호로
        // 맞춰 둔다 — 기억할 숫자를 둘로 늘릴 이유가 없다. 설정에서 따로 바꿀 수 있다.
        try {
          await setParentPin(code)
        } catch {
          // 잠금 PIN 을 못 정해도 가족은 만들어졌다. 설정에서 정하면 된다.
        }
      } else {
        const c = joinCode.trim().toUpperCase()
        if (c.length < 4) throw new Error('가족 코드를 입력해 주세요')
        await joinFamilyAsParent(c, label)
        rememberFamilyCode(c)
      }

      // 이름표를 골랐으니 이 핸드폰도 그 이름으로 등록해 둔다. 이걸 빼먹으면
      // member 에는 "아빠" 인데 device 에는 아무것도 없어서, 다음에 앱을 열 때
      // 이 핸드폰이 누구인지 서버가 모른다.
      try {
        const { claimDevice } = await import('../lib/device')
        await claimDevice({ kind: 'parent', label })
      } catch {
        // 이름표가 이미 다른 핸드폰에 잡혀 있을 수 있다. 가족 합류는 이미 끝났으니
        // 막지 않는다 — 설정 > 등록된 핸드폰에서 정리하면 된다.
      }

      markUnlocked()
      await refreshMembership()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  // ---------------------------------------------------------------- 아이

  async function submitChildCode() {
    setError(null)
    const c = joinCode.trim().toUpperCase()
    if (c.length < 4) return setError('가족 코드를 입력해 주세요')

    setBusy(true)
    try {
      const { ensureAnonymousSession, familyChildren, familyExists } = await auth()
      await ensureAnonymousSession()

      if (!(await familyExists(c))) {
        setError('그런 가족 코드가 없습니다. 부모님께 코드를 다시 물어보세요')
        return
      }
      rememberFamilyCode(c)
      const kids = await familyChildren(c)
      setStep({ at: 'childPick', code: c, kids })
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function pickChild(stepCode: string, childId: string) {
    setError(null)
    setBusy(true)
    try {
      const { joinAsChild } = await auth()
      await joinAsChild(stepCode, childId)
      await refreshMembership()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  async function submitNewChild(stepCode: string) {
    setError(null)
    const trimmed = name.trim()
    if (!trimmed) return setError('이름을 적어 주세요')
    if (trimmed.length > 10) return setError('이름이 너무 깁니다')

    const year = birthYear ? Number(birthYear) : null
    if (year !== null) {
      const thisYear = new Date().getFullYear()
      if (year < thisYear - 30 || year > thisYear) return setError('태어난 해를 다시 확인해 주세요')
    }

    setBusy(true)
    try {
      const { joinAsNewChild } = await auth()
      await joinAsNewChild(stepCode, {
        name: trimmed,
        birth_year: year,
        weekly_allowance: Number(allowance.replace(/[^0-9]/g, '')) || 0,
        payday,
      })
      await refreshMembership()
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const labelToggle = (
    <Field label="이름표">
      <Toggle
        options={[
          { key: '엄마', label: '엄마' },
          { key: '아빠', label: '아빠' },
        ]}
        value={label}
        onChange={(k) => setLabel(k as ParentLabel)}
      />
    </Field>
  )

  // ---------------------------------------------------------------- 누구세요

  if (step.at === 'who') {
    return (
      <div className="login">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            ₩
          </div>
          <div className="name">우리아이통장</div>
          <div className="label">이 핸드폰은 누가 쓰나요?</div>
        </div>

        <button className="card tap" onClick={() => void startParent()} disabled={busy}>
          <div className="row">
            <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
              <div className="avatar">부모</div>
              <div>
                <div>엄마 · 아빠</div>
                <div className="label">이메일 + PIN 6자리</div>
              </div>
            </div>
            <span className="muted">›</span>
          </div>
        </button>

        <button className="card tap" onClick={() => setStep({ at: 'childCode' })}>
          <div className="row">
            <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
              <div className="avatar" style={{ background: 'var(--accent-bg)', color: 'var(--accent-text)' }}>
                아이
              </div>
              <div>
                <div>아이</div>
                <div className="label">부모님이 알려준 가족 코드로</div>
              </div>
            </div>
            <span className="muted">›</span>
          </div>
        </button>

        {/* 개발 중에만 보이는 우회 입구. 배포본에는 없다. */}
        {import.meta.env.DEV && (
          <>
            <button className="btn dashed" onClick={() => setStep({ at: 'testParent' })}>
              이메일 없이 부모로 들어가기 (테스트용)
            </button>
            <div className="label muted" style={{ textAlign: 'center' }}>
              가족 코드 + 부모 PIN 으로 바로 들어갑니다. 개발 서버에서만 보입니다.
            </div>
          </>
        )}

        <div className="notice">
          한 번만 하면 다음부터는 앱을 열면 바로 내 화면이 보입니다.
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- 개발용 우회
  //
  // 화면 전체를 DEV 로 감싼다. 버튼만 막으면 화면 코드가 배포본 번들에 그대로 남는다
  // (도달할 수는 없지만 남아 있을 이유도 없다). 여기서 조건을 걸면 빌드가 통째로 지운다.

  if (import.meta.env.DEV && step.at === 'testParent') {
    return (
      <div className="login">
        <div className="brand">
          <div className="name">테스트용 부모 로그인</div>
          <div className="label">이메일 인증을 건너뜁니다</div>
        </div>

        <div
          className="card"
          style={{
            background: 'var(--warning-bg)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-text)',
            fontSize: 13,
          }}
        >
          개발 서버에서만 보이는 입구입니다. 배포본에는 없습니다.
          <br />
          가족 코드와 부모 PIN 을 맞춰야 들어갈 수 있는 건 그대로입니다.
        </div>

        <Field label="가족 코드">
          <input
            className="field"
            type="text"
            autoCapitalize="characters"
            placeholder="ABC123"
            value={joinCode}
            autoFocus
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase())
              setError(null)
            }}
          />
        </Field>

        <Field label="부모 PIN 6자리">
          <input
            className="field amount"
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^0-9]/g, ''))
              setError(null)
            }}
          />
        </Field>

        {error && <div className="error">{error}</div>}

        <button className="btn primary" onClick={() => void testParentLogin()} disabled={busy}>
          {busy ? '들어가는 중…' : '들어가기'}
        </button>

        <button className="btn" onClick={() => setStep({ at: 'who' })} disabled={busy}>
          뒤로
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------- 부모: 이메일 + PIN

  if (step.at === 'email') {
    const signup = parentMode === 'signup'
    return (
      <div className="login">
        <div className="brand">
          <div className="name">부모 등록</div>
          <div className="label">이메일과 PIN 6자리로 들어갑니다</div>
        </div>

        <Toggle
          options={[
            { key: 'signup', label: '처음이에요' },
            { key: 'signin', label: '이미 등록했어요' },
          ]}
          value={parentMode}
          onChange={(k) => {
            setParentMode(k as 'signup' | 'signin')
            setError(null)
          }}
        />

        <Field label="이메일">
          <input
            className="field"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            autoFocus
            onChange={(e) => {
              setEmail(e.target.value)
              setError(null)
            }}
          />
        </Field>

        <Field label={signup ? '쓸 PIN 6자리' : 'PIN 6자리'}>
          <input
            className="field amount"
            type="password"
            inputMode="numeric"
            autoComplete={signup ? 'new-password' : 'current-password'}
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^0-9]/g, ''))
              setError(null)
            }}
          />
        </Field>

        {/* 처음 정하는 PIN 은 오타 하나로 못 들어가는 계정이 된다. 두 번 받는다. */}
        {signup && (
          <Field label="PIN 6자리 다시">
            <input
              className="field amount"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              placeholder="000000"
              value={pinConfirm}
              onChange={(e) => {
                setPinConfirm(e.target.value.replace(/[^0-9]/g, ''))
                setError(null)
              }}
            />
          </Field>
        )}

        {notice && !error && <div className="label muted">{notice}</div>}
        {error && <div className="error">{error}</div>}

        <button className="btn primary" onClick={() => void submitParent()} disabled={busy}>
          {busy ? '확인 중…' : signup ? '등록하고 시작하기' : '들어가기'}
        </button>

        <button className="btn" onClick={() => setStep({ at: 'who' })} disabled={busy}>
          뒤로
        </button>

        <div className="notice">
          {signup ? (
            <>
              메일은 오지 않습니다. 인증 절차가 없으니 <b>PIN 을 꼭 기억해 주세요.</b>
              <br />
              배우자 핸드폰에서도 <b>같은 이메일과 같은 PIN</b> 으로 들어옵니다.
            </>
          ) : (
            <>
              처음 등록할 때 쓴 이메일과 PIN 을 넣어 주세요.
              <br />
              아이 핸드폰은 여기가 아니라 <b>가족 코드</b> 로 붙입니다.
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- 부모: 가족

  if (step.at === 'family') {
    return (
      <div className="login">
        <div className="brand">
          <div className="name">가족 설정</div>
          <div className="label">부모 계정이 준비됐습니다</div>
        </div>

        <Toggle
          options={[
            { key: 'create', label: '새로 시작' },
            { key: 'join', label: '가족에 합류' },
          ]}
          value={mode}
          onChange={(k) => {
            setMode(k as 'create' | 'join')
            setError(null)
          }}
        />

        {mode === 'create' ? (
          <>
            <Field label="가족 이름">
              <input
                className="field"
                type="text"
                placeholder="우리집"
                value={familyName}
                maxLength={20}
                onChange={(e) => setFamilyName(e.target.value)}
              />
            </Field>
            {labelToggle}
            <div className="label muted">
              가족 코드는 자동으로 만들어집니다. 아이 핸드폰을 붙이거나 배우자를 초대할 때
              설정에서 확인하세요.
            </div>
          </>
        ) : (
          <>
            <Field label="가족 코드">
              <input
                className="field"
                type="text"
                autoCapitalize="characters"
                placeholder="배우자에게 받은 코드"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase())
                  setError(null)
                }}
              />
            </Field>
            {labelToggle}
            <div className="label muted">
              먼저 가입한 쪽의 설정 &gt; 가족 코드에서 확인할 수 있습니다.
              엄마와 아빠는 권한이 같습니다.
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <button className="btn primary" onClick={finishParent} disabled={busy}>
          {busy ? '설정 중…' : '시작하기'}
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------- 기기 등록

  if (step.at === 'slots') {
    const parents = step.slots.filter((s) => s.kind === 'parent')
    const kids = step.slots.filter((s) => s.kind === 'child')

    return (
      <div className="login">
        <div className="brand">
          <div className="name">이 핸드폰은 누구예요?</div>
          <div className="label">가족은 이미 연결됐습니다</div>
        </div>

        {parents.length > 0 && <div className="label">부모</div>}
        {parents.map((s) => (
          <button
            key={s.kind === 'parent' ? s.label : ''}
            className="card tap"
            onClick={() => void claim(s)}
            disabled={busy}
          >
            <div className="row">
              <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
                <div className="avatar">{s.kind === 'parent' ? s.label : ''}</div>
                <div>
                  <div>{s.kind === 'parent' ? s.label : ''}</div>
                  <div className="label">부모 권한 · 전체 관리</div>
                </div>
              </div>
              <span className="muted">›</span>
            </div>
          </button>
        ))}

        {kids.length > 0 && <div className="label">아이</div>}
        {kids.map((s, i) => {
          const color = colorOf(i)
          const nm = s.kind === 'child' ? s.childName : ''
          return (
            <button
              key={s.kind === 'child' ? s.childId : String(i)}
              className="card tap"
              style={{ borderColor: color.fill }}
              onClick={() => void claim(s)}
              disabled={busy}
            >
              <div className="row">
                <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
                  <div className="avatar" style={{ background: color.bg, color: color.fg }}>
                    {nm.slice(0, 2)}
                  </div>
                  <div>
                    <div>{nm}</div>
                    <div className="label">조회 전용 · 내 통장만</div>
                  </div>
                </div>
                <span className="muted">›</span>
              </div>
            </button>
          )
        })}

        {parents.length === 0 && kids.length === 0 && (
          <div className="empty">
            고를 수 있는 것이 없습니다.
            <br />
            부모 핸드폰에서 아이를 먼저 등록해 주세요.
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="notice">
          엄마와 아빠는 권한이 같습니다. 서로 다른 핸드폰을 구분하기 위한 이름표입니다.
          <br />
          이미 쓰는 이름표는 목록에 나오지 않습니다.
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- 아이

  if (step.at === 'childCode') {
    return (
      <div className="login">
        <div className="brand">
          <div className="name">가족 코드</div>
          <div className="label">부모님이 알려준 코드를 넣어요</div>
        </div>

        <Field label="가족 코드">
          <input
            className="field"
            type="text"
            autoCapitalize="characters"
            placeholder="예: ABC123"
            value={joinCode}
            autoFocus
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase())
              setError(null)
            }}
          />
        </Field>

        <div className="label muted">새로 만드는 게 아니라, 이미 정해진 코드를 입력합니다.</div>

        {error && <div className="error">{error}</div>}

        <button className="btn primary" onClick={submitChildCode} disabled={busy}>
          {busy ? '확인 중…' : '다음'}
        </button>

        <button className="btn" onClick={() => setStep({ at: 'who' })} disabled={busy}>
          뒤로
        </button>
      </div>
    )
  }

  if (step.at === 'childPick') {
    return (
      <div className="login">
        <div className="brand">
          <div className="name">누구예요?</div>
          <div className="label">가족 코드 {step.code}</div>
        </div>

        {step.kids.map((k, i) => {
          const color = colorOf(i)
          return (
            <button
              key={k.id}
              className="card tap"
              style={{ borderColor: color.fill }}
              onClick={() => void pickChild(step.code, k.id)}
              disabled={busy}
            >
              <div className="row">
                <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
                  <div className="avatar" style={{ background: color.bg, color: color.fg }}>
                    {k.name.slice(0, 2)}
                  </div>
                  <div>
                    <div>{k.name}</div>
                    <div className="label">내 통장 보기</div>
                  </div>
                </div>
                <span className="muted">›</span>
              </div>
            </button>
          )
        })}

        <button className="btn dashed" onClick={() => setStep({ at: 'childNew', code: step.code })}>
          + 내 이름 정하고 시작하기
        </button>

        {error && <div className="error">{error}</div>}

        <button className="btn" onClick={() => setStep({ at: 'childCode' })} disabled={busy}>
          가족 코드 다시 입력
        </button>
      </div>
    )
  }

  // 아이: 새 이름
  // DEV 조건 때문에 testParent 가 타입상 여기까지 내려온다. 명시적으로 걸러낸다.
  if (step.at !== 'childNew') return null

  return (
    <div className="login">
      <div className="brand">
        <div className="name">이름이 뭐예요?</div>
        <div className="label">내 통장을 만들어요</div>
      </div>

      <Field label="이름">
        <input
          className="field"
          type="text"
          placeholder="이름을 적어 주세요"
          value={name}
          maxLength={10}
          autoFocus
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
        />
      </Field>

      <Field label="태어난 해 (선택)">
        <input
          className="field"
          type="text"
          inputMode="numeric"
          placeholder="2016"
          value={birthYear}
          maxLength={4}
          onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ''))}
        />
      </Field>

      <Field label="주간 용돈">
        <input
          className="field amount"
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={allowance ? Number(allowance).toLocaleString('ko-KR') : ''}
          onChange={(e) => setAllowance(e.target.value.replace(/[^0-9]/g, ''))}
        />
      </Field>

      <Field label="용돈 받는 날">
        <select
          className="field"
          value={payday}
          onChange={(e) => setPayday(Number(e.target.value))}
        >
          {WEEKDAYS.map((w) => (
            <option key={w.value} value={w.value}>
              매주 {w.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="label muted">용돈 금액은 부모님이 나중에 바꿀 수 있어요</div>

      {error && <div className="error">{error}</div>}

      <button
        className="btn primary"
        onClick={() => void submitNewChild(step.code)}
        disabled={busy}
      >
        {busy ? '만드는 중…' : '시작하기'}
      </button>

      <button className="btn" onClick={() => setStep({ at: 'childCode' })} disabled={busy}>
        뒤로
      </button>
    </div>
  )
}
