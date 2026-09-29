import { MAX_AMOUNT, MAX_AMOUNT_TEXT } from '../utils/money'
import { useState, useEffect } from 'react'
import { Card, Form, InputNumber, Select, Input, DatePicker, Button, Typography, message, Segmented } from 'antd'
import { SaveOutlined, ThunderboltOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface CategoryGroup { category_key: string; category_name: string; subcategories: { subcategory_key: string; subcategory_name: string }[] }

function QuickAddPage(): JSX.Element {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [recordType, setRecordType] = useState<string>('expense')

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
      })
      message.success('记录成功！')
      form.resetFields(); setSelectedCat(null)
    } catch { message.error('保存失败') }
    finally { setLoading(false) }
  }

  const subs = selectedCat ? categories.find(c => c.category_key === selectedCat)?.subcategories.map(s => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 8 }}>
      {/* 标题 */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'linear-gradient(135deg, #FFF0E8, #FFD4BC)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          ⚡
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1E293B' }}>快速记账</div>
          <Text type="secondary" style={{ fontSize: 12 }}>快捷键 Ctrl+Shift+N</Text>
        </div>
      </div>

      <Card
        style={{ borderRadius: 16, border: '1px solid #E2E8F0' }}
        styles={{ body: { padding: 24 } }}
      >
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ record_date: dayjs() }} size="large">
          <Form.Item label={<span style={{ fontSize: 13, fontWeight: 600 }}>类型</span>}>
            <Segmented
              block
              value={recordType}
              onChange={v => setRecordType(v as string)}
              options={[
                { label: '💰 支出', value: 'expense' },
                { label: '💵 收入', value: 'income' },
              ]}
            />
          </Form.Item>

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
              prefix={<span style={{ color: '#94A3B8', fontSize: 20, fontWeight: 600 }}>¥</span>}
              placeholder="0.00"
              style={{ width: '100%', height: 50 }}
              precision={2}
              min={0.01}
              max={MAX_AMOUNT}
              controls={false}
              autoFocus
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ fontSize: 13, fontWeight: 600 }}>日期</span>}
            name="record_date"
            rules={[{ required: true }]}
          >
            <DatePicker style={{ width: '100%', height: 44 }} allowClear={false} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item
              label={<span style={{ fontSize: 13, fontWeight: 600 }}>大类</span>}
              name="category_key"
              rules={[{ required: true }]}
            >
              <Select
                placeholder="选择"
                onChange={v => { setSelectedCat(v); form.setFieldValue('subcategory_key', undefined) }}
                options={categories.map(c => ({ value: c.category_key, label: c.category_name }))}
              />
            </Form.Item>

            <Form.Item
              label={<span style={{ fontSize: 13, fontWeight: 600 }}>小类</span>}
              name="subcategory_key"
              rules={[{ required: true }]}
            >
              <Select
                placeholder={selectedCat ? '选择' : '先选大类'}
                disabled={!selectedCat}
                options={subs}
              />
            </Form.Item>
          </div>

          <Form.Item label={<span style={{ fontSize: 13, fontWeight: 600 }}>备注</span>} name="note">
            <Input placeholder="可选" maxLength={200} style={{ borderRadius: 10 }} />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={loading}
            size="large"
            block
            style={{ height: 48, fontSize: 15, fontWeight: 600, borderRadius: 12 }}
          >
            保存
          </Button>
        </Form>
      </Card>
    </div>
  )
}

export default QuickAddPage
