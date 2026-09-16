import { useCallback, useEffect, useState } from 'react'
import { Field } from '../components/ui'
import type { RegisteredDevice } from '../lib/device'
import { asOfLabel, money, num, weekdayName } from '../lib/format'
import { PARENT_KEY, PIN_LENGTH, useSession } from '../state/session'
import { useData, useStore } from '../state/store'

export function Settings() {
  const { children, settings, quotes } = useData()
  const { db, reload, usingSupabase } = useStore()
  const { signOut, setPin, hasPin, isDefaultPin, modeIsFixed } = useSession()

  const [editing, setEditing] = useState<'rate' | 'cap' | 'stamp' | 'pin' | 'quote' | 'code' | null>(null)
  /** 가족 코드. 클라우드 모드에서만 의미가 있다. */
  const [familyCode, setFamilyCode] = useState<string | null>(null)
  const [codeDraft, setCodeDraft] = useState('')
  const [draft, setDraft] = useState('')
  /** PIN 확인 입력. 오타로 잠기는 일을 막기 위해 두 번 받는다. */
  const [draftConfirm, setDraftConfirm] = useState('')
  const [quoteTicker, setQuoteTicker] = useState('')
  /** PIN 을 바꿀 대상. PARENT_KEY 또는 childId */
  const [pinTarget, setPinTarget] = useState<string>(PARENT_KEY)
  const [error, setError] = useState<string | null>(null)

  /** 이 가족에 등록된 핸드폰들. 유령 등록을 정리할 수 있게 보여준다. */
  const [devices, setDevices] = useState<RegisteredDevice[]>([])

  // 클라우드 모드에서는 가족 코드를 보여준다. 아이 핸드폰을 붙일 때 알려줘야 하는 값이다.
  useEffect(() => {
    if (!modeIsFixed) return
    void (async () => {
      const { getFamilyCode } = await import('../lib/auth')
      setFamilyCode(await getFamilyCode())
    })()
  }, [modeIsFixed])

  const loadDevices = useCallback(async () => {
    if (!modeIsFixed) return
    try {
      const { familyDevices } = await import('../lib/device')
      setDevices(await familyDevices())
    } catch {
      // 기기 목록을 못 읽어도 설정의 나머지는 쓸 수 있어야 한다
      setDevices([])
    }
  }, [modeIsFixed])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  async function dropDevice(id: string) {
    setError(null)
    try {
      const { releaseDeviceById } = await import('../lib/device')
      await releaseDeviceById(id)
      await loadDevices()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveCode() {
    setError(null)
    // 형식은 먼저 여기서 본다. 서버가 같은 검사를 하지만, 서버 오류 메시지에 묻히면
    // 무엇이 잘못됐는지 알기 어렵다.
    if (!/^[A-Z0-9]{4,12}$/.test(codeDraft)) {
      return setError('영문 대문자와 숫자 4~12자로 입력해 주세요')
    }
    try {
      const { setFamilyCode: save } = await import('../lib/auth')
      const next = await save(codeDraft)
      setFamilyCode(next)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function open(section: 'rate' | 'cap' | 'stamp' | 'pin' | 'quote' | 'code', initial = '') {
    setEditing(section)
    setDraft(initial)
    setError(null)
  }

  function openPin(target: string) {
    setPinTarget(target)
    setDraftConfirm('')
    open('pin')
  }

  function closePin() {
    setEditing(null)
    setDraft('')
    setDraftConfirm('')
    setError(null)
  }

  const pinTargetName =
    pinTarget === PARENT_KEY
      ? '부모'
      : (children.find((c) => c.id === pinTarget)?.name ?? '아이')

  async function saveRate() {
    const v = Number(draft)
    if (Number.isNaN(v) || v < 0 || v > 100) return setError('0에서 100 사이로 입력해 주세요')
    if (!db) return
    await db.updateSettings({ interest_rate: v })
    await reload()
    setEditing(null)
  }

  async function saveCap() {
    const v = Number(draft.replace(/[^0-9]/g, ''))
    if (!v || v < 1 || v > 100) return setError('1에서 100 사이로 입력해 주세요')
    if (!db) return
    await db.updateSettings({ invest_cap_pct: v })
    await reload()
    setEditing(null)
  }

  async function saveStampGoal() {
    const v = Number(draft.replace(/[^0-9]/g, ''))
    if (!v || v < 1 || v > 20) return setError('1에서 20 사이로 입력해 주세요')
    if (!db) return
    await db.updateSettings({ stamp_goal: v })
    await reload()
    setEditing(null)
  }

  async function savePin() {
    if (draft.length !== PIN_LENGTH || !/^\d+$/.test(draft)) {
      return setError(`숫자 ${PIN_LENGTH}자리로 입력해 주세요`)
    }
    if (draftConfirm.length !== PIN_LENGTH) {
      return setError('확인을 위해 한 번 더 입력해 주세요')
    }
    // 오타로 엉뚱한 PIN 이 저장되면 본인도 못 들어간다. 두 값이 같을 때만 바꾼다.
    if (draft !== draftConfirm) {
      return setError('두 번 입력한 PIN이 서로 다릅니다')
    }
    try {
      await setPin(pinTarget, draft)
      closePin()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function clearPin(target: string) {
    try {
      await setPin(target, null)
      if (editing === 'pin' && pinTarget === target) closePin()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const pinFilled = draft.length === PIN_LENGTH && draftConfirm.length === PIN_LENGTH
  const pinMatches = pinFilled && draft === draftConfirm

  async function saveQuote() {
    const v = Number(draft.replace(/[^0-9.]/g, ''))
    const t = quoteTicker.trim()
    if (!t) return setError('종목 코드를 골라 주세요')
    if (!v || v <= 0) return setError('현재가를 입력해 주세요')
    if (!db) return
    const known = quotes.find((q) => q.ticker === t)
    await db.setManualQuote(t, known?.name ?? t, v)
    await reload()
    setEditing(null)
  }

  return (
    <>
      <div className="section-title">용돈 규칙</div>
      <div className="card">
        {children.map((c) => (
          <div key={c.id} className="list-item">
            <span>{c.name} 주간 용돈</span>
            <span className="label">{money(c.weekly_allowance)}</span>
          </div>
        ))}
        <div className="list-item">
          <span>지급 요일</span>
          <span className="label">
            매주 {weekdayName(children[0]?.payday ?? 1)}요일
          </span>
        </div>
      </div>

      <div className="section-title">이자</div>
      <div className="card">
        <button
          className="list-item"
          style={{ width: '100%', background: 'none', border: 'none', padding: '10px 0' }}
          onClick={() => open('rate', String(settings.interest_rate))}
        >
          <span>연 이자율</span>
          <span className="label">{settings.interest_rate}% ›</span>
        </button>
        <div className="list-item">
          <span>지급 주기</span>
          <span className="label">
            {settings.interest_cycle === 'monthly'
              ? '매월 말'
              : settings.interest_cycle === 'quarterly'
                ? '분기말'
                : '연말'}
          </span>
        </div>
      </div>

      {editing === 'rate' && (
        <div className="card col">
          <Field label="연 이자율 (%)">
            <input
              className="field"
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </Field>
          {error && <div className="error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setEditing(null)}>
              취소
            </button>
            <button className="btn primary" onClick={saveRate}>
              저장
            </button>
          </div>
        </div>
      )}

      <div className="section-title">투자 규칙</div>
      <div className="card">
        <div className="list-item">
          <span>시세 갱신</span>
          <span className="label">
            {usingSupabase ? `자동 · ${settings.quote_refresh_min}분` : '수동 입력'}
          </span>
        </div>
        <button
          className="list-item"
          style={{ width: '100%', background: 'none', border: 'none', padding: '10px 0' }}
          onClick={() => open('cap', String(settings.invest_cap_pct))}
        >
          <span>투자 비중 상한</span>
          <span className="label">{settings.invest_cap_pct}% ›</span>
        </button>
        <div className="list-item">
          <span>주식투자 권한</span>
          <span className="label">부모만</span>
        </div>
      </div>

      {editing === 'cap' && (
        <div className="card col">
          <Field label="투자 비중 상한 (%)">
            <input
              className="field"
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
          <div className="label muted">
            총자산 대비 투자 비중이 이 값을 넘으면 매수 화면에서 경고를 띄웁니다
          </div>
          {error && <div className="error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setEditing(null)}>
              취소
            </button>
            <button className="btn primary" onClick={saveCap}>
              저장
            </button>
          </div>
        </div>
      )}

      <div className="section-title">칭찬도장</div>
      <div className="card">
        <button
          className="list-item"
          style={{ width: '100%', background: 'none', border: 'none', padding: '10px 0' }}
          onClick={() => open('stamp', String(settings.stamp_goal))}
        >
          <span>보상까지 필요한 도장</span>
          <span className="label">{settings.stamp_goal}개 ›</span>
        </button>
      </div>

      {editing === 'stamp' && (
        <div className="card col">
          <Field label="보상까지 필요한 도장 수">
            <input
              className="field"
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
          <div className="label muted">
            아이가 어리면 3개 정도가 낫습니다. 이미 준 보상 기록은 그때 기준을 그대로 둡니다.
          </div>
          {error && <div className="error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setEditing(null)}>
              취소
            </button>
            <button className="btn primary" onClick={saveStampGoal}>
              저장
            </button>
          </div>
        </div>
      )}

      <div className="section-title">시세</div>
      <div className="card">
        {quotes.map((q) => (
          <div key={q.ticker} className="list-item">
            <div>
              <div>{q.name ?? q.ticker}</div>
              <div className="label">
                {q.ticker} · {q.source === 'manual' ? '수동' : 'API'} · {asOfLabel(q.as_of)}
              </div>
            </div>
            <span>{num(q.price)}</span>
          </div>
        ))}
      </div>
      <button
        className="btn dashed"
        onClick={() => {
          setQuoteTicker(quotes[0]?.ticker ?? '')
          open('quote')
        }}
      >
        현재가 직접 입력
      </button>

      {editing === 'quote' && (
        <div className="card col">
          <Field label="종목">
            <select
              className="field"
              value={quoteTicker}
              onChange={(e) => setQuoteTicker(e.target.value)}
            >
              {quotes.map((q) => (
                <option key={q.ticker} value={q.ticker}>
                  {q.name ?? q.ticker}
                </option>
              ))}
            </select>
          </Field>
          <Field label="현재가">
            <input
              className="field amount"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </Field>
          <div className="label muted">
            수동 입력한 값은 자동 갱신이 덮어쓰지 않습니다
          </div>
          {error && <div className="error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setEditing(null)}>
              취소
            </button>
            <button className="btn primary" onClick={saveQuote}>
              저장
            </button>
          </div>
        </div>
      )}

      {modeIsFixed && (
        <>
          <div className="section-title">가족 코드</div>
          <div className="card">
            <div className="list-item">
              <div>
                <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: 1 }}>
                  {familyCode ?? '…'}
                </div>
                <div className="label">아이 핸드폰을 붙일 때 이 코드를 알려주세요</div>
              </div>
              <button
                className="btn small"
                style={{ width: 'auto', padding: '6px 14px' }}
                onClick={() => {
                  setCodeDraft(familyCode ?? '')
                  open('code')
                }}
              >
                변경
              </button>
            </div>
          </div>

          {editing === 'code' && (
            <div className="card col">
              <Field label="새 가족 코드">
                <input
                  className="field"
                  type="text"
                  placeholder="HARIN25"
                  value={codeDraft}
                  autoFocus
                  autoCapitalize="characters"
                  onChange={(e) => {
                    setCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    setError(null)
                  }}
                />
              </Field>
              <div className="label muted">
                영문 대문자와 숫자 4~12자. 이미 붙어 있는 핸드폰은 그대로 쓰이고,
                새로 붙이는 핸드폰만 새 코드를 씁니다.
              </div>
              {error && <div className="error">{error}</div>}
              <div className="btn-row">
                <button className="btn" onClick={() => { setEditing(null); setError(null) }}>
                  취소
                </button>
                <button className="btn primary" onClick={() => void saveCode()}>
                  저장
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="section-title">PIN 관리</div>
      <div className="card">
        <div className="list-item">
          <div>
            <div>부모</div>
            <div className="label">
              {isDefaultPin(PARENT_KEY)
                ? `기본값 ${'0'.repeat(PIN_LENGTH)} · 바꿔 주세요`
                : modeIsFixed
                  ? '가족 전체 공용 · 서버 보관'
                  : '설정됨'}
            </div>
          </div>
          <button
            className="btn small"
            style={{ width: 'auto', padding: '6px 14px' }}
            onClick={() => openPin(PARENT_KEY)}
          >
            변경
          </button>
        </div>

        {children.map((c) => (
          <div key={c.id} className="list-item">
            <div>
              <div>{c.name}</div>
              <div className="label">
                {hasPin(c.id) ? 'PIN 사용 중' : 'PIN 없이 바로 들어감'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {hasPin(c.id) && (
                <button
                  className="btn small"
                  style={{ width: 'auto', padding: '6px 12px', color: 'var(--text-secondary)' }}
                  onClick={() => void clearPin(c.id)}
                >
                  해제
                </button>
              )}
              <button
                className="btn small"
                style={{ width: 'auto', padding: '6px 12px' }}
                onClick={() => openPin(c.id)}
              >
                {hasPin(c.id) ? '재설정' : '설정'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="label muted">
        아이가 PIN을 잊어버리면 여기서 새로 정해 주세요. 지금 PIN을 몰라도 바꿀 수 있습니다.
      </div>

      {editing === 'pin' && (
        <div className="card col">
          <Field label={`${pinTargetName}의 새 PIN ${PIN_LENGTH}자리`}>
            <input
              className="field amount"
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={draft}
              autoFocus
              onChange={(e) => {
                setDraft(e.target.value.replace(/[^0-9]/g, ''))
                setError(null)
              }}
            />
          </Field>

          <Field label="다시 한 번 입력">
            <input
              className="field amount"
              type="password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              value={draftConfirm}
              onChange={(e) => {
                setDraftConfirm(e.target.value.replace(/[^0-9]/g, ''))
                setError(null)
              }}
            />
          </Field>

          {pinFilled && (
            <div className={`label ${pinMatches ? 'up' : 'down'}`}>
              {pinMatches ? '두 값이 같습니다' : '두 값이 다릅니다'}
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div className="btn-row">
            <button className="btn" onClick={closePin}>
              취소
            </button>
            <button className="btn primary" onClick={() => void savePin()}>
              저장
            </button>
          </div>
        </div>
      )}

      {modeIsFixed && (
        <>
          <div className="section-title">등록된 핸드폰</div>
          <div className="card">
            {devices.length === 0 && <div className="label muted">아직 없습니다</div>}
            {devices.map((d) => (
              <div key={d.id} className="list-item">
                <div style={{ minWidth: 0 }}>
                  <div>
                    {d.kind === 'parent'
                      ? (d.label ?? '부모')
                      : (children.find((c) => c.id === d.childId)?.name ?? '아이')}
                    {d.isMe && <span className="chip" style={{ marginLeft: 6 }}>이 핸드폰</span>}
                  </div>
                  <div className="label muted">
                    {d.lastSeen ? `마지막 접속 ${asOfLabel(d.lastSeen)}` : '접속 기록 없음'}
                  </div>
                </div>
                {!d.isMe && (
                  <button className="btn small" onClick={() => void dropDevice(d.id)}>
                    해제
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="notice">
            앱을 지웠다 깔면 예전 등록이 이름표를 쥔 채 남습니다. 그게 둘 쌓이면 새
            핸드폰이 엄마·아빠를 못 고르니, 안 쓰는 것은 여기서 해제해 주세요.
            <br />
            해제해도 <b>기록은 지워지지 않습니다.</b> 그 핸드폰에서 다시 고르면 됩니다.
          </div>
        </>
      )}

      <div className="section-title">기타</div>
      <div className="card">
        <div className="list-item">
          <span>데이터 저장</span>
          <span className="label">
            {usingSupabase ? '클라우드 동기화' : '이 핸드폰에만'}
          </span>
        </div>
      </div>

      {!usingSupabase && (
        <div className="notice">
          지금은 이 핸드폰에만 저장됩니다.
          <br />
          클라우드 동기화를 켜려면 app/.env 에 Supabase 주소와 키를 넣어 주세요.
        </div>
      )}

      <div className="spacer" />

      <button className="btn" onClick={() => void signOut()}>
        {modeIsFixed ? '이 핸드폰 연결 해제' : '모드 바꾸기'}
      </button>

      {modeIsFixed && (
        <div className="notice">
          연결을 해제하면 이 핸드폰은 가족 코드부터 다시 입력해야 합니다.
          <br />
          기록은 지워지지 않습니다.
        </div>
      )}
    </>
  )
}
