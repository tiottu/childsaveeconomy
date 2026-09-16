import { hasSupabaseConfig } from './config'
import type { Quote } from './types'

/**
 * 종목 검색과 시세 조회 — 네이버 증권.
 *
 * 야후에서 네이버로 옮긴 이유:
 *  - 야후 검색은 한글 질의를 400 으로 거부한다. "삼성" 으로 못 찾는다.
 *  - 야후는 한국 종목 이름을 영문 약칭으로만 준다 ("SamsungElec"). 아이 화면에 쓸 수 없다.
 *  - 네이버는 미국 종목도 한글 이름을 준다 ("테슬라", "애플").
 *  - 시세도 네이버가 더 최신이었다 (같은 시각 삼성전자 250,500 대 248,500).
 *
 * 티커는 네이버 reutersCode 를 그대로 쓴다.
 *   국내 `005930` · 미국 `AAPL.O` · 환율 `FX_USDKRW`
 *
 * 네이버도 공식 문서가 없는 경로다. 막히면 화면이 "시세 없이 직접 입력" 으로 떨어진다
 * (TradeEntry). 시세를 못 받는다고 기록 자체가 막히지는 않는다.
 *
 * CORS 헤더를 주지 않아서 브라우저가 직접 부를 수 없다. 두 경로로 우회한다.
 *  - 개발 (npm run dev) : Vite 개발 서버 프록시 (vite.config.ts)
 *  - 배포              : Supabase Edge Function `quotes`
 */

/** 원/달러 환율의 티커. 미국 종목을 원화로 환산할 때 쓴다. */
export const FX_TICKER = 'FX_USDKRW'

/** 종목을 못 찾은 것과 네트워크가 안 되는 것을 구분한다. 대응이 다르다. */
export type Lookup<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'notfound' | 'unreachable' }

export type SymbolHit = {
  /** 네이버 reutersCode. 국내는 6자리, 미국은 AAPL.O 형태 */
  ticker: string
  name: string
  /** 코스피 / 코스닥 / NASDAQ … */
  exchange: string
  type: string
}

const useEdgeFunction = !import.meta.env.DEV && hasSupabaseConfig

type Params = { search: string } | { ticker: string }

type Fetched =
  | { status: number; json: unknown }
  | { status: 0; json: null }

/** 국내 6자리 종목코드인가 */
function isDomestic(ticker: string): boolean {
  return /^\d{6}$/.test(ticker)
}

function devPath(params: Params): string {
  if ('search' in params) {
    return `/naver-ac/ac?q=${encodeURIComponent(params.search)}&target=stock`
  }
  const t = params.ticker
  if (t === FX_TICKER) return `/naver-api/marketindex/exchange/${FX_TICKER}`
  if (isDomestic(t)) return `/naver-m/api/stock/${encodeURIComponent(t)}/basic`
  return `/naver-api/stock/${encodeURIComponent(t)}/basic`
}

async function call(params: Params): Promise<Fetched> {
  try {
    if (useEdgeFunction) {
      const { supabase } = await import('./supabaseClient')
      const sb = supabase()
      if (!sb) return { status: 0, json: null }

      const { data, error } = await sb.functions.invoke('quotes', { body: params })
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status ?? 0
        return { status, json: null }
      }
      return { status: 200, json: data }
    }

    const res = await fetch(devPath(params), { headers: { Accept: 'application/json' } })
    if (!res.ok) return { status: res.status, json: null }
    return { status: res.status, json: await res.json() }
  } catch {
    return { status: 0, json: null }
  }
}

/** "250,500" → 250500. 네이버는 국내 시세를 콤마 붙은 문자열로 준다. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * 국내 시세는 증감 부호가 숫자에 없고 별도 코드로 온다.
 * RISING / FALLING / EVEN (상한·하한도 각각 상승·하락으로 본다).
 */
function signOf(type: unknown): number {
  const name = (type as { name?: string; code?: string } | undefined)?.name
  if (name === 'FALLING' || name === 'LOWER_LIMIT') return -1
  if (name === 'EVEN') return 0
  const code = (type as { code?: string } | undefined)?.code
  if (code === '4' || code === '5') return -1
  if (code === '3') return 0
  return 1
}

export function normalizeTicker(input: string): string {
  const t = input.trim().toUpperCase()
  // 코스피·코스닥은 6자리 숫자 그대로 쓴다. 야후식 접미사가 붙어 오면 떼어낸다.
  const m = /^(\d{6})\.(KS|KQ|KN)$/.exec(t)
  if (m) return m[1]
  return t
}

/**
 * 시장 이름을 짧게 다듬는다.
 * 네이버는 "나스닥 증권거래소" 처럼 길게 주는데, 좁은 화면에서 종목명을 밀어낸다.
 */
