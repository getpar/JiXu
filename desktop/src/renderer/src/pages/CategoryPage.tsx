import { useState, useEffect } from 'react'
import { Card, Table, Tag, Button, Modal, Form, Input, Select, Typography, Popconfirm, message, Space } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

const MAJOR_CATEGORIES = [
  { key: 'food', name: '餐饮饮食', emoji: '🍜' },
  { key: 'transport', name: '交通出行', emoji: '🚗' },
  { key: 'shopping', name: '购物消费', emoji: '🛒' },
  { key: 'housing', name: '住房居家', emoji: '🏠' },
  { key: 'entertainment', name: '娱乐休闲', emoji: '🎮' },
  { key: 'medical', name: '医疗健康', emoji: '💊' },
  { key: 'education', name: '教育学习', emoji: '📚' },
  { key: 'social', name: '人情往来', emoji: '🎁' },
  { key: 'finance', name: '金融保险', emoji: '💰' },
  { key: 'pet', name: '宠物', emoji: '🐾' },
  { key: 'other', name: '其他杂项', emoji: '📦' },
  { key: 'income', name: '收入来源', emoji: '💵' },
]

function CategoryPage(): JSX.Element {
  const [categories, setCategories] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()


  useEffect(() => { loadData() }, [])

  async function loadData(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    setCategories(raw)
  }

  async function handleDelete(cat: any): Promise<void> {
    const result = await window.electronAPI.deleteCategory(cat.category_key, cat.subcategory_key)
    if (result.success) { message.success('已删除'); loadData() }
    else { message.error(result.error || '删除失败') }
  }

  async function handleAdd(): Promise<void> {
    try {
      const v = await form.validateFields()
      const major = MAJOR_CATEGORIES.find(c => c.key === v.category_key)
      const result = await window.electronAPI.addCategory({
        category_key: v.category_key, category_name: major?.name || v.category_key,
        subcategory_key: v.subcategory_key || `${v.category_key}_${Date.now()}`,
        subcategory_name: v.subcategory_name,
      })
      if (result.success) { message.success('添加成功'); setModalOpen(false); form.resetFields(); loadData() }
      else { message.error(result.error || '添加失败') }
    } catch { /* validation error */ }
  }

  const grouped: Record<string, { key: string; name: string; subs: any[] }> = {}
  for (const c of categories) {
    if (!grouped[c.category_key]) grouped[c.category_key] = { key: c.category_key, name: c.category_name, subs: [] }
    grouped[c.category_key].subs.push(c)
  }

  const columns = [
    {
      title: '二级分类', dataIndex: 'subcategory_name', key: 'name',
      render: (v: string) => <Text strong style={{ fontSize: 14 }}>{v}</Text>,
    },
    {
      title: '标识', dataIndex: 'subcategory_key', key: 'key',
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: '类型', key: 'is_default', width: 80,
      render: (_: any, r: any) => r.is_default
        ? <Tag color="blue" style={{ borderRadius: 6 }}>默认</Tag>
        : <Tag color="orange" style={{ borderRadius: 6 }}>自定义</Tag>,
    },
    {
      title: '操作', key: 'act', width: 80,
      render: (_: any, r: any) => (
        <Popconfirm
          title={r.is_default ? '默认分类不可删除' : '确定删除？'}
          disabled={!!r.is_default}
          onConfirm={() => handleDelete(r)}
        >
          <Button type="link" danger icon={<DeleteOutlined />} disabled={!!r.is_default} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          分类管理
        </Text>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>🏷️ 收支分类</div>
      </div>

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
          style={{ borderRadius: 10, height: 40 }}
        >
          添加分类
        </Button>
        <Text type="secondary" style={{ fontSize: 13 }}>
          默认分类不可删除，自定义分类可自由添加和删除
        </Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {Object.values(grouped).map(g => {
          const major = MAJOR_CATEGORIES.find(m => m.key === g.key)
          return (
            <Card
              key={g.key}
              title={
                <Space size={4}>
                  <span style={{ fontSize: 14 }}>{major?.emoji || '📌'}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</span>
                  <Tag style={{ borderRadius: 6, marginLeft: 4, fontSize: 11 }}>{g.subs.length}</Tag>
                </Space>
              }
              size="small"
              styles={{ body: { padding: '8px 12px' } }}
            >
              <Table
                columns={columns}
                dataSource={g.subs}
                rowKey="subcategory_key"
                pagination={false}
                size="small"
                style={{ fontSize: 12 }}
              />
            </Card>
          )
        })}
      </div>

      <Modal
        title="添加自定义分类"
        open={modalOpen}
        onOk={handleAdd}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        okText="添加"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="所属大类" name="category_key" rules={[{ required: true }]}>
            <Select
              placeholder="选择大类"
              options={MAJOR_CATEGORIES.map(c => ({
                value: c.key,
                label: `${c.emoji} ${c.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="分类名称" name="subcategory_name" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="例如：猫粮猫砂、游戏周边" />
          </Form.Item>
          <Form.Item label="标识（英文，自动生成）" name="subcategory_key">
            <Input placeholder="自动生成可不填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CategoryPage
