import { MAX_AMOUNT, MAX_AMOUNT_TEXT } from '../utils/money'
import { useState, useEffect } from 'react'
import { Card, Form, InputNumber, Select, Input, DatePicker, Button, Typography, message, Segmented } from 'antd'
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface CategoryGroup { category_key: string; category_name: string; subcategories: { subcategory_key: string; subcategory_name: string }[] }

function AddExpensePage(): JSX.Element {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [recordType, setRecordType] = useState<string>('expense')
  const navigate = useNavigate()

  useEffect(() => { loadCategories() }, [])

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const grouped: Record<string, CategoryGroup> = {}
    for (const cat of raw) {
      if (!grouped[cat.category_key]) grouped[cat.category_key] = { category_key: cat.category_key, category_name: cat.category_name, subcategories: [] }
      grouped[cat.category_key].subcategories.push({ subcategory_key: cat.subcategory_key, subcategory_name: cat.subcategory_name })
    }
    setCategories(Object.values(grouped))
  }

  async function onFinish(v: any): Promise<void> {
    setLoading(true)
    try {
      await window.electronAPI.addRecord({
        type: recordType, amount: v.amount, category_key: v.category_key,
        subcategory_key: v.subcategory_key, note: v.note || '',
        record_date: v.record_date.format('YYYY-MM-DD'),
        person: (v.person || '').trim(),
      })
      message.success('保存成功！')
      form.resetFields(); setSelectedCat(null); navigate('/home')
    } catch { message.error('保存失败') }
    finally { setLoading(false) }
  }

  const subs = selectedCat ? categories.find(c => c.category_key === selectedCat)?.subcategories.map(s => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/home')}
          style={{ borderRadius: 10, width: 40, height: 40, fontSize: 16 }}
        />
        <div>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            新增记录
          </Text>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>✏️ 记一笔</div>
        </div>
      </div>

      {/* 类型切换 — 浮出效果 */}
      <div style={{
        background: '#F1F5F9',
        borderRadius: 14,
        padding: 4,
        marginBottom: 24,
      }}>
        <Segmented
          block
          size="large"
          value={recordType}
          onChange={v => setRecordType(v as string)}
          options={[
            { label: '💰 支出', value: 'expense' },
            { label: '💵 收入', value: 'income' },
          ]}
          style={{ background: 'transparent' }}
        />
      </div>

      {/* 主表单卡片 */}
      <Card
        style={{
          borderRadius: 16,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          border: '1px solid #E2E8F0',
        }}
        styles={{ body: { padding: 28 } }}
      >
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ record_date: dayjs() }} size="large">
          {/* 金额 — 最突出 */}
          <Form.Item
            label={<span style={{ fontSize: 13, fontWeight: 600 }}>金额</span>}
            name="amount"
            rules={[
              { required: true, message: '请输入金额' },
              { type: 'number', min: 0.01, message: '金额需大于 0' },
              { type: 'number', max: MAX_AMOUNT, message: `单笔金额不能超过 ${MAX_AMOUNT_TEXT}` },
            ]}
          >
            <InputNumber
              prefix={<span style={{ color: '#94A3B8', fontSize: 22, fontWeight: 600 }}>¥</span>}
              placeholder="0.00"
              style={{ width: '100%', height: 56 }}
              precision={2}
              min={0.01}
              max={MAX_AMOUNT}
              controls={false}
            />
          </Form.Item>

          {/* 日期 */}
          <Form.Item
            label={<span style={{ fontSize: 13, fontWeight: 600 }}>日期</span>}
            name="record_date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%', height: 44 }} allowClear={false} />
          </Form.Item>

          {/* 分类 — 两列 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              label={<span style={{ fontSize: 13, fontWeight: 600 }}>一级分类</span>}
              name="category_key"
              rules={[{ required: true }]}
            >
              <Select
                placeholder="选择大类"
                onChange={v => { setSelectedCat(v); form.setFieldValue('subcategory_key', undefined) }}
                options={categories.map(c => ({ value: c.category_key, label: c.category_name }))}
              />
            </Form.Item>

            <Form.Item
              label={<span style={{ fontSize: 13, fontWeight: 600 }}>二级分类</span>}
              name="subcategory_key"
              rules={[{ required: true }]}
            >
              <Select
                placeholder={selectedCat ? '选择小类' : '先选大类'}
                disabled={!selectedCat}
                options={subs}
              />
            </Form.Item>
          </div>

          {/* 记录人（v0.8.0） */}
          <Form.Item
            label={<span style={{ fontSize: 13, fontWeight: 600 }}>谁花的（可选）</span>}
            name="person"
          >
            <Input
              placeholder="如：爸爸、妈妈、我"
              maxLength={10}
              allowClear
              style={{ borderRadius: 10 }}
            />
          </Form.Item>

          {/* 备注 */}
          <Form.Item
            label={<span style={{ fontSize: 13, fontWeight: 600 }}>备注</span>}
            name="note"
          >
            <Input.TextArea
              placeholder="写点什么…"
              rows={3}
              maxLength={200}
              showCount
              style={{ borderRadius: 10 }}
            />
          </Form.Item>

          {/* 提交按钮 */}
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={loading}
            size="large"
            block
            style={{
              height: 50,
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 12,
              marginTop: 8,
            }}
          >
            保存记录
          </Button>
        </Form>
      </Card>
    </div>
  )
}

export default AddExpensePage
