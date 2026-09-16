import { AssetChart } from '../components/AssetChart'
import { EMBLEMS, EmblemTile, emblemOf, type EmblemKey } from '../components/Emblem'
import { ProgressBar, TickerBadge, colorOf } from '../components/ui'
import { monthlyChange } from '../lib/compute'
import { monthlyHistory } from '../lib/history'
import { badgesOf, levelOf, savingStreak, type Level } from '../lib/profile'
import type { Child } from '../lib/types'
import {
  ageFrom,
  asOfLabel,
  dayLabel,
  daysUntilPayday,
  money,
  pct,
  qty,
  signed,
  weekdayName,
} from '../lib/format'
import { useState } from 'react'
import { useSession } from '../state/session'
import { useData, useStore } from '../state/store'

/** 종목을 아이 말로 한 줄 설명. 모르는 종목은 설명을 생략한다. */
const EXPLAIN: Record<string, string> = {
  '005930.KS': '휴대폰과 반도체를 만드는 회사',
  '360750.KS': '미국의 큰 회사 500곳 묶음',
  '379800.KS': '미국의 큰 회사 500곳 묶음',
  '069500.KS': '한국의 큰 회사 200곳 묶음',
}

/** 이름·레벨·칭호·경험치. 아이 화면 맨 위에 항상 같은 모양으로 둔다. */
function ProfileCard({ child, level }: { child: Child; level: Level }) {
  const k = emblemOf(child)
  return (
    <div className="profile">
      <div className="profile-top">
        <EmblemTile k={k} size={56} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 6, justifyContent: 'flex-start' }}>
            <span className="profile-name">{child.name}</span>
            <span className="chip">Lv.{level.level}</span>
          </div>
          <div className="label">{level.title}</div>
        </div>
      </div>
      <div className="profile-xp">
        <div className="row label">
          <span>다음 레벨까지</span>
          <span>도장 {level.toNext}개</span>
        </div>
        <ProgressBar pct={level.pct} color="var(--accent-fill)" />
      </div>
    </div>
  )
}

