/**
 * 아이가 고르는 엠블럼.
 *
 * 그림 파일이 아니라 코드로 그린다. 사내망에서 이미지 업로드가 막혀 있어 애초에
 * 올릴 방법이 없고, 확대해도 깨지지 않으며 한 개가 1KB 도 안 된다.
 *
 * 동물 얼굴 대신 각진 문양으로 뒀다. 4학년에게 귀여운 동물은 유치하게 읽힌다.
 */

export const EMBLEMS = [
  { key: 'bolt', name: '번개' },
  { key: 'flame', name: '불꽃' },
  { key: 'wolf', name: '늑대' },
  { key: 'wave', name: '파도' },
  { key: 'shield', name: '방패' },
  { key: 'robot', name: '로봇' },
  { key: 'rocket', name: '로켓' },
  { key: 'crown', name: '왕관' },
] as const

export type EmblemKey = (typeof EMBLEMS)[number]['key']

/** 아직 고르지 않은 아이에게도 뭔가는 보여줘야 한다. 이름으로 하나 정해 준다. */
export function emblemOf(child: { emblem: string | null; name: string }): EmblemKey {
  const picked = EMBLEMS.find((e) => e.key === child.emblem)
  if (picked) return picked.key
  let sum = 0
  for (const ch of child.name) sum += ch.codePointAt(0) ?? 0
  return EMBLEMS[sum % EMBLEMS.length].key
}

export function emblemName(key: EmblemKey): string {
  return EMBLEMS.find((e) => e.key === key)?.name ?? '번개'
}

/** 엠블럼마다 고유한 색. 아이를 색으로도 구분하게 한다. */
const COLORS: Record<EmblemKey, string> = {
  bolt: '#7f77dd',
  flame: '#d85a30',
  wolf: '#5f5e5a',
  wave: '#378add',
  shield: '#1d9e75',
  robot: '#534ab7',
  rocket: '#d4537e',
  crown: '#ba7517',
}

export function emblemColor(key: EmblemKey): string {
  return COLORS[key]
}

function Shape({ k }: { k: EmblemKey }) {
  const c = COLORS[k]
  switch (k) {
    case 'bolt':
      return <path d="M27 4 L12 26 H22 L19 44 L36 20 H25 Z" fill={c} />
    case 'flame':
      return (
        <>
          <path d="M24 4 Q34 16 32 26 Q30 36 24 44 Q18 36 16 26 Q14 16 24 4" fill={c} />
          <path d="M24 20 Q28 27 26 33 Q25 38 24 41 Q23 38 22 33 Q20 27 24 20" fill="#f0997b" />
        </>
      )
    case 'wolf':
      return (
        <>
          <path d="M8 10 L16 20 L24 14 L32 20 L40 10 L40 28 Q40 40 24 44 Q8 40 8 28 Z" fill={c} />
          <circle cx="18" cy="26" r="2.6" fill="#f1efe8" />
          <circle cx="30" cy="26" r="2.6" fill="#f1efe8" />
          <path
            d="M20 34 L24 38 L28 34"
            stroke="#f1efe8"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )
    case 'wave':
      return <path d="M24 4 L30 18 L44 24 L30 30 L24 44 L18 30 L4 24 L18 18 Z" fill={c} />
    case 'shield':
      return (
        <>
          <path d="M24 4 L38 12 V26 Q38 40 24 44 Q10 40 10 26 V12 Z" fill={c} />
          <path d="M24 14 L30 22 L24 34 L18 22 Z" fill="#e1f5ee" />
        </>
      )
    case 'robot':
      return (
        <>
          <rect x="10" y="14" width="28" height="24" rx="6" fill={c} />
          <circle cx="18" cy="24" r="3.4" fill="#eeedfe" />
          <circle cx="30" cy="24" r="3.4" fill="#eeedfe" />
          <rect x="18" y="31" width="12" height="3" rx="1.5" fill="#eeedfe" />
          <path d="M24 6 V14" stroke={c} strokeWidth="3" />
          <circle cx="24" cy="5" r="3" fill="#7f77dd" />
        </>
      )
    case 'rocket':
      return (
        <>
          <path d="M24 4 Q32 16 32 28 L24 36 L16 28 Q16 16 24 4" fill={c} />
          <circle cx="24" cy="20" r="4" fill="#fbeaf0" />
          <path d="M16 28 L10 40 L20 34 Z" fill="#ed93b1" />
          <path d="M32 28 L38 40 L28 34 Z" fill="#ed93b1" />
        </>
      )
    case 'crown':
      return (
        <>
          <path d="M6 36 L10 14 L18 24 L24 10 L30 24 L38 14 L42 36 Z" fill={c} />
          <rect x="6" y="36" width="36" height="6" rx="2" fill="#854f0b" />
        </>
      )
  }
}

// ---------------------------------------------------------------- 등급 테두리

/**
 * 칭호 단계(1~7)에 따라 세지는 엠블럼 테두리.
 *
 * 레벨이 올라도 화면이 그대로면 오른 걸 모른다. 숫자만 1 늘어나는 것보다
 * 테두리가 눈에 띄게 달라지는 쪽이 아이에게 훨씬 크게 읽힌다.
 *
 * 단계를 따로 만들지 않고 이미 있는 칭호(저축 새싹 … 저축의 전설)에 맞췄다.
 * 이름표와 테두리가 다른 이야기를 하면 안 된다.
 */
