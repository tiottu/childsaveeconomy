import type { CashTxn, ChildAsset, Goal, Reward, Stamp, Trade } from './types'

/**
 * 아이 화면의 게임 요소 — 레벨·등급·업적.
 *
 * **테이블을 새로 만들지 않는다.** 이미 있는 거래·도장·보상·목표에서 계산해 낸다.
 * 저장해 두면 실제 기록과 어긋날 수 있고, 기준을 바꿀 때마다 데이터를 고쳐야 한다.
 *
 * **레벨은 돈이 아니라 도장으로 올린다.** 돈으로 매기면 용돈을 많이 받는 아이가
 * 무조건 높아진다. 아이가 한 일로 올라가야 의미가 있다.
 *
 * 등급(트랙)은 처음에 문턱을 너무 낮게 잡아서, 3년치 기록을 넣자마자 거의 다 열려
 * 버렸다 — 다음에 할 일이 안 남으면 게임이 아니다. 그래서 단계를 다섯으로 늘리고
 * 문턱을 실제 규모에 맞춰 올렸다.
 */

/** 레벨 하나에 필요한 도장 수 */
const STAMPS_PER_LEVEL = 3

const TITLES: { min: number; title: string }[] = [
  { min: 30, title: '저축의 전설' },
  { min: 20, title: '저축 마스터' },
  { min: 15, title: '저축 달인' },
  { min: 10, title: '저축 모험가' },
  { min: 6, title: '저축 탐험가' },
  { min: 3, title: '저축 견습생' },
  { min: 1, title: '저축 새싹' },
]

export type Level = {
  level: number
  title: string
  /** 지금까지 받은 도장 총합 (보상으로 쓴 것도 센다) */
  xp: number
  inLevel: number
  toNext: number
  /** 0~100 */
  pct: number
  /**
   * 칭호 단계 1~7. 프로필 테두리가 이 값으로 세진다 —
   * 레벨이 올라도 화면이 똑같으면 오른 걸 모른다.
   */
  grade: number
  /** 다음 칭호와 그게 열리는 레벨. 최고 칭호면 null */
  nextTitle: string | null
  nextTitleAt: number | null
}

export function levelOf(stamps: Stamp[]): Level {
  // 보상으로 바꿔 쓴 도장도 '받은 것' 이다. 보상을 받으면 레벨이 내려가면 안 된다.
  const xp = stamps.filter((s) => s.status === 'given' || s.status === 'used').length
  const level = Math.floor(xp / STAMPS_PER_LEVEL) + 1
  const inLevel = xp % STAMPS_PER_LEVEL

  // TITLES 는 높은 레벨부터 적어 두었다. 처음 걸리는 것이 지금 칭호, 그 앞이 다음 칭호다.
  const i = TITLES.findIndex((t) => level >= t.min)
  const here = i === -1 ? TITLES[TITLES.length - 1] : TITLES[i]
  const next = i <= 0 ? null : TITLES[i - 1]

  return {
    level,
    title: here.title,
    xp,
    inLevel,
    toNext: STAMPS_PER_LEVEL - inLevel,
    pct: (inLevel / STAMPS_PER_LEVEL) * 100,
    grade: i === -1 ? 1 : TITLES.length - i,
    nextTitle: next?.title ?? null,
    nextTitleAt: next?.min ?? null,
  }
}

/** 칭호 단계 수. 테두리 그림이 이 수만큼 있다. */
export const GRADE_COUNT = TITLES.length

// ---------------------------------------------------------------- 주 단위 계산

/** 그 날짜가 속한 주의 월요일 (YYYY-MM-DD) */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1))
  return toIso(d)
}

function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function weekBefore(monday: string, n: number): string {
  const d = new Date(`${monday}T00:00:00`)
  d.setDate(d.getDate() - 7 * n)
  return toIso(d)
}

/**
 * 연속 저축 주 수.
 *
 * 입금이 있는 주를 연달아 센다. 주식을 사서 나간 돈은 저축을 깬 게 아니니 무시하고,
 * 매매로 생긴 기록(trade_id)도 세지 않는다.
 *
 * 이번 주가 비어 있어도 끊긴 것으로 보지 않는다 — 주가 아직 안 끝났다.
 */
export function savingStreak(cash: CashTxn[], now = new Date()): number {
  const weeks = new Set<string>()
  for (const t of cash) {
    if (t.direction !== 'in' || t.trade_id) continue
    weeks.add(mondayOf(t.occurred_on))
  }
  if (weeks.size === 0) return 0

  const thisWeek = mondayOf(toIso(now))
  const start = weeks.has(thisWeek) ? 0 : 1
  let streak = 0
  for (let i = start; i < 520; i++) {
    if (!weeks.has(weekBefore(thisWeek, i))) break
    streak++
  }
  return streak
}

/** 첫 거래부터 지금까지 몇 달인가 */
function monthsSinceFirst(cash: CashTxn[], now = new Date()): number {
  if (cash.length === 0) return 0
  const first = cash.reduce((a, t) => (t.occurred_on < a ? t.occurred_on : a), cash[0].occurred_on)
  const d = new Date(`${first}T00:00:00`)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(
    0,
    (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()),
  )
}

/** 입금은 있었고 지출은 한 건도 없던 달의 수 */
function noSpendMonths(cash: CashTxn[]): number {
  const dep = new Set<string>()
  const spend = new Set<string>()
  for (const t of cash) {
    if (t.trade_id) continue // 주식으로 옮긴 돈은 쓴 게 아니다
    const key = t.occurred_on.slice(0, 7)
    if (t.direction === 'in') dep.add(key)
    else spend.add(key)
  }
  return [...dep].filter((m) => !spend.has(m)).length
}

