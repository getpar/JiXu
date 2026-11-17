import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DatePicker, Input, message } from 'antd'
import dayjs from 'dayjs'
import {
  Mod, Icon, CatIcon, Seg, F, p2, dateLabel, todayStr, shiftDay,
} from '../components/ui'
import { parseAmountInput, sanitizeAmountInput, MAX_AMOUNT_TEXT } from '../utils/money'
import type { RecordItem } from '../types/electron'

interface CategoryGroup {
  category_key: string
  category_name: string
  subcategories: { subcategory_key: string; subcategory_name: string }[]
}

const KEYS: Array<[string, string, string]> = [
  ['7', '', ''],
  ['8', '', ''],
  ['9', '', ''],
  ['bs', '', 'BKSP'],
  ['4', '', ''],
  ['5', '', ''],
  ['6', '', ''],
  ['+', '+', 'ADD'],
  ['1', '', ''],
  ['2', '', ''],
  ['3', '', ''],
  ['ok', '', ''],
  ['c', 'C', 'ESC'],
  ['0', '', ''],
  ['.', '.', 'DOT'],
]

/** 金额表达式求值：仅支持 a+b（连加），逐段 parse 后按分累加 */
function evalExpr(expr: string): number {
  return expr
    .split('+')
    .reduce((s, part) => {
      const n = parseFloat(part)
      return s + (Number.isFinite(n) ? Math.round(n * 100) : 0)
    }, 0) / 100
}

function typing(s: string): string {
  const parts = s.split('.')
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (parts.length > 1 ? '.' + parts[1] : '')
}

