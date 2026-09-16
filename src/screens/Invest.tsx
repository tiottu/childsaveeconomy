import { useState } from 'react'
import { ParentTradeRequests } from './TradeRequests'
import { ProgressBar, TickerBadge, Toggle, colorOf } from '../components/ui'
import { asOfLabel, dayLabel, money, pct, qty, signed, signedUnit, unitPrice } from '../lib/format'
import { useData, useStore } from '../state/store'

export function InvestList({
  childId,
  onSelectChild,
  onOpenTicker,
  onTradeEntry,
}: {
  childId: string
  onSelectChild: (id: string) => void
  onOpenTicker: (ticker: string) => void
  onTradeEntry: () => void
}) {
  const { children, positions, assets } = useData()
  const rows = positions[childId] ?? []
  const asset = assets.find((a) => a.child_id === childId)

  const value = rows.reduce((s, p) => s + p.value, 0)
  const cost = rows.reduce((s, p) => s + p.cost, 0)
  const pnl = value - cost
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
  const newest = rows.reduce<string | null>(
    (acc, p) => (acc === null || p.asOf > acc ? p.asOf : acc),
    null,
  )

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
        <div className="row">
          <span className="label">평가금액</span>
          {newest && <span className="label muted">{asOfLabel(newest)}</span>}
        </div>
        <div className="big">{money(value)}</div>
        {cost > 0 && (
          <div className={`label ${pnl >= 0 ? 'up' : 'down'}`}>
            {signed(pnl)} ({pct(pnlPct)})
          </div>
        )}
        <div className="label muted" style={{ marginTop: 3 }}>
          매입 {money(cost)}
        </div>
      </div>

      {asset && asset.total > 0 && (
        <div className="label muted">
          총자산 대비 투자 비중 {Math.round((asset.invest / asset.total) * 100)}%
        </div>
      )}

      {/* 아이가 올린 신청이 있으면 보유 목록보다 먼저 보여준다. 기다리는 일이니까. */}
      <ParentTradeRequests childId={childId} />

      <div className="section-title">보유 종목 {rows.length}</div>

      {rows.length === 0 && <div className="empty">아직 보유한 종목이 없습니다</div>}

      {rows.map((p, i) => {
        const color = colorOf(i)
        return (
          <button key={p.ticker} className="card tap" onClick={() => onOpenTicker(p.ticker)}>
            <div className="row">
              <div className="row" style={{ gap: 10, justifyContent: 'flex-start', minWidth: 0 }}>
                <TickerBadge name={p.name} index={i} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.name}
                  </div>
                  <div className="label">
                    {qty(p.quantity)}주 · 평균 {unitPrice(p.avgPrice, p.currency)}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>{money(p.value)}</div>
                <div className={`label ${p.pnl >= 0 ? 'up' : 'down'}`}>{pct(p.pnlPct)}</div>
              </div>
            </div>
            <div style={{ marginTop: 9 }}>
              <ProgressBar pct={p.weight} color={color.fill} />
            </div>
            <div className="label muted" style={{ marginTop: 4 }}>
              비중 {Math.round(p.weight)}%
            </div>
          </button>
        )
      })}

      <div className="spacer" />

      <button className="btn dashed" onClick={onTradeEntry}>
        + 주식투자 기록
      </button>
    </>
  )
}

