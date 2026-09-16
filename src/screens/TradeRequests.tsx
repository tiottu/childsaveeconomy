import { useState } from 'react'
import { Field, TickerBadge, Toggle } from '../components/ui'
import { FX_TICKER, familyTickers, toKrw } from '../lib/compute'
import { dayLabel, money, qty, unitPrice } from '../lib/format'
import { useData, useStore } from '../state/store'
import type { Quote, TradeRequest } from '../lib/types'

/**
 * 아이가 올리는 매매 신청과 부모의 승인.
 *
 * **아이는 신청까지만 한다.** 실제 거래는 부모가 승인하는 순간 일어난다 —
 * 서버에서도 그렇게 막아 둔다 (아이 토큰은 trade 표에 쓸 수 없고, 신청 행의
 * status 도 'requested' 로만 넣을 수 있다). 화면에서 버튼을 감추는 수준이 아니다.
 *
 * 종목은 직접 입력하지 않고 **고르게** 한다. 아이가 티커를 적으면 '삼성' 같은
 * 이름이 종목 코드로 들어가 버린다 (부모 화면에서 이미 겪었다).
 */

/** 신청에 쓸 수 있는 종목 한 줄 */
type Candidate = {
  ticker: string
  name: string
  price: number
  currency: string
  /** 지금 가진 수량. 0 이면 아직 없는 종목 */
  held: number
}

function candidates(
  positions: { ticker: string; name: string; price: number; currency: string; quantity: number }[],
  quotes: Quote[],
  /** 우리 가족이 쓰는 종목 코드. quote 표는 모든 가족이 같이 쓰는 캐시다. */
  mine: Set<string>,
): Candidate[] {
  const list: Candidate[] = positions.map((p) => ({
    ticker: p.ticker,
    name: p.name,
    price: p.price,
    currency: p.currency,
    held: p.quantity,
  }))
  for (const q of quotes) {
    // 환율은 종목이 아니다
    if (q.ticker === FX_TICKER) continue
    // 다른 집이 조회한 종목을 우리 아이 화면에 보여주면 안 된다
    if (!mine.has(q.ticker)) continue
    if (list.some((c) => c.ticker === q.ticker)) continue
    list.push({
      ticker: q.ticker,
      name: q.name ?? q.ticker,
      price: q.price,
      currency: q.currency,
      held: 0,
    })
  }
  return list
}

function statusChip(s: TradeRequest['status']) {
  if (s === 'requested') return <span className="chip amber">심사 중</span>
  if (s === 'approved') return <span className="chip green">거래 완료</span>
  if (s === 'rejected') return <span className="chip gray">다음 기회</span>
  return <span className="chip gray">취소함</span>
}

function label(r: TradeRequest): string {
  return `${r.name} ${qty(r.quantity)}주 ${r.direction === 'buy' ? '사기' : '팔기'}`
}

// ---------------------------------------------------------------- 아이

