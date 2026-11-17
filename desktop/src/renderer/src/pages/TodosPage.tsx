import { useState, useEffect, useMemo } from 'react'
import { Modal, Form, InputNumber, Select, Input, DatePicker, TimePicker, Popconfirm, message } from 'antd'
import dayjs from 'dayjs'
import { Mod, Icon, CatIcon, F, dateLabel, todayStr, p2 } from '../components/ui'
import type { TodoItem } from '../types/electron'

interface CategoryGroup {
  category_key: string
  category_name: string
  subcategories: { subcategory_key: string; subcategory_name: string }[]
}

const CYCLE: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  yearly: '每年',
  once: '单次',
}

function TodosPage(): JSX.Element {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [categories, setCategories] = useState<CategoryGroup[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
    loadCategories()
    // v0.7.3 云同步应用了云端待办快照后自动刷新列表
    const onEntitySynced = (): void => { loadData() }
    window.addEventListener('entity-synced', onEntitySynced)
    return () => window.removeEventListener('entity-synced', onEntitySynced)
  }, [])

  async function loadData(): Promise<void> {
    setTodos(await window.electronAPI.getTodos())
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
    const amount = v.amount || 0
    await window.electronAPI.addTodo({
      title: v.title.trim(),
      cycle: v.cycle,
      next_date: v.next_date.format('YYYY-MM-DD'),
      time: v.time ? v.time.format('HH:mm') : '',
      amount: amount > 0 ? amount : 0,
      category_key: amount > 0 ? v.category_key : '',
      subcategory_key: amount > 0 ? v.subcategory_key : '',
      note: v.note || '',
    })
    message.success('待办已添加')
    setModalOpen(false)
    form.resetFields()
    loadData()
  }

  async function handleComplete(todo: TodoItem): Promise<void> {
    const res = await window.electronAPI.completeTodo(todo.id)
    if (res.success) {
      message.success(res.recorded ? `已完成，自动记账 ¥${F(res.recorded.amount)}` : '已完成')
      loadData()
    } else {
      message.error(res.error || '操作失败')
    }
  }

  async function handleToggle(id: number, active: boolean): Promise<void> {
    await window.electronAPI.toggleTodo(id, active)
    loadData()
  }

  async function handleDelete(id: number): Promise<void> {
    await window.electronAPI.deleteTodo(id)
    message.success('已删除')
    loadData()
  }

  const today = todayStr()
  const activeTodos = useMemo(() => todos.filter((t) => {
    if (!t.is_active) return false
    if (t.cycle === 'once' && t.completed_dates.length > 0) return false
    return true
  }), [todos])
  const doneTodos = useMemo(() => todos.filter((t) => !activeTodos.includes(t)), [todos, activeTodos])
  const dueToday = activeTodos.filter((t) => t.next_date <= today)
  const sorted = activeTodos.slice().sort((a, b) => a.next_date.localeCompare(b.next_date))

  const subs = selectedCat ? categories.find((c) => c.category_key === selectedCat)?.subcategories.map((s) => ({ value: s.subcategory_key, label: s.subcategory_name })) || [] : []

  return (
    <>
      {dueToday.length > 0 && (
        <Mod className="mb8">
          <div className="pace warn">
            <i className="led amb" />
            <span>
              今天有 <b>{dueToday.length}</b> 个待办到期
            </span>
            <span className="num">{dueToday.map((t) => t.title).join(' · ')}</span>
          </div>
        </Mod>
      )}

      <Mod
        id="P-02"
        className="mb8"
        title="待办事项"
        en={`TODO · ${activeTodos.length} OPEN`}
        right={
          <button className="mini ac" onClick={() => { setModalOpen(true); setSelectedCat(null); form.resetFields() }}>
            <Icon n="add" cls="s" />
            添加待办
          </button>
        }
      >
        {sorted.length === 0 && (
          <div className="nosig">
            <b>暂无进行中的待办</b>
            <p>每天喝水、每月交话费…填了关联金额的待办，点「完成」时会自动记一笔账。</p>
          </div>
        )}
        {sorted.map((t) => {
          const overdue = t.next_date < today
          const isToday = t.next_date === today
          return (
            <div className="td" key={t.id}>
              <button className="cbtn" onClick={() => handleComplete(t)} role="checkbox" aria-checked={false} aria-label={`完成 ${t.title}`}>
                <span className="chk">
                  <Icon n="ok" cls="s" />
                </span>
              </button>
              <div className="tt">
                <b>{t.title}</b>
                <span>
                  {overdue ? (
                    <span className="tag cor">已逾期</span>
                  ) : isToday ? (
                    <span className="tag amb">今天{t.time ? ` ${t.time}` : ''}</span>
                  ) : (
                    <span className="tag">{dateLabel(t.next_date)}</span>
                  )}
                  {CYCLE[t.cycle] || t.cycle}
                  {t.note ? ` · ${t.note}` : ''}
                </span>
              </div>
              <div className="r">
                {t.amount > 0 && (
                  <>
                    <span className="num">¥{F(t.amount)}</span>
                    {t.category_name && <span className="tag">{t.category_name}</span>}
                    <button className="mini" onClick={() => handleComplete(t)}>完成并记账</button>
                  </>
                )}
                {t.amount === 0 && (
                  <button className="mini" onClick={() => handleComplete(t)}>完成</button>
                )}
                <button
                  className={`tg${t.is_active ? ' on' : ''}`}
                  onClick={() => handleToggle(t.id, !t.is_active)}
                  role="switch"
                  aria-checked={!!t.is_active}
                  aria-label={`启用 ${t.title}`}
                />
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(t.id)}>
                  <button className="ib del" aria-label="删除">
                    <Icon n="trash" cls="s" />
                  </button>
                </Popconfirm>
              </div>
            </div>
          )
        })}
      </Mod>

      {doneTodos.length > 0 && (
        <Mod
          title={
            <button className="lnk" style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx)' }} onClick={() => setShowDone(!showDone)}>
              <Icon n={showDone ? 'r' : 'l'} cls="s" />
              已完成 / 已停用（{doneTodos.length}）
            </button>
          }
          en="ARCHIVE"
        >
          {showDone &&
            doneTodos.map((t) => {
              const last = t.completed_dates.length > 0 ? t.completed_dates[t.completed_dates.length - 1] : ''
              return (
                <div className="td done" key={t.id}>
                  <span className="cbtn">
                    <span className="chk on">
                      <Icon n="ok" cls="s" />
                    </span>
                  </span>
                  <div className="tt">
                    <b>{t.title}</b>
                    <span>
                      {CYCLE[t.cycle] || t.cycle}
                      {last ? ` · 最后完成 ${last}` : ''}
                      {!t.is_active ? ' · 已停用' : ''}
                    </span>
                  </div>
                  <div className="r">
                    <button className="mini" onClick={() => handleToggle(t.id, !t.is_active)}>
                      {t.is_active ? '停用' : '启用'}
                    </button>
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(t.id)}>
                      <button className="ib del" aria-label="删除">
                        <Icon n="trash" cls="s" />
                      </button>
                    </Popconfirm>
                  </div>
                </div>
              )
            })}
          {!showDone && <div className="empty-s">点标题展开</div>}
        </Mod>
      )}

      <Modal
        title="添加待办"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={480}
        footer={[
          <button key="c" className="mini" style={{ marginRight: 8 }} onClick={() => setModalOpen(false)}>取消</button>,
          <button key="a" className="mini ac" onClick={handleAdd}>添加</button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 8 }} initialValues={{ cycle: 'daily', next_date: dayjs(), amount: 0 }}>
          <Form.Item label="标题" name="title" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="如：交房租、晨跑、喝水 8 杯" maxLength={20} />
          </Form.Item>
          <Form.Item label="周期" name="cycle">
            <Select options={Object.entries(CYCLE).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item label="下次到期日期" name="next_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.cycle !== cur.cycle}>
            {({ getFieldValue }) => ['daily', 'weekly', 'once'].includes(getFieldValue('cycle') as string) && (
              <Form.Item label="具体时间（可选）" name="time">
                <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} placeholder="不限" />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item label="关联金额（可选，完成时自动记账）" name="amount">
            <InputNumber prefix="¥" min={0} precision={2} style={{ width: '100%' }} placeholder="不填则只提醒不记账" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.amount !== cur.amount}>
            {({ getFieldValue }) => ((getFieldValue('amount') as number) || 0) > 0 && (
              <>
                <Form.Item label="一级分类" name="category_key" rules={[{ required: true, message: '请选择大类' }]}>
                  <Select
                    placeholder="选择大类"
                    onChange={(v) => { setSelectedCat(v); form.setFieldValue('subcategory_key', undefined) }}
                    options={categories.map((c) => ({ value: c.category_key, label: c.category_name }))}
                  />
                </Form.Item>
                <Form.Item label="二级分类" name="subcategory_key" rules={[{ required: true, message: '请选择小类' }]}>
                  <Select placeholder={selectedCat ? '选择小类' : '请先选择大类'} disabled={!selectedCat} options={subs} />
                </Form.Item>
              </>
            )}
          </Form.Item>
          <Form.Item label="备注（可选）" name="note">
            <Input placeholder="补充说明" maxLength={30} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default TodosPage
