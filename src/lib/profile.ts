import type { CashTxn, ChildAsset, Goal, Reward, Stamp, Trade } from './types'

/**
 * 아이 화면의 게임 요소 — 레벨·연속 저축·업적.
 *
 * **테이블을 새로 만들지 않는다.** 이미 있는 거래·도장·보상·목표에서 계산해 낸다.
 * 저장해 두면 실제 기록과 어긋날 수 있고, 기준을 바꿀 때마다 데이터를 고쳐야 한다.
 *
 * **레벨은 돈이 아니라 도장으로 올린다.** 돈으로 매기면 용돈을 많이 받는 아이가
 * 무조건 높아진다. 아이가 한 일로 올라가야 의미가 있다.
 */

/** 레벨 하나에 필요한 도장 수 */
const STAMPS_PER_LEVEL = 3

const TITLES: { min: number; title: string }[] = [
  { min: 15, title: '저축 마스터' },
  { min: 10, title: '저축 달인' },
  { min: 7, title: '저축 모험가' },
  { min: 5, title: '저축 탐험가' },
  { min: 3, title: '저축 견습생' },
  { min: 1, title: '저축 새싹' },
]

export type Level = {
  level: number
  title: string
  /** 지금까지 받은 도장 총합 (보상으로 쓴 것도 센다) */
  xp: number
  /** 이번 레벨에서 채운 개수 */
  inLevel: number
  /** 다음 레벨까지 남은 개수 */
  toNext: number
  /** 0~100 */
  pct: number
}

export function levelOf(stamps: Stamp[]): Level {
  // 보상으로 바꿔 쓴 도장도 '받은 것' 이다. 보상을 받으면 레벨이 내려가면 안 된다.
  const xp = stamps.filter((s) => s.status === 'given' || s.status === 'used').length
  const level = Math.floor(xp / STAMPS_PER_LEVEL) + 1
  const inLevel = xp % STAMPS_PER_LEVEL
  const title = TITLES.find((t) => level >= t.min)?.title ?? '저축 새싹'
  return {
    level,
    title,
    xp,
    inLevel,
    toNext: STAMPS_PER_LEVEL - inLevel,
    pct: (inLevel / STAMPS_PER_LEVEL) * 100,
  }
}

/** 그 날짜가 속한 주의 월요일 (YYYY-MM-DD) */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  // JS 는 0=일요일. 월요일 시작으로 맞춘다.
  const dow = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (dow - 1))
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function weekBefore(monday: string, n: number): string {
  const d = new Date(`${monday}T00:00:00`)
  d.setDate(d.getDate() - 7 * n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * 연속 저축 주 수.
 *
 * 입금이 있는 주를 연달아 센다. 주식을 사서 나간 돈은 저축을 깬 게 아니니 무시하고,
 * 매매로 생긴 기록(trade_id)도 세지 않는다.
 *
 * 이번 주가 비어 있어도 끊긴 것으로 보지 않는다 — 주가 아직 안 끝났다. 그 경우
 * 지난주부터 센다.
 */
export function savingStreak(cash: CashTxn[], now = new Date()): number {
  const weeks = new Set<string>()
  for (const t of cash) {
    if (t.direction !== 'in' || t.trade_id) continue
    weeks.add(mondayOf(t.occurred_on))
  }
  if (weeks.size === 0) return 0

  const nowIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const thisWeek = mondayOf(nowIso)

  // 이번 주에 입금이 있으면 이번 주부터, 없으면 지난주부터 센다
  let start = weeks.has(thisWeek) ? 0 : 1
  let streak = 0
  // 넉넉히 5년까지만 본다
  for (let i = start; i < 260; i++) {
    if (!weeks.has(weekBefore(thisWeek, i))) break
    streak++
  }
  return streak
}

export type Badge = {
  key: string
  label: string
  /** 잠겨 있으면 무엇을 해야 하는지 */
  hint: string
  earned: boolean
}

export function badgesOf(input: {
  asset: ChildAsset | undefined
  cash: CashTxn[]
  trades: Trade[]
  stamps: Stamp[]
  rewards: Reward[]
  goals: Goal[]
  streak: number
}): Badge[] {
  const { asset, cash, trades, stamps, rewards, goals, streak } = input
  const deposits = cash.filter((t) => t.direction === 'in' && !t.trade_id)
  const earnedStamps = stamps.filter((s) => s.status === 'given' || s.status === 'used').length
  const total = asset?.total ?? 0

  const list: Badge[] = [
    { key: 'first', label: '첫 저축', hint: '용돈을 한 번 받으면', earned: deposits.length > 0 },
    { key: 'ten', label: '10만 돌파', hint: '전체 재산 10만원', earned: total >= 100_000 },
    { key: 'fifty', label: '50만 돌파', hint: '전체 재산 50만원', earned: total >= 500_000 },
    { key: 'stamp10', label: '도장 10개', hint: '칭찬도장 10개', earned: earnedStamps >= 10 },
    { key: 'streak4', label: '4주 연속', hint: '4주 연속 저축', earned: streak >= 4 },
    { key: 'invest', label: '첫 주식', hint: '주식을 한 번 사면', earned: trades.length > 0 },
    { key: 'profit', label: '첫 수익', hint: '주식으로 이익이 나면', earned: (asset?.pnl ?? 0) > 0 },
    { key: 'reward', label: '첫 보상', hint: '도장을 모아 보상을', earned: rewards.length > 0 },
    {
      key: 'goal',
      label: '목표 달성',
      hint: '저축 목표를 이루면',
      earned: goals.some((g) => g.status === 'achieved'),
    },
  ]
  // 받은 것을 앞으로, 잠긴 것을 뒤로. 다음에 할 일이 자연스럽게 눈에 들어온다.
  return [...list.filter((b) => b.earned), ...list.filter((b) => !b.earned)]
}
