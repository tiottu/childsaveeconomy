import { useEffect, useState } from 'react'
import { Screen, TabBar, type Tab } from './components/ui'
import { CashDetail } from './screens/CashDetail'
import { CashEntry } from './screens/CashEntry'
import { ChildSetup } from './screens/ChildSetup'
import { FamilyJoin } from './screens/FamilyJoin'
import { ParentGoals, KidGoals } from './screens/Goals'
import { InvestList, TickerDetail } from './screens/Invest'
import { KidHome, KidInvest, KidProfile } from './screens/Kid'
import { Login, PinGate } from './screens/Login'
import { ParentHome } from './screens/ParentHome'
import { Settings } from './screens/Settings'
import { TradeEntry } from './screens/TradeEntry'
import { TxnEdit } from './screens/TxnEdit'
import { useBackButton } from './lib/backButton'
import { PARENT_KEY, useSession } from './state/session'
import { useData, useStore } from './state/store'

const PARENT_TABS: Tab[] = [
  { key: 'home', label: '홈', glyph: '◆' },
  { key: 'cash', label: '통장', glyph: '▤' },
  { key: 'invest', label: '투자', glyph: '↗' },
  { key: 'goals', label: '목표', glyph: '◎' },
  { key: 'settings', label: '설정', glyph: '⚙' },
]

const KID_TABS: Tab[] = [
  { key: 'home', label: '내 통장', glyph: '◆' },
  { key: 'invest', label: '내 투자', glyph: '↗' },
  { key: 'goals', label: '내 목표', glyph: '◎' },
  { key: 'profile', label: '내 정보', glyph: '☺' },
]

type Route =
  | { t: 'home' }
  | { t: 'addChild' }
  | { t: 'cash'; childId: string }
  | { t: 'cashEntry'; childId?: string }
  | { t: 'txnEdit'; childId: string; txnId: string }
  | { t: 'invest'; childId: string }
  | { t: 'ticker'; childId: string; ticker: string }
  | { t: 'tradeEntry'; childId?: string; ticker?: string }
  | { t: 'goals' }
  | { t: 'settings' }

function tabOf(route: Route): string {
  switch (route.t) {
    case 'cash':
    case 'cashEntry':
    case 'txnEdit':
      return 'cash'
    case 'invest':
    case 'ticker':
    case 'tradeEntry':
      return 'invest'
    case 'goals':
      return 'goals'
    case 'settings':
      return 'settings'
    default:
      return 'home'
  }
}

/** 이 화면에서 뒤로 가면 어디로 가나. 핸드폰 뒤로 버튼과 ‹ 버튼이 같은 길을 쓴다. */
function parentBack(route: Route): Route {
  switch (route.t) {
    case 'txnEdit':
      return { t: 'cash', childId: route.childId }
    case 'ticker':
      return { t: 'invest', childId: route.childId }
    case 'tradeEntry':
      return route.childId ? { t: 'invest', childId: route.childId } : { t: 'home' }
    default:
      return { t: 'home' }
  }
}

