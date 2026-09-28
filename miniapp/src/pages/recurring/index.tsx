import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import {
  getRecurringBills, addRecurringBill, deleteRecurringBill,
  toggleRecurringBill, executeRecurringBill, getMergedCategories, localDateStr,
} from '../../utils/storage'
import type { RecurringBill } from '../../utils/storage'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

const cycleLabels: Record<string, string> = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' }

export default function Recurring(): JSX.Element {
  const dark = useThemeDark()
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [showModal, setShowModal] = useState(false)
  const [categories, setCategories] = useState<any[]>([])

  // 表单字段
  const [formType, setFormType] = useState<'expense' | 'income'>('expense')
  const [formAmount, setFormAmount] = useState('')
  const [formCycle, setFormCycle] = useState('monthly')
  const [formNextDate, setFormNextDate] = useState(localDateStr())
  const [formCatKey, setFormCatKey] = useState('food')
  const [formSubKey, setFormSubKey] = useState('')
  const [formNote, setFormNote] = useState('')

  useDidShow(() => { loadData() })
  useEffect(() => { loadCategories() }, [])

  async function loadData(): Promise<void> {
    setBills(await getRecurringBills())
  }

  async function loadCategories(): Promise<void> {
    setCategories(await getMergedCategories())
  }

  const currentCat = categories.find((c) => c.key === formCatKey)
  const subs = currentCat?.subs || []

  async function handleAdd(): Promise<void> {
    const amount = Number(formAmount)
    if (!amount || amount <= 0) { Taro.showToast({ title: '请输入金额', icon: 'none' }); return }
    if (!formSubKey) { Taro.showToast({ title: '请选择分类', icon: 'none' }); return }

    const cat = categories.find((c) => c.key === formCatKey)
    const sub = cat?.subs.find((s: any) => s.key === formSubKey)

    await addRecurringBill({
      type: formType, amount, categoryKey: formCatKey,
      categoryName: cat?.name || formCatKey,
      subcategoryKey: formSubKey,
      subcategoryName: sub?.name || formSubKey,
      note: formNote, cycle: formCycle as any,
      nextDate: formNextDate, isActive: true,
    })

    Taro.showToast({ title: '添加成功', icon: 'success' })
    setShowModal(false)
    resetForm()
    loadData()
  }

  async function handleDelete(id: string): Promise<void> {
    const res = await Taro.showModal({ title: '确定删除？', content: '删除后无法恢复' })
    if (res.confirm) {
      await deleteRecurringBill(id)
      Taro.showToast({ title: '已删除', icon: 'success' })
      loadData()
    }
  }

  async function handleExecute(bill: RecurringBill): Promise<void> {
    await executeRecurringBill(bill.id)
    Taro.showToast({ title: `已记录 ¥${bill.amount.toFixed(2)}`, icon: 'success' })
    loadData()
    // 通知首页刷新
    Taro.eventCenter.trigger('dataChanged')
  }

  async function handleToggle(id: string, active: boolean): Promise<void> {
    await toggleRecurringBill(id, active)
    loadData()
  }

  function resetForm(): void {
    setFormType('expense')
    setFormAmount('')
    setFormCycle('monthly')
    setFormNextDate(localDateStr())
    setFormCatKey('food')
    setFormSubKey('')
    setFormNote('')
  }

  const cycleKeys = ['monthly', 'weekly', 'daily', 'yearly']
  const cycleNames = cycleKeys.map((k) => cycleLabels[k])
  // Picker 用中文名展示，内部用 key 存储
  const catNames = categories.map((c) => c.name)
  const catKeys  = categories.map((c) => c.key)
  const subNames = subs.map((s: any) => s.name)
  const subKeys  = subs.map((s: any) => s.key)

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      {/* 顶栏 */}
      <View className='top-bar'>
        <Text className='back-btn' onClick={() => Taro.navigateBack()}>← 返回</Text>
        <Text className='title'>周期账单</Text>
        <Text className='placeholder' />
      </View>

      {/* 说明 */}
      <View className='hint'>
        <Text>房租、订阅等固定开销，到期一键记录，不用每次手动填</Text>
      </View>

      {/* 添加按钮 */}
      <View className='add-btn' onClick={() => { setShowModal(true); resetForm() }}>
        <Text className='add-btn-text'>+ 添加周期账单</Text>
      </View>

      {/* 列表 */}
      {bills.length === 0 ? (
        <View className='empty'>
          <Text>暂无周期账单</Text>
        </View>
      ) : (
        bills.map((b) => (
          <View key={b.id} className={`bill-card ${!b.isActive ? 'inactive' : ''}`}>
            {/* 头部：类型+金额 */}
            <View className='bill-header'>
              <View className='bill-type-row'>
                <View className={`type-dot ${b.type === 'income' ? 'income' : 'expense'}`} />
                <Text className='bill-cat'>{b.categoryName} · {b.subcategoryName}</Text>
              </View>
              <Text className={`bill-amount ${b.type === 'income' ? 'green' : 'red'}`}>
                {b.type === 'income' ? '+' : '-'}¥{b.amount.toFixed(2)}
              </Text>
            </View>

            {/* 信息行 */}
            <View className='bill-info'>
              <View className={`cycle-tag ${b.cycle}`}>
                <Text>{cycleLabels[b.cycle]}</Text>
              </View>
              <Text className='next-date'>下次：{b.nextDate}</Text>
              {b.note ? <Text className='note-text'>· {b.note}</Text> : null}
            </View>

            {/* 操作按钮 */}
            <View className='bill-actions'>
              <View className={`toggle-btn ${b.isActive ? 'on' : 'off'}`} onClick={() => handleToggle(b.id, !b.isActive)}>
                <Text>{b.isActive ? '已启用' : '已停用'}</Text>
              </View>
              <View className='exec-btn' onClick={() => handleExecute(b)}>
                <Text>立即记录</Text>
              </View>
              <View className='del-btn' onClick={() => handleDelete(b.id)}>
                <Text>删除</Text>
              </View>
            </View>
          </View>
        ))
      )}

      {/* ====== 添加弹窗 ====== */}
      {showModal && (
        <View className='modal' onClick={() => setShowModal(false)}>
          <View className='modal-box' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>添加周期账单</Text>

            {/* 类型 */}
            <View className='form-item'>
              <Text className='form-label'>类型</Text>
              <View className='type-switch'>
                <View className={`type-btn ${formType === 'expense' ? 'active expense' : ''}`} onClick={() => setFormType('expense')}><Text>支出</Text></View>
                <View className={`type-btn ${formType === 'income' ? 'active income' : ''}`} onClick={() => setFormType('income')}><Text>收入</Text></View>
              </View>
            </View>

            {/* 金额 */}
            <View className='form-item'>
              <Text className='form-label'>金额</Text>
              <View className='amount-input'>
                <Text className='prefix'>¥</Text>
                <Input type='digit' placeholder='输入金额' value={formAmount} onInput={(e) => setFormAmount(e.detail.value)} />
              </View>
            </View>

            {/* 周期 */}
            <View className='form-item'>
              <Text className='form-label'>周期</Text>
              <Picker mode='selector' range={cycleNames} value={cycleKeys.indexOf(formCycle)} onChange={(e) => setFormCycle(cycleKeys[Number(e.detail.value)])}>
                <View className='picker'><Text>{cycleLabels[formCycle]}</Text><Text className='arrow'>▼</Text></View>
              </Picker>
            </View>

            {/* 下次日期 */}
            <View className='form-item'>
              <Text className='form-label'>下次日期</Text>
              <Picker mode='date' value={formNextDate} onChange={(e) => setFormNextDate(e.detail.value)}>
                <View className='picker'><Text>{formNextDate}</Text><Text className='arrow'>▼</Text></View>
              </Picker>
            </View>

            {/* 一级分类 */}
            <View className='form-item'>
              <Text className='form-label'>一级分类</Text>
              <Picker mode='selector' range={catNames} value={catKeys.indexOf(formCatKey)} onChange={(e) => { const v = catKeys[Number(e.detail.value)]; setFormCatKey(v); setFormSubKey('') }}>
                <View className='picker'><Text>{currentCat?.name || '请选择'}</Text><Text className='arrow'>▼</Text></View>
              </Picker>
            </View>

            {/* 二级分类 */}
            <View className='form-item'>
              <Text className='form-label'>二级分类</Text>
              <Picker mode='selector' range={subNames} value={subKeys.indexOf(formSubKey)} onChange={(e) => setFormSubKey(subKeys[Number(e.detail.value)])}>
                <View className='picker'>
                  <Text style={formSubKey ? '' : 'color:var(--faint)'}>
                    {formSubKey ? subs.find((s: any) => s.key === formSubKey)?.name : '选择小类'}
                  </Text>
                  <Text className='arrow'>▼</Text>
                </View>
              </Picker>
            </View>

            {/* 备注 */}
            <View className='form-item'>
              <Text className='form-label'>备注</Text>
              <Input className='note-input' placeholder='如：房租、Netflix' value={formNote} onInput={(e) => setFormNote(e.detail.value)} />
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
