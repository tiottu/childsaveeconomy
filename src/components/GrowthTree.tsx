/**
 * 칭찬도장 나무.
 *
 * 도장을 모을수록 씨앗이 싹이 되고, 나무가 되고, 열매를 맺는다.
 * "3 / 5" 라는 숫자보다 그림 한 장이 아이에게 훨씬 빨리 읽힌다.
 *
 * 그림은 여섯 단계로 끊는다. 도장 목표가 5개든 10개든 같은 그림을 써야 하니
 * 도장 수를 그대로 단계로 쓸 수 없고, 목표에 대한 비율로 단계를 정한다.
 * 그래서 도장 1개만 받아도 씨앗에서 싹으로는 꼭 넘어간다 — 처음 한 개가
 * 아무 변화도 못 만들면 모을 마음이 안 생긴다.
 *
 * 그림은 inline SVG 다. 이미지 파일을 쓰면 색이 앱 테마와 따로 놀고,
 * 이모지를 쓰면 기기마다 다른 그림이 나온다.
 */

export const TREE_STAGES = [
  { name: '씨앗', hint: '씨앗을 심었어요' },
  { name: '싹', hint: '싹이 돋았어요' },
  { name: '잎', hint: '잎이 자랐어요' },
  { name: '어린 나무', hint: '나무가 되었어요' },
  { name: '큰 나무', hint: '키가 훌쩍 자랐어요' },
  { name: '열매', hint: '열매를 맺었어요' },
] as const

/** 도장 수를 0~5 단계로 옮긴다. 목표를 채우면 5단계(열매)다. */
export function treeStage(count: number, goal: number): number {
  if (count <= 0) return 0
  if (goal <= 0 || count >= goal) return 5
  // 첫 도장은 반드시 1단계 이상, 목표 전에는 4단계까지만.
  return Math.max(1, Math.min(4, Math.ceil((count / goal) * 5)))
}

const SOIL = 'var(--border-strong)'
const TRUNK = '#7a4f1d'
const LEAF = 'var(--success-fill)'
const LEAF_DARK = 'var(--success-text)'
const FRUIT = 'var(--danger-text)'

/** 줄기. 단계마다 조금씩 키가 자란다. */
function Trunk({ top, width }: { top: number; width: number }) {
  return (
    <path
      d={`M50 90 L50 ${top}`}
      stroke={TRUNK}
      strokeWidth={width}
      strokeLinecap="round"
      fill="none"
    />
  )
}

function Leaf({ x, y, r, rotate }: { x: number; y: number; r: number; rotate: number }) {
  return (
    <ellipse
      cx={x}
      cy={y}
      rx={r}
      ry={r * 0.55}
      fill={LEAF}
      transform={`rotate(${rotate} ${x} ${y})`}
    />
  )
}

export function GrowthTree({
  count,
  goal,
  size = 128,
}: {
  count: number
  goal: number
  size?: number
}) {
  const stage = treeStage(count, goal)
  const s = TREE_STAGES[stage]

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`${s.name} 단계 · ${s.hint}`}
      style={{ display: 'block', margin: '0 auto' }}
    >
      {/* 흙 */}
      <ellipse cx="50" cy="91" rx="30" ry="7" fill={SOIL} opacity="0.5" />
      <path d="M24 90 Q50 80 76 90 Z" fill={SOIL} />

      {stage === 0 && (
        <>
          <ellipse
            cx="50"
            cy="85"
            rx="5.5"
            ry="7"
            fill={TRUNK}
            transform="rotate(-18 50 85)"
          />
          <path d="M50 78 Q52 74 55 73" stroke={LEAF} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}

      {stage === 1 && (
        <>
          <Trunk top={72} width={3} />
          <Leaf x={42} y={74} r={8} rotate={-28} />
          <Leaf x={58} y={72} r={8} rotate={28} />
        </>
      )}

      {stage === 2 && (
        <>
          <Trunk top={58} width={3.5} />
          <Leaf x={39} y={66} r={10} rotate={-25} />
          <Leaf x={61} y={63} r={10} rotate={25} />
          <Leaf x={50} y={55} r={9} rotate={-70} />
        </>
      )}

      {stage === 3 && (
        <>
          <Trunk top={52} width={4.5} />
          <path d="M50 64 L38 56" stroke={TRUNK} strokeWidth="3" strokeLinecap="round" />
          <path d="M50 60 L62 53" stroke={TRUNK} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="44" r="12" fill={LEAF} />
          <circle cx="38" cy="51" r="9.5" fill={LEAF_DARK} opacity="0.85" />
          <circle cx="63" cy="50" r="9.5" fill={LEAF_DARK} opacity="0.85" />
        </>
      )}

      {stage >= 4 && (
        <>
          <Trunk top={50} width={6} />
          <path d="M50 62 L35 52" stroke={TRUNK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M50 58 L65 48" stroke={TRUNK} strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="50" cy="36" r="16" fill={LEAF} />
          <circle cx="33" cy="47" r="12" fill={LEAF} />
          <circle cx="67" cy="46" r="12" fill={LEAF} />
          <circle cx="42" cy="50" r="10" fill={LEAF_DARK} opacity="0.7" />
          <circle cx="59" cy="50" r="10" fill={LEAF_DARK} opacity="0.7" />
        </>
      )}

      {stage === 5 && (
        <>
          <circle cx="41" cy="36" r="4" fill={FRUIT} />
          <circle cx="58" cy="33" r="4" fill={FRUIT} />
          <circle cx="50" cy="47" r="4" fill={FRUIT} />
          <circle cx="31" cy="48" r="3.5" fill={FRUIT} />
          <circle cx="68" cy="47" r="3.5" fill={FRUIT} />
        </>
      )}
    </svg>
  )
}

/** 단계 표시줄. 지금 몇 단계인지, 다음이 무엇인지 한 줄로 적는다. */
export function GrowthCaption({ count, goal }: { count: number; goal: number }) {
  const stage = treeStage(count, goal)
  const next = stage < 5 ? TREE_STAGES[stage + 1] : null
  return (
    <div className="grow-caption">
      <span className="grow-stage">
        {stage + 1}단계 · {TREE_STAGES[stage].name}
      </span>
      <span className="label muted">
        {next ? `다음은 ${next.name}` : TREE_STAGES[5].hint}
      </span>
    </div>
  )
}
