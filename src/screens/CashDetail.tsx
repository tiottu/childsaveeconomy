import { AssetChart } from '../components/AssetChart'
import { Toggle } from '../components/ui'
import { monthlyChange } from '../lib/compute'
import { monthlyHistory } from '../lib/history'
import { dayLabel, money, signed } from '../lib/format'
import { useData } from '../state/store'
import type { CashTxn } from '../lib/types'

/** 같은 날짜끼리 묶는다 */
function groupByDay(txns: CashTxn[]): [string, CashTxn[]][] {
  const map = new Map<string, CashTxn[]>()
  for (const t of txns) {
    const list = map.get(t.occurred_on)
    if (list) list.push(t)
    else map.set(t.occurred_on, [t])
  }
  return [...map.entries()]
}

export function CashDetail({
  childId,
  onEditTxn,
  onSelectChild,
}: {
  childId: string
  /** 부모 모드에서만 넘어온다. 아이 화면에서는 수정할 수 없다. */
  onEditTxn?: (txnId: string) => void
  /** 부모 모드에서만 넘어온다. 아이를 바꿔 가며 보기 위한 것이다. */
  onSelectChild?: (childId: string) => void
}) {
  const { assets, cash, children, trades } = useData()
  const asset = assets.find((a) => a.child_id === childId)
  const child = children.find((c) => c.id === childId)
  const txns = cash[childId] ?? []
  const history = monthlyHistory(txns, trades[childId] ?? [])
  const month = monthlyChange(txns)
  const interest = txns
    .filter((t) => t.category === '이자')
    .reduce((s, t) => s + t.amount, 0)

  if (!asset || !child) return <div className="empty">아이 정보를 찾을 수 없습니다</div>

  return (
    <>
      {onSelectChild && children.length > 1 && (
        <Toggle
          options={children.map((c) => ({ key: c.id, label: c.name }))}
          value={childId}
          onChange={onSelectChild}
        />
      )}

      <div className="card" style={{ textAlign: 'center' }}>
        <div className="label">현금 잔액</div>
        <div className="big">{money(asset.cash)}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 8 }}>
          <span className="chip">이번달 {signed(month)}</span>
          {interest > 0 && <span className="chip amber">이자 {signed(interest)}</span>}
        </div>
      </div>

      {history.length >= 2 && (
        <div className="card">
          <div className="row">
            <span className="label">모은 돈 추이</span>
            <span className="label muted">최근 {history.length}개월</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <AssetChart points={history} />
          </div>
          <div className="label muted" style={{ marginTop: 6 }}>
            넣은 돈에서 쓴 돈을 뺀 값입니다. 주식값 등락은 빠져 있어요.
          </div>
        </div>
      )}

      <div className="section-title">거래 내역</div>

      {txns.length === 0 && <div className="empty">아직 거래가 없습니다</div>}

      {groupByDay(txns).map(([day, list]) => (
        <div key={day}>
          <div className="label muted" style={{ marginBottom: 2 }}>
            {dayLabel(day)}
          </div>
          <div className="card">
            {list.map((t) => {
              const row = (
                <>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.memo || t.category || (t.direction === 'in' ? '입금' : '출금')}
                    </div>
                    <div className="label">
                      {t.category}
                      {t.trade_id && ' · 주식투자 연동'}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <span className={t.direction === 'in' ? 'up' : 'down'}>
                      {t.direction === 'in' ? signed(t.amount) : signed(-t.amount)}
                    </span>
                    {onEditTxn && <span className="muted">›</span>}
                  </div>
                </>
              )

              // 부모만 고칠 수 있다. 아이 화면에서는 누를 수 없는 줄로 둔다.
              return onEditTxn ? (
                <button
                  key={t.id}
                  className="list-item"
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'left',
                    padding: '10px 0',
                  }}
                  onClick={() => onEditTxn(t.id)}
                >
                  {row}
                </button>
              ) : (
                <div key={t.id} className="list-item">
                  {row}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}