// ---------------------------------------------------------------- 등급 트랙

const TIER_NAMES = ['브론즈', '실버', '골드', '플래티넘', '다이아'] as const

export type Track = {
  key: string
  label: string
  /** 지금 값 */
  value: number
  /** 0 = 아직 등급 없음, 1~5 */
  tier: number
  tierName: string
  /** 다음 등급 문턱. 최고 등급이면 null */
  next: number | null
  /** 다음 등급까지 0~100 */
  pct: number
  /** 값을 어떻게 읽을지 */
  unit: 'won' | 'count' | 'week' | 'month'
}

function makeTrack(
  key: string,
  label: string,
  value: number,
  tiers: [number, number, number, number, number],
  unit: Track['unit'],
): Track {
  let tier = 0
  for (const t of tiers) if (value >= t) tier++

  const next = tier >= tiers.length ? null : tiers[tier]
  const floor = tier === 0 ? 0 : tiers[tier - 1]
  const pct = next === null ? 100 : ((value - floor) / (next - floor)) * 100

  return {
    key,
    label,
    value,
    tier,
    tierName: tier === 0 ? '' : TIER_NAMES[tier - 1],
    next,
    pct: Math.max(0, Math.min(100, pct)),
    unit,
  }
}

export function tracksOf(input: {
  cash: CashTxn[]
  trades: Trade[]
  stamps: Stamp[]
  now?: Date
}): Track[] {
  const { cash, trades, stamps } = input
  const now = input.now ?? new Date()

  // 모은 돈 = 넣은 돈 − 쓴 돈. 주식으로 옮긴 건 쓴 게 아니라 제외한다.
  const saved = cash
    .filter((t) => !t.trade_id)
    .reduce((s, t) => s + (t.direction === 'in' ? t.amount : -t.amount), 0)

  // 투자에 넣어 본 돈 총액 (팔았다가 다시 사도 경험은 쌓인다)
  const invested = cash
    .filter((t) => t.trade_id && t.direction === 'out')
    .reduce((s, t) => s + t.amount, 0)

  const earnedStamps = stamps.filter((s) => s.status === 'given' || s.status === 'used').length

  return [
    makeTrack('save', '모은 돈', saved, [100_000, 500_000, 1_500_000, 3_000_000, 5_000_000], 'won'),
    makeTrack('streak', '연속 저축', savingStreak(cash, now), [2, 4, 12, 26, 52], 'week'),
    makeTrack('stamp', '칭찬도장', earnedStamps, [5, 15, 30, 60, 100], 'count'),
    makeTrack('invest', '투자 경험', invested, [100_000, 500_000, 1_500_000, 3_000_000, 5_000_000], 'won'),
    makeTrack('record', '거래 기록', cash.length, [20, 50, 100, 200, 400], 'count'),
    makeTrack('months', '통장 나이', monthsSinceFirst(cash, now), [6, 12, 24, 36, 60], 'month'),
    makeTrack('trade', '매매 횟수', trades.length, [1, 5, 15, 30, 60], 'count'),
  ]
}

/** 트랙 등급을 합쳐 전체 등급을 매긴다. 프로필 카드에 한 줄로 보여준다. */
export function overallTier(tracks: Track[]): { tier: number; name: string } {
  const sum = tracks.reduce((s, t) => s + t.tier, 0)
  const avg = tracks.length ? sum / tracks.length : 0
  const tier = Math.max(1, Math.min(5, Math.round(avg)))
  return { tier, name: TIER_NAMES[tier - 1] }
}

// ---------------------------------------------------------------- 한 번만 받는 배지

export type Badge = {
  key: string
  label: string
  earned: boolean
}

/**
 * 등급으로 안 잡히는 '처음 한 번' 들. 트랙이 꾸준함을 보여주고 이쪽이 사건을 보여준다.
 */
export function badgesOf(input: {
  asset: ChildAsset | undefined
  cash: CashTxn[]
  trades: Trade[]
  stamps: Stamp[]
  rewards: Reward[]
  goals: Goal[]
}): Badge[] {
  const { asset, cash, trades, stamps, rewards, goals } = input
  const deposits = cash.filter((t) => t.direction === 'in' && !t.trade_id)
  const tickers = new Set(trades.map((t) => t.ticker))

  const list: Badge[] = [
    { key: 'first', label: '첫 저축', earned: deposits.length > 0 },
    { key: 'invest', label: '첫 주식', earned: trades.length > 0 },
    { key: 'sell', label: '첫 매도', earned: trades.some((t) => t.direction === 'sell') },
    { key: 'profit', label: '평가 이익', earned: (asset?.pnl ?? 0) > 0 },
    { key: 'three', label: '3종목', earned: tickers.size >= 3 },
    { key: 'reward', label: '첫 보상', earned: rewards.length > 0 },
    { key: 'goal', label: '목표 달성', earned: goals.some((g) => g.status === 'achieved') },
    { key: 'nospend', label: '무지출 한 달', earned: noSpendMonths(cash) > 0 },
    { key: 'ask', label: '도장 신청', earned: stamps.some((s) => s.asked_by === 'child') },
    { key: 'millon', label: '100만 돌파', earned: (asset?.total ?? 0) >= 1_000_000 },
    { key: 'threemil', label: '300만 돌파', earned: (asset?.total ?? 0) >= 3_000_000 },
    { key: 'usstock', label: '미국 주식', earned: trades.some((t) => t.ticker.includes('.')) },
  ]
  // 받은 것을 앞으로. 잠긴 것이 뒤에 남아 다음 목표가 된다.
  return [...list.filter((b) => b.earned), ...list.filter((b) => !b.earned)]
}
