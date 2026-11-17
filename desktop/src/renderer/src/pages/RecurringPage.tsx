import { useState, useEffect } from 'react'
import { Modal, Form, InputNumber, Select, Input, DatePicker, Popconfirm, message } from 'antd'
import dayjs from 'dayjs'
import { Mod, Icon, CatIcon, F, dateLabel, p2 } from '../components/ui'
import { MAX_AMOUNT } from '../utils/money'
import type { RecurringBill } from '../types/electron'

interface CategoryGroup {
  category_key: string
  category_name: string
  subcategories: { subcategory_key: string; subcategory_name: string }[]
}

const CYCLE: Record<string, string> = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }

function RecurringPage(): JSX.Element {
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
    loadCategories()
    // v0.7.3 云同步应用了云端周期规则快照后自动刷新列表
    const onEntitySynced = (): void => { loadData() }
    window.addEventListener('entity-synced', onEntitySynced)
    return () => window.removeEventListener('entity-synced', onEntitySynced)
  }, [])

  async function loadData(): Promise<void> {
    setBills(await window.electronAPI.getRecurringBills())
  }

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const grouped: Record<string, CategoryGroup> = {}
    for (const c of raw) {
      if (!grouped[c.category_key]) grouped[c.category_key] = { category_key: c.category_key, category_name: c.category_name, subcategories: [] }
      grouped[c.category_key].subcategories.push({ subcategory_key: c.subcategory_key, subcategory_name: c.subcategory_name })
    }
    setCategories(Object.values(grouped))
  }

  async function handleAdd(): Promise<void> {
    const v = await form.validateFields()
    await window.electronAPI.addRecurring({
      type: v.type || 'expense',
      amount: v.amount,
      category_key: v.category_key,
      subcategory_key: v.subcategory_key,
      note: v.note || '',
      cycle: v.cycle,
      next_date: v.next_date.format('YYYY-MM-DD'),
    })
    message.success('添加成功')
    setModalOpen(false)
    form.resetFields()
    loadData()
  }

  async function handleToggle(id: number, active: boolean): Promise<void> {
    await window.electronAPI.toggleRecurring(id, active)
    loadData()
  }

  async function handleDelete(id: number): Promise<void> {
    await window.electronAPI.deleteRecurring(id)
    message.success('已删除')
    loadData()
  }

  async function handleExecute(bill: RecurringBill): Promise<void> {
    await window.electronAPI.executeRecurring(bill.id)
    message.success(`已记录：${bill.category_name}-${bill.subcategory_name} ¥${F(bill.amount)}`)
    loadData()
  }

  const subs = selectedCat ? categories.find((c) => c.category_key === selectedCat)?.subcategories.map((s) => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []
  const monthlyFixed = bills.filter((b) => b.is_active && b.cycle === 'monthly').reduce((s, b) => s + b.amount, 0)
  const activeCount = bills.filter((b) => b.is_active).length

  return (
    <>
      <Mod
        id="P-01"
        title="周期账单"
        en={`RECURRING · ${activeCount} 启用`}
        right={
          <span className="lb">
            <b>每月固定</b>¥{F(monthlyFixed)}
          </span>
        }
      >
        {bills.length === 0 && (
          <div className="nosig">
            <b>还没有周期账单</b>
            <p>房租、订阅等固定账单，到期手动触发记录，让固定开销不用每次都手动记。</p>
            <button className="mini ac" onClick={() => { setModalOpen(true); setSelectedCat(null); form.resetFields() }}>
              <Icon n="add" cls="s" />
              添加周期账单
            </button>
          </div>
        )}
        {bills.map((b) => (
          <div className={`rec${b.is_active ? '' : ' off'}`} key={b.id}>
            <span className="pict">
              <CatIcon k={b.category_key} />
            </span>
            <div className="tt">
              <b>{b.note || b.subcategory_name}</b>
              <span>
                {CYCLE[b.cycle] || b.cycle} · 下次 {dateLabel(b.next_date)} · {b.category_name} / {b.subcategory_name}
              </span>
            </div>
            <span className="num">¥{F(b.amount)}</span>
            <button
              className={`tg${b.is_active ? ' on' : ''}`}
              onClick={() => handleToggle(b.id, !b.is_active)}
              role="switch"
              aria-checked={!!b.is_active}
              aria-label={`启用 ${b.note || b.subcategory_name}`}
            />
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button className="mini" onClick={() => handleExecute(b)} disabled={!b.is_active}>
                立即记录
              </button>
              <Popconfirm title="确定删除？" onConfirm={() => handleDelete(b.id)}>
                <button className="ib del" aria-label="删除">
                  <Icon n="trash" cls="s" />
                </button>
              </Popconfirm>
            </span>
          </div>
        ))}
        {bills.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <button className="mini" onClick={() => { setModalOpen(true); setSelectedCat(null); form.resetFields() }}>
              <Icon n="add" cls="s" />
              添加周期账单
            </button>
          </div>
        )}
      </Mod>

      <Modal
        title="添加周期账单"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={480}
        footer={[
          <button key="c" className="mini" style={{ marginRight: 8 }} onClick={() => setModalOpen(false)}>取消</button>,
          <button key="a" className="mini ac" onClick={handleAdd}>添加</button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }} initialValues={{ type: 'expense', cycle: 'monthly', next_date: dayjs() }}>
          <Form.Item label="类型" name="type">
            <Select options={[
              { value: 'expense', label: '支出' },
              { value: 'income', label: '收入' },
            ]} />
          </Form.Item>
          <Form.Item label="金额" name="amount" rules={[{ required: true }, { type: 'number', min: 0.01, max: MAX_AMOUNT }]}>
            <InputNumber prefix="¥" style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item label="周期" name="cycle">
            <Select options={Object.entries(CYCLE).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item label="下次日期" name="next_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
          <Form.Item label="一级分类" name="category_key" rules={[{ required: true }]}>
            <Select
              placeholder="选择大类"
              onChange={(v) => { setSelectedCat(v); form.setFieldValue('subcategory_key', undefined) }}
              options={categories.map((c) => ({ value: c.category_key, label: c.category_name }))}
            />
          </Form.Item>
          <Form.Item label="二级分类" name="subcategory_key" rules={[{ required: true }]}>
            <Select placeholder={selectedCat ? '选择小类' : '请先选择大类'} disabled={!selectedCat} options={subs} />
          </Form.Item>
          <Form.Item label="备注" name="note">
            <Input placeholder="例如：房租、Netflix订阅" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default RecurringPage
