import { View, Text } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { getMonthTotal, getMonthStats, getDailyTrend } from '../../utils/storage'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

function getMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const catColors: Record<string, string> = {
  food: '#EF4444', transport: '#3B82F6', shopping: '#8B5CF6',
  housing: '#F97316', entertainment: '#10B981', medical: '#EC4899',
  education: '#06B6D4', social: '#F59E0B', finance: '#6366F1',
  other: '#6B7280', income: '#10B981',
}

const catEmoji: Record<string, string> = {
  food: '🍜', transport: '🚗', shopping: '🛒', housing: '🏠',
  entertainment: '🎮', medical: '💊', education: '📚', social: '🎁',
  finance: '💰', other: '📦',
}

function formatAmount(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(1) + 'w'
  return v.toFixed(0)
}

export default function Stats(): JSX.Element {
  const dark = useThemeDark()
  const [month] = useState(getMonth())
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<any[]>([])
  const [trend, setTrend] = useState<any[]>([])
  const [, setTick] = useState(0)

  useEffect(() => { loadData() }, [month, type])
  useDidShow(() => { setTick((t) => t + 1); loadData() })

  async function loadData(): Promise<void> {
    const [t, s, d] = await Promise.all([
      getMonthTotal(month, type), getMonthStats(month, type), getDailyTrend(month, type),
    ])
    setTotal(t); setStats(s); setTrend(d)
  }

  // 柱状图最大值（用于算高度比例）
  const maxAmount = stats.length > 0 ? Math.max(...stats.map((s) => s.total), 1) : 1
  const maxTrend = trend.length > 0 ? Math.max(...trend.map((d) => d.total), 1) : 1

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      {/* ---- 类型切换 ---- */}
      <View className='type-switch'>
        <View className={`type-btn ${type === 'expense' ? 'active expense' : ''}`} onClick={() => setType('expense')}><Text>支出</Text></View>
        <View className={`type-btn ${type === 'income' ? 'active income' : ''}`} onClick={() => setType('income')}><Text>收入</Text></View>
      </View>

      {/* ---- 合计卡片 ---- */}
      <View className='card total-card'>
        <Text className='total-label'>本月{type === 'expense' ? '支出' : '收入'}</Text>
        <Text className={`total-value ${type === 'income' ? 'green' : 'red'}`}>¥{total.toFixed(2)}</Text>
        <View className='total-meta'>
          <Text className='total-sub'>{stats.length} 个类别</Text>
          {stats.length > 0 && <Text className='total-sub'>· 最高 {stats[0]?.categoryName}</Text>}
        </View>
      </View>

      {stats.length === 0 ? (
        <View className='empty-state'>
          <Text className='empty-icon'>📊</Text>
          <Text className='empty-text'>暂无数据</Text>
          <Text className='empty-hint'>记一笔账后这里就会出现统计图表</Text>
        </View>
      ) : (
        <>
          {/* ====== 柱状图：分类对比 ====== */}
          <View className='card'>
            <Text className='section-title'>📊 分类对比</Text>
            <View className='bar-chart'>
              {stats.map((s) => {
                const h = Math.max((s.total / maxAmount) * 100, 4)
                const color = catColors[s.categoryKey] || '#6B7280'
                return (
                  <View key={s.categoryKey} className='bar-col'>
                    <Text className='bar-val'>¥{formatAmount(s.total)}</Text>
                    <View className='bar-bar' style={{ height: `${h}%`, background: color }} />
                    <Text className='bar-label'>{s.categoryName.slice(0, 3)}</Text>
                  </View>
                )
              })}
            </View>
          </View>

          {/* ====== 横向进度条：分类占比 ====== */}
          <View className='card'>
            <Text className='section-title'>🍩 分类占比</Text>
            {stats.map((s, i) => {
              const pct = total > 0 ? (s.total / total) * 100 : 0
              const color = catColors[s.categoryKey] || '#6B7280'
              return (
                <View key={s.categoryKey} className='pct-row'>
                  <View className='pct-header'>
                    <View className='pct-left'>
                      <View className='pct-dot' style={{ background: color }} />
                      <Text className='pct-name'>{catEmoji[s.categoryKey] || ''} {s.categoryName}</Text>
                    </View>
                    <View className='pct-right'>
                      <Text className='pct-amount'>¥{s.total.toFixed(0)}</Text>
                      <Text className='pct-num'>{pct.toFixed(0)}%</Text>
                    </View>
                  </View>
                  <View className='pct-bar'>
                    <View className='pct-fill' style={{ width: `${pct}%`, background: color }} />
                  </View>
                </View>
              )
            })}
          </View>

          {/* ====== 每日趋势 ====== */}
          {trend.length >= 2 && (
            <View className='card'>
              <Text className='section-title'>📈 每日趋势</Text>
              <View className='trend-chart'>
                {trend.map((d) => {
                  const h = Math.max((d.total / maxTrend) * 100, 3)
                  return (
                    <View key={d.date} className='trend-col'>
                      <Text className='trend-val'>¥{formatAmount(d.total)}</Text>
                      <View className='trend-bar' style={{ height: `${h}%` }} />
                      <Text className='trend-date'>{d.date.slice(5)}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  )
}
