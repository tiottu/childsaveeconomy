import { cashWeight, pnlPct } from '../lib/compute'
import { asOfLabel, money, pct, signed } from '../lib/format'
import { EmblemTile, emblemOf } from '../components/Emblem'
import { Avatar, MixBar } from '../components/ui'
import { useData } from '../state/store'

export function ParentHome({
  onOpenChild,
  onCashEntry,
  onTradeEntry,
  onAddChild,
  onOpenRequests,
}: {
  onOpenChild: (childId: string) => void
  onCashEntry: () => void
  onTradeEntry: () => void
  onAddChild: () => void
  /** 아이가 올린 매매 신청을 보러 간다 */
  onOpenRequests: (childId: string) => void
}) {
  const { children, assets, quotes, tradeRequests, stamps } = useData()

  /*
    기다리는 신청은 첫 화면에서 알려 준다. 투자 탭을 열어야만 보인다면 아이는
    보내 놓고 며칠을 기다리게 된다 — 승인이 필요한 기능은 눈에 띄어야 한다.
  */
  const pendingTrades = tradeRequests.filter((r) => r.status === 'requested')
  const pendingStamps = stamps.filter((s) => s.status === 'requested')

  const totalCash = assets.reduce((s, a) => s + a.cash, 0)
  const totalInvest = assets.reduce((s, a) => s + a.invest, 0)
  const totalCost = assets.reduce((s, a) => s + a.invest_cost, 0)
  const total = totalCash + totalInvest
  const pnl = totalInvest - totalCost
  const overallPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0
  const cashPct = total > 0 ? (totalCash / total) * 100 : 100

  // 시세 중 가장 오래된 갱신시각을 보여준다. 값이 언제 기준인지 항상 알 수 있어야 한다.
  const oldest = quotes.reduce<string | null>(
    (acc, q) => (acc === null || q.as_of < acc ? q.as_of : acc),
    null,
  )

  return (
    <>
      <div className="card">
        <div className="row">
          <span className="label">전체 총자산</span>
          {oldest && <span className="label muted">{asOfLabel(oldest)}</span>}
        </div>
        <div className="big">{money(total)}</div>
        <div className={`label ${pnl >= 0 ? 'up' : 'down'}`}>
          평가손익 {signed(pnl)} ({pct(overallPct)})
        </div>
        <div style={{ marginTop: 10 }}>
          <MixBar cashPct={cashPct} />
        </div>
        <div className="row label" style={{ marginTop: 5 }}>
          <span>
            <span style={{ color: 'var(--accent-fill)' }}>■</span> 현금 {money(totalCash)}
          </span>
          <span>
            <span style={{ color: 'var(--success-fill)' }}>■</span> 투자 {money(totalInvest)}
          </span>
        </div>
      </div>

      {pendingTrades.length > 0 && (
        <button
          className="card tap"
          style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-border)' }}
          onClick={() => onOpenRequests(pendingTrades[0].child_id)}
        >
          <div className="row" style={{ color: 'var(--warning-text)' }}>
            <span style={{ fontWeight: 500 }}>
              매매 신청 {pendingTrades.length}건이 기다립니다
            </span>
            <span className="label">보기 ›</span>
          </div>
          <div className="label" style={{ color: 'var(--warning-text)', marginTop: 3 }}>
            {pendingTrades
              .slice(0, 3)
              .map((r) => {
                const who = children.find((c) => c.id === r.child_id)?.name ?? '아이'
                return `${who} · ${r.name} ${r.quantity}주 ${r.direction === 'buy' ? '매수' : '매도'}`
              })
              .join(' / ')}
          </div>
        </button>
      )}

      {pendingStamps.length > 0 && (
        <div className="label muted">칭찬도장 신청도 {pendingStamps.length}건 기다립니다</div>
      )}

      <div className="section-title">자녀</div>

      {assets.length === 0 && (
        <div className="empty">
          아직 등록된 아이가 없습니다.
          <br />
          아래에서 추가해 주세요.
        </div>
      )}

      {assets.map((a, i) => {
        const child = children.find((c) => c.id === a.child_id)
        const p = pnlPct(a)
        return (
          <button key={a.child_id} className="card tap" onClick={() => onOpenChild(a.child_id)}>
            <div className="row">
              <div className="row" style={{ gap: 10, justifyContent: 'flex-start' }}>
                {/* 아이가 고른 엠블럼을 부모 목록에도 보여준다. 누구 것인지 한눈에 든다. */}
                {child ? <EmblemTile k={emblemOf(child)} size={34} /> : <Avatar name={a.name} index={i} />}
                <div>
                  <div>{a.name}</div>
                  {child && (
                    <div className="label">주 {money(child.weekly_allowance)}</div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mid">{money(a.total)}</div>
                {a.invest_cost > 0 && (
                  <div className={`label ${a.pnl >= 0 ? 'up' : 'down'}`}>{pct(p)}</div>
                )}
              </div>
            </div>
            <div style={{ margin: '9px 0 5px' }}>
              <MixBar cashPct={cashWeight(a)} />
            </div>
            <div className="label">
              현금 {money(a.cash)} · 투자 {money(a.invest)}
            </div>
          </button>
        )
      })}

      <button className="btn dashed" onClick={onAddChild}>
        + 아이 추가
      </button>

      <div className="spacer" />

      {assets.length > 0 && (
        <div className="btn-row">
          <button className="btn primary" onClick={onCashEntry}>
            입출금
          </button>
          <button className="btn green" onClick={onTradeEntry}>
            주식투자
          </button>
        </div>
      )}
    </>
  )
}
