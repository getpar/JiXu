import { formatMoneyExact, MAX_AMOUNT, MAX_AMOUNT_TEXT } from '../utils/money'
import { useState, useEffect } from 'react'
import { Card, Table, Tag, Button, Modal, Form, InputNumber, Select, Input, DatePicker, Switch, Typography, Popconfirm, message, Space } from 'antd'
import { PlusOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface CategoryGroup { category_key: string; category_name: string; subcategories: { subcategory_key: string; subcategory_name: string }[] }

function RecurringPage(): JSX.Element {
  const [bills, setBills] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
      loadData(); loadCategories()
      // v0.7.3 云同步应用了云端周期规则快照后自动刷新列表
      const onEntitySynced = () => { loadData() }
      window.addEventListener('entity-synced', onEntitySynced)
      return () => window.removeEventListener('entity-synced', onEntitySynced)
    }, [])

  async function loadData(): Promise<void> {
    setBills(await window.electronAPI.getRecurringBills())
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
    await window.electronAPI.addRecurring({
      type: v.type || 'expense', amount: v.amount, category_key: v.category_key,
      subcategory_key: v.subcategory_key, note: v.note || '', cycle: v.cycle,
      next_date: v.next_date.format('YYYY-MM-DD'),
    })
    message.success('添加成功')
    setModalOpen(false); form.resetFields(); loadData()
  }

  async function handleToggle(id: number, active: boolean): Promise<void> {
    await window.electronAPI.toggleRecurring(id, active)
    loadData()
  }

  async function handleDelete(id: number): Promise<void> {
    await window.electronAPI.deleteRecurring(id)
    message.success('已删除'); loadData()
  }

  async function handleExecute(bill: any): Promise<void> {
    await window.electronAPI.executeRecurring(bill.id)
    message.success(`已记录：${bill.category_name}-${bill.subcategory_name} ¥${formatMoneyExact(bill.amount)}`)
    loadData()
  }

  const subs = selectedCat ? categories.find(c => c.category_key === selectedCat)?.subcategories.map(s => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  const columns = [
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 70,
      render: (t: string) => <Tag color={t === 'income' ? 'success' : 'error'} style={{ borderRadius: 6 }}>{t === 'income' ? '收入' : '支出'}</Tag>,
    },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 110,
      render: (a: number) => <span style={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>¥{formatMoneyExact(a)}</span>,
    },
    {
      title: '分类', key: 'cat', width: 170,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Tag color="orange" style={{ borderRadius: 6 }}>{r.category_name}</Tag>
          <Tag style={{ borderRadius: 6 }}>{r.subcategory_name}</Tag>
        </Space>
      ),
    },
    {
      title: '周期', dataIndex: 'cycle', key: 'cycle', width: 80,
      render: (c: string) => {
        const map: Record<string, { label: string; color: string }> = {
          daily: { label: '每天', color: 'blue' },
          weekly: { label: '每周', color: 'purple' },
          monthly: { label: '每月', color: 'orange' },
          yearly: { label: '每年', color: 'cyan' },
        }
        const m = map[c] || { label: c, color: 'default' }
        return <Tag color={m.color} style={{ borderRadius: 6 }}>{m.label}</Tag>
      },
    },
    { title: '下次日期', dataIndex: 'next_date', key: 'next_date', width: 110 },
    {
      title: '备注', dataIndex: 'note', key: 'note', ellipsis: true,
      render: (n: string) => <Text type="secondary" style={{ fontSize: 13 }}>{n || '-'}</Text>,
    },
    {
      title: '启用', key: 'active', width: 60,
      render: (_: any, r: any) => <Switch size="small" checked={!!r.is_active} onChange={v => handleToggle(r.id, v)} />,
    },
    {
      title: '操作', key: 'act', width: 160,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => handleExecute(r)} style={{ color: '#FF6B35' }}>立即记录</Button>
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
          周期账单
        </Text>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>🔁 定期收支</div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Space direction="vertical" size={8}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { setModalOpen(true); setSelectedCat(null); form.resetFields() }}
            style={{ borderRadius: 10, height: 40 }}
          >
            添加周期账单
          </Button>
          <Text type="secondary" style={{ fontSize: 13 }}>
            房租、订阅等固定账单，到期手动触发记录，让固定开销不用每次都手动记
          </Text>
        </Space>
      </div>

      <Card>
        <Table columns={columns} dataSource={bills} rowKey="id" pagination={false} size="middle" />
      </Card>

      <Modal
        title="添加周期账单"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => setModalOpen(false)}
        okText="添加"
        cancelText="取消"
        width={500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ type: 'expense', cycle: 'monthly', next_date: dayjs() }}>
          <Form.Item label="类型" name="type">
            <Select options={[
              { value: 'expense', label: '💰 支出' },
              { value: 'income', label: '💵 收入' },
            ]} />
          </Form.Item>
          <Form.Item label="金额" name="amount" rules={[{ required: true }, { type: 'number', min: 0.01 }]}>
            <InputNumber prefix="¥" style={{ width: '100%', borderRadius: 10 }} size="large" precision={2} />
          </Form.Item>
          <Form.Item label="周期" name="cycle">
            <Select options={[
              { value: 'monthly', label: '📅 每月' },
              { value: 'weekly', label: '📆 每周' },
              { value: 'daily', label: '☀️ 每天' },
              { value: 'yearly', label: '🎯 每年' },
            ]} />
          </Form.Item>
          <Form.Item label="下次日期" name="next_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%', borderRadius: 10 }} allowClear={false} />
          </Form.Item>
          <Form.Item label="一级分类" name="category_key" rules={[{ required: true }]}>
            <Select
              placeholder="选择大类"
              size="large"
              onChange={v => { setSelectedCat(v); form.setFieldValue('subcategory_key', undefined) }}
              options={categories.map(c => ({ value: c.category_key, label: c.category_name }))}
            />
          </Form.Item>
          <Form.Item label="二级分类" name="subcategory_key" rules={[{ required: true }]}>
            <Select
              placeholder={selectedCat ? '选择小类' : '请先选择大类'}
              size="large"
              disabled={!selectedCat}
              options={subs}
            />
          </Form.Item>
          <Form.Item label="备注" name="note">
            <Input placeholder="例如：房租、Netflix订阅" style={{ borderRadius: 10 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default RecurringPage
