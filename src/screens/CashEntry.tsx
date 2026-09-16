import { useState } from 'react'
import { Field, Toggle } from '../components/ui'
import { money, todayIso } from '../lib/format'
import { useData, useStore } from '../state/store'

const IN_CATEGORIES = ['용돈', '보너스', '선물', '이자', '배당금', '기타']
const OUT_CATEGORIES = ['간식', '학용품', '장난감', '책', '기부', '기타']
const QUICK = [1000, 5000, 10000, 50000]

export function CashEntry({
  initialChildId,
  onDone,
}: {
  initialChildId?: string
  onDone: () => void
}) {
  const { children, assets } = useData()
  const { db, reload } = useStore()

  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [childId, setChildId] = useState(initialChildId ?? children[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(IN_CATEGORIES[0])
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const categories = direction === 'in' ? IN_CATEGORIES : OUT_CATEGORIES
  const asset = assets.find((a) => a.child_id === childId)
  const value = Number(amount.replace(/[^0-9]/g, ''))
  const shortfall = direction === 'out' && asset ? value - asset.cash : 0

  function switchDirection(next: 'in' | 'out') {
    setDirection(next)
    setCategory(next === 'in' ? IN_CATEGORIES[0] : OUT_CATEGORIES[0])
    setError(null)
  }

  async function save() {
    setError(null)

    if (!childId) return setError('누구의 통장인지 골라 주세요')
    if (!value || value <= 0) return setError('금액을 입력해 주세요')
    if (direction === 'out' && asset && value > asset.cash) {
      return setError(`현금이 부족합니다. 잔액 ${money(asset.cash)}`)
    }
    if (!db) return setError('저장할 수 없습니다. 잠시 후 다시 시도해 주세요')

    setSaving(true)
    try {
      await db.addCashTxn({
        child_id: childId,
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
      setSaving(false)
    }
  }

  return (
    <>
      <Toggle
        options={[
          { key: 'in', label: '입금' },
          { key: 'out', label: '출금' },
        ]}
        value={direction}
        onChange={(k) => switchDirection(k as 'in' | 'out')}
      />

      <Field label="누구">
        <Toggle
          options={children.map((c) => ({ key: c.id, label: c.name }))}
          value={childId}
          onChange={setChildId}
        />
      </Field>

      <Field label="금액">
        <input
          className="field amount"
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
          onChange={(e) => {
            setAmount(e.target.value.replace(/[^0-9]/g, ''))
            setError(null)
          }}
        />
      </Field>

      <div className="quick">
        {QUICK.map((q) => (
          <button key={q} onClick={() => setAmount(String((value || 0) + q))}>
            +{q.toLocaleString('ko-KR')}
          </button>
        ))}
        {amount && <button onClick={() => setAmount('')}>지우기</button>}
      </div>

      {asset && (
        <div className="label muted">
          {direction === 'out' ? '출금 후 잔액' : '입금 후 잔액'}{' '}
          {money(direction === 'out' ? asset.cash - value : asset.cash + value)}
          {shortfall > 0 && ` · ${money(shortfall)} 부족`}
        </div>
      )}

      <Field label="분류">
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
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
          placeholder="방 청소 도움"
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

      <button className="btn primary" onClick={save} disabled={saving}>
        {saving ? '저장 중…' : '저장'}
      </button>
    </>
  )
}