type Frame = {
  /** 테두리 색 */
  color: string
  /** 네모(둥근) 인가 팔각인가 */
  oct: boolean
  width: number
  /** 못 장식 개수 — 0, 4(모서리), 8(모서리+변) */
  studs: 0 | 4 | 8
  /** 바깥으로 뻗는 뿔 개수 — 0, 4(변), 8(변+모서리) */
  spikes: 0 | 4 | 8
  /** 안쪽에 한 겹 더 */
  doubled?: boolean
  /** 못 장식 색을 따로 쓴다 (전설) */
  studColor?: string
  /** 위쪽 보석 */
  gem?: string
}

const FRAMES: Frame[] = [
  { color: '#a8a6a0', oct: false, width: 3, studs: 0, spikes: 0 }, // 1 저축 새싹
  { color: '#b07b3e', oct: false, width: 3.5, studs: 4, spikes: 0 }, // 2 견습생
  { color: '#6b8ea8', oct: true, width: 4, studs: 4, spikes: 0 }, // 3 탐험가
  { color: '#c9962a', oct: true, width: 4.5, studs: 8, spikes: 0 }, // 4 모험가
  { color: '#d85a30', oct: true, width: 5, studs: 8, spikes: 4 }, // 5 달인
  { color: '#6a3fc0', oct: true, width: 5, studs: 8, spikes: 4, doubled: true }, // 6 마스터
  {
    color: '#b4283c',
    oct: true,
    width: 5.5,
    studs: 8,
    spikes: 8,
    doubled: true,
    studColor: '#d4a017',
    gem: '#d4a017',
  }, // 7 저축의 전설
]

const OCT = '26,10 74,10 90,26 90,74 74,90 26,90 10,74 10,26'
const OCT_INNER = '30,17 70,17 83,30 83,70 70,83 30,83 17,70 17,30'

/** 모서리 4곳 · 변 4곳의 못 자리 */
const STUD_CORNER = [
  [21, 21],
  [79, 21],
  [79, 79],
  [21, 79],
]
const STUD_EDGE = [
  [50, 11],
  [89, 50],
  [50, 89],
  [11, 50],
]

/** 변에서 뻗는 뿔 (위·오른쪽·아래·왼쪽) */
const SPIKE_EDGE = [
  'M50 0 L42 12 L58 12 Z',
  'M100 50 L88 42 L88 58 Z',
  'M50 100 L42 88 L58 88 Z',
  'M0 50 L12 42 L12 58 Z',
]
/** 모서리에서 뻗는 뿔 */
const SPIKE_CORNER = [
  'M14 14 L30 16 L16 30 Z',
  'M86 14 L84 30 L70 16 Z',
  'M86 86 L70 84 L84 70 Z',
  'M14 86 L16 70 L30 84 Z',
]

export function RankFrame({ grade }: { grade: number }) {
  const f = FRAMES[Math.max(1, Math.min(FRAMES.length, grade)) - 1]
  const studs = f.studs === 8 ? [...STUD_CORNER, ...STUD_EDGE] : f.studs === 4 ? STUD_CORNER : []
  const spikes =
    f.spikes === 8 ? [...SPIKE_EDGE, ...SPIKE_CORNER] : f.spikes === 4 ? SPIKE_EDGE : []

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0 }}
    >
      {spikes.map((d) => (
        <path key={d} d={d} fill={f.color} />
      ))}
      {f.oct ? (
        <polygon points={OCT} fill="none" stroke={f.color} strokeWidth={f.width} />
      ) : (
        <rect
          x="11"
          y="11"
          width="78"
          height="78"
          rx="15"
          fill="none"
          stroke={f.color}
          strokeWidth={f.width}
        />
      )}
      {f.doubled && (
        <polygon points={OCT_INNER} fill="none" stroke={f.color} strokeWidth="1.6" opacity="0.6" />
      )}
      {studs.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.4" fill={f.studColor ?? f.color} />
      ))}
      {f.gem && <path d="M50 3 L56 10 L50 17 L44 10 Z" fill={f.gem} />}
    </svg>
  )
}

/** 테두리를 두른 엠블럼. 레벨이 오르면 테두리가 바뀐다. */
export function RankedEmblem({
  k,
  grade,
  size = 64,
}: {
  k: EmblemKey
  grade: number
  size?: number
}) {
  return (
    <div
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      role="img"
      aria-label={emblemName(k)}
    >
      <RankFrame grade={grade} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Emblem k={k} size={Math.round(size * 0.46)} />
      </div>
    </div>
  )
}

export function Emblem({ k, size = 34 }: { k: EmblemKey; size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label={emblemName(k)}>
      <Shape k={k} />
    </svg>
  )
}

/** 엠블럼을 담는 네모 판. 프로필 카드와 부모 목록에서 같은 모양으로 쓴다. */
export function EmblemTile({
  k,
  size = 56,
  onClick,
  selected,
}: {
  k: EmblemKey
  size?: number
  onClick?: () => void
  selected?: boolean
}) {
  const inner = <Emblem k={k} size={Math.round(size * 0.6)} />
  const style = {
    width: size,
    height: size,
    borderRadius: 12,
    background: 'var(--surface-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: selected ? `2px solid ${COLORS[k]}` : '1px solid var(--border)',
    padding: 0,
  } as const

  if (!onClick) return <div style={style}>{inner}</div>
  return (
    <button type="button" style={style} onClick={onClick} aria-label={emblemName(k)}>
      {inner}
    </button>
  )
}
