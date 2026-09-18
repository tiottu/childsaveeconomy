import { useState } from 'react'
import { GrowthCaption, GrowthTree } from '../components/GrowthTree'
import { Field, ProgressBar, Toggle } from '../components/ui'
import { dayLabel } from '../lib/format'
import { useData, useStore } from '../state/store'
import type { Reward, Stamp } from '../lib/types'

/**
 * 칭찬도장.
 *
 * 도장이 생기는 길이 둘이다 — 부모가 바로 찍어주거나, 아이가 신청해서 부모가 승인한다.
 * 모으면 보상으로 바꾼다 (기본 5개, 설정에서 조절).
 *
 * 아이 화면은 크고 밝게 둔다. 숫자보다 도장 모양이 먼저 눈에 들어와야 한다.
 * 거절을 '거절' 이라 쓰지 않고 '다음에' 로 적는다 — 아이가 읽는 말이다.
 */

/** 한 아이의 도장을 상태별로 갈라 놓는다 */
function split(stamps: Stamp[], childId: string) {
  const mine = stamps.filter((s) => s.child_id === childId)
  return {
    waiting: mine.filter((s) => s.status === 'requested'),
    given: mine.filter((s) => s.status === 'given'),
    rejected: mine.filter((s) => s.status === 'rejected'),
    done: mine.filter((s) => s.status === 'used'),
  }
}

/** 도장판. 채운 칸과 빈 칸을 그린다. */
function Board({
  count,
  goal,
  big = false,
}: {
  count: number
  goal: number
  big?: boolean
}) {
  const size = big ? 42 : 34
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        flexWrap: 'wrap',
      }}
    >
      {Array.from({ length: goal }, (_, i) => {
        const filled = i < count
        return (
          <div
            key={i}
            aria-hidden="true"
            style={{
              width: size,
              height: size,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: big ? 21 : 17,
              background: filled ? 'var(--warning-bg)' : 'transparent',
              color: 'var(--warning-text)',
              border: filled ? 'none' : '1px dashed var(--border-strong)',
            }}
          >
            {filled ? '★' : ''}
          </div>
        )
      })}
    </div>
  )
}

