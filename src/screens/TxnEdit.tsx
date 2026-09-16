import { useState } from 'react'
import { Field, Toggle } from '../components/ui'
import { money } from '../lib/format'
import type { CashTxn } from '../lib/types'
import { useStore } from '../state/store'

const IN_CATEGORIES = ['용돈', '보너스', '선물', '이자', '배당금', '기타']
const OUT_CATEGORIES = ['간식', '학용품', '장난감', '책', '기부', '기타']

/**
 * 현금 거래 수정·삭제.
 *
 * 매매로 생긴 기록(trade_id 가 있는 행)은 금액을 바꿀 수 없다. 그것만 고치면
 * 주식 수량은 그대로인데 돈만 달라져 장부가 어긋난다. 분류·메모·날짜만 허용하고,
 * 금액을 고치려면 투자 화면에서 그 매매를 지우고 다시 넣게 안내한다.
 */
export function TxnEdit({
  txn,
  childName,
  onDone,
}: {
  txn: CashTxn
  childName: string
  onDone: () => void
}) {
  const { db, reload } = useStore()

  const linkedToTrade = txn.trade_id !== null

  const [direction, setDirection] = useState<'in' | 'out'>(txn.direction)
  const [amount, setAmount] = useState(String(txn.amount))
  const [category, setCategory] = useState(txn.category ?? '기타')
  const [memo, setMemo] = useState(txn.memo ?? '')
  const [date, setDate] = useState(txn.occurred_on)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const categories = direction === 'in' ? IN_CATEGORIES : OUT_CATEGORIES
  const value = Number(amount.replace(/[^0-9]/g, ''))

  async function save() {
    setError(null)
    if (!value || value <= 0) return setError('금액을 입력해 주세요')
    if (!db) return setError('저장할 수 없습니다')

    setBusy(true)
    try {
      await db.updateCashTxn(txn.id, {
        child_id: txn.child_id,
        direction,
        amount: value,
        category,
        memo: memo.trim() || null,
        occurred_on: date,
      })
      await reload()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setError(null)
    if (!db) return setError('삭제할 수 없습니다')

    setBusy(true)
    try {
      await db.deleteCashTxn(txn.id)
      await reload()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card flat">
        <div className="row">
          <span className="label">{childName}</span>
          <span className="label muted">{txn.occurred_on}</span>
        </div>
        <div className="mid" style={{ marginTop: 3 }}>
          {txn.direction === 'in' ? '+' : '−'}
          {money(txn.amount)}
        </div>
      </div>

      {linkedToTrade && (
        <div
          className="card"
          style={{
            background: 'var(--warning-bg)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-text)',
            fontSize: 13,
          }}
        >
          주식투자로 생긴 기록입니다. 금액과 방향은 바꿀 수 없습니다.
          <br />
          금액을 고치려면 투자 화면에서 그 매매를 지우고 다시 기록해 주세요.
        </div>
      )}

      <Toggle
        options={[
          { key: 'in', label: '입금' },
          { key: 'out', label: '출금' },
        ]}
        value={direction}
        onChange={(k) => {
          if (linkedToTrade) return
          setDirection(k as 'in' | 'out')
          setCategory(k === 'in' ? IN_CATEGORIES[0] : OUT_CATEGORIES[0])
          setError(null)
        }}
      />

      <Field label="금액">
        <input
          className="field amount"
          type="text"
          inputMode="numeric"
          value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
          disabled={linkedToTrade}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^0-9]/g, ''))
            setError(null)
          }}
        />
      </Field>

      <Field label="분류">
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
          {[...new Set([category, ...categories])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="메모">
        <input
          className="field"
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Field>

      <Field label="날짜">
        <input
          className="field"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      {error && <div className="error">{error}</div>}

      <div className="spacer" />

      <button className="btn primary" onClick={() => void save()} disabled={busy}>
        {busy ? '저장 중…' : '저장'}
      </button>

      {/* 삭제는 한 번 더 묻는다. 되돌릴 수 없다. */}
      {confirming ? (
        <div className="card col" style={{ borderColor: 'var(--danger-border)' }}>
          <div style={{ fontSize: 13 }}>
            이 기록을 지우면 되돌릴 수 없습니다. 잔액이 {money(txn.amount)}만큼 바뀝니다.
          </div>
          <div className="btn-row">
            <button className="btn" onClick={() => setConfirming(false)} disabled={busy}>
              취소
            </button>
            <button className="btn red" onClick={() => void remove()} disabled={busy}>
              {busy ? '지우는 중…' : '지우기'}
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn"
          style={{ color: 'var(--danger-text)' }}
          onClick={() => setConfirming(true)}
          disabled={busy || linkedToTrade}
        >
          {linkedToTrade ? '투자 화면에서 지워 주세요' : '이 기록 지우기'}
        </button>
      )}
    </>
  )
}