function ParentApp() {
  const { children, assets, positions, cash } = useData()
  const { membership, deviceRole } = useStore()
  const [route, setRoute] = useState<Route>({ t: 'home' })

  useBackButton(route.t !== 'home', () => setRoute(parentBack(route)))

  // 엄마 / 아빠는 권한이 같다. 어느 기기로 보고 있는지만 알려 준다.
  // 이메일을 가족이 공유하면 membership 에는 이름표가 없다. 기기 등록 쪽이 정답이다.
  const label = deviceRole?.kind === 'parent' ? deviceRole.label : membership?.label
  const badgeText = label ? `${label} 모드` : '부모 모드'

  const firstChild = children[0]?.id ?? ''

  function selectTab(key: string) {
    // 아이가 없으면 통장·투자 탭은 볼 게 없다. 등록 화면으로 보낸다.
    if ((key === 'cash' || key === 'invest') && !firstChild) {
      return setRoute({ t: 'addChild' })
    }
    switch (key) {
      case 'cash':
        return setRoute({ t: 'cash', childId: firstChild })
      case 'invest':
        return setRoute({ t: 'invest', childId: firstChild })
      case 'goals':
        return setRoute({ t: 'goals' })
      case 'settings':
        return setRoute({ t: 'settings' })
      default:
        return setRoute({ t: 'home' })
    }
  }

  const tabs = (
    <TabBar tabs={PARENT_TABS} active={tabOf(route)} onSelect={selectTab} />
  )
  const badge = <span className="chip gray">{badgeText}</span>

  switch (route.t) {
    case 'home':
      return (
        <Screen title="우리집 자산" right={badge} tabs={tabs}>
          <ParentHome
            onOpenChild={(childId) => setRoute({ t: 'cash', childId })}
            onCashEntry={() => setRoute({ t: 'cashEntry' })}
            onTradeEntry={() => setRoute({ t: 'tradeEntry' })}
            onAddChild={() => setRoute({ t: 'addChild' })}
          />
        </Screen>
      )

    case 'addChild':
      return (
        <Screen title="아이 추가" onBack={() => setRoute({ t: 'home' })}>
          <ChildSetup
            variant="parent"
            onCreated={() => setRoute({ t: 'home' })}
            onCancel={() => setRoute({ t: 'home' })}
          />
        </Screen>
      )

    case 'cash': {
      const name = assets.find((a) => a.child_id === route.childId)?.name ?? '통장'
      return (
        <Screen
          title={`${name} 통장`}
          onBack={() => setRoute({ t: 'home' })}
          right={
            <button
              className="chip"
              style={{ border: 'none' }}
              onClick={() => setRoute({ t: 'cashEntry', childId: route.childId })}
            >
              + 기록
            </button>
          }
          tabs={tabs}
        >
          <CashDetail
            childId={route.childId}
            onEditTxn={(txnId) => setRoute({ t: 'txnEdit', childId: route.childId, txnId })}
            onSelectChild={(childId) => setRoute({ t: 'cash', childId })}
          />
        </Screen>
      )
    }

    case 'txnEdit': {
      const txn = (cash[route.childId] ?? []).find((t) => t.id === route.txnId)
      const name = assets.find((a) => a.child_id === route.childId)?.name ?? ''
      const back = () => setRoute({ t: 'cash', childId: route.childId })
      return (
        <Screen title="거래 고치기" onBack={back}>
          {txn ? (
            <TxnEdit txn={txn} childName={name} onDone={back} />
          ) : (
            <div className="empty">그 거래를 찾을 수 없습니다</div>
          )}
        </Screen>
      )
    }

    case 'cashEntry':
      return (
        <Screen title="입출금 기록" onBack={() => setRoute({ t: 'home' })}>
          <CashEntry
            initialChildId={route.childId}
            onDone={() => setRoute({ t: 'home' })}
          />
        </Screen>
      )

    case 'invest':
      return (
        <Screen title="투자 현황" right={badge} tabs={tabs}>
          <InvestList
            childId={route.childId}
            onSelectChild={(childId) => setRoute({ t: 'invest', childId })}
            onOpenTicker={(ticker) => setRoute({ t: 'ticker', childId: route.childId, ticker })}
            onTradeEntry={() => setRoute({ t: 'tradeEntry', childId: route.childId })}
          />
        </Screen>
      )

    case 'ticker': {
      const name =
        (positions[route.childId] ?? []).find((p) => p.ticker === route.ticker)?.name ??
        route.ticker
      return (
        <Screen
          title={name}
          onBack={() => setRoute({ t: 'invest', childId: route.childId })}
          right={<span className="label muted">{route.ticker}</span>}
          tabs={tabs}
        >
          <TickerDetail
            childId={route.childId}
            ticker={route.ticker}
            onTrade={() =>
              setRoute({ t: 'tradeEntry', childId: route.childId, ticker: route.ticker })
            }
            onGone={() => setRoute({ t: 'invest', childId: route.childId })}
          />
        </Screen>
      )
    }

    case 'tradeEntry':
      return (
        <Screen
          title="주식투자 기록"
          onBack={() =>
            setRoute(
              route.childId
                ? { t: 'invest', childId: route.childId }
                : { t: 'home' },
            )
          }
        >
          <TradeEntry
            initialChildId={route.childId}
            initialTicker={route.ticker}
            onDone={() =>
              setRoute(
                route.childId
                  ? { t: 'invest', childId: route.childId }
                  : { t: 'home' },
              )
            }
          />
        </Screen>
      )

    case 'goals':
      return (
        <Screen title="저축 목표" right={badge} tabs={tabs}>
          <ParentGoals />
        </Screen>
      )

    case 'settings':
      return (
        <Screen title="설정" right={badge} tabs={tabs}>
          <Settings />
        </Screen>
      )
  }
}