function AddExpensePage(): JSX.Element {
  const navigate = useNavigate()
  const [recordType, setRecordType] = useState<'expense' | 'income'>('expense')
  const [expr, setExpr] = useState('')
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [cat, setCat] = useState<string | null>(null)
  const [sub, setSub] = useState<string | null>(null)
  const [date, setDate] = useState(todayStr())
  const [person, setPerson] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<RecordItem[]>([])
  const [favs, setFavs] = useState<Array<{ c: string; s: string; name: string; n: number }>>([])
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    loadCategories()
    loadRecent()
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  async function loadCategories(): Promise<void> {
    const raw = await window.electronAPI.getCategories()
    const grouped: Record<string, CategoryGroup> = {}
    for (const c of raw) {
      if (!grouped[c.category_key]) grouped[c.category_key] = { category_key: c.category_key, category_name: c.category_name, subcategories: [] }
      grouped[c.category_key].subcategories.push({ subcategory_key: c.subcategory_key, subcategory_name: c.subcategory_name })
    }
    setCategories(Object.values(grouped))
  }

  async function loadRecent(): Promise<void> {
    const res = await window.electronAPI.getRecordList({ page: 1, pageSize: 60 })
    setRecent(res.rows)
    const counts: Record<string, number> = {}
    for (const r of res.rows) {
      const k = `${r.category_key}|${r.subcategory_key}`
      counts[k] = (counts[k] || 0) + 1
    }
    setFavs(
      Object.keys(counts)
        .sort((a, b) => counts[b] - counts[a])
        .slice(0, 6)
        .map((k) => {
          const [c, s] = k.split('|')
          const row = res.rows.find((r) => r.category_key === c && r.subcategory_key === s)
          return { c, s, name: row?.subcategory_name || s, n: counts[k] }
        }),
    )
  }

  const subs = cat ? categories.find((c) => c.category_key === cat)?.subcategories || [] : []
  const hasPlus = expr.includes('+')
  const total = evalExpr(expr)

  const lcdMain = useMemo(() => {
    if (!expr) return '0.00'
    if (hasPlus) return F(total)
    return typing(expr)
  }, [expr, hasPlus, total])

  const press = (k: string): void => {
    setErr('')
    if (k === 'c') { setExpr(''); return }
    if (k === 'bs') { setExpr(expr.slice(0, -1)); return }
    if (k === '+') {
      if (!expr || expr.endsWith('+')) return
      setExpr(expr + '+')
      return
    }
    if (k === '.') {
      const last = expr.split('+').pop() || ''
      if (last.includes('.')) return
      setExpr((last === '' ? '0' : expr) + '.')
      return
    }
    if (k === 'ok') { save(); return }
    // 数字
    const last = expr.split('+').pop() || ''
    const clean = sanitizeAmountInput(last + k)
    if (clean === last) {
      setErr(`单笔金额不能超过 ${MAX_AMOUNT_TEXT}`)
      return
    }
    setExpr(expr.slice(0, expr.length - last.length) + clean)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); return }
      if (e.key === '.' || e.key === '+') { e.preventDefault(); press(e.key); return }
      if (e.key === 'Backspace') { e.preventDefault(); press('bs'); return }
      if (e.key === 'Enter') { e.preventDefault(); press('ok'); return }
      if (e.key === 'Escape') { e.preventDefault(); press('c') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function save(): Promise<void> {
    if (loading) return
    const parsed = parseAmountInput(hasPlus ? String(total) : expr)
    if (!parsed.ok) {
      setErr(parsed.message)
      return
    }
    if (!cat || !sub) {
      setErr('请选择分类')
      return
    }
    setLoading(true)
    try {
      await window.electronAPI.addRecord({
        type: recordType,
        amount: parsed.value,
        category_key: cat,
        subcategory_key: sub,
        note: note.trim(),
        record_date: date,
        person: person.trim(),
      })
      message.success('保存成功！')
      setExpr(''); setCat(null); setSub(null); setNote(''); setPerson('')
      navigate('/home')
    } catch {
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  function pickCat(k: string): void {
    setErr('')
    setCat(k)
    setSub(null)
  }

  const catName = cat ? categories.find((c) => c.category_key === cat)?.category_name : ''
  const subName = subs.find((s) => s.subcategory_key === sub)?.subcategory_name
  const lastTx = recent[0]
  const inc = recordType === 'income'
  const recTime = `${p2(now.getHours())}:${p2(now.getMinutes())}`

  return (
    <div className="grid">
      <div className="col s-7">
        <Mod
          id="A-01"
          title="金额"
          en="AMOUNT"
          right={
            <Seg
              value={recordType}
              onChange={(v) => { setRecordType(v); setErr('') }}
              options={[['expense', '支出'], ['income', '收入']]}
            />
          }
        >
          <div className={`lcd${inc ? ' inc' : ''}${err ? ' err' : ''}`}>
            <div className="top">
              <span>{inc ? 'CH-02 · IN · INCOME' : 'CH-01 · OUT · EXPENSE'}</span>
              <span>REC {recTime}</span>
            </div>
            <div className="val">
              {hasPlus && <span className="ex">{expr.replace(/\+/g, ' + ')} =</span>}
              <small>¥</small>
              <span className={expr ? '' : 'num0'}>{lcdMain}</span>
              <i className="caret" />
            </div>
            <div className="bot">
              <span>{cat ? `${catName} · ${subName || '未选小类'}` : '未选分类 · NO CAT'}</span>
              <span>
                {dateLabel(date)} {recTime}
                {person ? ` · ${person}` : ''}
              </span>
            </div>
          </div>
          <div className="err-t" role="alert">{err}</div>
          <div className="txlog">
            <span className="lb">{lastTx ? 'LAST' : 'LAST'}</span>
            {lastTx ? (
              <span className="pk">
                <CatIcon k={lastTx.category_key} cls="s" />
                <b>{lastTx.subcategory_name}</b>
                <span className="num">
                  {lastTx.type === 'income' ? '+' : '−'}¥{F(lastTx.amount)}
                </span>
                <span>
                  {dateLabel(lastTx.record_date)} {(lastTx.created_at || '').slice(11, 16)}
                </span>
              </span>
            ) : (
              <span>还没有记录</span>
            )}
          </div>
        </Mod>

        <Mod
          id="A-02"
          title="分类"
          en="CATEGORY"
          right={cat ? <span className="tag ac">{catName} · {subName || '待选'}</span> : undefined}
        >
          {favs.length > 0 && (
            <>
              <div className="lb" style={{ marginBottom: 8 }}>
                <b>常用</b>FREQUENT
              </div>
              <div className="chips scroll" style={{ marginBottom: 10 }}>
                {favs.map((f) => (
                  <button
                    key={`${f.c}-${f.s}`}
                    className={`chip${cat === f.c && sub === f.s ? ' on' : ''}`}
                    onClick={() => { setCat(f.c); setSub(f.s); setErr('') }}
                  >
                    <CatIcon k={f.c} />
                    {f.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="cats">
            {categories.map((c, i) => (
              <button
                key={c.category_key}
                className={`cat${cat === c.category_key ? ' on' : ''}`}
                onClick={() => pickCat(c.category_key)}
                aria-pressed={cat === c.category_key}
              >
                <span className="k">{p2(i + 1)}</span>
                <CatIcon k={c.category_key} />
                <span>{c.category_name.slice(0, 2)}</span>
              </button>
            ))}
            <button className="cat" onClick={() => navigate('/categories')}>
              <Icon n="tag" />
              <span>管理</span>
            </button>
          </div>
          <div className="sect">
            <span className="lb">
              <b>二级</b>SUB{catName ? ` · ${catName}` : ''}
            </span>
            <div className="chips">
              {subs.length === 0 && <span className="hint0">先选一个一级分类</span>}
              {subs.map((s) => (
                <button
                  key={s.subcategory_key}
                  className={`chip${sub === s.subcategory_key ? ' on' : ''}`}
                  onClick={() => { setSub(s.subcategory_key); setErr('') }}
                >
                  {s.subcategory_name}
                </button>
              ))}
            </div>
          </div>
        </Mod>
      </div>

      <div className="col s-5">
        <Mod id="A-03" title="详情" en="DETAILS">
          <div className="fields">
            <span className="lb">日期 DATE</span>
            <div className="fv">
              <button className={`chip${date === todayStr() ? ' on' : ''}`} onClick={() => setDate(todayStr())}>今天</button>
              <button className={`chip${date === shiftDay(todayStr(), -1) ? ' on' : ''}`} onClick={() => setDate(shiftDay(todayStr(), -1))}>昨天</button>
              <DatePicker
                value={dayjs(date)}
                onChange={(d) => setDate((d || dayjs()).format('YYYY-MM-DD'))}
                allowClear={false}
                format="YYYY.MM.DD"
                className="bdate"
                inputReadOnly
              />
            </div>
            <span className="lb">谁花的 BY</span>
            <div className="fv">
              <button className={`chip${person === '我' ? ' on' : ''}`} onClick={() => setPerson('我')}>我</button>
              <button className={`chip${person === '阿念' ? ' on' : ''}`} onClick={() => setPerson('阿念')}>阿念</button>
              <Input
                className="inp"
                placeholder="或填：爸爸、妈妈…"
                maxLength={10}
                allowClear
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                variant="borderless"
              />
            </div>
            <span className="lb">备注 NOTE</span>
            <div className="fv">
              <Input
                className="inp"
                placeholder="写点什么，比如：和同事拼饭"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                variant="borderless"
              />
            </div>
          </div>
          <button className={`savebtn${inc ? ' inc' : ''}`} onClick={save} disabled={loading}>
            {loading ? '保存中…' : '保存这笔记录'}
            <span className="kbd">ENTER</span>
          </button>
          <div className="hints">
            <span><i className="kbd">0–9</i>直接输入</span>
            <span><i className="kbd">+</i>连加</span>
            <span><i className="kbd">Enter</i>保存</span>
            <span><i className="kbd">Esc</i>清空</span>
            <span><i className="kbd">Ctrl+Shift+N</i>随时记一笔</span>
          </div>
        </Mod>

        <Mod id="A-04" title="键盘" en="KEYPAD · 键盘同步">
          <div className="pad">
            {KEYS.map(([k, label, cap]) =>
              k === 'ok' ? (
                <button key={k} className={`key save${inc ? ' inc' : ''}`} onClick={() => press('ok')}>
                  {loading ? '保存中' : '保存'}
                  <span className="kbd">ENTER</span>
                </button>
              ) : (
                <button
                  key={k}
                  className={`key${/\d/.test(k) ? '' : ' fn'}`}
                  onClick={() => press(k)}
                  aria-label={cap || k}
                >
                  {cap && <small>{cap}</small>}
                  {k === 'bs' ? <Icon n="bs" cls="s" /> : label || k}
                </button>
              ),
            )}
          </div>
        </Mod>
      </div>
    </div>
  )
}

export default AddExpensePage
