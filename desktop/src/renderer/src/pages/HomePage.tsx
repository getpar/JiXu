import { formatMoney, formatMoneyExact } from '../utils/money'
import { useState, useEffect } from 'react'
import { Card, Row, Col, Typography, List, Tag, Progress, InputNumber, Button, Modal, Alert } from 'antd'
import { WalletOutlined, EditOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography

function HomePage(): JSX.Element {
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [incomeTotal, setIncomeTotal] = useState(0)
  const [recentRecords, setRecentRecords] = useState<any[]>([])
  const [budget, setBudget] = useState<number | null>(null)
  const [budgetModalOpen, setBudgetModalOpen] = useState(false)
  const [budgetInput, setBudgetInput] = useState<number | null>(null)
  const currentMonth = dayjs().format('YYYY-MM')

  useEffect(() => { loadData(); loadBudget() }, [])

  async function loadData(): Promise<void> {
    const [expTotal, incTotal, records] = await Promise.all([
      window.electronAPI.getMonthlyTotal(currentMonth, 'expense'),
      window.electronAPI.getMonthlyTotal(currentMonth, 'income'),
      window.electronAPI.getRecordList({ page: 1, pageSize: 10, month: currentMonth }),
    ])
    setExpenseTotal(expTotal)
    setIncomeTotal(incTotal)
    setRecentRecords(records.rows)
  }

  async function loadBudget(): Promise<void> {
    const val = await window.electronAPI.getSetting('monthly_budget')
    if (val) { setBudget(parseFloat(val)); setBudgetInput(parseFloat(val)) }
  }

  async function saveBudget(): Promise<void> {
    if (budgetInput && budgetInput > 0) {
      await window.electronAPI.setSetting('monthly_budget', String(budgetInput))
      setBudget(budgetInput)
      setBudgetModalOpen(false)
    }
  }

  const kbdStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#64748B',
  }

  const balance = incomeTotal - expenseTotal
  const budgetPercent = budget && budget > 0 ? Math.round((expenseTotal / budget) * 100) : 0
  const isOverBudget = budget ? expenseTotal > budget : false

  function getBudgetColor(): string {
    if (!budget) return '#FF6B35'
    if (budgetPercent > 100) return '#EF4444'
    if (budgetPercent >= 80) return '#EF4444'
    if (budgetPercent >= 50) return '#F59E0B'
    return '#10B981'
  }

  // 分类 emoji 映射
  const catEmoji: Record<string, string> = {
    food: '🍜', transport: '🚗', shopping: '🛒', housing: '🏠',
    entertainment: '🎮', medical: '💊', education: '📚', social: '🎁',
    finance: '💰', other: '📦', income: '💵',
  }

  // 统计卡片配置
  const statCards = [
    {
      title: '本月支出',
      value: expenseTotal,
      color: '#EF4444',
      bg: 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)',
      border: '1px solid rgba(239,68,68,0.15)',
      icon: <ArrowUpOutlined />,
      prefix: '-¥',
    },
    {
      title: '本月收入',
      value: incomeTotal,
      color: '#10B981',
      bg: 'linear-gradient(135deg, #ECFDF5 0%, #FFFFFF 100%)',
      border: '1px solid rgba(16,185,129,0.15)',
      icon: <ArrowDownOutlined />,
      prefix: '+¥',
    },
    {
      title: '收支结余',
      value: Math.abs(balance),
      color: balance >= 0 ? '#10B981' : '#EF4444',
      bg: balance >= 0
        ? 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)'
        : 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)',
      border: balance >= 0
        ? '1px solid rgba(59,130,246,0.15)'
        : '1px solid rgba(239,68,68,0.15)',
      icon: <WalletOutlined />,
      prefix: balance >= 0 ? '¥' : '-¥',
    },
  ]

  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ fontSize: 14, fontWeight: 500, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          本月概览
        </Text>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#1E293B' }}>
            {dayjs().format('YYYY年M月')}
          </span>
          <Text type="secondary" style={{ fontSize: 14 }}>
            {dayjs().format('ddd, MMM D')}
          </Text>
        </div>
      </div>

      {/* 超支/预算警告 */}
      {budget && isOverBudget && (
        <Alert
          message={
            <span>
              本月已超支 <strong>¥{formatMoney(expenseTotal - budget)}</strong>
              <span style={{ marginLeft: 12, opacity: 0.7 }}>预算 ¥{formatMoney(budget, 0)} · 已用 ¥{formatMoney(expenseTotal)}</span>
            </span>
          }
          type="error"
          showIcon
          style={{ marginBottom: 20, borderRadius: 12 }}
        />
      )}
      {budget && budgetPercent >= 80 && !isOverBudget && (
        <Alert
          message={
            <span>
              已用预算的 <strong>{budgetPercent}%</strong>
              <span style={{ marginLeft: 12, opacity: 0.7 }}>剩余 ¥{formatMoney(budget - expenseTotal)} · 预算 ¥{formatMoney(budget, 0)}</span>
            </span>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 20, borderRadius: 12 }}
        />
      )}

      {/* 三大统计卡片 */}
      <Row gutter={20} style={{ marginBottom: 16 }}>
        {statCards.map((card) => (
          <Col span={8} key={card.title}>
            <div
              style={{
                background: card.bg,
                border: card.border,
                borderRadius: 16,
                padding: '20px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ fontSize: 13, color: '#64748B', fontWeight: 500, marginBottom: 8 }}>
                {card.title}
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: card.color, fontVariantNumeric: 'tabular-nums' }}>
                {card.prefix}{formatMoney(card.value)}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      {/* 快捷数据 & 键盘导航 */}
      <div style={{
        background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFBF8 100%)',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: '10px 20px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            📋 本月共 <strong style={{ color: '#1E293B' }}>{recentRecords.length}</strong> 条记录
          </Text>
          {budget && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              💰 日均约 <strong style={{ color: '#1E293B' }}>¥{formatMoney(expenseTotal / Math.max(dayjs().date(), 1), 0)}</strong>
            </Text>
          )}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          ⌨️ <kbd style={kbdStyle}>Ctrl+1~7</kbd> 切换页面 · <kbd style={kbdStyle}>Ctrl+Shift+N</kbd> 快速记账
        </Text>
      </div>

      {/* 预算卡片 */}
      <Card
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Text strong style={{ fontSize: 15 }}>📊 月度预算</Text>
              {budget ? (
                <Tag color={budgetPercent > 100 ? 'error' : budgetPercent >= 80 ? 'warning' : 'success'}>
                  {budgetPercent}%
                </Tag>
              ) : (
                <Tag>未设置</Tag>
              )}
            </div>
            {budget ? (
              <>
                <Progress
                  percent={Math.min(budgetPercent, 100)}
                  strokeColor={getBudgetColor()}
                  trailColor="#F1F5F9"
                  strokeWidth={12}
                  format={() => ''}
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    已用 ¥{formatMoney(expenseTotal)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    预算 ¥{formatMoney(budget, 0)} · 剩余 ¥{formatMoney(Math.max(budget - expenseTotal, 0))}
                  </Text>
                </div>
              </>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                设置每月支出上限，帮你控制花销
              </Text>
            )}
          </div>
          <Button
            type={budget ? 'default' : 'primary'}
            icon={<EditOutlined />}
            onClick={() => { setBudgetInput(budget); setBudgetModalOpen(true) }}
            style={{ marginLeft: 24, borderRadius: 10 }}
          >
            {budget ? '调整' : '设置预算'}
          </Button>
        </div>
      </Card>

      {/* 最近记录 */}
      <Card
        title={<span style={{ fontSize: 15, fontWeight: 600 }}>📋 最近记录</span>}
        styles={{ body: { padding: 0 } }}
      >
        {recentRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
            <WalletOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
            <br />
            <Text type="secondary">本月还没有记录，去记一笔吧</Text>
          </div>
        ) : (
          <List
            dataSource={recentRecords}
            renderItem={(item: any, index: number) => (
              <List.Item
                style={{
                  padding: '14px 24px',
                  borderBottom: index < recentRecords.length - 1 ? '1px solid #F1F5F9' : 'none',
                  transition: 'background 0.15s',
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      background: item.type === 'income' ? '#ECFDF5' : '#FFF0E8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}>
                      {catEmoji[item.category_key] || '📌'}
                    </div>
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 14 }}>
                        {item.subcategory_name}
                      </Text>
                      <Tag
                        color={item.type === 'income' ? 'success' : 'default'}
                        style={{ borderRadius: 6, fontSize: 11 }}
                      >
                        {item.type === 'income' ? '收入' : '支出'}
                      </Tag>
                    </div>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {item.record_date || item.expense_date} {item.note ? `· ${item.note}` : ''}
                    </Text>
                  }
                />
                <span style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: item.type === 'income' ? '#10B981' : '#EF4444',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {item.type === 'income' ? '+' : '-'}¥{formatMoneyExact(item.amount)}
                </span>
              </List.Item>
            )}
          />
        )}
      </Card>

      {/* 预算弹窗 */}
      <Modal
        title="设置月度支出预算"
        open={budgetModalOpen}
        onOk={saveBudget}
        onCancel={() => setBudgetModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <div style={{ padding: '8px 0' }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            设置每月支出上限，超支时会收到提醒
          </Text>
          <InputNumber
            prefix="¥"
            placeholder="例如：5000"
            style={{ width: '100%' }}
            size="large"
            value={budgetInput}
            onChange={(v) => setBudgetInput(v)}
            min={0}
            precision={2}
          />
        </div>
      </Modal>
    </div>
  )
}

export default HomePage
