import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { InputNumber, Modal, message } from 'antd'
import dayjs from 'dayjs'
import {
  Mod, Icon, CatIcon, HeroAmount, Ro, MonthSwitch, cssVar,
  F, p2, kf, dateLabel, weekday, monthEn, daysInMonth, todayStr,
} from '../components/ui'
import { useApp } from '../components/appCtx'
import type { MonthlyStat, RecordItem, TodoItem, RecurringBill } from '../types/electron'

const A0 = 135
const SW = 270
const ang = (f: number): number => A0 + SW * Math.max(0, Math.min(1, f))
const pt = (r: number, a: number): string => {
  const t = (a * Math.PI) / 180
  return `${(150 + r * Math.cos(t)).toFixed(1)} ${(150 + r * Math.sin(t)).toFixed(1)}`
}
const arc = (r: number, f0: number, f1: number): string =>
  `M${pt(r, ang(f0))}A${r} ${r} 0 ${SW * (f1 - f0) > 180 ? 1 : 0} 1 ${pt(r, ang(f1))}`

interface Bud {
  budget: number
  spent: number
  ratio: number
  remain: number
  n: number
  cur: boolean
  day: number
  pace: number
  exp: number
  ahead: number
  st: 'ok' | 'warn' | 'over'
  daysLeft: number
  perDay: number
}

function computeBud(ym: string, budget: number, spent: number): Bud {
  const n = daysInMonth(ym)
  const cur = ym === todayStr().slice(0, 7)
  const day = cur ? dayjs().date() : n
  const pace = day / n
  const exp = Math.round(budget * pace * 100) / 100
  const ahead = Math.round((spent - exp) * 100) / 100
  const ratio = budget > 0 ? spent / budget : 0
  const st: Bud['st'] = ratio > 1 ? 'over' : ahead > budget * 0.05 ? 'warn' : 'ok'
  const daysLeft = Math.max(0, n - day)
  const remain = budget - spent
  return {
    budget, spent, ratio, remain, n, cur, day, pace, exp, ahead, st,
    daysLeft,
    perDay: daysLeft > 0 ? Math.max(0, remain) / daysLeft : 0,
  }
}

function Dial({ b }: { b: Bud }): JSX.Element {
  const ticks: JSX.Element[] = []
  for (let d = 0; d <= b.n; d++) {
    const a = ang(d / b.n)
    const mj = d % 5 === 0 || d === b.n
    ticks.push(
      <path
        key={d}
        className={`tk${d <= b.day ? ' el' : ''}${mj ? ' mj' : ''}`}
        d={`M${pt(mj ? 118 : 123, a)}L${pt(131, a)}`}
      />,
    )
  }
  const fv = Math.min(b.ratio, 1)
  const lbl = (t: string, f: number): JSX.Element => {
    const [x, y] = pt(94, ang(f)).split(' ')
    return (
      <text key={t} className="lbl" x={x} y={y} textAnchor="middle" dominantBaseline="middle">
        {t}
      </text>
    )
  }
  return (
    <svg className={`dial ${b.st}`} viewBox="0 0 300 300" aria-hidden="true">
      {ticks}
      <path className="trk" d={arc(108, 0, 1)} />
      {b.st !== 'ok' && fv > b.pace ? <path className="zone" d={arc(108, b.pace, fv)} /> : null}
      {fv > 0.003 ? <path className="val" d={arc(108, 0, fv)} /> : null}
      <path className="bug" d={`M${pt(136, ang(b.pace))}L${pt(146, ang(b.pace) - 2.6)}L${pt(146, ang(b.pace) + 2.6)}Z`} />
      {lbl('0', 0)}
      {lbl(kf(b.budget / 2), 0.5)}
      {lbl(kf(b.budget), 1)}
    </svg>
  )
}

function RecordRow({ r }: { r: RecordItem }): JSX.Element {
  const inc = r.type === 'income'
  return (
    <div className="row">
      <div className="rw">
        <span className="pict">
          <CatIcon k={r.category_key} />
        </span>
        <span className="tx">
          <b>{r.subcategory_name}</b>
          <i>{r.note || r.category_name}</i>
        </span>
        <span className={`who${r.person === '阿念' ? ' n' : ''}`}>{r.person || '我'}</span>
        <span className="tm">{(r.created_at || '').slice(11, 16)}</span>
        <span className="ph" title={r.note || undefined} />
        <span className={`amt${inc ? ' in' : ''}`}>
          {inc ? '+' : '−'}
          {F(r.amount)}
        </span>
      </div>
    </div>
  )
}

