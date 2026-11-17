import { useState, useEffect, useMemo } from 'react'
import { Input, DatePicker, Select, Form, InputNumber, Popconfirm, message, Pagination, Modal } from 'antd'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import {
  Mod, Icon, CatIcon, Ro, Seg, F, p2, dateLabel, weekday, todayStr, monthEn,
} from '../components/ui'
import { sumAmounts, MAX_AMOUNT } from '../utils/money'
import type { MonthlyStat, RecordItem, Category } from '../types/electron'

interface CategoryGroup {
  category_key: string
  category_name: string
  subcategories: { subcategory_key: string; subcategory_name: string }[]
}

const PAGE_SIZE = 15

function HistoryPage(): JSX.Element {
  const [data, setData] = useState<RecordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7))
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined)
  const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income'>('all')
  const [keyword, setKeyword] = useState('')
  const [q, setQ] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [catGroups, setCatGroups] = useState<CategoryGroup[]>([])
  const [monthStats, setMonthStats] = useState<MonthlyStat[]>([])
  const [monthExp, setMonthExp] = useState(0)
  const [monthInc, setMonthInc] = useState(0)
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([])
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null)
  const [editForm] = Form.useForm()
  const [editSelCat, setEditSelCat] = useState<string | null>(null)

  useEffect(() => { loadCategories() }, [])
  useEffect(() => { loadData() }, [page, selectedMonth, selectedCategory, selectedType, keyword])
  useEffect(() => { loadReadout() }, [selectedMonth, selectedType, selectedCategory])

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const seen = new Set<string>()
    const unique: Category[] = []
    const grouped: Record<string, CategoryGroup> = {}
    for (const c of raw) {
      if (!seen.has(c.category_key)) { seen.add(c.category_key); unique.push(c) }
      if (!grouped[c.category_key]) grouped[c.category_key] = { category_key: c.category_key, category_name: c.category_name, subcategories: [] }
      grouped[c.category_key].subcategories.push({ subcategory_key: c.subcategory_key, subcategory_name: c.subcategory_name })
    }
    setCategories(unique)
    setCatGroups(Object.values(grouped))
  }

  async function loadData(): Promise<void> {
    try {
      const result = await window.electronAPI.getRecordList({
        page,
        pageSize: PAGE_SIZE,
        month: selectedMonth,
        category_key: selectedCategory,
        type: selectedType === 'all' ? undefined : selectedType,
        keyword: keyword || undefined,
      })
      setData(result.rows)
      setTotal(result.total)
    } catch { message.error('加载失败') }
  }

  async function loadReadout(): Promise<void> {
    const [exp, inc, st] = await Promise.all([
      window.electronAPI.getMonthlyTotal(selectedMonth, 'expense'),
      window.electronAPI.getMonthlyTotal(selectedMonth, 'income'),
      window.electronAPI.getMonthlyStats(selectedMonth, selectedType === 'income' ? 'income' : 'expense'),
    ])
    setMonthExp(exp)
    setMonthInc(inc)
    setMonthStats(st)
  }

  async function handleDelete(id: number): Promise<void> {
    await window.electronAPI.deleteRecord(id)
    message.success('删除成功')
    setSelectedRowKeys((prev) => prev.filter((k) => k !== id))
    loadData()
  }

  async function handleBatchDelete(): Promise<void> {
    for (const id of selectedRowKeys) {
      await window.electronAPI.deleteRecord(id)
    }
    message.success(`已删除 ${selectedRowKeys.length} 条记录`)
    setSelectedRowKeys([])
    loadData()
  }

  function openEditModal(record: RecordItem): void {
    setEditingRecord(record)
    setEditSelCat(record.category_key)
    editForm.setFieldsValue({
      type: record.type,
      amount: record.amount,
      category_key: record.category_key,
      subcategory_key: record.subcategory_key,
      note: record.note,
      person: record.person || '',
      record_date: dayjs(record.record_date),
    })
    setEditModalOpen(true)
  }

  async function handleEditSubmit(): Promise<void> {
    try {
      const v = await editForm.validateFields()
      if (!editingRecord) return
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
      loadReadout()
    } catch { /* validation error */ }
  }

  async function handleExport(): Promise<void> {
    const exportData = await window.electronAPI.exportAll(selectedMonth, selectedType === 'all' ? undefined : selectedType)
    if (exportData.length === 0) { message.warning('无数据可导出'); return }
    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '账单')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const result = await window.electronAPI.saveFile(`计序_${selectedMonth}.xlsx`, Array.from(new Uint8Array(buf)))
    if (result.success) message.success(`已导出到：${result.path}`)
  }

  async function handleExportCSV(): Promise<void> {
    const exportData = await window.electronAPI.exportAll(selectedMonth, selectedType === 'all' ? undefined : selectedType)
    if (exportData.length === 0) { message.warning('无数据可导出'); return }
    // 手动生成 CSV（支持中文 BOM，Excel 可正确打开）
    const BOM = '\ufeff'
    const headers = ['日期', '类型', '一级分类', '二级分类', '金额', '记录人', '备注']
    const rows = exportData.map((r: Record<string, unknown>) => [
      r['日期'] || r.date || '', r['类型'] || r.type || '',
      r['一级分类'] || r.category_name || '', r['二级分类'] || r.subcategory_name || '',
      r['金额'] || r.amount || '', r['记录人'] || r.person || '',
      String(r['备注'] || r.note || '').replace(/,/g, '，'),
    ])
    const csv = BOM + headers.join(',') + '\n' + rows.map((r: unknown[]) => r.join(',')).join('\n')
    const buf = new TextEncoder().encode(csv)
    const result = await window.electronAPI.saveFile(`计序_${selectedMonth}.csv`, Array.from(buf))
    if (result.success) message.success(`CSV 已导出到：${result.path}`)
  }

  const editSubs = editSelCat ? catGroups.find((c) => c.category_key === editSelCat)?.subcategories.map((s) => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  const expenseSum = sumAmounts(data.filter((d) => d.type === 'expense').map((d) => d.amount))
  const incomeSum = sumAmounts(data.filter((d) => d.type === 'income').map((d) => d.amount))

  const groups = useMemo(() => {
    const out: Array<{ date: string; rows: RecordItem[] }> = []
    for (const r of data) {
      const last = out[out.length - 1]
      if (last && last.date === r.record_date) last.rows.push(r)
      else out.push({ date: r.record_date, rows: [r] })
    }
    return out
  }, [data])

  const months = useMemo(() => {
    const cur = dayjs(todayStr())
    return Array.from({ length: 6 }, (_, i) => cur.subtract(i, 'month').format('YYYY-MM'))
  }, [])

  const allCats = useMemo(
    () => monthStats.slice(0, 12),
    [monthStats],
  )

  const typeLabel = selectedType === 'income' ? '收入' : selectedType === 'expense' ? '支出' : '全部'

  return (
    <>
      <Mod className="mb8">
        <div className="fbar">
          <div className={`search${q ? ' has' : ''}`}>
            <Icon n="search" cls="s" />
            <input
              value={q}
              placeholder="搜索备注或分类，例如：午餐、猫"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { setKeyword(q); setPage(1) }
              }}
              aria-label="搜索账单"
            />
            <button
              className="x"
              onClick={() => { setQ(''); setKeyword(''); setPage(1) }}
              aria-label="清空搜索"
            >
              <Icon n="x" cls="s" />
            </button>
          </div>
          <Seg
            value={selectedType}
            onChange={(v) => { setSelectedType(v); setPage(1) }}
            options={[['all', '全部'], ['expense', '支出'], ['income', '收入']]}
          />
          <div className="chips scroll">
            <button
              className={`chip${!selectedCategory ? ' on' : ''}`}
              onClick={() => { setSelectedCategory(undefined); setPage(1) }}
            >
              全部类别
            </button>
            {allCats.map((c) => (
              <button
                key={c.category_key}
                className={`chip${selectedCategory === c.category_key ? ' on' : ''}`}
                onClick={() => { setSelectedCategory(c.category_key); setPage(1) }}
              >
                <CatIcon k={c.category_key} />
                {c.category_name}
              </button>
            ))}
          </div>
          <div className="chips">
            <button
              className={`chip${selectedMonth === todayStr().slice(0, 7) ? ' on' : ''}`}
              onClick={() => { setSelectedMonth(todayStr().slice(0, 7)); setPage(1) }}
            >
              本月
            </button>
            {months.map((m) => (
              <button
                key={m}
                className={`chip${selectedMonth === m ? ' on' : ''}`}
                onClick={() => { setSelectedMonth(m); setPage(1) }}
              >
                {Number(m.slice(5, 7))}月
              </button>
            ))}
            <DatePicker
              picker="month"
              value={dayjs(selectedMonth + '-01')}
              onChange={(d) => { setSelectedMonth((d || dayjs()).format('YYYY-MM')); setPage(1) }}
              allowClear={false}
              format="YYYY.MM"
              className="bdate"
              inputReadOnly
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button className="mini" onClick={() => { loadData(); loadReadout() }}>
              <Icon n="refresh" cls="s" />
              刷新
            </button>
            <button className="mini" onClick={handleExport}>
              <Icon n="down" cls="s" />
              Excel
            </button>
            <button className="mini" onClick={handleExportCSV}>
              <Icon n="down" cls="s" />
              CSV
            </button>
          </div>
        </div>
      </Mod>

      <div className="hlay">
        <Mod
          id="L-01"
          className="logm"
          title="账单"
          en={`LOG · ${monthEn(selectedMonth)} · ${typeLabel}`}
          right={<span className="lb">{total} 条</span>}
        >
          {selectedRowKeys.length > 0 && (
            <div className="batch on" style={{ margin: '0 0 8px' }}>
              <span className="num">已选 {selectedRowKeys.length} 条</span>
              <span className="sp" style={{ flex: 1 }} />
              <button onClick={() => setSelectedRowKeys([])}>取消</button>
              <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 条记录？`} onConfirm={handleBatchDelete}>
                <button className="bd">删除</button>
              </Popconfirm>
            </div>
          )}
          {groups.length === 0 && (
            <div className="nosig">
              <b>这个月没有匹配的记录</b>
              <p>换个关键词或月份试试</p>
            </div>
          )}
          {groups.map((g) => {
            const e = sumAmounts(g.rows.filter((x) => x.type === 'expense').map((x) => x.amount))
            const i = sumAmounts(g.rows.filter((x) => x.type === 'income').map((x) => x.amount))
            return (
              <div className="day" key={g.date}>
                <div className="dh">
                  <b>{dateLabel(g.date)}</b>
                  <span className="m">
                    {g.date.slice(5).replace('-', '.')} {weekday(g.date)}
                  </span>
                  <span className="sum">
                    <span>{g.rows.length} 笔</span>
                    {e > 0 && <span>−{F(e)}</span>}
                    {i > 0 && <span className="in">+{F(i)}</span>}
                  </span>
                </div>
                {g.rows.map((r) => {
                  const inc = r.type === 'income'
                  const on = selectedRowKeys.includes(r.id)
                  return (
                    <div className={`row hrow${on ? ' on' : ''}`} key={r.id}>
                      <div className="rw">
                        <button
                          className="sel"
                          onClick={() => setSelectedRowKeys((prev) => (on ? prev.filter((k) => k !== r.id) : [...prev, r.id]))}
                          aria-label="选择"
                        >
                          <span className={`chk${on ? ' on' : ''}`}>
                            <Icon n="ok" cls="s" />
                          </span>
                        </button>
                        <span className="pict">
                          <CatIcon k={r.category_key} />
                        </span>
                        <span className="tx">
                          <b>{r.subcategory_name}</b>
                          <i>{r.note || r.category_name}</i>
                        </span>
                        <span className={`who${r.person === '阿念' ? ' n' : ''}`}>{r.person || '我'}</span>
                        <span className="tm">{(r.created_at || '').slice(11, 16)}</span>
                        <span className="ph" />
                        <span className={`amt${inc ? ' in' : ''}`}>
                          {inc ? '+' : '−'}
                          {F(r.amount)}
                        </span>
                        <span className="acts">
                          <button className="ib" onClick={() => openEditModal(r)} aria-label="编辑">
                            <Icon n="edit" cls="s" />
                          </button>
                          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
                            <button className="ib del" aria-label="删除">
                              <Icon n="trash" cls="s" />
                            </button>
                          </Popconfirm>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {total > PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                onChange={(p) => setPage(p)}
                showSizeChanger={false}
                size="small"
              />
            </div>
          )}
        </Mod>

        <Mod id="L-02" className="side" title="读数" en="READOUT">
          <div className="ro">
            <span className="lb">
              <b>筛选结果</b>MATCHED
            </span>
            <span className="v num">
              {p2(total)}
              <small className="u">条</small>
            </span>
          </div>
          <Ro cn="本页支出" en="OUT" v={expenseSum} />
          <Ro cn="本页收入" en="IN" v={incomeSum} cls="inc" />
          <div className="kv" style={{ borderTop: 0, marginTop: 10 }}>
            <span>
              {Number(selectedMonth.slice(5, 7))}月合计
            </span>
            <span className="num">
              −{F(monthExp)} / +{F(monthInc)}
            </span>
          </div>
          <span className="lb" style={{ display: 'block', marginTop: 14 }}>
            <b>分类</b>CATEGORY
          </span>
          <div className="clist">
            <button
              className={`cl${!selectedCategory ? ' on' : ''}`}
              onClick={() => { setSelectedCategory(undefined); setPage(1) }}
            >
              <Icon n="tag" cls="s" />
              <span>全部类别</span>
              <span className="num">{total}</span>
            </button>
            {monthStats.map((c) => (
              <button
                key={c.category_key}
                className={`cl${selectedCategory === c.category_key ? ' on' : ''}`}
                onClick={() => { setSelectedCategory(c.category_key); setPage(1) }}
              >
                <CatIcon k={c.category_key} cls="s" />
                <span>{c.category_name}</span>
                <span className="num">¥{F(c.total, 0)}</span>
              </button>
            ))}
          </div>
        </Mod>
      </div>

      <Modal
        title="编辑记录"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        width={520}
        footer={[
          <button key="c" className="mini" style={{ marginRight: 8 }} onClick={() => setEditModalOpen(false)}>取消</button>,
          <button key="s" className="mini ac" onClick={handleEditSubmit}>保存修改</button>,
        ]}
      >
        {editingRecord && (
          <Form form={editForm} layout="vertical" style={{ marginTop: 8 }}>
            <Form.Item label="类型" name="type">
              <Select
                options={[
                  { value: 'expense', label: '支出' },
                  { value: 'income', label: '收入' },
                ]}
              />
            </Form.Item>
            <Form.Item label="金额" name="amount" rules={[{ required: true }, { type: 'number', min: 0.01, max: MAX_AMOUNT }]}>
              <InputNumber prefix="¥" style={{ width: '100%' }} precision={2} />
            </Form.Item>
            <Form.Item label="日期" name="record_date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} allowClear={false} />
            </Form.Item>
            <Form.Item label="一级分类" name="category_key" rules={[{ required: true }]}>
              <Select
                onChange={(v) => { setEditSelCat(v); editForm.setFieldValue('subcategory_key', undefined) }}
                options={catGroups.map((c) => ({ value: c.category_key, label: c.category_name }))}
              />
            </Form.Item>
            <Form.Item label="二级分类" name="subcategory_key" rules={[{ required: true }]}>
              <Select disabled={!editSelCat} options={editSubs} />
            </Form.Item>
            <Form.Item label="记录人（谁花的，可选）" name="person">
              <Input placeholder="如：爸爸、妈妈、我" maxLength={10} />
            </Form.Item>
            <Form.Item label="备注" name="note">
              <Input.TextArea rows={2} maxLength={200} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </>
  )
}

export default HistoryPage