export function KidTradeRequest({ childId }: { childId: string }) {
  const { positions, quotes, assets, tradeRequests, trades } = useData()
  const { db, reload } = useStore()

  const [direction, setDirection] = useState<'buy' | 'sell'>('buy')
  const [ticker, setTicker] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const asset = assets.find((a) => a.child_id === childId)
  const all = candidates(positions[childId] ?? [], quotes, familyTickers(positions, trades))
  // 팔 수 있는 건 가진 것뿐이다
  const list = direction === 'sell' ? all.filter((c) => c.held > 0) : all

  const mine = tradeRequests.filter((r) => r.child_id === childId)
  const waiting = mine.filter((r) => r.status === 'requested')
  const past = mine.filter((r) => r.status !== 'requested')

  const picked = list.find((c) => c.ticker === ticker) ?? null
  const count = Number(amount)
  const estimate =
    picked && count > 0 ? Math.round(toKrw(count * picked.price, picked.currency, quotes)) : 0

  function reset() {
    setTicker(null)
    setAmount('')
    setReason('')
  }

  async function send() {
    setError(null)
    setSent(false)
    if (!picked) return setError('어떤 회사인지 골라 주세요')
    if (!Number.isFinite(count) || count <= 0) return setError('몇 주인지 적어 주세요')
    if (direction === 'sell' && count > picked.held) {
      return setError(`${qty(picked.held)}주까지 팔 수 있어요`)
    }
    if (direction === 'buy' && asset && estimate > asset.cash) {
      return setError(`현금이 ${money(estimate - asset.cash)} 부족해요`)
    }
    if (!db) return setError('지금은 신청할 수 없어요')

    // 환율을 못 받아왔으면 미국 주식은 금액을 계산할 수 없다. 0원으로 신청하면 안 된다.
    const fx =
      picked.currency === 'KRW' ? 1 : (quotes.find((q) => q.ticker === FX_TICKER)?.price ?? 0)
    if (fx <= 0) return setError('환율을 아직 못 받아왔어요. 조금 뒤에 다시 해 주세요')

    setBusy(true)
    try {
      await db.requestTrade({
        child_id: childId,
        direction,
        ticker: picked.ticker,
        name: picked.name,
        quantity: count,
        price: picked.price,
        fx,
        reason: reason.trim() || null,
      })
      await reload()
      reset()
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: string) {
    if (!db) return
    setError(null)
    try {
      await db.cancelTradeRequest(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <div className="section-title">사고 팔기 신청</div>

      <Toggle
        options={[
          { key: 'buy', label: '사고 싶어요' },
          { key: 'sell', label: '팔고 싶어요' },
        ]}
        value={direction}
        onChange={(k) => {
          setDirection(k as 'buy' | 'sell')
          setTicker(null)
          setError(null)
          setSent(false)
        }}
      />

      {list.length === 0 ? (
        <div className="empty">
          {direction === 'sell' ? '팔 수 있는 주식이 없어요' : '고를 수 있는 회사가 아직 없어요'}
        </div>
      ) : (
        <>
          <div className="pick-grid">
            {list.map((c, i) => (
              <button
                key={c.ticker}
                className={c.ticker === ticker ? 'pick on' : 'pick'}
                onClick={() => {
                  setTicker(c.ticker)
                  setError(null)
                  setSent(false)
                }}
              >
                <TickerBadge name={c.name} index={i} />
                <div style={{ minWidth: 0 }}>
                  <div className="pick-name">{c.name}</div>
                  <div className="label muted">
                    {unitPrice(c.price, c.currency)}
                    {c.held > 0 && ` · ${qty(c.held)}주 있음`}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <Field label="몇 주 할까요">
            <input
              className="field"
              type="text"
              inputMode="decimal"
              placeholder="예: 1"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^0-9.]/g, ''))
                setError(null)
                setSent(false)
              }}
            />
          </Field>

          <Field label="왜 사고 싶은지 (안 적어도 돼요)">
            <input
              className="field"
              type="text"
              placeholder="예: 내가 쓰는 휴대폰을 만드는 회사예요"
              value={reason}
              maxLength={60}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>

          {picked && count > 0 && (
            <div className="card row">
              <span className="label">예상 금액</span>
              <span className="mid">{money(estimate)}</span>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <button className="btn primary" disabled={busy} onClick={() => void send()}>
            {busy ? '보내는 중…' : '부모님께 신청 보내기'}
          </button>
          {sent && !error && (
            <div className="label muted">보냈어요. 부모님이 승인하면 진짜로 사고 팔아요.</div>
          )}
        </>
      )}

      {waiting.length > 0 && (
        <>
          <div className="section-title">기다리는 신청 {waiting.length}</div>
          {waiting.map((r) => (
            <div key={r.id} className="card">
              <div className="row">
                <span>{label(r)}</span>
                {statusChip(r.status)}
              </div>
              <div className="label muted" style={{ marginTop: 2 }}>
                {dayLabel(r.created_at.slice(0, 10))} · 신청할 때 {unitPrice(r.price, 'KRW')}
              </div>
              {r.reason && <div className="label" style={{ marginTop: 4 }}>{r.reason}</div>}
              <button
                className="btn small"
                style={{ marginTop: 9, color: 'var(--text-secondary)' }}
                onClick={() => void cancel(r.id)}
              >
                신청 취소
              </button>
            </div>
          ))}
        </>
      )}

      {past.length > 0 && (
        <>
          <div className="section-title">지난 신청</div>
          <div className="card">
            {past.slice(0, 10).map((r) => (
              <div key={r.id} className="list-item">
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label(r)}
                  </div>
                  <div className="label muted">{dayLabel(r.created_at.slice(0, 10))}</div>
                </div>
                {statusChip(r.status)}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="notice">
        주식은 <b>부모님이 승인해야</b> 사고 팔려요. 값이 오르고 내리니 왜 사고 싶은지도
        같이 적어 보세요.
      </div>
    </>
  )
}

// ---------------------------------------------------------------- 부모

export function ParentTradeRequests({ childId }: { childId: string }) {
  const { children, tradeRequests, quotes, positions, assets } = useData()
  const { db, reload } = useStore()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const waiting = tradeRequests.filter((r) => r.child_id === childId && r.status === 'requested')
  const child = children.find((c) => c.id === childId)
  const asset = assets.find((a) => a.child_id === childId)

  if (waiting.length === 0) return null

  async function decide(r: TradeRequest, approve: boolean) {
    if (!db) return
    setError(null)
    setBusy(r.id)
    try {
      // 승인은 지금 시세로 기록한다. 아이가 신청한 값은 그때 화면에 보였던 값이라
      // 며칠 지나면 실제와 어긋난다.
      const now = quotes.find((q) => q.ticker === r.ticker)
      await db.decideTradeRequest(r.id, approve, approve ? (now?.price ?? r.price) : undefined)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="section-title">
        {child?.name ?? '아이'}의 매매 신청 {waiting.length}
      </div>

      {error && <div className="error">{error}</div>}

      {waiting.map((r) => {
        const now = quotes.find((q) => q.ticker === r.ticker)
        const price = now?.price ?? r.price
        const currency = now?.currency ?? 'KRW'
        const estimate = Math.round(toKrw(r.quantity * price, currency, quotes))
        const held = (positions[childId] ?? []).find((p) => p.ticker === r.ticker)?.quantity ?? 0
        const shortOf = r.direction === 'buy' && asset ? estimate - asset.cash : 0

        return (
          <div key={r.id} className="card" style={{ borderColor: 'var(--accent-border)' }}>
            <div className="row">
              <span style={{ fontWeight: 500 }}>
                {r.name} {qty(r.quantity)}주 {r.direction === 'buy' ? '매수' : '매도'}
              </span>
              <span className="mid">{money(estimate)}</span>
            </div>
            <div className="label muted" style={{ marginTop: 3 }}>
              신청 {dayLabel(r.created_at.slice(0, 10))} · 신청할 때{' '}
              {unitPrice(r.price, currency)} · 지금 {unitPrice(price, currency)}
            </div>
            {r.reason && (
              <div className="label" style={{ marginTop: 5 }}>
                “{r.reason}”
              </div>
            )}

            {/* 승인하면 그 자리에서 실제 매매가 된다. 막힐 이유를 미리 알려 준다. */}
            {r.direction === 'buy' && shortOf > 0 && (
              <div className="label" style={{ color: 'var(--danger-text)', marginTop: 5 }}>
                현금이 {money(shortOf)} 부족합니다
              </div>
            )}
            {r.direction === 'sell' && held < r.quantity && (
              <div className="label" style={{ color: 'var(--danger-text)', marginTop: 5 }}>
                보유 {qty(held)}주뿐입니다
              </div>
            )}

            <div className="btn-row" style={{ marginTop: 10 }}>
              <button
                className="btn small"
                disabled={busy === r.id}
                onClick={() => void decide(r, false)}
              >
                이번엔 아니야
              </button>
              <button
                className="btn small primary"
                disabled={busy === r.id}
                onClick={() => void decide(r, true)}
              >
                {busy === r.id ? '처리 중…' : '승인하고 거래'}
              </button>
            </div>
          </div>
        )
      })}

      <div className="label muted">
        승인하면 <b>지금 시세로</b> 매매가 기록되고 현금도 함께 움직입니다.
      </div>
    </>
  )
}