function HomePage(): JSX.Element {
  const navigate = useNavigate()
  const app = useApp()
  const currentMonth = dayjs().format('YYYY-MM')
  const [ym, setYm] = useState(currentMonth)
  const [expense, setExpense] = useState(0)
  const [income, setIncome] = useState(0)
  const [prevExpense, setPrevExpense] = useState(0)
  const [count, setCount] = useState(0)
  const [stats, setStats] = useState<MonthlyStat[]>([])
  const [records, setRecords] = useState<RecordItem[]>([])
  const [budget, setBudget] = useState<number | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [budgetInput, setBudgetInput] = useState<number | null>(null)

  useEffect(() => {
    loadBudget()
    loadBills()
    loadTodos()
  }, [])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym])

  async function loadData(): Promise<void> {
    const prev = dayjs(ym + '-01').subtract(1, 'month').format('YYYY-MM')
    const [exp, inc, prevExp, list, st] = await Promise.all([
      window.electronAPI.getMonthlyTotal(ym, 'expense'),
      window.electronAPI.getMonthlyTotal(ym, 'income'),
      window.electronAPI.getMonthlyTotal(prev, 'expense'),
      window.electronAPI.getRecordList({ page: 1, pageSize: 200, month: ym }),
      window.electronAPI.getMonthlyStats(ym, 'expense'),
    ])
    setExpense(exp)
    setIncome(inc)
    setPrevExpense(prevExp)
    setRecords(list.rows)
    setCount(list.total)
    setStats(st)
  }

  async function loadBudget(): Promise<void> {
    const val = await window.electronAPI.getSetting('monthly_budget')
    if (val) {
      const n = parseFloat(val)
      if (Number.isFinite(n)) { setBudget(n); setBudgetInput(n) }
    }
  }

  async function loadTodos(): Promise<void> {
    try { setTodos(await window.electronAPI.getTodos()) } catch { /* 老库无表时忽略 */ }
  }

  async function loadBills(): Promise<void> {
    try { setBills(await window.electronAPI.getRecurringBills()) } catch { /* 同上 */ }
  }

  async function saveBudget(): Promise<void> {
    if (budgetInput && budgetInput > 0) {
      await window.electronAPI.setSetting('monthly_budget', String(budgetInput))
      setBudget(budgetInput)
      setBudgetModalOpen(false)
    }
  }

  async function completeTodo(t: TodoItem): Promise<void> {
    const res = await window.electronAPI.completeTodo(t.id)
    if (res.success) {
      message.success(res.recorded ? `已完成，自动记账 ¥${F(res.recorded.amount)}` : '已完成')
      loadTodos()
    } else {
      message.error(res.error || '操作失败')
    }
  }

  const bal = income - expense
  const bud = useMemo(
    () => (budget && budget > 0 ? computeBud(ym, budget, expense) : null),
    [budget, ym, expense],
  )

  const today = todayStr()
  const logList = useMemo(() => {
    if (ym !== currentMonth) return records.slice(0, 8)
    const t = records.filter((r) => r.record_date === today)
    const past = records.filter((r) => r.record_date < today).slice(0, 3)
    return [...t, ...past]
  }, [records, ym, currentMonth, today])

  const top3 = useMemo(() => stats.slice(0, 3), [stats])
  const maxShare = top3[0]?.total || 1

  const report = useMemo(() => {
    const out: string[] = []
    if (!expense) return ['这个月还没有记账。记下第一笔，仪表就开始转起来了。']
    const top = stats[0]
    out.push(`本月花了 ¥${F(expense)}${top ? `，其中「${top.category_name}」占 ${Math.round((top.total / expense) * 100)}%` : ''}。`)
    if (prevExpense > 0) {
      const d = expense - prevExpense
      out.push(`${d >= 0 ? '比上月多花' : '比上月少花'} ¥${F(Math.abs(d))}。`)
    }
    const big = records.reduce<RecordItem | null>((m, r) => (r.type === 'expense' && (!m || r.amount > m.amount) ? r : m), null)
    if (big) out.push(`最大的一笔是「${big.subcategory_name}」¥${F(big.amount)}。`)
    if (bud) {
      if (bud.cur && bud.st === 'warn') {
        out.push(`按线性节奏，到今天应花 ¥${F(bud.exp)}，目前超前 ¥${F(bud.ahead)}；剩下 ${bud.daysLeft} 天，每天控制在 ¥${F(bud.perDay)} 以内就不会超支。`)
      } else if (bud.cur) {
        out.push(`节奏平稳，剩下 ${bud.daysLeft} 天每天还能花 ¥${F(bud.perDay)}。`)
      } else if (bud.st === 'over') {
        out.push(`这个月超出预算 ¥${F(bud.spent - bud.budget)}。`)
      } else {
        out.push('本月已结算，未超预算。')
      }
    }
    return out
  }, [expense, prevExpense, stats, records, bud])

  const activeTodos = todos.filter((t) => t.is_active && !(t.cycle === 'once' && t.completed_dates.length > 0))
  const openTodos = activeTodos.length
  const doneTodos = todos.length - openTodos
  const dueTodos = activeTodos.slice().sort((a, b) => a.next_date.localeCompare(b.next_date)).slice(0, 4)

  const nextBills = bills.filter((b) => b.is_active && b.next_date >= today).sort((a, b) => a.next_date.localeCompare(b.next_date))
  const nextBill = nextBills[0]
  const daysTo = (d: string): number => Math.round((new Date(d).getTime() - new Date(today).getTime()) / 864e5)

  const cycleLabel: Record<string, string> = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年', once: '单次' }


  if (app.uiStyle === 'miniapp') {
    return (
      <div className="mini-home">
        <div className="mini-home-top">
          <b>计序</b>
          <MonthSwitch ym={ym} onChange={setYm} />
        </div>

        <section className="mini-hero">
          <span className="mini-hero-label">本月结余</span>
          <div className="mini-hero-value">
            {bal >= 0 ? '+' : '−'}¥{F(Math.abs(bal))}
          </div>
          <div className="mini-hero-row">
            <span>支出 <b className="mini-exp">¥{F(expense)}</b></span>
            <span>收入 <b className="mini-inc">¥{F(income)}</b></span>
          </div>
        </section>

        <button className="mini-card mini-savings" onClick={() => navigate('/savings')}>
          <span>
            <b>存钱罐</b>
            <i>独立小账本 · 不计入本月结余</i>
          </span>
          <span className="mini-arrow">›</span>
        </button>

        <section className="mini-card">
          <div className="mini-card-head">
            <span>本月预算</span>
            <b className={`mini-budget-pct ${bud ? (bud.ratio > 1 ? 'over' : bud.st === 'warn' ? 'warn' : 'ok') : ''}`}>
              {bud ? (bud.ratio > 1 ? '已超支' : `${Math.round(bud.ratio * 100)}%`) : '未设置'}
            </b>
          </div>
          {bud ? (
            <>
              <div className="mini-bar"><i className={bud.ratio > 1 ? 'over' : bud.st === 'warn' ? 'warn' : 'ok'} style={cssVar('--w', `${Math.min(bud.ratio, 1) * 100}%`)} /></div>
              <div className="mini-budget-foot"><span>已用 ¥{F(bud.spent)}</span><span>预算 ¥{F(bud.budget)}</span></div>
              <div className="mini-budget-left">
                <span><i>{bud.remain < 0 ? '已超支' : '剩余可花'}</i><b className={bud.remain < 0 ? 'over' : ''}>¥{F(Math.abs(bud.remain))}</b></span>
                <span><i>日均可花</i><b>¥{F(bud.perDay)}</b></span>
              </div>
            </>
          ) : (
            <p className="mini-muted">设一个月度预算，这里会显示剩余可花。</p>
          )}
          <button className="mini-link" onClick={() => { setBudgetInput(budget); setBudgetModalOpen(true) }}>
            {budget ? '调整预算' : '设置预算'} ›
          </button>
        </section>

        {top3.length > 0 && (
          <section className="mini-card">
            <div className="mini-card-head"><span>这个月钱花哪了</span><button className="mini-link" onClick={() => navigate('/stats')}>统计 ›</button></div>
            {top3.map((c, i) => (
              <div className="mini-top3" key={c.category_key}>
                <div><span>{c.category_name}</span><i>¥{F(c.total)} · {Math.round((c.total / expense) * 100)}%</i></div>
                <div className="mini-bar"><i className={`lv${i + 1}`} style={cssVar('--w', `${Math.max((c.total / maxShare) * 100, 3)}%`)} /></div>
              </div>
            ))}
          </section>
        )}

        <section className="mini-quick">
          {[
            ['记一笔', '/add'],
            ['待办', '/todos'],
            ['设预算', ''],
            ['分类', '/categories'],
            ['周期', '/recurring'],
            ['统计', '/stats'],
          ].map(([label, route]) => (
            <button
              key={label}
              className="mini-quick-item"
              onClick={() => route ? navigate(route) : (setBudgetInput(budget), setBudgetModalOpen(true))}
            >
              {label}
            </button>
          ))}
        </section>

        <section className="mini-card">
          <div className="mini-card-head"><span>最近记录</span><button className="mini-link" onClick={() => navigate('/history')}>全部 ›</button></div>
          {logList.length === 0 && <p className="mini-muted">暂无记录，去记一笔吧</p>}
          {logList.slice(0, 6).map((r) => (
            <RecordRow key={r.id} r={r} />
          ))}
        </section>

        <Modal
          title="设置月度支出预算"
          open={budgetModalOpen}
          onCancel={() => setBudgetModalOpen(false)}
          width={400}
          footer={[
            <button key="c" className="mini" style={{ marginRight: 8 }} onClick={() => setBudgetModalOpen(false)}>取消</button>,
            <button key="s" className="mini ac" onClick={saveBudget}>保存</button>,
          ]}
        >
          <p style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 14 }}>设置每月支出上限，超支时会收到提醒</p>
          <InputNumber prefix="¥" placeholder="例如：5000" style={{ width: '100%' }} size="large" value={budgetInput} onChange={(v) => setBudgetInput(v as number | null)} min={0} precision={2} />
        </Modal>
      </div>
    )
  }

  return (
    <div className="grid" style={{ rowGap: 'var(--gap)' }}>
      {/* M-01 本月支出 */}
      <Mod
        id="M-01"
        className="s-7 hero"
        title="本月支出"
        en="CH-01 · EXPENSE"
        right={
          <div className="ch">
            <MonthSwitch ym={ym} onChange={setYm} />
          </div>
        }
      >
        <HeroAmount v={expense} />
        <div className="ros">
          <Ro cn="收入" en="INCOME" v={income} cls="inc" />
          <Ro cn="结余" en="BALANCE" v={bal} cls={bal < 0 ? 'cor' : ''} />
          <div className="ro">
            <span className="lb">
              <b>笔数</b>ENTRIES
            </span>
            <span className="v num">
              {p2(count)}
              <small className="u">笔</small>
            </span>
          </div>
        </div>
        <div className="top3">
          <div className="t3h">
            <span className="lb">
              <b>支出前三</b>TOP 3
            </span>
          </div>
          {top3.length === 0 && <div className="empty-s">本月还没有支出</div>}
          {top3.map((c) => (
            <button
              key={c.category_key}
              className="t3"
              onClick={() => navigate('/stats')}
              title={`${c.category_name} ¥${F(c.total)}`}
            >
              <span className="pict">
                <CatIcon k={c.category_key} />
              </span>
              <span className="nm">{c.category_name}</span>
              <span className="br">
                <i style={cssVar('--s', (c.total / maxShare).toFixed(3))} />
              </span>
              <span className="a num">¥{F(c.total)}</span>
              <span className="p">{Math.round((c.total / expense) * 100)}%</span>
            </button>
          ))}
        </div>
      </Mod>

      {/* M-02 预算 */}
      <Mod
        id="M-02"
        className="s-5"
        title="预算"
        en={`BUDGET${budget ? ` · ¥${F(budget, 0)} / MO` : ' · 未设置'}`}
        right={
          <button className="lnk" onClick={() => { setBudgetInput(budget); setBudgetModalOpen(true) }}>
            {budget ? '调整' : '设置预算'}
            <Icon n="r" cls="s" />
          </button>
        }
      >
        {bud ? (
          <>
            <div className="dialw">
              <Dial b={bud} />
              <div className={`dialc${bud.remain < 0 ? ' over' : ''}`}>
                <span className="lb">
                  <b>{bud.remain < 0 ? '已超支' : '剩余可花'}</b>
                  {bud.remain < 0 ? 'OVER' : 'REMAIN'}
                </span>
                <span className="big num">
                  <small>¥</small>
                  {F(Math.abs(bud.remain))}
                </span>
                <span className="sub">
                  {bud.cur ? (
                    <>
                      日均可花 <b>¥{F(bud.perDay)}</b> · 余 {bud.daysLeft} 天
                    </>
                  ) : bud.remain < 0 ? (
                    '本月已结算 · 超出预算'
                  ) : (
                    '本月已结算 · 未超预算'
                  )}
                </span>
              </div>
            </div>
            <div className={`pace ${bud.st}`}>
              <i className={`led ${bud.st === 'ok' ? '' : bud.st === 'warn' ? 'amb' : 'cor'}`} />
              <span>
                {bud.st === 'over' ? <b>超出预算</b> : bud.st === 'warn' ? <>花费<b>超前节奏</b></> : <b>节奏正常</b>}
              </span>
              <span className="num">
                {bud.st === 'over'
                  ? `+¥${F(bud.spent - bud.budget)}`
                  : `${bud.ahead >= 0 ? '+' : '−'}¥${F(Math.abs(bud.ahead))}`}
              </span>
            </div>
            <div className="ros">
              <Ro cn="已花" en="SPENT" v={bud.spent} />
              <Ro cn="线性应花" en="PACE" v={bud.exp} />
              <div className="ro">
                <span className="lb">
                  <b>进度</b>DAY
                </span>
                <span className="v num">
                  {p2(bud.day)}
                  <small className="u">/{bud.n}</small>
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="nosig">
            <b>还没设置月度预算</b>
            <p>设置每月支出上限，仪表会按天数节奏提示你花得超前还是落后。</p>
            <button className="mini ac" onClick={() => setBudgetModalOpen(true)}>
              设置预算
            </button>
          </div>
        )}
      </Mod>

      {/* M-03 今天 */}
      <div className="col s-5">
        <Mod
          id="M-03"
          className="logm"
          title={ym === currentMonth ? '今天' : `${Number(ym.slice(5, 7))}月记录`}
          en={ym === currentMonth ? 'TODAY · LOG' : 'RECENT'}
          right={
            <button className="lnk" onClick={() => navigate('/history')}>
              全部账单
              <Icon n="r" cls="s" />
            </button>
          }
        >
          <div className="rows" style={{ marginTop: 2 }}>
            {logList.length === 0 && <div className="empty-s">这个月还没有记录</div>}
            {logList.map((r, i) => (
              <div key={r.id}>
                {ym === currentMonth && (i === 0 || logList[i - 1].record_date !== r.record_date) && (
                  <div className="dh">
                    <b>{dateLabel(r.record_date)}</b>
                    <span className="m">
                      {r.record_date.slice(5).replace('-', '.')} {weekday(r.record_date)}
                    </span>
                    <span className="sum">
                      {logList.filter((x) => x.record_date === r.record_date).length} 笔 · −
                      {F(logList.filter((x) => x.record_date === r.record_date && x.type === 'expense').reduce((s, x) => s + x.amount, 0))}
                    </span>
                  </div>
                )}
                <RecordRow r={r} />
              </div>
            ))}
          </div>
        </Mod>
      </div>

      {/* M-04 月度报告 + M-05 下一笔周期账单 */}
      <div className="col s-4">
        <Mod id="M-04" title="月度报告" en={`REPORT · ${monthEn(ym)}`}>
          <div className="rep">
            {report.map((s, i) => (
              <p key={i} data-n={p2(i + 1)}>
                {s}
              </p>
            ))}
          </div>
        </Mod>
        <Mod
          id="M-05"
          title="下一笔周期账单"
          en="NEXT BILL"
          right={
            <button className="lnk" onClick={() => navigate('/recurring')}>
              全部
              <Icon n="r" cls="s" />
            </button>
          }
        >
          {nextBill ? (
            <>
              <div className="bill">
                <div className="when">
                  <b>{Number(nextBill.next_date.slice(8))}</b>
                  <span>{monthEn(nextBill.next_date)}</span>
                </div>
                <div className="bi">
                  <b>{nextBill.note || nextBill.subcategory_name}</b>
                  <span>
                    {cycleLabel[nextBill.cycle] || nextBill.cycle} · {daysTo(nextBill.next_date)} 天后
                  </span>
                </div>
                <span className="num">¥{F(nextBill.amount)}</span>
              </div>
              <div className="nx">
                {nextBills.slice(1, 3).map((x) => (
                  <div key={x.id}>
                    <span>{x.note || x.subcategory_name}</span>
                    <span className="m">{dateLabel(x.next_date)}</span>
                    <span className="num">¥{F(x.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-s">没有待执行的周期账单</div>
          )}
        </Mod>
      </div>

      {/* M-06 待办 + M-07 云同步 */}
      <div className="col s-3">
        <Mod
          id="M-06"
          title="待办"
          en={`TODO · ${openTodos} OPEN`}
          right={
            <button className="lnk" onClick={() => navigate('/todos')}>
              {doneTodos} 已完成
              <Icon n="r" cls="s" />
            </button>
          }
        >
          {dueTodos.length === 0 && <div className="empty-s">没有进行中的待办</div>}
          {dueTodos.map((t) => {
            const overdue = t.next_date < today
            const isToday = t.next_date === today
            return (
              <div className="td" key={t.id}>
                <button className="cbtn" onClick={() => completeTodo(t)} role="checkbox" aria-checked={false} aria-label={`完成 ${t.title}`}>
                  <span className="chk">
                    <Icon n="ok" cls="s" />
                  </span>
                </button>
                <div className="tt">
                  <b>{t.title}</b>
                  <span>
                    {overdue ? (
                      <span className="tag cor">已逾期</span>
                    ) : isToday ? (
                      <span className="tag amb">今天{t.time ? ` ${t.time}` : ''}</span>
                    ) : (
                      <span className="tag">{dateLabel(t.next_date)}</span>
                    )}
                    {cycleLabel[t.cycle] || t.cycle}
                  </span>
                </div>
                <div className="r">
                  {t.amount > 0 && <span className="num">¥{F(t.amount)}</span>}
                  {t.amount > 0 && (
                    <button className="mini" onClick={() => completeTodo(t)}>
                      记账
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </Mod>
        <Mod id="M-07" className="syncm" title="云同步" en="UPLINK">
          <span className="lb">
            <b>微信身份</b>WECHAT ID
          </span>
          <div className="code-big">
            <span>{app.cloudEnabled ? '已连接' : '未连接'}</span>
          </div>
          <div className="st" data-sync={app.syncing ? 'busy' : 'idle'}>
            <i className={`led ${app.cloudEnabled ? '' : 'off'}`} />
            <span>
              {app.syncing ? '同步中' : app.cloudEnabled ? '已连接云端' : '未连接云端'}
            </span>
            <span className="scanbar">
              <i />
            </span>
          </div>
          <button className="sbtn" onClick={app.cloudEnabled ? app.sync : app.openCloud}>
            <Icon n="up" cls="s" />
            {app.cloudEnabled ? '立即同步' : '配置云端'}
          </button>
        </Mod>
      </div>

      <Modal
        title="设置月度支出预算"
        open={budgetModalOpen}
        onCancel={() => setBudgetModalOpen(false)}
        width={400}
        footer={[
          <button key="c" className="mini" style={{ marginRight: 8 }} onClick={() => setBudgetModalOpen(false)}>
            取消
          </button>,
          <button key="s" className="mini ac" onClick={saveBudget}>
            保存
          </button>,
        ]}
      >
        <p style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 14 }}>设置每月支出上限，超支时会收到提醒</p>
        <InputNumber
          prefix="¥"
          placeholder="例如：5000"
          style={{ width: '100%' }}
          size="large"
          value={budgetInput}
          onChange={(v) => setBudgetInput(v as number | null)}
          min={0}
          precision={2}
        />
      </Modal>
    </div>
  )
}

export default HomePage
