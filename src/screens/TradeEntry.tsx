import { useEffect, useRef, useState } from 'react'
import { Field, Toggle } from '../components/ui'
import { asOfLabel, money, num, qty as fmtQty, todayIso, unitPrice } from '../lib/format'
import {
  FX_TICKER,
  exchangeLabel,
  fetchFx,
  fetchQuote,
  normalizeTicker,
  searchSymbols,
  type SymbolHit,
} from '../lib/market'
import { useData, useStore } from '../state/store'
import type { Quote } from '../lib/types'

/** 아이 계좌에 자주 담는 종목. 검색 없이 바로 고를 수 있게 둔다. */
const PRESETS: SymbolHit[] = [
  { ticker: '360750', name: 'TIGER 미국S&P500', exchange: '코스피', type: 'ETF' },
  { ticker: '069500', name: 'KODEX 200', exchange: '코스피', type: 'ETF' },
  { ticker: '005930', name: '삼성전자', exchange: '코스피', type: 'EQUITY' },
  { ticker: 'AAPL.O', name: '애플', exchange: 'NASDAQ', type: 'EQUITY' },
]

/** 확정된 종목 = 야후가 실제로 시세를 준 종목 */
type Picked = {
  ticker: string
  name: string
  exchange: string
  quote: Quote
}