function KidApp({ childId }: { childId: string }) {
  const { children } = useData()
  const [tab, setTab] = useState('home')

  useBackButton(tab !== 'home', () => setTab('home'))
  const child = children.find((c) => c.id === childId)
  const name = child?.name ?? '내'

  const tabs = <TabBar tabs={KID_TABS} active={tab} onSelect={setTab} />
  const badge = <span className="chip">{name} 모드</span>

  if (tab === 'invest') {
    return (
      <Screen title="내 투자" right={badge} tabs={tabs}>
        <KidInvest childId={childId} />
      </Screen>
    )
  }
  if (tab === 'goals') {
    return (
      <Screen title="내 목표" right={badge} tabs={tabs}>
        <KidGoals childId={childId} />
      </Screen>
    )
  }
  if (tab === 'profile') {
    return (
      <Screen title="내 정보" right={badge} tabs={tabs}>
        <KidProfile childId={childId} />
      </Screen>
    )
  }
  return (
    <Screen title={`${name}의 통장`} right={badge} tabs={tabs}>
      <KidHome childId={childId} />
    </Screen>
  )
}

export default function App() {
  const { mode, unlocked, signOut, isDefaultPin, modeIsFixed } = useSession()
  const { loading, error, data, needsJoin, membership, deviceRole } = useStore()
  const { children } = useData()

  // 저장된 모드가 가리키는 아이가 사라졌으면 로그인으로 되돌린다.
  // 클라우드 모드는 기기 등록이 모드를 정하므로 건드리지 않는다.
  useEffect(() => {
    if (modeIsFixed || !data || mode?.kind !== 'child') return
    if (!children.some((c) => c.id === mode.childId)) void signOut()
  }, [data, mode, children, signOut, modeIsFixed])

  if (error) {
    return (
      <div className="login">
        <div className="error">{error}</div>
        <button className="btn" onClick={() => location.reload()}>
          다시 시도
        </button>
      </div>
    )
  }

  // 클라우드 모드인데 이 기기가 아직 가족에 붙지 않았다
  if (needsJoin) return <FamilyJoin />

  if (loading && !data) {
    return (
      <div className="login">
        <div className="empty">불러오는 중…</div>
      </div>
    )
  }

  if (!mode) return <Login />

  if (!unlocked) {
    if (mode.kind === 'parent') {
      return (
        <PinGate
          who={
            (deviceRole?.kind === 'parent' ? deviceRole.label : membership?.label) ?? '부모'
          }
          hint="아이가 금액을 고치지 못하게 잠금"
          showDefaultNotice={isDefaultPin(PARENT_KEY)}
        />
      )
    }
    const name = children.find((c) => c.id === mode.childId)?.name ?? '내'
    return (
      <PinGate
        who={name}
        hint="내 통장을 나만 볼 수 있게 잠금"
        showDefaultNotice={false}
      />
    )
  }

  if (mode.kind === 'parent') return <ParentApp />
  return <KidApp childId={mode.childId} />
}
