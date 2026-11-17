import { useState, useEffect } from 'react'
import { DatePicker, Input, Select, message } from 'antd'
import dayjs from 'dayjs'
import { Mod, Icon, CatIcon, Seg, F, dateLabel, todayStr } from '../components/ui'
import { parseAmountInput, sanitizeAmountInput, MAX_AMOUNT_TEXT } from '../utils/money'

interface CategoryGroup {
  category_key: string
  category_name: string
  subcategories: { subcategory_key: string; subcategory_name: string }[]
}

function QuickAddPage(): JSX.Element {
  const [recordType, setRecordType] = useState<'expense' | 'income'>('expense')
  const [expr, setExpr] = useState('')
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [cat, setCat] = useState<string | null>(null)
  const [sub, setSub] = useState<string | null>(null)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { loadCategories() }, [])

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const grouped: Record<string, CategoryGroup> = {}
    for (const c of raw) {
      if (!grouped[c.category_key]) grouped[c.category_key] = { category_key: c.category_key, category_name: c.category_name, subcategories: [] }
      grouped[c.category_key].subcategories.push({ subcategory_key: c.subcategory_key, subcategory_name: c.subcategory_name })
    }
    setCategories(Object.values(grouped))
  }

  async function save(): Promise<void> {
    if (loading) return
    const parsed = parseAmountInput(expr)
    if (!parsed.ok) { setErr(parsed.message); return }
    if (!cat || !sub) { setErr('请选择分类'); return }
    setLoading(true)
    try {
      await window.electronAPI.addRecord({
        type: recordType,
        amount: parsed.value,
        category_key: cat,
        subcategory_key: sub,
        note: note.trim(),
        record_date: date,
      })
      message.success('记录成功！')
      setExpr(''); setNote(''); setCat(null); setSub(null); setErr('')
    } catch {
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const subs = cat ? categories.find((c) => c.category_key === cat)?.subcategories || [] : []
  const inc = recordType === 'income'
  const catName = cat ? categories.find((c) => c.category_key === cat)?.category_name : ''

  return (
    <div style={{ maxWidth: 420 }}>
      <Mod
        id="Q-01"
        title="快速记账"
        en="QUICK ENTRY"
        right={<Seg value={recordType} onChange={(v) => { setRecordType(v); setErr('') }} options={[['expense', '支出'], ['income', '收入']]} />}
      >
        <div className={`lcd${inc ? ' inc' : ''}${err ? ' err' : ''}`} style={{ padding: '10px 14px' }}>
          <div className="top">
            <span>{inc ? 'CH-02 · IN' : 'CH-01 · OUT'}</span>
            <span>Ctrl+Shift+N</span>
          </div>
          <div className="val" style={{ font: '300 44px/1 var(--mono)', minHeight: 44, margin: '12px 0 6px' }}>
            <small>¥</small>
            <span className={expr ? '' : 'num0'}>{expr ? expr.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0.00'}</span>
            <i className="caret" />
          </div>
          <div className="bot">
            <span>{cat ? `${catName} · ${subs.find((s) => s.subcategory_key === sub)?.subcategory_name || '未选小类'}` : '未选分类'}</span>
            <span>{dateLabel(date)}</span>
          </div>
        </div>

        <input
          className="inp"
          style={{ height: 40, marginTop: 8, fontFamily: 'var(--mono)', fontSize: 16, width: '100%', borderBottom: '1px solid var(--ln)' }}
          inputMode="decimal"
          autoFocus
          placeholder="0.00"
          value={expr}
          onChange={(e) => { setErr(''); setExpr(sanitizeAmountInput(e.target.value)) }}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          aria-label="金额"
        />
        <div className="err-t">{err}</div>

        <div className="fields" style={{ gridTemplateColumns: '52px minmax(0,1fr)' }}>
          <span className="lb">日期</span>
          <div className="fv">
            <DatePicker
              value={dayjs(date)}
              onChange={(d) => setDate((d || dayjs()).format('YYYY-MM-DD'))}
              allowClear={false}
              format="YYYY.MM.DD"
              className="bdate"
              inputReadOnly
            />
          </div>
          <span className="lb">大类</span>
          <div className="fv">
            <Select
              placeholder="选择"
              value={cat || undefined}
              onChange={(v) => { setCat(v); setSub(null); setErr('') }}
              options={categories.map((c) => ({ value: c.category_key, label: c.category_name }))}
              style={{ width: '100%' }}
            />
          </div>
          <span className="lb">小类</span>
          <div className="fv">
            <Select
              placeholder={cat ? '选择' : '先选大类'}
              disabled={!cat}
              value={sub || undefined}
              onChange={(v) => { setSub(v); setErr('') }}
              options={subs.map((s) => ({ value: s.subcategory_key, label: s.subcategory_name }))}
              style={{ width: '100%' }}
            />
          </div>
          <span className="lb">备注</span>
          <div className="fv">
            <Input
              className="inp"
              placeholder="可选"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              variant="borderless"
            />
          </div>
        </div>

        <button className={`savebtn${inc ? ' inc' : ''}`} style={{ height: 44, marginTop: 12 }} onClick={save} disabled={loading}>
          {loading ? '保存中…' : '保存'}
          <span className="kbd">ENTER</span>
        </button>
        {cat && (
          <div className="txlog" style={{ marginTop: 8 }}>
            <CatIcon k={cat} cls="s" />
            <span>{catName}</span>
            <span className="sp" style={{ flex: 1 }} />
            <span className="num">¥{F(parseAmountInput(expr).ok ? parseAmountInput(expr).value : 0)}</span>
          </div>
        )}
      </Mod>
      <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: 'var(--fnt)' }}>
        <Icon n="kb" cls="s" /> 回车保存 · 关闭窗口不影响主账本
      </div>
    </div>
  )
}

export default QuickAddPage
