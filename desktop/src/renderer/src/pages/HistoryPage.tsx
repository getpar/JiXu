import { useState, useEffect } from 'react'
import {
  Card, Table, Tag, Select, DatePicker, Input, Space, Typography,
  Popconfirm, message, Button, Modal, Form, InputNumber, Segmented,
} from 'antd'
import { DeleteOutlined, ReloadOutlined, DownloadOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import * as XLSX from 'xlsx'

const { Title, Text } = Typography
const { Search } = Input

interface CategoryGroup { category_key: string; category_name: string; subcategories: { subcategory_key: string; subcategory_name: string }[] }

function HistoryPage(): JSX.Element {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs())
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [selectedType, setSelectedType] = useState<string | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [catGroups, setCatGroups] = useState<CategoryGroup[]>([])
  const pageSize = 15

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<any>(null)
  const [editForm] = Form.useForm()
  const [editSelCat, setEditSelCat] = useState<string | null>(null)

  useEffect(() => { loadCategories() }, [])
  useEffect(() => { loadData() }, [page, selectedMonth, selectedCategory, selectedType, keyword])

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const seen = new Set<string>(); const unique: any[] = []
    const grouped: Record<string, CategoryGroup> = {}
    for (const c of raw) {
      if (!seen.has(c.category_key)) { seen.add(c.category_key); unique.push({ value: c.category_key, label: c.category_name }) }
      if (!grouped[c.category_key]) grouped[c.category_key] = { category_key: c.category_key, category_name: c.category_name, subcategories: [] }
      grouped[c.category_key].subcategories.push({ subcategory_key: c.subcategory_key, subcategory_name: c.subcategory_name })
    }
    setCategories(unique)
    setCatGroups(Object.values(grouped))
  }

  async function loadData(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.electronAPI.getRecordList({
        page, pageSize, month: selectedMonth.format('YYYY-MM'),
        category_key: selectedCategory, type: selectedType, keyword: keyword || undefined,
      })
      setData(result.rows); setTotal(result.total)
    } catch { message.error('加载失败') }
    finally { setLoading(false) }
  }

  async function handleDelete(id: number): Promise<void> {
    await window.electronAPI.deleteRecord(id)
    message.success('删除成功')
    setSelectedRowKeys(prev => prev.filter(k => k !== id))
    loadData()
  }

  async function handleBatchDelete(): Promise<void> {
    for (const id of selectedRowKeys) {
      await window.electronAPI.deleteRecord(id as number)
    }
    message.success(`已删除 ${selectedRowKeys.length} 条记录`)
    setSelectedRowKeys([])
    loadData()
  }

  function openEditModal(record: any): void {
    setEditingRecord(record)
    setEditSelCat(record.category_key)
    editForm.setFieldsValue({
      type: record.type,
      amount: record.amount,
      category_key: record.category_key,
      subcategory_key: record.subcategory_key,
      note: record.note,
      person: record.person || '',
      record_date: dayjs(record.record_date || record.expense_date),
    })
    setEditModalOpen(true)
  }

  async function handleEditSubmit(): Promise<void> {
    try {
      const v = await editForm.validateFields()
      await window.electronAPI.updateRecord(editingRecord.id, {
        type: v.type,
        amount: v.amount,
        category_key: v.category_key,
        subcategory_key: v.subcategory_key,
        note: v.note || '',
        person: (v.person || '').trim(),
        record_date: v.record_date.format('YYYY-MM-DD'),
      })
      message.success('修改成功')
      setEditModalOpen(false)
      loadData()
    } catch { /* validation error */ }
  }

  async function handleExport(): Promise<void> {
    const exportData = await window.electronAPI.exportAll(selectedMonth.format('YYYY-MM'), selectedType)
    if (exportData.length === 0) { message.warning('无数据可导出'); return }
    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '账单')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const result = await window.electronAPI.saveFile(`计序_${selectedMonth.format('YYYY-MM')}.xlsx`, Array.from(new Uint8Array(buf)))
    if (result.success) message.success(`已导出到：${result.path}`)
  }

  async function handleExportCSV(): Promise<void> {
    const exportData = await window.electronAPI.exportAll(selectedMonth.format('YYYY-MM'), selectedType)
    if (exportData.length === 0) { message.warning('无数据可导出'); return }
    // 手动生成 CSV（支持中文 BOM，Excel 可正确打开）
    const BOM = '﻿'
    const headers = ['日期', '类型', '一级分类', '二级分类', '金额', '记录人', '备注']
    const rows = exportData.map((r: any) => [
      r['日期'] || r.date || '', r['类型'] || r.type || '',
      r['一级分类'] || r.category_name || '', r['二级分类'] || r.subcategory_name || '',
      r['金额'] || r.amount || '', r['记录人'] || r.person || '', (r['备注'] || r.note || '').replace(/,/g, '，'),
    ])
    const csv = BOM + headers.join(',') + '\n' + rows.map((r: string[]) => r.join(',')).join('\n')
    const buf = new TextEncoder().encode(csv)
    const result = await window.electronAPI.saveFile(
      `计序_${selectedMonth.format('YYYY-MM')}.csv`,
      Array.from(buf),
    )
    if (result.success) message.success(`CSV 已导出到：${result.path}`)
  }

  const monthTotal = data.reduce((sum, d) => sum + (d.type === 'income' ? d.amount : -d.amount), 0)
  const expenseSum = data.filter(d => d.type === 'expense').reduce((s, d) => s + d.amount, 0)
  const incomeSum = data.filter(d => d.type === 'income').reduce((s, d) => s + d.amount, 0)

  const editSubs = editSelCat ? catGroups.find(c => c.category_key === editSelCat)?.subcategories.map(s => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  const columns = [
    {
      title: '日期', dataIndex: 'record_date', key: 'date', width: 110,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{v || '-'}</Text>,
      sorter: (a: any, b: any) => (a.record_date || '').localeCompare(b.record_date || ''),
    },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 70,
      render: (t: string) => (
        <Tag color={t === 'income' ? 'success' : 'error'} style={{ borderRadius: 6 }}>
          {t === 'income' ? '收入' : '支出'}
        </Tag>
      ),
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
      title: '金额', dataIndex: 'amount', key: 'amount', width: 120,
      render: (a: number, r: any) => (
        <span style={{
          color: r.type === 'income' ? '#10B981' : '#EF4444',
          fontWeight: 700,
          fontSize: 15,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {r.type === 'income' ? '+' : '-'}¥{a.toFixed(2)}
        </span>
      ),
      sorter: (a: any, b: any) => a.amount - b.amount,
    },
    {
      title: '记录人', dataIndex: 'person', key: 'person', width: 90,
      render: (p: string) => (p ? <Tag color="orange" style={{ borderRadius: 6 }}>{p}</Tag> : <Text type="secondary" style={{ fontSize: 13 }}>-</Text>),
    },
    {
      title: '备注', dataIndex: 'note', key: 'note', ellipsis: true,
      render: (n: string) => <Text type="secondary" style={{ fontSize: 13 }}>{n || '-'}</Text>,
    },
    {
      title: '操作', key: 'act', width: 120,
      render: (_: any, r: any) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)} style={{ color: '#FF6B35' }}>
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  }

  return (
    <div>
      {/* 标题行 */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            账单明细
          </Text>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1E293B' }}>📋 所有记录</div>
        </div>
      </div>

      <Card styles={{ body: { padding: 24 } }}>
        {/* 筛选栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
          flexWrap: 'wrap', padding: '16px 20px',
          background: '#F8FAFC', borderRadius: 12,
        }}>
          <DatePicker
            picker="month"
            value={selectedMonth}
            onChange={d => { setSelectedMonth(d || dayjs()); setPage(1) }}
            allowClear={false}
            format="YYYY年M月"
            style={{ borderRadius: 10 }}
          />
          <Select
            placeholder="全部类别"
            allowClear
            style={{ width: 130, borderRadius: 10 }}
            value={selectedCategory}
            onChange={v => { setSelectedCategory(v); setPage(1) }}
            options={categories}
          />
          <Select
            placeholder="全部类型"
            allowClear
            style={{ width: 100, borderRadius: 10 }}
            value={selectedType}
            onChange={v => { setSelectedType(v); setPage(1) }}
            options={[{ value: 'expense', label: '支出' }, { value: 'income', label: '收入' }]}
          />
          <Search
            placeholder="搜索备注/分类"
            allowClear
            style={{ width: 220 }}
            onSearch={v => { setKeyword(v); setPage(1) }}
            enterButton={<SearchOutlined />}
          />
          <div style={{ flex: 1 }} />
          <Button icon={<ReloadOutlined />} onClick={loadData} style={{ borderRadius: 10 }}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} type="primary" onClick={handleExport} style={{ borderRadius: 10 }}>
            导出 Excel
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportCSV} style={{ borderRadius: 10 }}>
            导出 CSV
          </Button>
          {selectedRowKeys.length > 0 && (
            <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 条记录？`} onConfirm={handleBatchDelete}>
              <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 10 }}>
                删除选中 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
        </div>

        {/* 汇总栏 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 20,
          padding: '12px 20px', marginBottom: 16,
          background: 'linear-gradient(135deg, #F8FAFC, #FFF)',
          borderRadius: 12, border: '1px solid #E2E8F0',
        }}>
          <Text type="secondary" style={{ fontSize: 13 }}>{selectedMonth.format('M月')}汇总：</Text>
          <Text strong style={{ color: '#EF4444', fontSize: 15 }}>
            支出 ¥{expenseSum.toFixed(2)}
          </Text>
          <Text strong style={{ color: '#10B981', fontSize: 15 }}>
            收入 ¥{incomeSum.toFixed(2)}
          </Text>
          <Text strong style={{ color: monthTotal >= 0 ? '#10B981' : '#EF4444', fontSize: 15 }}>
            结余 ¥{monthTotal.toFixed(2)}
          </Text>
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 13 }}>共 {total} 条记录</Text>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: p => setPage(p),
            showTotal: t => `共 ${t} 条`,
            showSizeChanger: false,
          }}
          size="middle"
          style={{ borderRadius: 12, overflow: 'hidden' }}
        />
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑记录"
        open={editModalOpen}
        onOk={handleEditSubmit}
        onCancel={() => setEditModalOpen(false)}
        okText="保存修改"
        cancelText="取消"
        width={500}
      >
        {editingRecord && (
          <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="类型" name="type">
              <Segmented
                block
                options={[
                  { label: '💰 支出', value: 'expense' },
                  { label: '💵 收入', value: 'income' },
                ]}
              />
            </Form.Item>
            <Form.Item label="金额" name="amount" rules={[{ required: true }, { type: 'number', min: 0.01 }]}>
              <InputNumber prefix="¥" style={{ width: '100%', borderRadius: 10 }} precision={2} />
            </Form.Item>
            <Form.Item label="日期" name="record_date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%', borderRadius: 10 }} allowClear={false} />
            </Form.Item>
            <Form.Item label="一级分类" name="category_key" rules={[{ required: true }]}>
              <Select
                onChange={v => { setEditSelCat(v); editForm.setFieldValue('subcategory_key', undefined) }}
                options={catGroups.map(c => ({ value: c.category_key, label: c.category_name }))}
              />
            </Form.Item>
            <Form.Item label="二级分类" name="subcategory_key" rules={[{ required: true }]}>
              <Select disabled={!editSelCat} options={editSubs} />
            </Form.Item>
            <Form.Item label="记录人（谁花的，可选）" name="person">
              <Input placeholder="如：爸爸、妈妈、我" maxLength={10} style={{ borderRadius: 10 }} />
            </Form.Item>
            <Form.Item label="备注" name="note">
              <Input.TextArea rows={2} maxLength={200} style={{ borderRadius: 10 }} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  )
}

export default HistoryPage