export function exchangeLabel(name: string): string {
  const exact: Record<string, string> = {
    NASDAQ: '나스닥',
    NYSE: '뉴욕',
    AMEX: '아멕스',
    NSQ: '나스닥',
    NYS: '뉴욕',
  }
  if (exact[name]) return exact[name]

  // "나스닥 증권거래소" → "나스닥", "뉴욕 증권거래소" → "뉴욕"
  const trimmed = name.replace(/\s*증권거래소$/, '').trim()
  return trimmed || name
}

// ---------------------------------------------------------------- 검색

export async function searchSymbols(query: string): Promise<Lookup<SymbolHit[]>> {
  const q = query.trim()
  if (q.length < 2) return { ok: true, value: [] }

  const res = await call({ search: q })
  if (res.status !== 200 || res.json === null) {
    return { ok: false, reason: 'unreachable' }
  }

  try {
    const items = (res.json as { items?: Record<string, unknown>[] }).items ?? []
    const hits = items
      .filter((r) => {
        const nation = String(r.nationCode ?? '')
        // 이 앱은 국내와 미국만 다룬다. 일본·홍콩이 섞이면 시세 경로 규칙이 어긋난다.
        return String(r.category ?? '') === 'stock' && (nation === 'KOR' || nation === 'USA')
      })
      .map<SymbolHit>((r) => ({
        // reutersCode 를 그대로 티커로 쓴다. 국내 005930, 미국 AAPL.O
        ticker: String(r.reutersCode ?? r.code ?? ''),
        name: String(r.name ?? r.code ?? ''),
        // 네이버는 국내 시장 이름을 한글로 준다 (코스피 / 코스닥)
        exchange: String(r.typeName ?? r.typeCode ?? ''),
        type: 'EQUITY',
      }))
      .filter((h) => h.ticker)

    return { ok: true, value: hits }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

// ---------------------------------------------------------------- 시세

export async function fetchQuote(ticker: string): Promise<Lookup<Quote>> {
  const res = await call({ ticker })

  // 없는 종목에는 404 가 온다
  if (res.status === 404) return { ok: false, reason: 'notfound' }
  if (res.status !== 200 || res.json === null) return { ok: false, reason: 'unreachable' }

  try {
    const quote =
      ticker === FX_TICKER
        ? parseFx(res.json)
        : isDomestic(ticker)
          ? parseDomestic(ticker, res.json)
          : parseForeign(ticker, res.json)

    return quote ? { ok: true, value: quote } : { ok: false, reason: 'notfound' }
  } catch {
    return { ok: false, reason: 'notfound' }
  }
}

function parseDomestic(ticker: string, raw: unknown): Quote | null {
  const d = raw as Record<string, unknown>
  const price = num(d.closePrice)
  if (price === null) return null

  const change = (num(d.compareToPreviousClosePrice) ?? 0) * signOf(d.compareToPreviousPrice)
  const ratio = (num(d.fluctuationsRatio) ?? 0) * signOf(d.compareToPreviousPrice)

  return {
    ticker,
    name: (d.stockName as string) ?? null,
    price,
    prev_close: price - change,
    change_pct: ratio,
    currency: 'KRW',
    as_of: asOf(d.localTradedAt),
    source: 'api',
  }
}

function parseForeign(ticker: string, raw: unknown): Quote | null {
  const d = raw as Record<string, unknown>
  const price = num(d.closePrice)
  if (price === null) return null

  // 해외 시세는 증감이 이미 부호를 갖고 온다
  const change = num(d.compareToPreviousClosePrice) ?? 0
  const currency =
    (d.currencyType as { code?: string } | undefined)?.code ?? 'USD'

  return {
    ticker,
    // 한글 이름을 우선한다. 없으면 영문.
    name: (d.stockName as string) ?? (d.stockNameEng as string) ?? null,
    price,
    prev_close: price - change,
    change_pct: num(d.fluctuationsRatio) ?? 0,
    currency,
    as_of: asOf(d.localTradedAt),
    source: 'api',
  }
}

function parseFx(raw: unknown): Quote | null {
  const info = (raw as { exchangeInfo?: Record<string, unknown> }).exchangeInfo
  if (!info) return null

  // calcPrice 는 숫자, closePrice 는 "1,360.70" 문자열이다. 숫자를 먼저 쓴다.
  const price = num(info.calcPrice) ?? num(info.closePrice)
  if (price === null) return null

  const sign = signOf(info.fluctuationsType)
  const change = (num(info.fluctuations) ?? 0) * sign

  return {
    ticker: FX_TICKER,
    name: '원/달러',
    price,
    prev_close: price - change,
    change_pct: (num(info.fluctuationsRatio) ?? 0) * sign,
    currency: 'KRW',
    as_of: asOf(info.localTradedAt),
    source: 'api',
  }
}

function asOf(v: unknown): string {
  if (typeof v === 'string') {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date().toISOString()
}

/** 원/달러 환율. 미국 종목을 원화로 환산할 때 쓴다. */
export async function fetchFx(): Promise<Quote | null> {
  const res = await fetchQuote(FX_TICKER)
  return res.ok ? res.value : null
}
