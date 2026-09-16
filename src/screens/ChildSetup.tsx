import { useState } from 'react'
import { Field } from '../components/ui'
import { useData, useStore } from '../state/store'

const WEEKDAYS = [
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
  { value: 7, label: '일요일' },
]

/**
 * 아이 등록. 두 곳에서 쓴다.
 *  - 로그인 화면에서 아이가 자기 이름을 정할 때 (self)
 *  - 부모 모드에서 아이를 추가할 때 (parent)
 */
export function ChildSetup({
  variant,
  onCreated,
  onCancel,
}: {
  variant: 'self' | 'parent'
  onCreated: (childId: string) => void
  onCancel: () => void
}) {
  const { children } = useData()
  const { db, reload } = useStore()

  const [name, setName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [allowance, setAllowance] = useState('')
  const [payday, setPayday] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isSelf = variant === 'self'

  async function save() {
    setError(null)
    const trimmed = name.trim()

    if (!trimmed) return setError(isSelf ? '이름을 적어 주세요' : '아이 이름을 입력해 주세요')
    if (trimmed.length > 10) return setError('이름이 너무 깁니다')
    if (children.some((c) => c.name === trimmed)) {
      return setError(`${trimmed}는 이미 등록돼 있어요. 로그인 화면에서 골라 주세요`)
    }

    const year = birthYear ? Number(birthYear) : null
    if (year !== null) {
      const thisYear = new Date().getFullYear()
      if (year < thisYear - 30 || year > thisYear) {
        return setError('태어난 해를 다시 확인해 주세요')
      }
    }

    if (!db) return setError('지금은 저장할 수 없습니다')

    setSaving(true)
    try {
      const childId = await db.addChild({
        name: trimmed,
        birth_year: year,
        weekly_allowance: Number(allowance.replace(/[^0-9]/g, '')) || 0,
        payday,
      })
      await reload()
      onCreated(childId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Field label={isSelf ? '이름' : '아이 이름'}>
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

      <div className="label muted">
        {isSelf
          ? '용돈 금액은 부모님이 나중에 바꿀 수 있어요'
          : '용돈 금액과 받는 날은 설정에서 언제든 바꿀 수 있습니다'}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="spacer" />

      <div className="btn-row">
        <button className="btn" onClick={onCancel} disabled={saving}>
          취소
        </button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? '저장 중…' : isSelf ? '시작하기' : '추가'}
        </button>
      </div>
    </>
  )
}