export function TradeEntry({
  initialChildId,
  initialTicker,
  onDone,
}: {
  initialChildId?: string
  initialTicker?: string
  onDone: () => void
}) {
  const { children, assets, positions, quotes } = useData()
  const { db, reload } = useStore()

  const [direction, setDirection] = useState<'buy' | 'sell'>('buy')
  const [childId, setChildId] = useState(initialChildId ?? children[0]?.id ?? '')

  const [query, setQuery] = useState(initialTicker ?? '')
  const [hits, setHits] = useState<SymbolHit[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [quantity, setQuantity] = useState('1')
  const [price, setPrice] = useState('')
  const [fee, setFee] = useState('0')
  const [date, setDate] = useState(todayIso())
  const [fx, setFx] = useState<Quote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  /** 사용자가 단가를 직접 고쳤으면 자동 채우기를 멈춘다 */
  const priceTouched = useRef(false)

  const asset = assets.find((a) => a.child_id === childId)
  const held = positions[childId] ?? []

  // 종목을 2글자 이상 입력하면 검색한다. 종목코드를 그대로 넣은 경우도 검색으로 걸린다.
  useEffect(() => {
    const q = query.trim()
    if (picked || q.length < 2) {
      setHits([])
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const res = await searchSymbols(q)
      if (cancelled) return
      setSearching(false)

      if (res.ok) {
        setHits(res.value)
        setLookupError(
          res.value.length === 0 ? '그런 종목을 찾지 못했습니다' : null,
        )
      } else {
        setHits([])
        setLookupError(
          res.reason === 'unreachable'
            ? '시세 서버에 연결할 수 없습니다'
            : /[^\x20-\x7E]/.test(q)
              ? '검색은 종목코드나 영문 이름으로 해주세요 (예: 005930, AAPL)'
              : '그런 종목을 찾지 못했습니다',
        )
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, picked])

  /**
   * 시세를 못 받았을 때 직접 입력으로 넘어갈 수 있게 남겨 두는 후보.
   *
   * 시세 확인을 종목 존재 확인으로 쓰고 있는데, 이걸 저장의 전제 조건으로 두면
   * 시세 서버가 막히는 날에는 기록 자체를 못 한다. 없는 종목(notfound)은 막고,
   * 통신 문제(unreachable)는 직접 입력 길을 열어 준다.
   */
  const [manualCandidate, setManualCandidate] = useState<SymbolHit | null>(null)

  /** 종목을 확정한다. 야후가 시세를 주지 않으면 확정하지 않는다 — 존재 확인을 겸한다. */
  async function confirm(hit: SymbolHit) {
    const ticker = normalizeTicker(hit.ticker)
    setLookupError(null)
    setManualCandidate(null)
    setSearching(true)

    const res = await fetchQuote(ticker)
    setSearching(false)

    if (!res.ok) {
      if (res.reason === 'notfound') {
        setLookupError(`${ticker} 은 조회되지 않는 종목입니다`)
      } else {
        setLookupError('시세 서버에 연결할 수 없습니다')
        setManualCandidate({ ...hit, ticker })
      }
      return
    }

    const quote = res.value
    setPicked({
      ticker,
      // 야후 영문 약칭보다 우리가 아는 한글 이름을 우선한다
      name:
        held.find((p) => p.ticker === ticker)?.name ??
        PRESETS.find((p) => p.ticker === ticker)?.name ??
        hit.name ??
        quote.name ??
        ticker,
      exchange: hit.exchange || '',
      quote,
    })
    setHits([])
    setQuery(ticker)

    priceTouched.current = false
    setPrice(String(quote.price))

    if (db) void db.saveQuote(quote).then(() => reload())

    // 미국 종목이면 원화 환산에 환율이 필요하다
    if (quote.currency !== 'KRW') {
      const cached = quotes.find((q) => q.ticker === FX_TICKER)
      const rate = (await fetchFx()) ?? cached ?? null
      setFx(rate)
      if (rate && db) void db.saveQuote(rate).then(() => reload())
    } else {
      setFx(null)
    }
  }

  /** 시세 없이 직접 입력으로 진행한다. 단가는 사용자가 넣어야 한다. */
  function proceedManually(hit: SymbolHit) {
    setPicked({
      ticker: hit.ticker,
      name: hit.name || hit.ticker,
      exchange: hit.exchange || '',
      quote: {
        ticker: hit.ticker,
        name: hit.name || null,
        price: 0,
        prev_close: null,
        change_pct: null,
        // 통화를 모르는 채로 환산하면 금액이 틀린다. 원화로 본다.
        currency: 'KRW',
        as_of: new Date().toISOString(),
        source: 'manual',
      },
    })
    setHits([])
    setManualCandidate(null)
    setLookupError(null)
    priceTouched.current = true
    setPrice('')
  }

  function reset() {
    setPicked(null)
    setQuery('')
    setHits([])
    setPrice('')
    setFx(null)
    setLookupError(null)
    setManualCandidate(null)
    setError(null)
    priceTouched.current = false
  }

  const q = Number(quantity.replace(/[^0-9.]/g, ''))
  const p = Number(price.replace(/[^0-9.]/g, ''))
  const f = Number(fee.replace(/[^0-9]/g, '')) || 0

  /** 시세를 못 받아 직접 입력으로 진행한 상태 */
  const isManual = picked !== null && picked.quote.source === 'manual' && picked.quote.price === 0
  /** 입력창에 적은 값을 종목코드로 해석한 형태 (6자리 숫자면 .KS 가 붙는다) */
  const typedTicker = normalizeTicker(query)
  /**
   * 검색이 막혔을 때 직접 입력을 열어 주는데, 적어 넣은 글자를 그대로 종목코드로
   * 쓴다. "삼성" 같은 이름을 코드 자리에 넣으면 종목 하나가 통째로 잘못 생긴다.
   * 코드 모양일 때만 이 길을 연다.
   */
  const typedLooksLikeTicker = /^(\d{6}|[A-Z]{1,5}(\.[A-Z]{1,2})?)$/.test(typedTicker)
  const isForeign = picked !== null && picked.quote.currency !== 'KRW'
  const fxRate = isForeign ? (fx?.price ?? 0) : 1
  const amount =
    q > 0 && p > 0 && fxRate > 0
      ? Math.round(q * p * fxRate) + (direction === 'buy' ? f : -f)
      : 0

  const position = picked ? held.find((x) => x.ticker === picked.ticker) : undefined
  const shortCash = direction === 'buy' && asset ? amount - asset.cash : 0
  const shortQty = direction === 'sell' ? q - (position?.quantity ?? 0) : 0

  async function save() {
    setError(null)

    if (!childId) return setError('누구의 계좌인지 골라 주세요')
    if (!picked) return setError('종목을 골라 주세요')
    if (isForeign && fxRate <= 0) return setError('환율을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요')
    if (!q || q <= 0) return setError('수량을 입력해 주세요')
    if (!p || p <= 0) return setError('단가를 입력해 주세요')
    if (direction === 'buy' && asset && amount > asset.cash) {
      return setError(`현금이 부족합니다. 잔액 ${money(asset.cash)}, 필요 ${money(amount)}`)
    }
    if (direction === 'sell' && shortQty > 0) {
      return setError(`보유 수량이 부족합니다. 보유 ${fmtQty(position?.quantity ?? 0)}주`)
    }
    if (!db) return setError('저장할 수 없습니다. 잠시 후 다시 시도해 주세요')

    setSaving(true)
    try {
      await db.applyTrade({
        child_id: childId,
        direction,
        ticker: picked.ticker,
        name: picked.name,
        quantity: q,
        price: p,
        fee: f,
        fx: fxRate,
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

  // 매도는 보유 종목 중에서만 고르게 한다
  const sellable = held.map<SymbolHit>((h) => ({
    ticker: h.ticker,
    name: h.name,
    exchange: '',
    type: 'EQUITY',
  }))
  const shortcuts = direction === 'sell' ? sellable : PRESETS

  return (
    <>
      <Toggle
        options={[
          { key: 'buy', label: '매수' },
          { key: 'sell', label: '매도' },
        ]}
        value={direction}
        onChange={(k) => {
          setDirection(k as 'buy' | 'sell')
          setError(null)
        }}
      />

      <Field label="누구">
        <Toggle
          options={children.map((c) => ({ key: c.id, label: c.name }))}
          value={childId}
          onChange={setChildId}
        />
      </Field>

      {picked ? (
        <div className="card">
          <div className="row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{picked.name}</div>
              <div className="label">
                {picked.ticker}
                {picked.exchange && ` · ${exchangeLabel(picked.exchange)}`}
                {picked.quote.currency !== 'KRW' && ` · ${picked.quote.currency}`}
              </div>
            </div>
            <button
              className="btn small"
              style={{ width: 'auto', padding: '6px 12px' }}
              onClick={reset}
            >
              바꾸기
            </button>
          </div>
          {isManual ? (
            <div className="label" style={{ marginTop: 7, color: 'var(--warning-text)' }}>
              시세를 받지 못했습니다. 단가를 직접 넣어 주세요.
            </div>
          ) : (
            <div className="label" style={{ marginTop: 7 }}>
              현재가 {unitPrice(picked.quote.price, picked.quote.currency)} ·{' '}
              {asOfLabel(picked.quote.as_of)}
            </div>
          )}
          {isForeign && (
            <div className="label muted">
              {fx
                ? `환율 ${num(fx.price)}원 적용 → 1주 ${money(picked.quote.price * fx.price)}`
                : '환율을 가져오는 중…'}
            </div>
          )}
        </div>
      ) : (
        <>
          <Field label="종목 검색">
            <input
              className="field"
              type="text"
              placeholder="005930, AAPL, kodex …"
              value={query}
              autoFocus
              onChange={(e) => {
                setQuery(e.target.value)
                setLookupError(null)
                setError(null)
              }}
            />
          </Field>

          <div className="quick">
            {shortcuts.map((t) => (
              <button key={t.ticker} onClick={() => void confirm(t)}>
                {t.name}
              </button>
            ))}
          </div>

          {searching && <div className="label muted">찾는 중…</div>}

          {!searching && hits.length > 0 && (
            <div className="card" style={{ padding: '4px 14px' }}>
              {hits.map((h) => (
                <button
                  key={h.ticker}
                  className="list-item"
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                    padding: '10px 0',
                  }}
                  onClick={() => void confirm(h)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h.name}
                    </div>
                    <div className="label">
                      {h.ticker}
                      {h.exchange && ` · ${exchangeLabel(h.exchange)}`}
                      {h.type === 'ETF' && ' · ETF'}
                    </div>
                  </div>
                  <span className="muted">›</span>
                </button>
              ))}
            </div>
          )}

          {!searching && lookupError && <div className="error">{lookupError}</div>}

          {/* 통신이 안 될 때만 열어 주는 길. 없는 종목은 여기로 오지 않는다. */}
          {!searching && manualCandidate && (
            <>
              <button className="btn" onClick={() => proceedManually(manualCandidate)}>
                {manualCandidate.ticker} 시세 없이 직접 입력
              </button>
              <div className="label muted">
                시세를 못 받아도 기록은 남길 수 있습니다. 단가를 직접 넣어 주세요.
              </div>
            </>
          )}

          {/* 검색 자체가 안 될 때: 입력한 종목코드로 바로 진행 */}
          {!searching &&
            !manualCandidate &&
            lookupError?.includes('연결할 수 없습니다') &&
            (typedLooksLikeTicker ? (
              <button
                className="btn"
                onClick={() =>
                  proceedManually({ ticker: typedTicker, name: '', exchange: '', type: 'EQUITY' })
                }
              >
                {typedTicker} 종목코드로 직접 입력
              </button>
            ) : (
              <div className="label muted">
                검색이 안 될 때는 종목코드로 적어 주세요 (예: 005930, AAPL)
              </div>
            ))}

          {!searching && !lookupError && query.trim().length > 0 && query.trim().length < 2 && (
            <div className="label muted">두 글자 이상 입력하면 종목을 찾아줍니다</div>
          )}
        </>
      )}

      {picked && isManual && (
        <Field label="종목 이름">
          <input
            className="field"
            type="text"
            placeholder={picked.ticker}
            value={picked.name === picked.ticker ? '' : picked.name}
            onChange={(e) =>
              setPicked({ ...picked, name: e.target.value.trim() || picked.ticker })
            }
          />
        </Field>
      )}

      {picked && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Field label="수량">
                <input
                  className="field"
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))}
                />
              </Field>
            </div>
            <div style={{ flex: 1.4 }}>
              <Field
                label={
                  picked.quote.currency === 'KRW' ? '단가' : `단가 (${picked.quote.currency})`
                }
              >
                <input
                  className="field"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={
                    price
                      ? picked.quote.currency === 'KRW'
                        ? Number(price).toLocaleString('ko-KR')
                        : price
                      : ''
                  }
                  onChange={(e) => {
                    priceTouched.current = true
                    setPrice(e.target.value.replace(/[^0-9.]/g, ''))
                  }}
                />
              </Field>
            </div>
          </div>

          {priceTouched.current && !isManual && (
            <button
              className="btn small"
              onClick={() => {
                priceTouched.current = false
                setPrice(String(picked.quote.price))
              }}
            >
              현재가 {unitPrice(picked.quote.price, picked.quote.currency)} 으로 되돌리기
            </button>
          )}

          <Field label="수수료 (원)">
            <input
              className="field"
              type="text"
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value.replace(/[^0-9]/g, ''))}
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

          {amount > 0 && asset && (
            <div
              className="card"
              style={{
                background: 'var(--warning-bg)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-text)',
              }}
            >
              <div className="row">
                <span style={{ fontSize: 12 }}>
                  {direction === 'buy' ? '매수 금액' : '매도 금액'}
                </span>
                <span style={{ fontWeight: 500 }}>{money(Math.abs(amount))}</span>
              </div>
              {isForeign && fx && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {fmtQty(q)}주 × {p} {picked.quote.currency} × 환율 {num(fx.price)}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 5 }}>
                {asset.name} 현금 통장에서 {direction === 'buy' ? '출금' : '입금'}
              </div>
              {/* 현금이 부족하면 음수 잔액을 보여주는 대신 부족액만 말한다 */}
              {shortCash > 0 ? (
                <div style={{ fontSize: 12, marginTop: 3, fontWeight: 500 }}>
                  잔액 {money(asset.cash)} · {money(shortCash)} 부족합니다
                </div>
              ) : (
                <div style={{ fontSize: 12 }}>
                  {money(asset.cash)} →{' '}
                  {money(
                    direction === 'buy' ? asset.cash - amount : asset.cash + Math.abs(amount),
                  )}
                </div>
              )}
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div className="spacer" />

          <button className="btn primary" onClick={save} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      )}
    </>
  )
}
