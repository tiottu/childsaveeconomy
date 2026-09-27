import type { ReactNode } from 'react'

/**
 * 금액 하나를 가리거나 보여준다.
 *
 * 통장 화면은 다른 사람 앞에서도 열어 볼 일이 많다 (전철, 교실). 자산이 화면에
 * 그대로 떠 있으면 곤란하다. 그래서 처음엔 가려 두고, 금액을 직접 눌러야 보인다 —
 * 카드 전체를 누르면 다른 화면으로 넘어가는 곳이 많아서, 금액 글자에서만 클릭이
 * 먹게 하고 부모 요소로 번지지 않게 막는다(stopPropagation).
 *
 * 화면을 나갔다 돌아오면 다시 가려진다 — 쓰는 쪽에서 이 값을 담은 state 가 매번
 * false 로 새로 시작하는 것을 그대로 이용한다. 매번 열 때마다 안전한 기본값이다.
 */
export function Hideable({
  visible,
  onToggle,
  children,
}: {
  visible: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      style={{ cursor: 'pointer' }}
    >
      {visible ? children : '●●●,●●●원'}
    </span>
  )
}

export function Screen({
  title,
  onBack,
  right,
  tabs,
  children,
}: {
  title: ReactNode
  onBack?: () => void
  right?: ReactNode
  tabs?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-title">
          {onBack && (
            <button className="back" onClick={onBack} aria-label="뒤로">
              ‹
            </button>
          )}
          <span>{title}</span>
        </div>
        {right}
      </div>
      <div className={tabs ? 'body' : 'body no-tabs'}>{children}</div>
      {tabs}
    </div>
  )
}

export type Tab = { key: string; label: string; glyph: string }

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: Tab[]
  active: string
  onSelect: (key: string) => void
}) {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={t.key === active ? 'on' : undefined}
          onClick={() => onSelect(t.key)}
          aria-current={t.key === active ? 'page' : undefined}
        >
          <span className="glyph" aria-hidden="true">
            {t.glyph}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}

/** 현금 : 투자 비중 바 */
export function MixBar({ cashPct }: { cashPct: number }) {
  const cash = Math.max(0, Math.min(100, cashPct))
  return (
    <div className="mix">
      <div style={{ width: `${cash}%`, background: 'var(--accent-fill)' }} />
      <div style={{ width: `${100 - cash}%`, background: 'var(--success-fill)' }} />
    </div>
  )
}

export function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

const PALETTE = [
  { bg: 'var(--accent-bg)', fg: 'var(--accent-text)', fill: 'var(--accent-fill)' },
  { bg: 'var(--success-bg)', fg: 'var(--success-text)', fill: 'var(--success-fill)' },
  { bg: 'var(--warning-bg)', fg: 'var(--warning-text)', fill: 'var(--warning-fill)' },
]

/** 아이·종목마다 일관된 색을 준다 (순서 기반, 3색 순환) */
export function colorOf(index: number) {
  return PALETTE[index % PALETTE.length]
}

export function Avatar({ name, index }: { name: string; index: number }) {
  const c = colorOf(index)
  return (
    <div className="avatar" style={{ background: c.bg, color: c.fg }}>
      {name.slice(0, 2)}
    </div>
  )
}

export function TickerBadge({ name, index }: { name: string; index: number }) {
  const c = colorOf(index)
  return (
    <div className="ticker-badge" style={{ background: c.bg, color: c.fg }}>
      {name.slice(0, 2)}
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="field-group">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

export function Toggle({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.key}
          className={o.key === value ? 'on' : undefined}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
