import { useState } from 'react'
import { ProgressBar, colorOf } from '../components/ui'
import { goalProgress, weeksToGoal } from '../lib/compute'
import { money } from '../lib/format'
import { useData, useStore } from '../state/store'
import type { ChildAsset, Goal } from '../lib/types'

function GoalCard({
  goal,
  asset,
  weekly,
  index,
  onApprove,
  onCancel,
  onAchieve,
  onUndo,
}: {
  goal: Goal
  asset: ChildAsset
  weekly: number
  index: number
  onApprove?: () => void
  onCancel?: () => void
  onAchieve?: () => void
  onUndo?: () => void
}) {
  const progress = goalProgress(goal.target_amount, goal.basis, asset)
  const weeks = weeksToGoal(goal.target_amount, goal.basis, asset, weekly)
  const color = colorOf(index)

  if (goal.status === 'requested') {
    return (
      <div
        className="card"
        style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}
      >
        <div className="row" style={{ color: 'var(--warning-text)' }}>
          <div>
            <div style={{ fontWeight: 500 }}>{goal.title}</div>
            <div style={{ fontSize: 12 }}>{money(goal.target_amount)} 신청</div>
          </div>
          {onApprove && (
            <button className="btn small" style={{ width: 'auto', padding: '6px 14px' }} onClick={onApprove}>
              승인
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="row">
        <span style={{ fontWeight: 500 }}>{goal.title}</span>
        <span className="label">
          {goal.status === 'achieved' ? '달성' : `${Math.round(progress)}%`}
        </span>
      </div>
      <div style={{ margin: '8px 0 5px' }}>
        <ProgressBar
          pct={goal.status === 'achieved' ? 100 : progress}
          color={goal.status === 'achieved' ? 'var(--warning-fill)' : color.fill}
        />
      </div>
      <div className="row label">
        <span>
          {money(goal.basis === 'cash' ? asset.cash : asset.total)} / {money(goal.target_amount)}
        </span>
        <span>
          {goal.status === 'achieved'
            ? '달성'
            : weeks === null
              ? goal.basis === 'cash' ? '현금 기준' : '총자산 기준'
              : weeks === 0
                ? '모았어요'
                : `약 ${weeks}주 남음`}
        </span>
      </div>
      {/*
        달성은 부모가 눌러 주는 것이다. 돈이 모였다고 저절로 달성이 되면 안 된다 —
        실제로 사 줬는지는 앱이 알 수 없고, 아이의 '달성한 목표' 기록이 멋대로 늘어난다.
      */}
      {goal.status === 'active' && (onAchieve || onCancel) && (
        <div className="btn-row" style={{ marginTop: 9 }}>
          {onCancel && (
            <button className="btn small" style={{ color: 'var(--text-secondary)' }} onClick={onCancel}>
              목표 내리기
            </button>
          )}
          {onAchieve && (
            <button className="btn small primary" onClick={onAchieve}>
              달성했어요
            </button>
          )}
        </div>
      )}
      {goal.status === 'achieved' && onUndo && (
        <button
          className="btn small"
          style={{ marginTop: 9, color: 'var(--text-secondary)' }}
          onClick={onUndo}
        >
          달성 취소
        </button>
      )}
    </div>
  )
}

export function ParentGoals() {
  const { children, assets, goals } = useData()
  const { db, reload } = useStore()

  async function setStatus(id: string, status: Goal['status']) {
    if (!db) return
    await db.setGoalStatus(id, status)
    await reload()
  }

  return (
    <>
      {children.map((child) => {
        const asset = assets.find((a) => a.child_id === child.id)
        const mine = goals.filter(
          (g) => g.child_id === child.id && g.status !== 'canceled',
        )
        if (!asset) return null
        return (
          <div key={child.id} className="col">
            <div className="section-title">{child.name}의 목표</div>
            {mine.length === 0 && <div className="empty">목표가 없습니다</div>}
            {mine.map((g, i) => (
              <GoalCard
                key={g.id}
                goal={g}
                asset={asset}
                weekly={child.weekly_allowance}
                index={i}
                onApprove={() => void setStatus(g.id, 'active')}
                onCancel={() => void setStatus(g.id, 'canceled')}
                onAchieve={() => void setStatus(g.id, 'achieved')}
                onUndo={() => void setStatus(g.id, 'active')}
              />
            ))}
          </div>
        )
      })}
    </>
  )
}

export function KidGoals({ childId }: { childId: string }) {
  const { children, assets, goals } = useData()
  const { db, reload } = useStore()

  const child = children.find((c) => c.id === childId)
  const asset = assets.find((a) => a.child_id === childId)
  const mine = goals.filter((g) => g.child_id === childId && g.status !== 'canceled')

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!child || !asset) return <div className="empty">정보를 찾을 수 없습니다</div>

  async function request() {
    setError(null)
    const amount = Number(target.replace(/[^0-9]/g, ''))
    if (!title.trim()) return setError('무엇을 사고 싶은지 적어 주세요')
    if (!amount || amount <= 0) return setError('얼마인지 적어 주세요')
    if (!db) return setError('지금은 신청할 수 없어요')

    try {
      await db.addGoal({
        child_id: childId,
        title: title.trim(),
        target_amount: amount,
        basis: 'cash',
        status: 'requested',
      })
      await reload()
      setAdding(false)
      setTitle('')
      setTarget('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      {mine.length === 0 && <div className="empty">아직 목표가 없어요</div>}

      {mine.map((g, i) => {
        const remain = g.target_amount - (g.basis === 'cash' ? asset.cash : asset.total)
        return (
          <div key={g.id}>
            <GoalCard
              goal={g}
              asset={asset}
              weekly={child.weekly_allowance}
              index={i}
            />
            {g.status === 'active' && remain > 0 && (
              <div className="label muted" style={{ marginTop: 4 }}>
                {money(remain)} 더 모으면 끝!
              </div>
            )}
          </div>
        )
      })}

      <div className="spacer" />

      {adding ? (
        <div className="card col">
          <input
            className="field"
            type="text"
            placeholder="사고 싶은 것"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="field"
            type="text"
            inputMode="numeric"
            placeholder="얼마예요?"
            value={target ? Number(target).toLocaleString('ko-KR') : ''}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))}
          />
          {error && <div className="error">{error}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setAdding(false)}>
              취소
            </button>
            <button className="btn primary" onClick={request}>
              신청
            </button>
          </div>
        </div>
      ) : (
        <button className="btn dashed" onClick={() => setAdding(true)}>
          + 목표 신청하기
        </button>
      )}

      <div className="notice">부모님이 확인하면 목표가 시작돼요</div>
    </>
  )
}
