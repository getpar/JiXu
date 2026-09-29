import { formatMoneyExact } from '../utils/money'
import { useState, useEffect, useMemo } from 'react'
import { Card, Table, Tag, Button, Modal, Form, InputNumber, Select, Input, DatePicker, TimePicker, Switch, Typography, Popconfirm, message, Space, Alert, Collapse } from 'antd'
import { PlusOutlined, DeleteOutlined, CheckOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { TodoItem } from '../types/electron'

const { Text } = Typography

interface CategoryGroup { category_key: string; category_name: string; subcategories: { subcategory_key: string; subcategory_name: string }[] }

const cycleMeta: Record<string, { label: string; emoji: string; color: string }> = {
  daily: { label: '每天', emoji: '☀️', color: 'blue' },
  weekly: { label: '每周', emoji: '📆', color: 'purple' },
  monthly: { label: '每月', emoji: '📅', color: 'orange' },
  yearly: { label: '每年', emoji: '🎯', color: 'cyan' },
  once: { label: '单次', emoji: '📍', color: 'default' },
}

function TodosPage(): JSX.Element {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
      loadData(); loadCategories()
      // v0.7.3 云同步应用了云端待办快照后自动刷新列表
      const onEntitySynced = () => { loadData() }
      window.addEventListener('entity-synced', onEntitySynced)
      return () => window.removeEventListener('entity-synced', onEntitySynced)
    }, [])

  async function loadData(): Promise<void> {
    setTodos(await window.electronAPI.getTodos())
  }

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const grouped: Record<string, CategoryGroup> = {}
    for (const cat of raw) {
      if (!grouped[cat.category_key]) grouped[cat.category_key] = { category_key: cat.category_key, category_name: cat.category_name, subcategories: [] }
      grouped[cat.category_key].subcategories.push({ subcategory_key: cat.subcategory_key, subcategory_name: cat.subcategory_name })
    }
    setCategories(Object.values(grouped))
  }

  async function handleAdd(): Promise<void> {
    const v = await form.validateFields()
    const amount = v.amount || 0
    await window.electronAPI.addTodo({
      title: v.title.trim(), cycle: v.cycle,
      next_date: v.next_date.format('YYYY-MM-DD'),
      time: v.time ? v.time.format('HH:mm') : '',
      amount: amount > 0 ? amount : 0,
      category_key: amount > 0 ? v.category_key : '',
      subcategory_key: amount > 0 ? v.subcategory_key : '',
      note: v.note || '',
    })
    message.success('待办已添加')
    setModalOpen(false); form.resetFields(); loadData()
  }

  async function handleComplete(todo: TodoItem): Promise<void> {
    const res = await window.electronAPI.completeTodo(todo.id)
    if (res.success) {
      message.success(res.recorded ? `已完成，自动记账 ¥${formatMoneyExact(res.recorded.amount)}` : '已完成')
      loadData()
    } else {
      message.error(res.error || '操作失败')
    }
  }

  async function handleToggle(id: number, active: boolean): Promise<void> {
    await window.electronAPI.toggleTodo(id, active)
    loadData()
  }

  async function handleDelete(id: number): Promise<void> {
    await window.electronAPI.deleteTodo(id)
    message.success('已删除'); loadData()
  }

  const today = dayjs().format('YYYY-MM-DD')
  // 进行中：启用且（非单次 或 单次未完成）
  const activeTodos = useMemo(() => todos.filter((t) => {
    if (!t.is_active) return false
    if (t.cycle === 'once' && t.completed_dates.length > 0) return false
    return true
  }), [todos])
  // 已完成区：停用的 + 单次已完成的（与小程序端一致）
  const doneTodos = useMemo(() => todos.filter((t) => !activeTodos.includes(t)), [todos, activeTodos])
  const dueToday = activeTodos.filter((t) => t.next_date <= today)

  const subs = selectedCat ? categories.find(c => c.category_key === selectedCat)?.subcategories.map(s => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  const columns = [
    {
      title: '周期', dataIndex: 'cycle', key: 'cycle', width: 90,
      render: (c: string) => {
        const m = cycleMeta[c] || { label: c, emoji: '', color: 'default' }
        return <Tag color={m.color} style={{ borderRadius: 6 }}>{m.emoji} {m.label}</Tag>
      },
    },
    {
      title: '到期日', key: 'due', width: 150,
      render: (_: any, r: TodoItem) => {
        const overdue = r.next_date < today
        return (
          <Space size={4}>
            <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{r.next_date.slice(5)}</Text>
            {r.time && <Text type="secondary" style={{ fontSize: 12 }}><ClockCircleOutlined /> {r.time}</Text>}
            {overdue && <Tag color="error" style={{ borderRadius: 6 }}>已过期</Tag>}
          </Space>
        )
      },
    },
    {
      title: '待办事项', dataIndex: 'title', key: 'title',
      render: (t: string, r: TodoItem) => (
        <Space size={6}>
          <Text strong style={{ fontSize: 15 }}>{t}</Text>
          {r.note && <Text type="secondary" style={{ fontSize: 12 }}>· {r.note}</Text>}
        </Space>
      ),
    },
    {
      title: '关联金额', key: 'amount', width: 190,
      render: (_: any, r: TodoItem) => r.amount > 0 ? (
        <Space size={4}>
          <Text style={{ fontWeight: 700, color: '#FF6B35' }}>¥{formatMoneyExact(r.amount)}</Text>
          {r.category_name && <Tag color="orange" style={{ borderRadius: 6 }}>{r.category_name}</Tag>}
          {r.subcategory_name && <Tag style={{ borderRadius: 6 }}>{r.subcategory_name}</Tag>}
        </Space>
      ) : <Text type="secondary">-</Text>,
    },
    {
      title: '启用', key: 'active', width: 60,
      render: (_: any, r: TodoItem) => <Switch size="small" checked={!!r.is_active} onChange={v => handleToggle(r.id, v)} />,
    },
    {
      title: '操作', key: 'act', width: 170,
      render: (_: any, r: TodoItem) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleComplete(r)} style={{ color: '#10B981', fontWeight: 600 }}>
            {r.amount > 0 ? '完成并记账' : '完成'}
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          待办事项
        </Text>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>🔔 重复待办</div>
      </div>

      {dueToday.length > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
          message={`今天有 ${dueToday.length} 个待办到期：${dueToday.map((t) => t.title).join('、')}`}
        />
      )}

      <div style={{ marginBottom: 20 }}>
        <Space direction="vertical" size={8}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setModalOpen(true); setSelectedCat(null); form.resetFields() }}
            style={{ borderRadius: 10, height: 40 }}
          >
            添加待办
          </Button>
          <Text type="secondary" style={{ fontSize: 13 }}>
            每天喝水、每月交话费…填了关联金额的待办，点"完成"时会自动记一笔账
          </Text>
        </Space>
      </div>

      <Card>
        <Table columns={columns} dataSource={activeTodos} rowKey="id" pagination={false} size="middle"
          locale={{ emptyText: '暂无进行中的待办，点上面按钮添加一个' }} />
      </Card>

      {doneTodos.length > 0 && (
        <Collapse
          ghost style={{ marginTop: 16 }}
          items={[{
            key: 'done',
            label: <Text type="secondary">✅ 已完成 / 已停用（{doneTodos.length}）</Text>,
            children: doneTodos.map((t) => {
              const m = cycleMeta[t.cycle] || { label: t.cycle, emoji: '' }
              const last = t.completed_dates.length > 0 ? t.completed_dates[t.completed_dates.length - 1] : ''
              return (
                <div key={t.id} style={{ padding: '8px 4px', borderBottom: '1px solid #f1f5f9' }}>
                  <Space split={<Text type="secondary">·</Text>} wrap>
                    <Text delete type="secondary">{t.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.emoji} {m.label}</Text>
                    {last && <Text type="secondary" style={{ fontSize: 12 }}>最后完成 {last}</Text>}
                    {!t.is_active && <Text type="secondary" style={{ fontSize: 12 }}>已停用</Text>}
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(t.id)}>
                      <Button type="link" danger size="small" style={{ padding: 0, fontSize: 12 }}>删除</Button>
                    </Popconfirm>
                  </Space>
                </div>
              )
            }),
          }]}
        />
      )}

      <Modal
        title="添加待办"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => setModalOpen(false)}
        okText="添加"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}
          initialValues={{ cycle: 'daily', next_date: dayjs(), amount: 0 }}>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：交房租、晨跑、喝水 8 杯" maxLength={20} style={{ borderRadius: 10 }} />
          </Form.Item>
          <Form.Item label="周期" name="cycle">
            <Select options={Object.entries(cycleMeta).map(([k, m]) => ({ value: k, label: `${m.emoji} ${m.label}` }))} />
          </Form.Item>
          <Form.Item label="下次到期日期" name="next_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%', borderRadius: 10 }} allowClear={false} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.cycle !== cur.cycle}>
            {({ getFieldValue }) => ['daily', 'weekly', 'once'].includes(getFieldValue('cycle')) && (
              <Form.Item label="具体时间（可选）" name="time">
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%', borderRadius: 10 }} placeholder="不限" />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item label="关联金额（可选，完成时自动记账）" name="amount">
            <InputNumber prefix="¥" min={0} precision={2} style={{ width: '100%', borderRadius: 10 }} placeholder="不填则只提醒不记账" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.amount !== cur.amount}>
            {({ getFieldValue }) => (getFieldValue('amount') || 0) > 0 && (
              <>
                <Form.Item label="一级分类" name="category_key" rules={[{ required: true, message: '请选择大类' }]}>
                  <Select
                    placeholder="选择大类"
                    onChange={v => { setSelectedCat(v); form.setFieldValue('subcategory_key', undefined) }}
                    options={categories.map(c => ({ value: c.category_key, label: c.category_name }))}
                  />
                </Form.Item>
                <Form.Item label="二级分类" name="subcategory_key" rules={[{ required: true, message: '请选择小类' }]}>
                  <Select placeholder={selectedCat ? '选择小类' : '请先选择大类'} disabled={!selectedCat} options={subs} />
                </Form.Item>
              </>
            )}
          </Form.Item>
          <Form.Item label="备注（可选）" name="note">
            <Input placeholder="补充说明" maxLength={30} style={{ borderRadius: 10 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TodosPage
