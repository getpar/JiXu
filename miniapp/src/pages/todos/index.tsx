import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useMemo } from 'react'
import {
  getTodos, addTodo, deleteTodo, toggleTodo, completeTodo, getMergedCategories, localDateStr,
} from '../../utils/storage'
import type { Todo } from '../../utils/storage'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

const cycleLabels: Record<string, string> = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年', once: '单次' }
const cycleTags: Record<string, string> = { daily: '☀️', weekly: '📆', monthly: '📅', yearly: '🎯', once: '📍' }

function formatDate(d: string): string { return d.slice(5) }

export default function Todos(): JSX.Element {
  const dark = useThemeDark()
  const [todos, setTodos] = useState<Todo[]>([])
  const [showModal, setShowModal] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [showDone, setShowDone] = useState(false)

  // 表单
  const [fTitle, setFTitle] = useState('')
  const [fCycle, setFCycle] = useState('daily')
  const [fNextDate, setFNextDate] = useState(localDateStr())
  const [fAmount, setFAmount] = useState('')
  const [fCatKey, setFCatKey] = useState('food')
  const [fSubKey, setFSubKey] = useState('')
  const [fTime, setFTime] = useState('')
  const [fNote, setFNote] = useState('')

  useDidShow(() => { loadData(); loadCategories() })

  async function loadData(): Promise<void> {
    setTodos(await getTodos())
  }

  async function loadCategories(): Promise<void> {
    setCategories(await getMergedCategories())
  }

  const activeTodos = useMemo(() => todos.filter((t) => t.isActive).sort((a, b) => a.nextDate.localeCompare(b.nextDate)), [todos])
  // v0.6.9 状态一眼分明：今天已完成（划线置底）/ 今天到期未做（橙色高亮）/ 未到期（灰色）
  const today = localDateStr()
  const doneTodayOf = (t: Todo) => t.completedDates[t.completedDates.length - 1] === today
  const undoneTodos = useMemo(() => activeTodos.filter((t) => !doneTodayOf(t)), [todos])
  const doneTodayTodos = useMemo(() => activeTodos.filter((t) => doneTodayOf(t)), [todos])
  // 已完成的：停用的 + 单次型已完成的
  const completedTodos = useMemo(() => todos.filter((t) => {
    if (!t.isActive) return true
    if (t.cycle === 'once' && t.completedDates.length > 0) return true
    return false
  }), [todos])

  const currentCat = categories.find((c: any) => c.key === fCatKey)
  const subs = currentCat?.subs || []
  const hasAmount = fAmount !== '' && Number(fAmount) > 0

  const cycleKeys = ['daily', 'weekly', 'monthly', 'yearly', 'once']
  const cycleNames = cycleKeys.map((k) => `${cycleTags[k]} ${cycleLabels[k]}`)
  const catKeys = categories.map((c: any) => c.key)
  const catNames = categories.map((c: any) => c.name)
  const subKeys = subs.map((s: any) => s.key)
  const subNames = subs.map((s: any) => s.name)

  function resetForm(): void {
    setFTitle(''); setFCycle('daily')
    setFNextDate(localDateStr())
    setFTime(''); setFAmount(''); setFCatKey('food'); setFSubKey(''); setFNote('')
  }

  async function handleAdd(): Promise<void> {
    if (!fTitle.trim()) { Taro.showToast({ title: '请输入标题', icon: 'none' }); return }
    const amount = Number(fAmount)
    await addTodo({
      title: fTitle.trim(), cycle: fCycle as any, nextDate: fNextDate,
      time: fTime || undefined, isActive: true,
      amount: amount > 0 ? amount : undefined,
      categoryKey: amount > 0 ? fCatKey : undefined,
      categoryName: amount > 0 ? currentCat?.name : undefined,
      subcategoryKey: amount > 0 ? fSubKey || undefined : undefined,
      subcategoryName: amount > 0 ? (fSubKey ? subs.find((s: any) => s.key === fSubKey)?.name : undefined) : undefined,
      note: fNote || undefined,
    })
    Taro.showToast({ title: '已添加', icon: 'success' })
    setShowModal(false); resetForm(); loadData()
  }

  async function handleComplete(todo: Todo): Promise<void> {
    await completeTodo(todo.id)
    if (todo.amount && todo.amount > 0) {
      Taro.showToast({ title: `已完成并记账 ¥${todo.amount.toFixed(0)}`, icon: 'success' })
    } else {
      Taro.showToast({ title: '已完成', icon: 'success' })
    }
    loadData()
    Taro.eventCenter.trigger('dataChanged')
  }

  async function handleDelete(id: string): Promise<void> {
    const res = await Taro.showModal({ title: '确定删除？', content: '删除后无法恢复' })
    if (res.confirm) { await deleteTodo(id); loadData() }
  }

  async function handleToggle(id: string, active: boolean): Promise<void> {
    await toggleTodo(id, active); loadData()
  }

  // 今天到期且还没完成的（已完成的不再进提醒计数）
  const dueToday = undoneTodos.filter((t) => t.nextDate <= today)

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      {/* 顶栏 */}
      <View className='top-bar'>
        <Text className='back-btn' onClick={() => Taro.navigateBack()}>← 返回</Text>
        <Text className='title'>待办事项</Text>
        <Text className='badge'>{undoneTodos.length}</Text>
      </View>

      {/* 今日到期（不含已完成的） */}
      {dueToday.length > 0 && (
        <View className='alert'>
          <Text>今天有 {dueToday.length} 个待办到期还没完成</Text>
        </View>
      )}

      {/* 添加按钮 */}
      <View className='add-btn' onClick={() => { setShowModal(true); resetForm() }}>
        <Text className='add-btn-text'>+ 添加待办</Text>
      </View>

      {/* 进行中：未完成在前、今天已完成的划线置底 */}
      {activeTodos.length === 0 ? (
        <View className='empty'>
          <Text className='empty-icon'>☑️</Text>
          <Text>暂无待办</Text>
        </View>
      ) : (
        <View className='section-label'>进行中 ({undoneTodos.length}{doneTodayTodos.length > 0 ? ` · 今天已完成 ${doneTodayTodos.length}` : ''})</View>
      )}
      {[...undoneTodos, ...doneTodayTodos].map((t) => {
        const done = doneTodayOf(t)
        const due = !done && t.nextDate <= today
        const overdue = !done && t.nextDate < today
        return (
          <View key={t.id} className={`todo-card${done ? ' finished-today' : due ? ' due-today' : ''}`}>
            <View className='todo-header'>
              <View className='tag-row'>
                <View className={`cycle-tag ${t.cycle} ${overdue ? 'overdue' : ''}`}>
                  <Text>{cycleTags[t.cycle]} {cycleLabels[t.cycle]}{overdue ? ' 已过期' : ''}</Text>
                </View>
                {done && <View className='status-tag done'><Text>✓ 今天已完成</Text></View>}
                {due && <View className='status-tag due'><Text>今天到期</Text></View>}
              </View>
              <Text className='todo-date'>{done ? `下次 ${formatDate(t.nextDate)}` : `${formatDate(t.nextDate)}${t.time ? ` ${t.time}` : ''}`}</Text>
            </View>
            <Text className={`todo-title${done ? ' struck' : ''}`}>{t.title}</Text>
            {t.amount && t.amount > 0 && (
              <View className='todo-amount-row'>
                <Text className='todo-amount'>¥{t.amount.toFixed(0)}</Text>
                {t.categoryName && <Text className='todo-cat'>· {t.categoryName} - {t.subcategoryName}</Text>}
              </View>
            )}
            {t.note && <Text className='todo-note'>{t.note}</Text>}
            <View className='todo-actions'>
              {done ? (
                <View className='action-done'><Text>✓ 今天已完成</Text></View>
              ) : (
                <View className='action-complete' onClick={() => handleComplete(t)}>
                  <Text>{t.amount ? '✓ 完成并记账' : '✓ 完成'}</Text>
                </View>
              )}
              <View className={`toggle-btn ${t.isActive ? 'on' : 'off'}`} onClick={() => handleToggle(t.id, !t.isActive)}>
                <Text>停用</Text>
              </View>
              <View className='del-btn' onClick={() => handleDelete(t.id)}>
                <Text>删除</Text>
              </View>
            </View>
          </View>
        )
      })}

      {/* 已完成 */}
      {completedTodos.length > 0 && (
        <>
          <View className='section-label done-label' onClick={() => setShowDone(!showDone)}>
            <Text>已完成 ({completedTodos.length})</Text>
            <Text className='expand-arrow'>{showDone ? '▲' : '▼'}</Text>
          </View>
          {showDone && completedTodos.map((t) => (
            <View key={t.id} className='done-card'>
              <Text className='done-title'>{t.title}</Text>
              <Text className='done-meta'>
                {cycleTags[t.cycle]} {cycleLabels[t.cycle]}
                {t.completedDates.length > 0 && ` · 最后完成 ${t.completedDates[t.completedDates.length - 1]}`}
                {!t.isActive && ' · 已停用'}
              </Text>
            </View>
          ))}
        </>
      )}

      {/* ====== 添加弹窗 ====== */}
      {showModal && (
        <View className='modal' onClick={() => setShowModal(false)}>
          <View className='modal-box' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>添加待办</Text>

            {/* 标题 */}
            <View className='form-item'>
              <Text className='form-label'>标题</Text>
              <Input className='note-input' placeholder='如：交房租、喝水' value={fTitle} onInput={(e) => setFTitle(e.detail.value)} maxlength={20} />
            </View>

            {/* 周期 */}
            <View className='form-item'>
              <Text className='form-label'>周期</Text>
              <Picker mode='selector' range={cycleNames} value={cycleKeys.indexOf(fCycle)} onChange={(e) => setFCycle(cycleKeys[Number(e.detail.value)])}>
                <View className='picker'><Text>{cycleTags[fCycle]} {cycleLabels[fCycle]}</Text><Text className='arrow'>▼</Text></View>
              </Picker>
            </View>

            {/* 日期 */}
            {fCycle === 'once' && (
              <View className='form-item'>
                <Text className='form-label'>截止日期</Text>
                <Picker mode='date' value={fNextDate} onChange={(e) => setFNextDate(e.detail.value)}>
                  <View className='picker'><Text>{fNextDate}</Text><Text className='arrow'>▼</Text></View>
                </Picker>
              </View>
            )}

            {/* 具体时间（可选）*/}
            {['daily', 'weekly', 'once'].includes(fCycle) && (
              <View className='form-item'>
                <Text className='form-label'>⏰ 具体时间（可选）</Text>
                <Picker mode='time' value={fTime || '09:00'} onChange={(e) => setFTime(e.detail.value)}>
                  <View className='picker'><Text style={fTime ? '' : 'color:var(--faint)'}>{fTime || '不限'}</Text><Text className='arrow'>▼</Text></View>
                </Picker>
              </View>
            )}

            {/* 关联金额（可选）*/}
            <View className='form-item'>
              <Text className='form-label'>关联金额（可选）</Text>
              <View className='amount-input'>
                <Text className='prefix'>¥</Text>
                <Input type='digit' placeholder='填了自动记账' value={fAmount} onInput={(e) => setFAmount(e.detail.value)} />
              </View>
            </View>

            {/* 分类（填了金额才显示）*/}
            {hasAmount && (
              <>
                <View className='form-item'>
                  <Text className='form-label'>一级分类</Text>
                  <Picker mode='selector' range={catNames} value={catKeys.indexOf(fCatKey)} onChange={(e) => { setFCatKey(catKeys[Number(e.detail.value)]); setFSubKey('') }}>
                    <View className='picker'><Text>{currentCat?.name || '请选择'}</Text><Text className='arrow'>▼</Text></View>
                  </Picker>
                </View>
                <View className='form-item'>
                  <Text className='form-label'>二级分类</Text>
                  <Picker mode='selector' range={subNames} value={subKeys.indexOf(fSubKey)} onChange={(e) => setFSubKey(subKeys[Number(e.detail.value)])}>
                    <View className='picker'>
                      <Text style={fSubKey ? '' : 'color:var(--faint)'}>{fSubKey ? subs.find((s: any) => s.key === fSubKey)?.name : '选择小类'}</Text>
                      <Text className='arrow'>▼</Text>
                    </View>
                  </Picker>
                </View>
              </>
            )}

            {/* 备注 */}
            <View className='form-item'>
              <Text className='form-label'>备注（可选）</Text>
              <Input className='note-input' placeholder='补充说明' value={fNote} onInput={(e) => setFNote(e.detail.value)} maxlength={30} />
            </View>

            {/* 按钮 */}
            <View className='modal-btns'>
              <View className='btn btn-cancel' onClick={() => setShowModal(false)}><Text>取消</Text></View>
              <View className='btn btn-ok' onClick={handleAdd}><Text className='btn-ok-text'>添加</Text></View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