export function TickerDetail({
  childId,
  ticker,
  onTrade,
  onGone,
}: {
  childId: string
  ticker: string
  onTrade: () => void
  /** 마지막 매매를 지워 보유가 없어졌을 때. 빈 화면에 남지 않게 목록으로 돌려보낸다. */
  onGone: () => void
}) {
  const { positions, quotes, trades } = useData()
  const { db, reload } = useStore()
  const [removing, setRemoving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const position = (positions[childId] ?? []).find((p) => p.ticker === ticker)
  const quote = quotes.find((q) => q.ticker === ticker)

  // 이 종목의 매매 이력. 예전에는 현금 거래의 메모로 찾았는데, 메모 문구가 바뀌면
  // 이력이 사라지는 약한 연결이었다. trade 를 직접 읽는다.
  const tradeLog = (trades[childId] ?? []).filter((t) => t.ticker === ticker)

  async function removeTrade(tradeId: string) {
    setDeleteError(null)
    if (!db) return setDeleteError('지금은 지울 수 없습니다')
    setDeleting(true)
    try {
      await db.deleteTrade(tradeId)
      await reload()
      setRemoving(null)
      // 이 종목의 마지막 매매였으면 보유가 없어진다. 빈 화면에 남지 않게 되돌아간다.
      const rest = (trades[childId] ?? []).filter((t) => t.ticker === ticker && t.id !== tradeId)
      if (rest.length === 0) onGone()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  if (!position) return <div className="empty">보유 정보를 찾을 수 없습니다</div>

  // 직접 입력한 가격에는 '오늘 등락' 이 없다. 예전 자동 시세의 전일 종가와 비교하면
  // 있지도 않은 등락이 찍힌다 — 71,000원을 넣었는데 "+2,000 오늘" 이 나왔다.
  const dayChange =
    quote?.source !== 'manual' && quote?.prev_close && quote.prev_close > 0
      ? quote.price - quote.prev_close
      : null

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="row">
          <span className="label">현재가</span>
          <span className="label muted">
            {quote?.source === 'manual' ? '수동 입력' : asOfLabel(position.asOf)}
          </span>
        </div>
        <div className="big">{unitPrice(position.price, position.currency)}</div>
        {dayChange !== null && quote?.change_pct !== null && quote?.change_pct !== undefined && (
          <div className={`label ${dayChange >= 0 ? 'up' : 'down'}`}>
            {signedUnit(dayChange, position.currency)} ({pct(quote.change_pct)}) 오늘
          </div>
        )}
      </div>

      <div className="card">
        <div className="list-item">
          <span className="label">보유 수량</span>
          <span>{qty(position.quantity)}주</span>
        </div>
        <div className="list-item">
          <span className="label">평균 단가</span>
          <span>{unitPrice(position.avgPrice, position.currency)}</span>
        </div>
        <div className="list-item">
          <span className="label">매입 금액</span>
          <span>{money(position.cost)}</span>
        </div>
        <div className="list-item">
          <span className="label">평가 금액</span>
          <span>{money(position.value)}</span>
        </div>
        <div className="list-item">
          <span className="label">평가 손익</span>
          <span className={position.pnl >= 0 ? 'up' : 'down'}>
            {signed(position.pnl)} ({pct(position.pnlPct)})
          </span>
        </div>
      </div>

      <div className="section-title">거래 이력</div>

      {tradeLog.length === 0 ? (
        <div className="empty">이력이 없습니다</div>
      ) : (
        <div className="card">
          {tradeLog.map((t) => (
            <div key={t.id} className="list-item">
              <div>
                <div>
                  {t.direction === 'buy' ? '매수' : '매도'} {qty(t.quantity)}주
                </div>
                <div className="label">
                  {dayLabel(t.occurred_on)} · {unitPrice(t.price, position.currency)}
                </div>
              </div>
              {/* 매매를 지우면 연결된 현금 거래도 사라지고 평균단가가 다시 계산된다 */}
              <button
                className="btn small"
                style={{ width: 'auto', padding: '5px 10px', color: 'var(--danger-text)' }}
                onClick={() => setRemoving(t.id)}
              >
                지우기
              </button>
            </div>
          ))}
        </div>
      )}

      {removing && (
        <div className="card col" style={{ borderColor: 'var(--danger-border)' }}>
          <div style={{ fontSize: 13 }}>
            이 매매를 지우면 연결된 현금 기록도 함께 사라지고, 보유 수량과 평균단가가
            다시 계산됩니다. 되돌릴 수 없습니다.
          </div>
          {deleteError && <div className="error">{deleteError}</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setRemoving(null)} disabled={deleting}>
              취소
            </button>
            <button className="btn red" onClick={() => void removeTrade(removing)} disabled={deleting}>
              {deleting ? '지우는 중…' : '지우기'}
            </button>
          </div>
        </div>
      )}

      <div className="spacer" />

      <button className="btn primary" onClick={onTrade}>
        이 종목 주식투자 기록
      </button>
    </>
  )
}
