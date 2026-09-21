import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useMemo, useEffect } from 'react'
import { getMonthTotal, getRecords, getBudget, setBudget as saveBudgetToStorage, syncNow, checkAndExecuteDueBills, getDueSummary, localDateStr } from '../../utils/storage'
import { getOwnerId, joinOwnerId, regenerateOwnerId, testCloud } from '../../utils/cloud'
import { formatOwnerId } from '../../utils/cloudCore'
import { useThemeDark, getThemePref, setThemePref, THEME_PREFS } from '../../utils/theme'
import type { ThemePref } from '../../utils/theme'
import './index.scss'

const THIS_MONTH = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()

function formatAmount(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 100000000) return (abs / 100000000).toFixed(2) + '亿'
  if (abs >= 10000) return (abs / 10000).toFixed(2) + '万'
  return abs.toFixed(2)
}

const catEmoji: Record<string, string> = {
  food: '🍜', transport: '🚗', shopping: '🛒', housing: '🏠',
  entertainment: '🎮', medical: '💊', education: '📚', social: '🎁',
  finance: '💰', other: '📦',
}

export default function Index(): JSX.Element {
  const dark = useThemeDark()
  const [themePref, setThemePrefState] = useState<ThemePref>(getThemePref())

  // v0.7.0 外观切换：跟随系统 / 始终浅色 / 始终深色（选一次永久记住）
  function pickTheme(): void {
    Taro.showActionSheet({ itemList: THEME_PREFS.map((p) => p.label) })
      .then((res) => {
        const p = THEME_PREFS[res.tapIndex].key
        setThemePref(p)
        setThemePrefState(p)
      })
      .catch(() => { /* 用户取消 */ })
  }
  const [month, setMonth] = useState(THIS_MONTH)
  const [exp, setExp] = useState(0)
  const [inc, setInc] = useState(0)
  const [recent, setRecent] = useState<any[]>([])
  const [budget, setBudget] = useState(0)
  const [showBudget, setShowBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  // 云同步 / 同步码（多用户隔离）
  const [showCloud, setShowCloud] = useState(false)
  const [ownerId, setOwnerId_] = useState('')
  const [joinInput, setJoinInput] = useState('')
  // v0.7.1 云端真实连通自检结果（打开弹窗时异步检测，不再假确认）
  const [cloudTest, setCloudTest] = useState<{ real: boolean; detail: string } | null>(null)
  // v0.7.2 方案B App 内强提醒：今天到期/已逾期未完成的待办
  const [dueInfo, setDueInfo] = useState({ due: 0, overdue: 0 })
  const dueTotal = dueInfo.due + dueInfo.overdue

  const isCurrentMonth = month === THIS_MONTH

  const monthOptions = useMemo(() => {
    const opts = []
    for (let i = 0; i < 12; i++) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return opts
  }, [])

  async function refresh(): Promise<void> {
    const [expVal, incVal, records] = await Promise.all([
      getMonthTotal(month, 'expense'), getMonthTotal(month, 'income'), getRecords(),
    ])
    setExp(expVal); setInc(incVal); setRecent(records.filter((r) => r.date.startsWith(month)).slice(0, 8))
    if (isCurrentMonth) {
      const b = await getBudget()
      setBudget(b)
    } else { setBudget(0) }
  }

  useDidShow(() => {
    refresh()
    // v0.6.9 到期的周期账单自动补记（纯手机用户与桌面端对齐），记完弹提示并刷新
    checkAndExecuteDueBills().then((list) => {
      if (list.length > 0) {
        refresh()
        Taro.showToast({ title: `已自动记录 ${list.length} 笔周期账单`, icon: 'none', duration: 2500 })
      }
    }).catch(() => { /* ignore */ })
    // 每次回到首页先和云端同步一次：桌面端记的账拉下来就地刷新
    syncNow().then((r) => { if (r.pulled > 0) refresh() }).catch(() => { /* 同步失败不影响本地查看 */ })
    // v0.7.2 方案B：待办到期红点角标 + 首页横幅数据；每天首次打开额外 toast 提一嘴（当天不重复）
    getDueSummary().then(({ due, overdue }) => {
      setDueInfo({ due, overdue })
      const n = due + overdue
      if (n > 0) {
        Taro.setTabBarBadge({ index: 0, text: n > 99 ? '99+' : String(n) }).catch(() => { /* 非 tabBar 环境忽略 */ })
        const today = localDateStr()
        if (Taro.getStorageSync('last_due_remind') !== today) {
          Taro.setStorageSync('last_due_remind', today)
          Taro.showToast({ title: `🔔 今天有 ${n} 个待办${overdue > 0 ? `（含 ${overdue} 个已逾期）` : ''}`, icon: 'none', duration: 2500 })
        }
      } else {
        Taro.removeTabBarBadge({ index: 0 }).catch(() => { /* 非 tabBar 环境忽略 */ })
      }
    }).catch(() => { /* ignore */ })
  })
  useEffect(() => { refresh() }, [month])
  Taro.eventCenter.on('dataChanged', refresh)

  async function saveBudget(): Promise<void> {
    const val = Number(budgetInput)
    if (val >= 0 && budgetInput.trim() !== '') {
      setBudget(val)
      await saveBudgetToStorage(val)
      setShowBudget(false)
    }
  }

  async function clearAll(): Promise<void> {
    Taro.showModal({
      title: '清除所有数据？',
      content: '将删除全部记账记录和预算',
      success: (res) => {
        if (res.confirm) { Taro.clearStorageSync(); setExp(0); setInc(0); setRecent([]); setBudget(0); Taro.eventCenter.trigger('dataChanged') }
      },
    })
  }

  function openCloud(): void {
    setOwnerId_(getOwnerId())
    setJoinInput('')
    setCloudTest(null)
    setShowCloud(true)
    testCloud().then(setCloudTest).catch((e) => setCloudTest({ real: false, detail: `检测失败：${e?.message || e}` }))
  }

  function copyOwnerId(): void {
    Taro.setClipboardData({ data: getOwnerId() })
  }

  async function handleJoin(): Promise<void> {
    if (!joinOwnerId(joinInput)) {
      Taro.showToast({ title: '同步码格式不对（至少 8 位）', icon: 'none' })
      return
    }
    const id = getOwnerId()
    setOwnerId_(id)
    Taro.showToast({ title: '已加入，正在同步…', icon: 'none' })
    const r = await syncNow()
    if (r.ok) { refresh(); Taro.eventCenter.trigger('dataChanged') }
  }

  function handleRegenerate(): void {
    Taro.showModal({
      title: '换新同步码？',
      content: '换新码后本机将和一个新的云端账本同步，旧账本数据仍在云端但不再拉取',
      success: (res) => {
        if (res.confirm) { setOwnerId_(regenerateOwnerId()) }
      },
    })
  }

  const balance = inc - exp
  const pct = budget > 0 ? Math.round((exp / budget) * 100) : 0
  const over = budget > 0 && exp > budget

  const budgetColor = over ? '#EF4444' : pct >= 80 ? '#F59E0B' : '#10B981'

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      {/* ====== 顶栏 ====== */}
      <View className='topbar'>
        <Text className='topbar-brand'>每日小记</Text>
        <Picker mode='selector' range={monthOptions} onChange={(e) => setMonth(monthOptions[Number(e.detail.value)])}>
          <View className='topbar-month'>
            <Text>{month}</Text>
            <Text className='topbar-arrow'>▼</Text>
          </View>
        </Picker>
      </View>

      {/* ====== v0.7.2 待办到期强提醒横幅（点击直达待办页） ====== */}
      {dueTotal > 0 && (
        <View className='due-banner' onClick={() => Taro.navigateTo({ url: '/pages/todos/index' })}>
          <Text className='due-banner-text'>
            🔔 今天有 {dueTotal} 个待办要处理{dueInfo.overdue > 0 ? `（含 ${dueInfo.overdue} 个已逾期）` : ''}
          </Text>
          <Text className='due-banner-go'>去处理 ›</Text>
        </View>
      )}

      {/* ====== 结余卡片 ====== */}
      <View className='balance-card'>
        <Text className='balance-label'>本月结余</Text>
        <Text className={`balance-value ${balance >= 0 ? 'green' : 'red'}`}>
          {balance >= 0 ? '+' : '-'}¥{formatAmount(Math.abs(balance))}
        </Text>
        <View className='balance-row'>
          <View className='balance-item'>
            <View className='balance-dot balance-dot-exp' />
            <Text className='balance-item-label'>支出</Text>
            <Text className='balance-item-val'>¥{formatAmount(exp)}</Text>
          </View>
          <View className='balance-item'>
            <View className='balance-dot balance-dot-inc' />
            <Text className='balance-item-label'>收入</Text>
            <Text className='balance-item-val'>¥{formatAmount(inc)}</Text>
          </View>
        </View>
      </View>

      {/* ====== 预算卡片 ====== */}
      {isCurrentMonth && budget > 0 && (
        <View className='budget-card'>
          <View className='budget-header'>
            <Text className='budget-title'>📊 月度预算</Text>
            <View className='budget-tag' style={`background:${over ? '#FEF2F2' : pct >= 80 ? '#FFFBEB' : '#ECFDF5'}`}>
              <Text style={`color:${budgetColor};font-size:22rpx;font-weight:600`}>{over ? '已超支' : `${pct}%`}</Text>
            </View>
          </View>
          <View className='budget-bar'>
            <View className='budget-fill' style={`width:${Math.min(pct, 100)}%;background:${budgetColor}`} />
          </View>
          <View className='budget-footer'>
            <Text className='budget-used'>已用 ¥{formatAmount(exp)}</Text>
            <Text className='budget-total'>预算 ¥{formatAmount(budget)}</Text>
          </View>
        </View>
      )}

      {/* ====== 快捷操作 ====== */}
      <View className='actions'>
        <View className='action-item' onClick={() => Taro.switchTab({ url: '/pages/add/index' })}>
          <View className='action-icon action-add'>✏️</View>
          <Text className='action-text'>记账</Text>
        </View>
        <View className='action-item' onClick={() => Taro.navigateTo({ url: '/pages/todos/index' })}>
          <View className='action-icon action-todo'>🔔</View>
          <Text className='action-text'>待办</Text>
        </View>
        <View className='action-item' onClick={() => { setShowBudget(true); setBudgetInput(budget > 0 ? String(Math.round(budget)) : '') }}>
          <View className='action-icon action-budget'>🎯</View>
          <Text className='action-text'>{budget > 0 ? '预算' : '设预算'}</Text>
        </View>
        <View className='action-item' onClick={() => Taro.navigateTo({ url: '/pages/categories/index' })}>
          <View className='action-icon action-cat'>🏷️</View>
          <Text className='action-text'>分类</Text>
        </View>
        <View className='action-item' onClick={() => Taro.navigateTo({ url: '/pages/recurring/index' })}>
          <View className='action-icon action-recur'>🔁</View>
          <Text className='action-text'>周期</Text>
        </View>
        <View className='action-item' onClick={() => Taro.switchTab({ url: '/pages/stats/index' })}>
          <View className='action-icon action-stats'>📊</View>
          <Text className='action-text'>统计</Text>
        </View>
      </View>

      {/* ====== 最近记录 ====== */}
      <View className='section'>
        <View className='section-header'>
          <Text className='section-title'>最近记录</Text>
          <Text className='section-more' onClick={() => Taro.switchTab({ url: '/pages/history/index' })}>全部 ›</Text>
        </View>

        {recent.length === 0 ? (
          <View className='empty'>
            <Text className='empty-icon'>📝</Text>
            <Text>暂无记录，去记一笔吧</Text>
          </View>
        ) : (
          recent.map((r, i) => (
            <View key={r.id} className={`record-card ${i === recent.length - 1 ? 'last' : ''}`}>
              <View className='record-icon' style={`background:${r.type === 'income' ? '#ECFDF5' : '#FFF0E8'}`}>
                <Text>{catEmoji[r.categoryKey] || '📌'}</Text>
              </View>
              <View className='record-body'>
                <View className='record-top'>
                  <Text className='record-cat'>{r.subcategoryName}</Text>
                  <Text className={`record-amt ${r.type === 'income' ? 'green' : 'red'}`}>
                    {r.type === 'income' ? '+' : '-'}¥{r.amount.toFixed(2)}
                  </Text>
                </View>
                <View className='record-btm'>
                  <Text className='record-date'>{r.date}</Text>
                  {r.note ? <Text className='record-note'>· {r.note}</Text> : null}
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 外观 & 云同步 & 清除数据 */}
      <View className='clear-btn' onClick={pickTheme}>
        <Text className='clear-text'>🌙 外观 · {THEME_PREFS.find((p) => p.key === themePref)?.label}{themePref === 'system' && dark ? '（当前深色）' : ''}</Text>
      </View>
      <View className='clear-btn' onClick={openCloud}>
        <Text className='clear-text'>☁️ 云同步 · 同步码：{formatOwnerId(ownerId || getOwnerId())}</Text>
      </View>
      <View className='clear-btn' onClick={clearAll}>
        <Text className='clear-text'>清除所有数据</Text>
      </View>

      {/* ====== 云同步 / 同步码弹窗 ====== */}
      {showCloud && (
        <View className='modal' onClick={() => setShowCloud(false)}>
          <View className='modal-box' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>☁️ 云同步</Text>
            <Text style={`font-size:24rpx;color:${cloudTest === null ? 'var(--muted)' : cloudTest.real ? '#10B981' : '#EF4444'};display:block;margin-bottom:16rpx`}>
              {cloudTest === null ? '正在检测云端连通…' : cloudTest.detail}
            </Text>

            <Text style='font-size:26rpx;color:var(--text);font-weight:600;display:block;margin-bottom:8rpx'>我的同步码</Text>
            <View style='display:flex;align-items:center;gap:16rpx;margin-bottom:24rpx'>
              <Text style='font-size:32rpx;font-weight:700;color:#FF6B35;letter-spacing:2rpx'>{formatOwnerId(ownerId)}</Text>
              <View className='btn btn-ok' style='height:56rpx;padding:0 24rpx' onClick={copyOwnerId}><Text style='color:#fff;font-size:24rpx'>复制</Text></View>
            </View>
            <Text style='font-size:22rpx;color:var(--muted);display:block;margin-bottom:24rpx'>
              在电脑桌面端输入同一个码，手机和电脑就同步同一本账；别人用小程序会自动分到各自的账本，互相看不到
            </Text>

            <Text style='font-size:26rpx;color:var(--text);font-weight:600;display:block;margin-bottom:8rpx'>输入桌面端的码，加入同一本账</Text>
            <View className='input-wrap'>
              <Input className='input' placeholder='如：ABCD-EFGH-JKMN' value={joinInput} onInput={(e) => setJoinInput(e.detail.value)} maxlength={16} />
            </View>
            <View className='modal-btns'>
              <View className='btn btn-cancel' onClick={handleRegenerate}><Text>换新码</Text></View>
              <View className='btn btn-ok' onClick={handleJoin}><Text className='btn-ok-text'>加入</Text></View>
            </View>
          </View>
        </View>
      )}

      {/* ====== 预算弹窗 ====== */}
      {showBudget && (
        <View className='modal' onClick={() => setShowBudget(false)}>
          <View className='modal-box' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>设置月度预算</Text>
            <View className='input-wrap'>
              <Text className='input-prefix'>¥</Text>
              <Input className='input' type='digit' placeholder='输入金额' value={budgetInput} onInput={(e) => setBudgetInput(e.detail.value)} maxlength={10} />
            </View>
            <View className='modal-btns'>
              <View className='btn btn-cancel' onClick={() => setShowBudget(false)}><Text>取消</Text></View>
              <View className='btn btn-ok' onClick={saveBudget}><Text className='btn-ok-text'>保存</Text></View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