export function KidHome({ childId }: { childId: string }) {
  const { children, assets, cash, trades, stamps, rewards, goals } = useData()
  const child = children.find((c) => c.id === childId)
  const asset = assets.find((a) => a.child_id === childId)
  const txns = cash[childId] ?? []
  const myTrades = trades[childId] ?? []
  const history = monthlyHistory(txns, myTrades)

  if (!child || !asset) return <div className="empty">정보를 찾을 수 없어요</div>

  const month = monthlyChange(txns)
  const days = daysUntilPayday(child.payday)
  const myStamps = stamps.filter((s) => s.child_id === childId)
  const lv = levelOf(myStamps)
  const streak = savingStreak(txns)
  const badges = badgesOf({
    asset,
    cash: txns,
    trades: myTrades,
    stamps: myStamps,
    rewards: rewards.filter((r) => r.child_id === childId),
    goals: goals.filter((g) => g.child_id === childId),
    streak,
  })
  const earned = badges.filter((b) => b.earned).length

  return (
    <>
      <ProfileCard child={child} level={lv} />

      <div className="stat-grid">
        <div className="stat">
          <div className="label">내 전체 재산</div>
          <div className="stat-value">{money(asset.total)}</div>
        </div>
        <div className="stat">
          <div className="label">이번달 모은 돈</div>
          <div className={`stat-value ${month >= 0 ? 'up' : 'down'}`}>{signed(month)}</div>
        </div>
        <div className="stat">
          <div className="label">연속 저축</div>
          <div className="stat-value">{streak}주</div>
        </div>
        <div className="stat">
          <div className="label">모은 도장</div>
          <div className="stat-value">{lv.xp}</div>
        </div>
      </div>

      <div className="card row">
        <div>
          <div>다음 용돈까지</div>
          <div className="label">매주 {weekdayName(child.payday)}요일</div>
        </div>
        <div className="mid">{days}일</div>
      </div>

      <div className="section-title">
        업적 {earned} / {badges.length}
      </div>
      <div className="badge-grid">
        {/*
          잠긴 업적에는 설명을 붙이지 않는다. 좁은 화면에서 두세 줄로 접히면서 칸 높이가
          들쭉날쭉해지고, 무엇보다 이름만으로 이미 무엇을 해야 하는지 알 수 있다
          ("50만 돌파", "4주 연속"). 채운 별과 빈 별로 상태를 구분한다.
        */}
        {badges.map((b) => (
          <div key={b.key} className={b.earned ? 'badge' : 'badge locked'}>
            <div className="badge-mark">{b.earned ? '★' : '☆'}</div>
            <div className="badge-label">{b.label}</div>
          </div>
        ))}
      </div>

      {history.length >= 2 && (
        <div className="card">
          <div className="label">내 돈이 늘어난 모습</div>
          <div style={{ marginTop: 8 }}>
            <AssetChart points={history} />
          </div>
        </div>
      )}

      <div className="section-title">내 거래 내역</div>

      {txns.length === 0 && <div className="empty">아직 거래가 없어요</div>}

      {txns.length > 0 && (
        <div className="card">
          {txns.slice(0, 20).map((t) => (
            <div key={t.id} className="list-item">
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.memo || t.category}
                </div>
                <div className="label">
                  {dayLabel(t.occurred_on)}
                  {t.category && ` · ${t.category}`}
                </div>
              </div>
              <div className={t.direction === 'in' ? 'up' : 'down'}>
                {t.direction === 'in' ? signed(t.amount) : signed(-t.amount)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="spacer" />
      <div className="notice">기록은 부모님만 추가할 수 있어요</div>
    </>
  )
}

export function KidInvest({ childId }: { childId: string }) {
  const { positions, children } = useData()
  const rows = positions[childId] ?? []
  const color = colorOf(children.findIndex((c) => c.id === childId))

  const value = rows.reduce((s, p) => s + p.value, 0)
  const cost = rows.reduce((s, p) => s + p.cost, 0)
  const pnl = value - cost
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
  const newest = rows.reduce<string | null>(
    (acc, p) => (acc === null || p.asOf > acc ? p.asOf : acc),
    null,
  )

  if (rows.length === 0) {
    return (
      <>
        <div className="empty">아직 가진 주식이 없어요</div>
        <div className="notice">주식은 부모님과 함께 정해요</div>
      </>
    )
  }

  return (
    <>
      <div
        className="card"
        style={{
          textAlign: 'center',
          background: pnl >= 0 ? 'var(--success-bg)' : 'var(--danger-bg)',
          borderColor: 'transparent',
        }}
      >
        <div
          className="label"
          style={{ color: pnl >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}
        >
          내 주식이 지금
        </div>
        <div
          className="big"
          style={{ color: pnl >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}
        >
          {money(value)}
        </div>
        <div
          className="label"
          style={{ color: pnl >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}
        >
          {pnl >= 0
            ? `${money(pnl)} 늘었어요 (${pct(pnlPct)})`
            : `${money(Math.abs(pnl))} 줄었어요 (${pct(pnlPct)})`}
        </div>
        {newest && (
          <div className="label" style={{ color: color.fg, marginTop: 3 }}>
            {asOfLabel(newest)}
          </div>
        )}
      </div>

      <div className="section-title">내가 가진 회사</div>

      {rows.map((p, i) => {
        const c = colorOf(i)
        return (
          <div key={p.ticker} className="card">
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
                  <div className="label">{qty(p.quantity)}주</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>{money(p.value)}</div>
                <div className={`label ${p.pnl >= 0 ? 'up' : 'down'}`}>{signed(p.pnl)}</div>
              </div>
            </div>
            <div style={{ margin: '9px 0 5px' }}>
              <ProgressBar pct={p.weight} color={c.fill} />
            </div>
            {EXPLAIN[p.ticker] && <div className="label muted">{EXPLAIN[p.ticker]}</div>}
          </div>
        )
      })}

      <div className="spacer" />
      <div className="notice">
        주식은 값이 오르고 내려요.
        <br />
        사고 파는 건 부모님과 함께 정해요
      </div>
    </>
  )
}

export function KidProfile({ childId }: { childId: string }) {
  const { children, assets, settings, goals, stamps } = useData()
  const { db, reload } = useStore()
  const { signOut, modeIsFixed } = useSession()
  const [saving, setSaving] = useState(false)

  const child = children.find((c) => c.id === childId)
  const asset = assets.find((a) => a.child_id === childId)
  const achieved = goals.filter((g) => g.child_id === childId && g.status === 'achieved').length

  if (!child || !asset) return <div className="empty">정보를 찾을 수 없어요</div>

  const current = emblemOf(child)
  const lv = levelOf(stamps.filter((s) => s.child_id === childId))

  const [emblemError, setEmblemError] = useState<string | null>(null)

  async function pickEmblem(k: EmblemKey) {
    if (!db || saving || k === child!.emblem) return
    setSaving(true)
    setEmblemError(null)
    try {
      await db.setEmblem(childId, k)
      await reload()
    } catch (e) {
      setEmblemError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ProfileCard child={child} level={lv} />

      <div className="section-title">엠블럼 고르기</div>
      <div className="emblem-grid">
        {EMBLEMS.map((e) => (
          <div key={e.key} style={{ textAlign: 'center' }}>
            <EmblemTile
              k={e.key}
              size={60}
              selected={e.key === current}
              onClick={() => void pickEmblem(e.key)}
            />
            <div className="label" style={{ marginTop: 2 }}>
              {e.name}
            </div>
          </div>
        ))}
      </div>
      {emblemError && <div className="error">{emblemError}</div>}
      <div className="label muted">누르면 바로 바뀌어요. 부모님 화면에도 이 엠블럼이 보여요.</div>

      <div className="card">
        <div className="list-item">
          <span>나이</span>
          <span className="label">
            {child.birth_year ? `${ageFrom(child.birth_year)} · ${child.birth_year}년생` : '모름'}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="list-item">
          <span>주간 용돈</span>
          <span className="label">{money(child.weekly_allowance)}</span>
        </div>
        <div className="list-item">
          <span>받는 날</span>
          <span className="label">매주 {weekdayName(child.payday)}요일</span>
        </div>
        <div className="list-item">
          <span>현금 이자율</span>
          <span className="label">연 {settings.interest_rate}%</span>
        </div>
      </div>

      <div className="label muted">금액과 규칙은 부모님만 바꿀 수 있어요</div>

      <div className="section-title">기록</div>
      <div className="card">
        <div className="list-item">
          <span>전체 재산</span>
          <span className="label">{money(asset.total)}</span>
        </div>
        <div className="list-item">
          <span>주식으로 번 돈</span>
          <span className={`label ${asset.pnl >= 0 ? 'up' : 'down'}`}>{signed(asset.pnl)}</span>
        </div>
        <div className="list-item">
          <span>달성한 목표</span>
          <span className="label">{achieved}개</span>
        </div>
      </div>

      <div className="spacer" />

      <button className="btn" onClick={() => void signOut()}>
        {modeIsFixed ? '이 핸드폰 연결 해제' : '모드 바꾸기'}
      </button>

      {/*
        개발 중에는 한 브라우저로 부모와 아이를 번갈아 봐야 한다. 그런데 아이로 등록된
        기기는 아이 화면만 열리고, 부모로 돌아가려면 위 "연결 해제" 가 유일한 길인데
        이름만 봐서는 부모로 다시 들어갈 수 있다는 걸 알 수 없다. 그 길을 이름으로 적어 둔다.

        하는 일은 위 버튼과 똑같다 — 권한을 건너뛰지 않는다. 해제 후 가입 화면에서
        부모로 들어가려면 여전히 이메일 인증이나 가족 코드 + 부모 PIN 이 필요하다.
        배포본에는 이 버튼이 아예 없다.
      */}
      {import.meta.env.DEV && (
        <>
          <button className="btn dashed" onClick={() => void signOut()}>
            테스트용 · 부모로 바꾸기
          </button>
          <div className="label muted" style={{ textAlign: 'center' }}>
            이 기기 등록을 풀고 가입 화면으로 갑니다. 거기서 "이메일 없이 부모로
            들어가기" 를 고르면 됩니다. 개발 서버에서만 보입니다.
          </div>
        </>
      )}
    </>
  )
}
