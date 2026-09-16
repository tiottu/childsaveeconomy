const won = new Intl.NumberFormat('ko-KR')

/** 12345 → "12,345" */
export function num(n: number): string {
  return won.format(Math.round(n))
}

/** 12345 → "12,345원" */
export function money(n: number): string {
  return `${won.format(Math.round(n))}원`
}

/** 부호를 붙인다. 3000 → "+3,000", -2000 → "-2,000" */
export function signed(n: number): string {
  const r = Math.round(n)
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${won.format(Math.abs(r))}`
}

/** 10.55 → "+10.6%" */
export function pct(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${Math.abs(n).toFixed(1)}%`
}

/** 소수 수량을 깔끔하게. 5 → "5", 1.5 → "1.5" */
export function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)))
}

/**
 * 종목 단가. 통화를 반드시 붙인다.
 * 미국 종목의 333.08 을 "333" 으로만 쓰면 원화로 읽혀서 금액 감각이 1000배 어긋난다.
 */
export function unitPrice(value: number, currency: string): string {
  if (currency === 'KRW') return `${won.format(Math.round(value))}원`
  return `${Number(value.toFixed(2)).toLocaleString('en-US')} ${currency}`
}

/**
 * 단가의 증감. 통화 단위로 표시한다.
 * 원화는 정수로 반올림해도 되지만, 달러는 0.81 을 1 로 반올림하면 변동폭이 사라진다.
 */
export function signedUnit(value: number, currency: string): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  const abs = Math.abs(value)
  if (currency === 'KRW') return `${sign}${won.format(Math.round(abs))}`
  return `${sign}${Number(abs.toFixed(2)).toLocaleString('en-US')} ${currency}`
}

/** "2026-09-15" → "9월 15일" */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 시세 기준시각. 오늘이면 "10:32 기준", 아니면 "9월 14일 기준" */
export function asOfLabel(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  if (sameDay) {
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm} 기준`
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일 기준`
}

export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

export function weekdayName(payday: number): string {
  return WEEKDAYS[Math.min(Math.max(payday, 1), 7) - 1]
}

/** 다음 용돈날까지 남은 일수. payday 는 1=월 … 7=일 */
export function daysUntilPayday(payday: number): number {
  const today = new Date()
  // JS 는 0=일요일이므로 1=월 … 7=일 로 맞춘다
  const current = today.getDay() === 0 ? 7 : today.getDay()
  const diff = (payday - current + 7) % 7
  return diff === 0 ? 7 : diff
}

export function ageFrom(birthYear: number | null): string {
  if (!birthYear) return ''
  return `${new Date().getFullYear() - birthYear + 1}세`
}
