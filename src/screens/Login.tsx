import { useState } from 'react'
import { colorOf } from '../components/ui'
import { PIN_LENGTH, useSession } from '../state/session'
import { useData, useStore } from '../state/store'
import { ChildSetup } from './ChildSetup'

export function Login() {
  const { children } = useData()
  const { loading } = useStore()
  const { enterParent, enterChild, hasPin } = useSession()
  const [naming, setNaming] = useState(false)

  if (naming) {
    return (
      <div className="login">
        <div className="brand">
          <div className="name">이름이 뭐예요?</div>
          <div className="label">내 통장을 만들어요</div>
        </div>
        <ChildSetup
          variant="self"
          onCreated={(childId) => {
            setNaming(false)
            enterChild(childId)
          }}
          onCancel={() => setNaming(false)}
        />
      </div>
    )
  }

  return (
    <div className="login">
      <div className="brand">
        <div className="mark" aria-hidden="true">
          ₩
        </div>
        <div className="name">우리아이통장</div>
        <div className="label">누구세요?</div>
      </div>

      <button className="card tap" onClick={enterParent}>
        <div className="row">
          <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
            <div className="avatar">부모</div>
            <div>
              <div>부모 모드</div>
              <div className="label">전체 관리 · PIN 필요</div>
            </div>
          </div>
          <span className="muted">›</span>
        </div>
      </button>

      {loading && <div className="empty">불러오는 중…</div>}

      {children.length > 0 && <div className="label">아이</div>}

      {children.map((c, i) => {
        const color = colorOf(i)
        return (
          <button
            key={c.id}
            className="card tap"
            style={{ borderColor: color.fill }}
            onClick={() => enterChild(c.id)}
          >
            <div className="row">
              <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
                <div className="avatar" style={{ background: color.bg, color: color.fg }}>
                  {c.name.slice(0, 2)}
                </div>
                <div>
                  <div>{c.name}</div>
                  <div className="label">
                    {hasPin(c.id) ? 'PIN 필요' : '내 통장 보기'}
                  </div>
                </div>
              </div>
              <span className="muted">›</span>
            </div>
          </button>
        )
      })}

      <button className="btn dashed" onClick={() => setNaming(true)}>
        + 내 이름 정하고 시작하기
      </button>

      <div className="notice">
        {children.length === 0
          ? '아이 이름을 정하면 그 이름으로 통장이 만들어져요'
          : '마지막 모드를 기억합니다'}
      </div>
    </div>
  )
}

/**
 * PIN 입력 화면. 부모 모드와 아이 모드가 같은 화면을 쓴다.
 * 서버 권한은 RLS 가 막고, 이 화면은 같은 기기에서 모드를 번갈아 쓸 때의 잠금이다.
 */
export function PinGate({
  who,
  hint,
  showDefaultNotice,
}: {
  who: string
  hint: string
  showDefaultNotice: boolean
}) {
  const { unlock, signOut, modeIsFixed } = useSession()
  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)

  function press(d: string) {
    if (checking) return
    setError(false)
    const next = (digits + d).slice(0, PIN_LENGTH)
    setDigits(next)
    if (next.length === PIN_LENGTH) {
      // 마지막 점이 찍히는 걸 보여준 뒤 검사한다.
      // 클라우드 모드에서는 서버가 확인하므로 기다리는 시간이 있다.
      setChecking(true)
      setTimeout(async () => {
        const ok = await unlock(next)
        setChecking(false)
        if (!ok) {
          setError(true)
          setDigits('')
        }
      }, 120)
    }
  }

  function backspace() {
    setError(false)
    setDigits((d) => d.slice(0, -1))
  }

  return (
    <div className="login">
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 500 }}>
          {who} PIN {PIN_LENGTH}자리 입력
        </div>
        <div className="label">{hint}</div>
      </div>

      <div className="pin-dots" aria-label={`${digits.length}자리 입력됨`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={i < digits.length ? undefined : 'off'}>
            {i < digits.length ? '●' : '○'}
          </span>
        ))}
      </div>

      {checking && <div className="label muted" style={{ textAlign: 'center' }}>확인 중…</div>}
      {error && <div className="error">PIN이 맞지 않습니다. 다시 입력해 주세요</div>}

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="blank" aria-hidden="true" tabIndex={-1} />
        <button onClick={() => press('0')}>0</button>
        <button onClick={backspace} aria-label="지우기">
          ←
        </button>
      </div>

      {showDefaultNotice && (
        <div className="notice">
          처음 쓰신다면 기본 PIN은 {'0'.repeat(PIN_LENGTH)}입니다.
          <br />
          설정 &gt; PIN 관리에서 바꿔 주세요.
        </div>
      )}

      <button className="btn" onClick={() => void signOut()} disabled={checking}>
        {modeIsFixed ? '이 핸드폰 연결 해제' : '모드 다시 고르기'}
      </button>
    </div>
  )
}
