import { formatMoney } from '../utils/money'
import { useState, useEffect } from 'react'
import { Card, DatePicker, Typography, Row, Col, Statistic, Empty, Spin, Space, Segmented } from 'antd'
import { PieChartOutlined, RiseOutlined } from '@ant-design/icons'
import { Pie, Column, Line } from '@ant-design/charts'
import dayjs, { Dayjs } from 'dayjs'

const { Title, Text } = Typography

// 现代化分类配色
const catColors: Record<string, string> = {
  food: '#EF4444', transport: '#3B82F6', shopping: '#8B5CF6',
  housing: '#F97316', entertainment: '#10B981', medical: '#EC4899',
  education: '#06B6D4', social: '#F59E0B', finance: '#6366F1',
  other: '#6B7280', income: '#10B981',
}

function getColors(stats: any[]) { return stats.map(s => catColors[s.category_key] || '#6B7280') }

function StatsPage(): JSX.Element {
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs())
  const [stats, setStats] = useState<any[]>([])
  const [dailyTrend, setDailyTrend] = useState<any[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [recordType, setRecordType] = useState<string>('expense')
  const [compareMonth, setCompareMonth] = useState<Dayjs>(dayjs().subtract(1, 'month'))
  const [compareData, setCompareData] = useState<any>(null)

  useEffect(() => { loadStats() }, [selectedMonth, recordType])
  useEffect(() => { loadCompare() }, [compareMonth, selectedMonth])

  async function loadStats(): Promise<void> {
    setLoading(true)
    try {
      const month = selectedMonth.format('YYYY-MM')
      const [ms, total, trend] = await Promise.all([
        window.electronAPI.getMonthlyStats(month, recordType),
        window.electronAPI.getMonthlyTotal(month, recordType),
        window.electronAPI.getDailyTrend(month, recordType),
      ])
      setStats(ms); setTotalAmount(total); setDailyTrend(trend)
    } finally { setLoading(false) }
  }

  async function loadCompare(): Promise<void> {
    const result = await window.electronAPI.compareMonths(selectedMonth.format('YYYY-MM'), compareMonth.format('YYYY-MM'))
    setCompareData(result)
  }

  const pieData = stats.map(i => ({ type: i.category_name, value: i.total }))
  const columnData = stats.map(i => ({ category: i.category_name, amount: i.total }))
  const lineData = dailyTrend.map(i => ({ date: i.date, amount: i.total }))

  const pieConfig = {
    data: pieData,
    angleField: 'value',
    colorField: 'type',
    radius: 0.85,
    innerRadius: 0.55,
    label: {
      text: (d: any) => `${d.type}\n¥${formatMoney(Number(d.value), 0)}`,
      position: 'outside' as const,
      style: { fontSize: 11, fill: '#64748B' },
    },
    legend: { color: { position: 'bottom' as const } },
    color: getColors(stats),
    style: { stroke: '#fff', lineWidth: 2 },
  }

  const columnConfig = {
    data: columnData,
    xField: 'category',
    yField: 'amount',
    colorField: 'category',
    label: {
      text: (d: any) => `¥${formatMoney(Number(d.amount), 0)}`,
      position: 'top' as const,
      style: { fontSize: 11, fill: '#64748B' },
    },
    legend: false,
    color: getColors(stats),
    axis: { x: { labelAutoRotate: true } },
    style: { radiusTopLeft: 8, radiusTopRight: 8 },
  }

  const lineConfig = {
    data: lineData,
    xField: 'date',
    yField: 'amount',
    point: { size: 4, shape: 'circle' as const, style: { fill: '#FF6B35', lineWidth: 2, stroke: '#fff' } },
    label: {
      text: (d: any) => (Number(d.amount) > 0 ? `¥${formatMoney(Number(d.amount), 0)}` : ''),
      style: { fontSize: 10, fill: '#64748B' },
    },
    smooth: true,
    style: { line: { stroke: '#FF6B35', lineWidth: 2.5 } },
  }

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          统计分析
        </Text>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>📊 数据洞察</div>
      </div>

      {/* 控制栏 */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 20 }}>
        <Space wrap size={16}>
          <DatePicker
            picker="month"
            value={selectedMonth}
            onChange={d => setSelectedMonth(d || dayjs())}
            allowClear={false}
            format="YYYY年M月"
            size="large"
            style={{ borderRadius: 10 }}
          />
          <Segmented
            value={recordType}
            onChange={v => setRecordType(v as string)}
            options={[
              { label: '📤 支出', value: 'expense' },
              { label: '📥 收入', value: 'income' },
            ]}
          />
          <div style={{
            marginLeft: 16, paddingLeft: 16, borderLeft: '1px solid #E2E8F0',
          }}>
            <Text type="secondary" style={{ fontSize: 13 }}>合计：</Text>
            <Text strong style={{
              fontSize: 22,
              color: recordType === 'income' ? '#10B981' : '#EF4444',
              fontVariantNumeric: 'tabular-nums',
            }}>
              ¥{formatMoney(totalAmount)}
            </Text>
          </div>
        </Space>
      </Card>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : stats.length === 0 ? (
        <Card><Empty description="暂无数据" /></Card>
      ) : (
        <>
          {/* 统计小卡片 */}
          <Row gutter={16} style={{ marginBottom: 20 }}>
            <Col span={6}>
              <div className="stat-mini-card">
                <Statistic
                  title="合计"
                  value={totalAmount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: recordType === 'income' ? '#10B981' : '#EF4444', fontSize: 22, fontWeight: 700 }}
                />
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-mini-card">
                <Statistic
                  title="类别数"
                  value={stats.length}
                  suffix="个"
                  prefix={<PieChartOutlined style={{ color: '#FF6B35' }} />}
                  valueStyle={{ fontSize: 22, fontWeight: 700 }}
                />
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-mini-card">
                <Statistic
                  title="日均"
                  value={totalAmount / Math.max(dayjs().date(), 1)}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ fontSize: 22, fontWeight: 700 }}
                />
              </div>
            </Col>
            <Col span={6}>
              <div className="stat-mini-card">
                <Statistic
                  title="最高类别"
                  value={stats[0]?.category_name || '-'}
                  suffix={stats[0] ? `¥${formatMoney(stats[0].total, 0)}` : ''}
                  valueStyle={{ fontSize: 18, fontWeight: 700 }}
                />
              </div>
            </Col>
          </Row>

          {/* 图表区 */}
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title={<span style={{ fontWeight: 600 }}>📊 分类占比</span>}>
                <Pie {...pieConfig} height={280} />
              </Card>
            </Col>
            <Col span={12}>
              <Card title={<span style={{ fontWeight: 600 }}>📊 分类对比</span>}>
                <Column {...columnConfig} height={280} />
              </Card>
            </Col>
            <Col span={24}>
              <Card title={<span style={{ fontWeight: 600 }}>📈 每日趋势</span>}>
                {lineData.length > 1 ? (
                  <Line {...lineConfig} height={240} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 80, color: '#94A3B8' }}>
                    <RiseOutlined style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }} />
                    <br />需要至少 2 天有数据才能显示趋势图
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          {/* 月度对比 */}
          <Card
            title={<span style={{ fontWeight: 600 }}>📅 月度对比</span>}
            style={{ marginTop: 16 }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20,
              padding: '14px 20px', background: '#F8FAFC', borderRadius: 12,
            }}>
              <DatePicker
                picker="month"
                value={compareMonth}
                onChange={d => setCompareMonth(d || dayjs())}
                allowClear={false}
                format="YYYY年M月"
                style={{ borderRadius: 10 }}
              />
              <Text>
                {compareMonth.format('YYYY年M月')}：
                <Text strong style={{ color: '#EF4444', fontSize: 15 }}>
                  ¥{formatMoney(compareData?.month2?.total ?? 0)}
                </Text>
              </Text>
              <Text type="secondary" style={{ fontSize: 18 }}>vs</Text>
              <Text>
                {selectedMonth.format('YYYY年M月')}：
                <Text strong style={{ color: '#EF4444', fontSize: 15 }}>
                  ¥{formatMoney(compareData?.month1?.total ?? 0)}
                </Text>
              </Text>
            </div>
            {compareData && (
              <Row gutter={16}>
                <Col span={12}>
                  <Card
                    size="small"
                    title={`${compareMonth.format('M月')} 分类占比`}
                    styles={{ body: { padding: 16 } }}
                  >
                    <Pie
                      data={compareData.month2.rows.map((i: any) => ({ type: i.category_name, value: i.total }))}
                      angleField="value" colorField="type" radius={0.8}
                      label={{ text: (d: any) => d.type, position: 'outside' as const, style: { fontSize: 11 } }}
                      legend={{ color: { position: 'bottom' as const } }}
                      color={getColors(compareData.month2.rows)}
                      height={200}
                    />
                  </Card>
                </Col>
                <Col span={12}>
                  <Card
                    size="small"
                    title={`${selectedMonth.format('M月')} 分类占比`}
                    styles={{ body: { padding: 16 } }}
                  >
                    <Pie
                      data={compareData.month1.rows.map((i: any) => ({ type: i.category_name, value: i.total }))}
                      angleField="value" colorField="type" radius={0.8}
                      label={{ text: (d: any) => d.type, position: 'outside' as const, style: { fontSize: 11 } }}
                      legend={{ color: { position: 'bottom' as const } }}
                      color={getColors(compareData.month1.rows)}
                      height={200}
                    />
                  </Card>
                </Col>
              </Row>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

export default StatsPage