function RewardList({ rewards, title }: { rewards: Reward[]; title: string }) {
  if (rewards.length === 0) return null
  return (
    <>
      <div className="section-title">{title}</div>
      <div className="card">
        {rewards.map((r) => (
          <div key={r.id} className="list-item">
            <span>{r.title}</span>
            <span className="label muted">
              {dayLabel(r.created_at.slice(0, 10))} · 도장 {r.stamps}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- 부모

export function ParentStamps({
  childId,
  onSelectChild,
}: {
  childId: string
  onSelectChild: (id: string) => void
}) {
  const { children, stamps, rewards, settings } = useData()
  const { db, reload } = useStore()

  const [reason, setReason] = useState('')
  const [rewardTitle, setRewardTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /*
    도장을 주는 것도, 보상을 주는 것도 실제로 값을 바꾸는 행동이다. 한 번 눌렀다고
    바로 처리하지 않고, "정말 처리할까요?" 를 한 번 더 물은 뒤에야 실행한다.
    거절("이번엔 아니야")은 되돌리기 쉬운 쪽이라 확인을 두지 않는다.
    값은 무엇을 확인 중인지 나타낸다 — 신청 도장은 그 id, 직접 찍기/보상 주기는
    고정 키를 쓴다.
  */
  const [confirming, setConfirming] = useState<string | null>(null)

  const child = children.find((c) => c.id === childId)
  const goal = settings.stamp_goal
  const { waiting, given, rejected, done } = split(stamps, childId)
  const mine = rewards.filter((r) => r.child_id === childId)
  const left = Math.max(0, goal - given.length)

  if (!child) return <div className="empty">아이를 먼저 등록해 주세요</div>

  async function run(fn: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  /** 확인 문구 + 취소/네 버튼 한 줄. 눌러야 할 행동 바로 아래에 붙인다. */
  function ConfirmBar({ text, onYes }: { text: string; onYes: () => void }) {
    return (
      <div style={{ marginTop: 10 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          {text}
        </div>
        <div className="btn-row">
          <button className="btn small" disabled={busy} onClick={() => setConfirming(null)}>
            취소
          </button>
          <button className="btn small primary" disabled={busy} onClick={onYes}>
            {busy ? '처리 중…' : '네, 맞아요'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {children.length > 1 && (
        <Toggle
          options={children.map((c) => ({ key: c.id, label: c.name }))}
          value={childId}
          onChange={onSelectChild}
        />
      )}

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="label">모은 도장</div>
        {/* 아이 화면과 같은 나무를 보여준다 — 아이가 무엇을 보고 있는지 부모도 알아야 한다 */}
        <GrowthTree count={given.length} goal={goal} size={104} />
        <GrowthCaption count={given.length} goal={goal} />
        <div style={{ margin: '10px 0' }}>
          <Board count={given.length} goal={goal} />
        </div>
        <div className="big">
          {given.length} / {goal}
        </div>
        <div className="label muted">
          {left === 0 ? '보상을 줄 수 있어요' : `${left}개 더 모으면 보상`}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {waiting.length > 0 && (
        <>
          <div className="section-title">기다리는 신청 {waiting.length}</div>
          {waiting.map((s) => (
            <div
              key={s.id}
              className="card"
              style={{ borderColor: 'var(--accent-border)' }}
            >
              <div>{s.reason || '칭찬도장 신청'}</div>
              <div className="label muted" style={{ marginTop: 2 }}>
                {child.name}이 신청 · {dayLabel(s.created_at.slice(0, 10))}
              </div>
              {confirming === s.id ? (
                <ConfirmBar
                  text={`정말 ${child.name}에게 도장을 줄까요?`}
                  onYes={() => void run(() => db!.decideStamp(s.id, true))}
                />
              ) : (
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button
                    className="btn small primary"
                    disabled={busy}
                    onClick={() => setConfirming(s.id)}
                  >
                    도장 주기
                  </button>
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() => void run(() => db!.decideStamp(s.id, false))}
                  >
                    이번엔 아니야
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <div className="section-title">직접 도장 찍기</div>
      <Field label="무엇을 잘했나요 (선택)">
        <input
          className="field"
          type="text"
          placeholder="예: 동생을 잘 돌봤어요"
          value={reason}
          maxLength={60}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {confirming === 'give' ? (
        <ConfirmBar
          text={`정말 ${child.name}에게 도장을 찍어줄까요?`}
          onYes={() =>
            void run(async () => {
              await db!.giveStamp(childId, reason.trim() || null)
              setReason('')
            })
          }
        />
      ) : (
        <button className="btn primary" disabled={busy} onClick={() => setConfirming('give')}>
          {child.name}에게 도장 찍어주기
        </button>
      )}

      <div className="section-title">보상 주기</div>
      {given.length >= goal ? (
        <>
          {/* 아이가 미리 적어 둔 소원이 있으면 보여준다 — 부모가 매번 새로 지어내지 않아도 된다 */}
          {child.reward_wish && (
            <div className="card row" style={{ borderColor: 'var(--accent-border)' }}>
              <div>
                <div className="label">{child.name}가 받고 싶어하는 것</div>
                <div style={{ marginTop: 2 }}>{child.reward_wish}</div>
              </div>
              <button
                className="btn small"
                style={{ width: 'auto', padding: '6px 12px' }}
                onClick={() => setRewardTitle(child.reward_wish ?? '')}
              >
                이걸로 채우기
              </button>
            </div>
          )}
          <Field label="무엇을 해줄까요">
            <input
              className="field"
              type="text"
              placeholder="예: 놀이공원 가기"
              value={rewardTitle}
              maxLength={40}
              onChange={(e) => setRewardTitle(e.target.value)}
            />
          </Field>
          {confirming === 'redeem' ? (
            <ConfirmBar
              text={`도장 ${goal}개를 쓰고 "${rewardTitle || '보상'}" 을 정말 줄까요?`}
              onYes={() =>
                void run(async () => {
                  await db!.redeemStamps(childId, rewardTitle)
                  setRewardTitle('')
                })
              }
            />
          ) : (
            <button className="btn primary" disabled={busy} onClick={() => setConfirming('redeem')}>
              도장 {goal}개로 보상 주기
            </button>
          )}
          <div className="label muted">
            도장 {goal}개가 사라지고 아래 기록에 남습니다. 도장판은 다시 비워집니다.
          </div>
        </>
      ) : (
        <div className="empty">도장 {left}개를 더 모으면 보상을 줄 수 있어요</div>
      )}

      <RewardList rewards={mine} title={`${child.name}에게 준 보상`} />

      {(rejected.length > 0 || done.length > 0) && (
        <>
          <div className="section-title">지난 기록</div>
          <div className="card">
            {done.length > 0 && (
              <div className="list-item">
                <span className="label">보상으로 바꾼 도장</span>
                <span className="label muted">{done.length}개</span>
              </div>
            )}
            {rejected.map((s) => (
              <div key={s.id} className="list-item">
                <span className="label muted">{s.reason || '신청'}</span>
                <span className="label muted">다음에</span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------- 아이

export function KidStamps({ childId }: { childId: string }) {
  const { children, stamps, rewards, settings } = useData()
  const { db, reload } = useStore()

  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // 받고 싶은 것 — 저장된 값과 따로 들고 있다가 "저장" 을 눌러야 반영한다.
  // 부모 화면에 곧바로 보이는 값이니, 타이핑 중간 글자가 새어 나가면 안 된다.
  const [wish, setWish] = useState<string | null>(null)
  const [wishSaving, setWishSaving] = useState(false)
  const [wishSaved, setWishSaved] = useState(false)

  const child = children.find((c) => c.id === childId)
  const goal = settings.stamp_goal
  const { waiting, given, rejected } = split(stamps, childId)
  const mine = rewards.filter((r) => r.child_id === childId)
  const left = Math.max(0, goal - given.length)

  if (!child) return <div className="empty">정보를 찾을 수 없어요</div>

  // wish 가 null 이면 아직 입력칸을 안 건드린 것 — 서버 값을 그대로 보여준다.
  // 한 번이라도 타이핑했으면(null 이 아니면) 그 뒤로는 입력값을 우선한다.
  const wishValue = wish ?? child.reward_wish ?? ''

  async function saveWish() {
    if (!db) return
    setWishSaving(true)
    setWishSaved(false)
    try {
      await db.setRewardWish(childId, wishValue)
      await reload()
      setWishSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setWishSaving(false)
    }
  }

  async function request() {
    const text = reason.trim()
    if (!text) return setError('무엇을 잘했는지 적어 주세요')

    setError(null)
    setBusy(true)
    try {
      await db!.requestStamp(childId, text)
      setReason('')
      setSent(true)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 신청한 것과 결과를 한 줄씩 보여준다. 최근 것이 위로 온다.
  const history = [...waiting, ...given, ...rejected].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )

  return (
    <>
      <div className="quest">
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span className="quest-title">보상까지</span>
          <span className="quest-count">
            {given.length} / {goal}
          </span>
        </div>
        {/* 도장이 쌓이는 걸 나무가 자라는 것으로 보여준다 */}
        <GrowthTree count={given.length} goal={goal} size={140} />
        <GrowthCaption count={given.length} goal={goal} />
        <div style={{ margin: '10px 0' }}>
          <ProgressBar
            pct={goal > 0 ? (given.length / goal) * 100 : 0}
            color="var(--accent-fill)"
          />
        </div>
        <Board count={given.length} goal={goal} big />
        <div className="label" style={{ marginTop: 10 }}>
          {left === 0 ? '보상을 받을 수 있어요' : `도장 ${left}개 남았어요`}
        </div>
      </div>

      {/*
        보상을 부모가 마음대로 정하지 않고, 뭘 받고 싶은지 아이가 직접 적어 둔다.
        도장을 다 모으기 전에도 미리 적어 둘 수 있다 — 모으는 동안 뭘 위해 모으는지
        보여야 재미있다.
      */}
      <div className="section-title">받고 싶은 것</div>
      <Field label="보상으로 받고 싶은 것 (안 적어도 돼요)">
        <input
          className="field"
          type="text"
          placeholder="예: 조립 로봇 장난감"
          value={wishValue}
          maxLength={40}
          onChange={(e) => {
            setWish(e.target.value)
            setWishSaved(false)
          }}
        />
      </Field>
      <button className="btn" disabled={wishSaving} onClick={() => void saveWish()}>
        {wishSaving ? '저장 중…' : '저장'}
      </button>
      {wishSaved && <div className="label muted">저장했어요. 부모님 화면에도 보여요.</div>}

      <div className="section-title">도장 신청</div>
      <Field label="무엇을 잘했는지 적기">
        <input
          className="field"
          type="text"
          placeholder="예: 방을 혼자 치웠어요"
          value={reason}
          maxLength={60}
          onChange={(e) => {
            setReason(e.target.value)
            setError(null)
            setSent(false)
          }}
        />
      </Field>
      {error && <div className="error">{error}</div>}
      <button className="btn primary" disabled={busy} onClick={() => void request()}>
        {busy ? '보내는 중…' : '신청 보내기'}
      </button>
      {sent && !error && <div className="label muted">보냈어요. 부모님이 확인하면 도장이 들어와요.</div>}

      {history.length > 0 && (
        <>
          <div className="section-title">신청 기록</div>
          <div className="card">
            {history.map((s) => (
              <div key={s.id} className="list-item">
                <span
                  style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: s.status === 'rejected' ? 'var(--text-muted)' : undefined,
                  }}
                >
                  {s.reason || (s.asked_by === 'parent' ? '부모님이 주신 도장' : '칭찬도장')}
                </span>
                {s.status === 'requested' && <span className="chip amber">심사 중</span>}
                {s.status === 'given' && <span className="chip green">통과</span>}
                {s.status === 'rejected' && <span className="chip gray">다음 기회</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <RewardList rewards={mine} title="받은 보상" />
    </>
  )
}
