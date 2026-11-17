import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Popconfirm, message } from 'antd'
import { Mod, Icon, CatIcon, p2 } from '../components/ui'
import type { Category } from '../types/electron'

const MAJOR_CATEGORIES = [
  { key: 'food', name: '餐饮饮食' },
  { key: 'transport', name: '交通出行' },
  { key: 'shopping', name: '购物消费' },
  { key: 'housing', name: '住房居家' },
  { key: 'entertainment', name: '娱乐休闲' },
  { key: 'medical', name: '医疗健康' },
  { key: 'education', name: '教育学习' },
  { key: 'social', name: '人情往来' },
  { key: 'finance', name: '金融保险' },
  { key: 'pet', name: '宠物' },
  { key: 'other', name: '其他杂项' },
  { key: 'income', name: '收入来源' },
]

function CategoryPage(): JSX.Element {
  const [categories, setCategories] = useState<Category[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => { loadData() }, [])

  async function loadData(): Promise<void> {
    setCategories(await window.electronAPI.getCategories())
  }

  async function handleDelete(cat: Category): Promise<void> {
    const result = await window.electronAPI.deleteCategory(cat.category_key, cat.subcategory_key)
    if (result.success) { message.success('已删除'); loadData() }
    else { message.error(result.error || '删除失败') }
  }

  async function handleAdd(): Promise<void> {
    try {
      const v = await form.validateFields()
      const major = MAJOR_CATEGORIES.find((c) => c.key === v.category_key)
      const result = await window.electronAPI.addCategory({
        category_key: v.category_key,
        category_name: major?.name || v.category_key,
        subcategory_key: v.subcategory_key || `${v.category_key}_${Date.now()}`,
        subcategory_name: v.subcategory_name,
      })
      if (result.success) { message.success('添加成功'); setModalOpen(false); form.resetFields(); loadData() }
      else { message.error(result.error || '添加失败') }
    } catch { /* validation error */ }
  }

  const grouped: Record<string, { key: string; name: string; subs: Category[] }> = {}
  for (const c of categories) {
    if (!grouped[c.category_key]) grouped[c.category_key] = { key: c.category_key, name: c.category_name, subs: [] }
    grouped[c.category_key].subs.push(c)
  }
  const groups = Object.values(grouped)
  const totalSubs = categories.length

  return (
    <>
      <Mod
        className="mb8"
        title="收支分类"
        en={`CATEGORIES · ${groups.length} 大类 / ${totalSubs} 小类`}
        right={
          <button className="mini ac" onClick={() => setModalOpen(true)}>
            <Icon n="add" cls="s" />
            添加分类
          </button>
        }
      >
        <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.7 }}>
          默认分类不可删除，自定义分类可自由添加和删除。分类名称会出现在记一笔、账单与统计里。
        </p>
      </Mod>

      <div className="catgrid">
        {groups.map((g, gi) => (
          <Mod key={g.key} id={`C-${p2(gi + 1)}`} title={g.name} en={`${g.subs.length} SUB`} right={<span className="pict"><CatIcon k={g.key} /></span>}>
            {g.subs.map((s) => (
              <div className="catrow" key={s.subcategory_key}>
                <span className="pict" style={{ width: 22, height: 22 }}>
                  <CatIcon k={g.key} cls="s" />
                </span>
                <span className="nm">{s.subcategory_name}</span>
                <span className="key">{s.subcategory_key}</span>
                <span className={`tag${s.is_default ? '' : ' ac'}`}>{s.is_default ? '默认' : '自定义'}</span>
                <Popconfirm
                  title={s.is_default ? '默认分类不可删除' : '确定删除？'}
                  disabled={!!s.is_default}
                  onConfirm={() => handleDelete(s)}
                >
                  <button className="ib del" disabled={!!s.is_default} aria-label="删除分类">
                    <Icon n="trash" cls="s" />
                  </button>
                </Popconfirm>
              </div>
            ))}
          </Mod>
        ))}
      </div>

      <Modal
        title="添加自定义分类"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        width={440}
        footer={[
          <button key="c" className="mini" style={{ marginRight: 8 }} onClick={() => { setModalOpen(false); form.resetFields() }}>取消</button>,
          <button key="a" className="mini ac" onClick={handleAdd}>添加</button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item label="所属大类" name="category_key" rules={[{ required: true }]}>
            <Select
              placeholder="选择大类"
              options={MAJOR_CATEGORIES.map((c) => ({ value: c.key, label: c.name }))}
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
    </>
  )
}

export default CategoryPage
