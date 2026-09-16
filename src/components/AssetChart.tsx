import { useState } from 'react'
import { money, signed } from '../lib/format'
import type { MonthPoint } from '../lib/history'

/**
 * 월별 자산 추이 — 현금 / 투자 누적 막대.
 *
 * 두 계열만 쓰고 색은 앱 전체와 같은 규칙을 따른다 (현금 = 파랑, 투자 = 초록).
 * 색이 계열이 아니라 **대상** 을 따라가므로, 다른 화면의 비중 바와 같은 색이다.
 *
 * 막대를 누르면 그 달의 값이 뜬다. 모든 막대에 숫자를 쓰지 않는다 —
 * 좁은 화면에서 숫자가 서로 겹치고, 마지막 값만 알면 대부분 충분하다.
 */

const CASH = 'var(--accent-fill)'
const INVEST = 'var(--success-fill)'

export function AssetChart({ points }: { points: MonthPoint[] }) {
  const [picked, setPicked] = useState<number | null>(null)

  if (points.length === 0) {
    return <div className="empty">아직 기록이 없어요</div>
  }

  const max = Math.max(...points.map((p) => p.total), 1)
  const last = points[points.length - 1]
  const shown = picked !== null ? points[picked] : last

  // 좁은 화면 기준. 막대 사이 간격은 값이 아니라 여백이므로 고정폭으로 둔다.
  const H = 132
  const GAP = 4
  const n = points.length
  const barW = Math.max(6, Math.min(28, (100 - GAP * (n - 1)) / n))

  return (
    <div>
      {/* 선택한 달의 값. 막대마다 숫자를 붙이지 않는 대신 여기에 크게 보여준다. */}
      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 10 }}>
        <div>
          <div className="label">{shown.label} 모은 돈</div>
          <div className="mid">{money(shown.total)}</div>
        </div>
        <div className="label" style={{ textAlign: 'right' }}>
          현금 {money(shown.cash)}
          <br />
          투자 {money(shown.invest)}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: `${GAP}px`,
          height: H,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {points.map((p, i) => {
          const totalH = (p.total / max) * (H - 8)
          const cashH = p.total > 0 ? (p.cash / p.total) * totalH : 0
          const investH = Math.max(0, totalH - cashH)
          const active = (picked ?? points.length - 1) === i

          return (
            <button
              key={p.month}
              onClick={() => setPicked(i)}
              aria-label={`${p.label} ${money(p.total)}`}
              style={{
                flex: `0 0 ${barW}%`,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                background: 'none',
                border: 'none',
                padding: 0,
                // 누르기 쉽게 막대보다 넓은 영역을 준다
                minWidth: 22,
                opacity: active ? 1 : 0.55,
              }}
            >
              {/* 위가 투자, 아래가 현금. 두 칸 사이에 2px 틈을 둬서 색만으로 구분하지 않게 한다. */}
              {investH > 0 && (
                <div
                  style={{
                    height: investH,
                    background: INVEST,
                    borderRadius: '4px 4px 0 0',
                    marginBottom: cashH > 0 ? 2 : 0,
                  }}
                />
              )}
              {cashH > 0 && (
                <div
                  style={{
                    height: cashH,
                    background: CASH,
                    borderRadius: investH > 0 ? 0 : '4px 4px 0 0',
                  }}
                />
              )}
              {p.total === 0 && (
                <div style={{ height: 2, background: 'var(--border-strong)' }} />
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: `${GAP}px`, marginTop: 5 }}>
        {points.map((p, i) => (
          <div
            key={p.month}
            className="label muted"
            style={{
              flex: `0 0 ${barW}%`,
              minWidth: 22,
              textAlign: 'center',
              fontSize: 9,
              // 막대가 많으면 한 칸 띄워 라벨이 겹치지 않게 한다
              visibility: n > 8 && i % 2 === 1 ? 'hidden' : 'visible',
            }}
          >
            {p.label}
          </div>
        ))}
      </div>

      {/* 계열이 둘이므로 범례는 항상 둔다. 색만으로 구분하지 않게 이름을 붙인다. */}
      <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 8 }}>
        <span className="label">
          <span style={{ color: CASH }}>■</span> 현금
        </span>
        <span className="label">
          <span style={{ color: INVEST }}>■</span> 투자
        </span>
      </div>
    </div>
  )
}

/** 첫 달 대비 증감 한 줄 */
export function GrowthLine({ amount, months }: { amount: number; months: number }) {
  if (months < 2) return null
  return (
    <div className={`label ${amount >= 0 ? 'up' : 'down'}`}>
      {months}개월 동안 {signed(amount)}원
    </div>
  )
}
