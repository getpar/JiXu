import { useState, useEffect, useMemo } from 'react'
import dayjs from 'dayjs'
import {
  Mod, Icon, CatIcon, HeroAmount, Ro, Seg, MonthSwitch, cssVar,
  F, p2, kf, daysInMonth, todayStr, dateLabel, weekday,
} from '../components/ui'
import type { MonthlyStat } from '../types/electron'

interface DayPoint {
  date: string
  total: number
  future: boolean
}

const arcD = (r: number, a0: number, a1: number): string => {
  const P = (a: number): string => {
    const t = (a * Math.PI) / 180
    return `${(120 + r * Math.cos(t)).toFixed(2)} ${(120 + r * Math.sin(t)).toFixed(2)}`
  }
  return `M${P(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(a1)}`
}

function StatsPage(): JSX.Element {
  const currentMonth = todayStr().slice(0, 7)
  const [ym, setYm] = useState(currentMonth)
  const [recordType, setRecordType] = useState<'expense' | 'income'>('expense')
  const [stats, setStats] = useState<MonthlyStat[]>([])
  const [total, setTotal] = useState(0)
  const [incomeTotal, setIncomeTotal] = useState(0)
  const [trend, setTrend] = useState<DayPoint[]>([])
  const [budget, setBudget] = useState(0)
  const [six, setSix] = useState<Array<{ month: string; expense: number; income: number }>>([])
  const [ri, setRi] = useState(0)
  const [hi, setHi] = useState<number | null>(null)

  useEffect(() => { loadBudget() }, [])

  useEffect(() => { loadStats() }, [ym, recordType])
  useEffect(() => { loadSix() }, [ym])

  async function loadBudget(): Promise<void> {
    const v = await window.electronAPI.getSetting('monthly_budget')
    if (v) setBudget(parseFloat(v) || 0)
  }

  async function loadStats(): Promise<void> {
    const [ms, tot, inc, tr] = await Promise.all([
      window.electronAPI.getMonthlyStats(ym, recordType),
      window.electronAPI.getMonthlyTotal(ym, recordType),
      window.electronAPI.getMonthlyTotal(ym, 'income'),
      window.electronAPI.getDailyTrend(ym, recordType),
    ])
    setStats(ms)
    setTotal(tot)
    setIncomeTotal(inc)
    setRi(0)
    setHi(null)

    const n = daysInMonth(ym)
    const map: Record<string, number> = {}
    for (const d of tr) map[d.date] = d.total
    const today = todayStr()
    const days: DayPoint[] = []
    for (let d = 1; d <= n; d++) {
      const ds = `${ym}-${p2(d)}`
      days.push({ date: ds, total: map[ds] || 0, future: ds > today })
    }
    setTrend(days)
  }

  async function loadSix(): Promise<void> {
    const base = dayjs(ym + '-01')
    const months = Array.from({ length: 6 }, (_, i) => base.subtract(5 - i, 'month').format('YYYY-MM'))
    const rows = await Promise.all(
      months.map(async (m) => {
        const [e, i] = await Promise.all([
          window.electronAPI.getMonthlyTotal(m, 'expense'),
          window.electronAPI.getMonthlyTotal(m, 'income'),
        ])
        return { month: m, expense: e, income: i }
      }),
    )
    setSix(rows)
  }

  const sum = useMemo(() => stats.reduce((s, c) => s + c.total, 0), [stats])
  const list = useMemo(() => stats.map((c) => ({ ...c, share: sum > 0 ? c.total / sum : 0 })), [stats, sum])
  const cur = list[Math.min(ri, Math.max(0, list.length - 1))]
  const maxShare = list[0]?.share || 1

  const past = trend.filter((d) => !d.future)
  const peak = past.reduce<DayPoint>((m, d) => (d.total > m.total ? d : m), past[0] || { date: '', total: 0, future: false })
  const avg = total / Math.max(1, past.length)

  /* ---------- oscilloscope ---------- */
  const osc = useMemo(() => {
    const n = trend.length || daysInMonth(ym)
    const vals = trend.map((x) => x.total).sort((a, b) => b - a)
    let cap = vals[0] || 100
    if (vals[1] && vals[0] > vals[1] * 2.4) cap = vals[1] * 1.3
    const p = Math.pow(10, Math.floor(Math.log10(cap))) / 2
    cap = Math.ceil(cap / p) * p
    const dailyBudget = budget > 0 ? budget / n : 0
    return { n, cap, dailyBudget }
  }, [trend, budget, ym])

  const sixMax = Math.max(...six.map((x) => Math.max(x.expense, x.income)), 1)
  const sixExp = six.reduce((s, x) => s + x.expense, 0)
  const sixInc = six.reduce((s, x) => s + x.income, 0)

  const hoverDay = hi !== null ? trend[hi] : null

  return (
    <div className="grid">
      {/* S-01 收支总览 */}
      <Mod
        id="S-01"
        className="s-4 tot"
        title="收支总览"
        en="TOTALS"
        right={<MonthSwitch ym={ym} onChange={setYm} ticks={false} />}
      >
        <span className="lb">
          <b>{recordType === 'income' ? '收入' : '支出'}</b>
          {recordType === 'income' ? 'INCOME' : 'EXPENSE'}
        </span>
        <HeroAmount v={total} />
        <div className="ros" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <Ro cn="收入" en="INCOME" v={incomeTotal} cls="inc" />
          <Ro cn="结余" en="BALANCE" v={incomeTotal - total} />
        </div>
        <div className="kv">
          <span>日均支出</span>
          <span className="num">¥{F(avg)}</span>
        </div>
        <div className="kv">
          <span>最高单日 · {peak.date ? dateLabel(peak.date) : '—'}</span>
          <span className="num">¥{F(peak.total)}</span>
        </div>
        <div className="kv">
          <span>记账笔数</span>
          <span className="num">{past.length} 天有记录</span>
        </div>
      </Mod>

      {/* S-02 分类构成 */}
      <Mod
        id="S-02"
        className="s-8"
        title="分类构成"
        en={`COMPOSITION · ${list.length} CH`}
        right={
          <Seg
            value={recordType}
            onChange={(v) => setRecordType(v)}
            options={[['expense', '支出'], ['income', '收入']]}
          />
        }
      >
        <div className="ringw">
          <div className="ringbox">
            <svg className="ring" viewBox="0 0 240 240" aria-hidden="true">
              {Array.from({ length: 60 }, (_, k) => {
                const t = (k * 6 * Math.PI) / 180
                const r1 = k % 5 ? 113 : 110
                return (
                  <path
                    key={k}
                    className="bz"
                    d={`M${(120 + r1 * Math.cos(t)).toFixed(1)} ${(120 + r1 * Math.sin(t)).toFixed(1)}L${(120 + 116 * Math.cos(t)).toFixed(1)} ${(120 + 116 * Math.sin(t)).toFixed(1)}`}
                  />
                )
              })}
              <circle className="ot" cx="120" cy="120" r="82" />
              {(() => {
                let a = -90
                return list.map((c, i) => {
                  const sw = c.share * 360
                  const g = list.length > 1 ? 1.4 : 0
                  const a0 = a + g / 2
                  const a1 = Math.min(a + sw - g / 2, a0 + 359.9)
                  a += sw
                  if (a1 <= a0 + 0.3) return null
                  return (
                    <path
                      key={c.category_key}
                      className={`sg${i === ri ? ' on' : ''}`}
                      d={arcD(96, a0, a1)}
                      style={{ opacity: i === ri ? 1 : Math.max(0.24, 1 - i * 0.13) }}
                      onClick={() => setRi(i)}
                    />
                  )
                })
              })()}
            </svg>
            <div className="ringc">
              {cur ? (
                <>
                  <span className="lb">
                    <b>
                      {p2(ri + 1)} / {p2(list.length)}
                    </b>
                    RANK
                  </span>
                  <span className="nm">{cur.category_name}</span>
                  <span className="v">¥{F(cur.total)}</span>
                  <span className="p">{(cur.share * 100).toFixed(1)}%</span>
                </>
              ) : (
                <span className="nm">这个月还没有数据</span>
              )}
            </div>
          </div>
          <div className="rk">
            {list.slice(0, 8).map((c, i) => (
              <button
                key={c.category_key}
                className={`rkr${i === ri ? ' on' : ''}`}
                onClick={() => setRi(i)}
              >
                <span className="n0">{p2(i + 1)}</span>
                <span className="pict">
                  <CatIcon k={c.category_key} />
                </span>
                <span className="nm">
                  <span>{c.category_name}</span>
                  <i style={cssVar('--s', (c.share / maxShare).toFixed(3))} />
                </span>
                <span className="a">¥{F(c.total)}</span>
                <span className="p">{(c.share * 100).toFixed(1)}%</span>
                <Icon n="r" cls="s go" />
              </button>
            ))}
            {list.length === 0 && <div className="empty-s">这个月还没有{recordType === 'income' ? '收入' : '支出'}</div>}
          </div>
        </div>
      </Mod>

      {/* S-03 每日走势 */}
      <Mod id="S-03" className="s-8" title="每日走势" en="DAILY · OSCILLOSCOPE" right={<span className="lb">悬停读数</span>}>
        <div className="osc" onMouseLeave={() => setHi(null)}>
          <span className="yl" style={{ top: 4 }}>{kf(osc.cap)}</span>
          <span className="yl mid" style={{ top: '50%' }}>{kf(osc.cap / 2)}</span>
          <div className="pl">
            {osc.dailyBudget > 0 && osc.dailyBudget < osc.cap && (
              <div className="bl" style={{ bottom: `${((osc.dailyBudget / osc.cap) * 100).toFixed(1)}%` }}>
                <span>日均预算 {F(osc.dailyBudget, 0)}</span>
              </div>
            )}
            <div className="bars">
              {trend.map((d, i) => (
                <div
                  key={d.date}
                  className={`b${d.future ? ' fu' : ''}${d.date === todayStr() ? ' td' : ''}${d.total > osc.cap ? ' ov' : ''}${hi === i ? ' hi' : ''}`}
                  onMouseEnter={() => setHi(i)}
                >
                  <i
                    style={{
                      height: d.future
                        ? '100%'
                        : `${Math.max(d.total ? 1.5 : 0, Math.min(100, (d.total / osc.cap) * 100)).toFixed(1)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            {hi !== null && (
              <div className={`xh${hi > trend.length * 0.62 ? ' l' : ''}`} style={{ transform: `translateX(${(((hi + 0.5) / trend.length) * 100).toFixed(2)}%)` }}>
                <div className="rd">
                  {hoverDay ? (
                    <>
                      {Number(hoverDay.date.slice(5, 7))}月{Number(hoverDay.date.slice(8))}日 {weekday(hoverDay.date)}
                      <b>{hoverDay.future ? '未到 · —' : `¥${F(hoverDay.total)}`}</b>
                      {hoverDay.future ? 'NOT YET' : hoverDay.date === todayStr() ? '今天' : '已入账'}
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <div className="xl">
            {[1, 5, 10, 15, 20, 25, trend.length].map((k, idx, arr) => (
              <span
                key={k}
                className={idx === 0 ? 'first' : idx === arr.length - 1 ? 'last' : ''}
                style={{ left: `${(((k - 0.5) / trend.length) * 100).toFixed(2)}%` }}
              >
                {p2(k)}
              </span>
            ))}
          </div>
        </div>
      </Mod>

      {/* S-04 近六个月 */}
      <Mod id="S-04" className="s-4" title="近六个月" en="6-MONTH · OUT / IN">
        <div className="pairs">
          {six.map((x) => (
            <button
              key={x.month}
              className={`pr${x.month === ym ? ' on' : ''}`}
              onClick={() => setYm(x.month)}
              aria-label={`${x.month} 支出 ${F(x.expense)} 收入 ${F(x.income)}`}
            >
              <span className="bb">
                <i className="e" style={{ height: `${((x.expense / sixMax) * 100).toFixed(1)}%` }}>
                  <span className="tv">{kf(x.expense)}</span>
                </i>
                <i className="n" style={{ height: `${((x.income / sixMax) * 100).toFixed(1)}%` }} />
              </span>
              <span className="ml">{Number(x.month.slice(5, 7))}月</span>
            </button>
          ))}
        </div>
        <div className="legend">
          <span>
            <i className="le" />
            支出 OUT
          </span>
          <span>
            <i className="ln" />
            收入 IN
          </span>
        </div>
        <div className="ros" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
          <Ro cn="六月累计支出" en="Σ OUT" v={sixExp} />
          <Ro cn="累计收入" en="Σ IN" v={sixInc} cls="inc" />
        </div>
      </Mod>
    </div>
  )
}

export default StatsPage
