import { View, Text, Picker, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { getRecords, deleteRecord, updateRecord, getMergedCategories, syncNow, restoreRecord, getDeletedRecords, localDateStr } from '../../utils/storage'
import * as XLSX from 'xlsx'
import './index.scss'

function getMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function History(): JSX.Element {
  const [records, setRecords] = useState<any[]>([])
  const [keyword, setKeyword] = useState('')
  const [month, setMonth] = useState('')
  const [type, setType] = useState('')

  // v0.6.8 回收站折叠区：已删除记录（本地留底，可恢复）
  const [deletedList, setDeletedList] = useState<any[]>([])
  const [trashOpen, setTrashOpen] = useState(false)

  // 编辑弹窗
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [editType, setEditType] = useState<'expense'|'income'>('expense')
  const [editAmt, setEditAmt] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editSub, setEditSub] = useState('')
  const [editNote, setEditNote] = useState('')

  useDidShow(() => {
    getRecords().then(setRecords)
    setDeletedList(getDeletedRecords())
    // 进入账单页时与云端同步一次，拉到新记录就重新列表
    syncNow().then((r) => {
      if (r.pulled > 0) { getRecords().then(setRecords); setDeletedList(getDeletedRecords()) }
    }).catch(() => { /* ignore */ })
  })

  async function handleDelete(id: string): Promise<void> {
    Taro.showModal({ title: '确定删除？', success: async (res) => {
      if (res.confirm) { await deleteRecord(id); setRecords(await getRecords()); setDeletedList(getDeletedRecords()); Taro.eventCenter.trigger('dataChanged') }
    }})
  }

  // v0.6.8 从回收站恢复（restoreRecord 内部会静默同步，恢复动作跟到其它端）
  async function handleRestore(id: string): Promise<void> {
    Taro.showModal({ title: '恢复这条记录？', content: '恢复后将回到账单列表，其它设备同步后也会跟着恢复', success: async (res) => {
      if (res.confirm) {
        await restoreRecord(id)
        setRecords(await getRecords()); setDeletedList(getDeletedRecords())
        Taro.eventCenter.trigger('dataChanged')
        Taro.showToast({ title: '已恢复', icon: 'success' })
      }
    }})
  }

  function openEdit(r: any): void {
    setEditId(r.id); setEditType(r.type); setEditAmt(String(r.amount))
    setEditDate(r.date); setEditCat(r.categoryKey); setEditSub(r.subcategoryKey)
    setEditNote(r.note); setEditOpen(true)
  }

  async function saveEdit(): Promise<void> {
    const amt = parseFloat(editAmt)
    if (!amt || amt <= 0) { Taro.showToast({ title: '金额无效', icon: 'none' }); return }
    const currentCat = editCategories.find((c) => c.key === editCat)
    const sub = currentCat?.subs.find((s: any) => s.key === editSub)
    await updateRecord(editId, {
      type: editType, amount: amt, categoryKey: editCat, categoryName: currentCat!.name,
      subcategoryKey: editSub, subcategoryName: sub!.name, note: editNote, date: editDate,
    })
    setRecords(await getRecords()); Taro.eventCenter.trigger('dataChanged')
    setEditOpen(false)
    Taro.showToast({ title: '修改成功', icon: 'success' })
  }

  const [editCategories, setEditCategories] = useState<any[]>([])
  useEffect(() => { getMergedCategories().then(setEditCategories) }, [])
  const editCurrentCat = editCategories.find((c) => c.key === editCat)

  // 生成月份列表（当前月 + 往前11个月 + 全部日期）
  const now = new Date()
  const monthOptions = ['全部日期']
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // 筛选 + 倒序排列
  let filtered = records
  if (month) filtered = filtered.filter((r) => r.date.startsWith(month))
  if (type) filtered = filtered.filter((r) => r.type === type)
  if (keyword) filtered = filtered.filter((r) => r.note.includes(keyword) || r.categoryName.includes(keyword) || r.subcategoryName.includes(keyword))
  filtered = [...filtered].sort((a, b) => b.date.localeCompare(a.date))

  const expenseSum = filtered.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
  const incomeSum = filtered.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0)

  function handleExport(): void {
    if (filtered.length === 0) { Taro.showToast({ title: '无数据可导出', icon: 'none' }); return }
    const data = filtered.map((r) => ({
      '日期': r.date, '类型': r.type === 'expense' ? '支出' : '收入',
      '一级分类': r.categoryName, '二级分类': r.subcategoryName,
      '金额': r.amount, '备注': r.note,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '账单')
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const fs = Taro.getFileSystemManager()
    const path = `${Taro.env.USER_DATA_PATH}/每日小记_${localDateStr()}.xlsx`
    fs.writeFile({
      filePath: path, data: new Uint8Array(wbout).buffer as any,
      success: () => { Taro.openDocument({ filePath: path, showMenu: true }) },
      fail: () => { Taro.showToast({ title: '导出失败', icon: 'none' }) },
    })
  }

  return (
    <View className='wrap'>
      {/* 筛选栏 */}
      <View className='filter-row'>
        <Picker mode='selector' range={monthOptions} onChange={(e) => { const v = Number(e.detail.value); setMonth(v === 0 ? '' : monthOptions[v]) }}>
          <View className='filter-item'><Text>{month || '全部日期'}</Text></View>
        </Picker>
        <Picker mode='selector' range={['全部','支出','收入']} onChange={(e) => { const v = Number(e.detail.value); setType(v === 1 ? 'expense' : v === 2 ? 'income' : '') }}>
          <View className='filter-item'><Text>{type === 'expense' ? '支出' : type === 'income' ? '收入' : '全部'}</Text></View>
        </Picker>
      </View>

      <View className='search-bar'>
        <input className='search-input' placeholder='搜索备注或分类...' value={keyword} onInput={(e: any) => setKeyword(e.detail.value)} />
        {keyword && <Text className='search-clear' onClick={() => setKeyword('')}>✕</Text>}
      </View>

      <View className='summary'>
        <Text className='summary-item red'>支出 ¥{expenseSum.toFixed(2)}</Text>
        <Text className='summary-item green'>收入 ¥{incomeSum.toFixed(2)}</Text>
        <Text className='summary-item'>共 {filtered.length} 条</Text>
        <Text className='export-btn' onClick={handleExport}>导出Excel</Text>
      </View>

      {filtered.length === 0 ? (
        <View className='empty'><Text>暂无记录</Text></View>
      ) : filtered.map((r) => (
        <View key={r.id} className='record'>
          <View className='record-main'>
            <View className='record-info'>
              <View className='record-tags'>
                <Text className='tag orange'>{r.categoryName}</Text>
                <Text className='tag'>{r.subcategoryName}</Text>
              </View>
              <Text className='record-date'>{r.date} {r.note || ''}</Text>
            </View>
            <View className='record-right'>
              <Text className={`record-amount ${r.type === 'income' ? 'green' : 'red'}`}>{r.type === 'income' ? '+' : '-'}¥{r.amount.toFixed(2)}</Text>
              <View className='record-actions'>
                <Text className='edit-btn' onClick={() => openEdit(r)}>编辑</Text>
                <Text className='delete-btn' onClick={() => handleDelete(r.id)}>删除</Text>
              </View>
            </View>
          </View>
        </View>
      ))}

      {/* v0.6.8 回收站折叠区：误删的账都留底在这里，点开可恢复 */}
      {deletedList.length > 0 && (
        <View className='trash'>
          <View className='trash-head' onClick={() => setTrashOpen(!trashOpen)}>
            <Text className='trash-title'>🗑 已删除 ({deletedList.length})</Text>
            <Text className='trash-arrow'>{trashOpen ? '收起 ▴' : '展开 ▾'}</Text>
          </View>
          {trashOpen && (
            <View>
              <View className='trash-tip'><Text>误删的账可以恢复，恢复后其它设备同步时也会跟着恢复</Text></View>
              {deletedList.map((r) => (
                <View key={r.id} className='trash-record'>
                  <View className='record-info'>
                    <View className='record-tags'>
                      <Text className='tag orange'>{r.categoryName}</Text>
                      <Text className='tag'>{r.subcategoryName}</Text>
                    </View>
                    <Text className='record-date'>{r.date} {r.note || ''}</Text>
                  </View>
                  <View className='record-right'>
                    <Text className='trash-amount'>{r.type === 'income' ? '+' : '-'}¥{r.amount.toFixed(2)}</Text>
                    <View className='record-actions'>
                      <Text className='restore-btn' onClick={() => handleRestore(r.id)}>恢复</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 编辑弹窗 */}
      {editOpen && (
        <View className='modal' onTouchEnd={() => setEditOpen(false)}>
          <View className='modal-box' onTouchEnd={(e) => e.stopPropagation()}>
            <Text className='modal-title'>编辑记录</Text>

            <View className='form-item'><Text className='form-label'>金额</Text>
              <View className='amount-row'><Text className='currency'>¥</Text><Input className='amount-input' type='digit' value={editAmt} onInput={(e) => setEditAmt(e.detail.value)} /></View>
            </View>

            <View className='form-item'><Text className='form-label'>日期</Text>
              <Picker mode='date' value={editDate} onChange={(e) => setEditDate(e.detail.value)}>
                <View className='picker'><Text>{editDate}</Text><Text className='arrow'>›</Text></View>
              </Picker>
            </View>

            <View className='form-item'><Text className='form-label'>分类</Text>
              <Picker mode='selector' range={editCategories} rangeKey='name' onChange={(e) => { setEditCat(editCategories[Number(e.detail.value)].key); setEditSub('') }}>
                <View className='picker'><Text>{editCurrentCat?.name || '选择一级分类'}</Text><Text className='arrow'>›</Text></View>
              </Picker>
              {editCurrentCat && (
                <View className='sub-grid' style={{ marginTop: '12rpx' }}>
                  {editCurrentCat.subs.map((s: any) => (
                    <View key={s.key} className={`sub-item ${editSub === s.key ? 'sub-active' : ''}`} onTouchEnd={(e) => { e.stopPropagation(); setEditSub(s.key) }}>
                      <Text>{s.name}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View className='form-item'><Text className='form-label'>备注</Text>
              <Input className='note-input' value={editNote} onInput={(e) => setEditNote(e.detail.value)} maxlength={200} />
            </View>

            <View className='modal-btns'>
              <View className='btn btn-cancel' hoverClass='btn-hover' onTouchEnd={(e) => { e.stopPropagation(); setEditOpen(false) }}><Text>取消</Text></View>
              <View className='btn btn-ok' hoverClass='btn-hover' onTouchEnd={(e) => { e.stopPropagation(); saveEdit() }}><Text className='btn-ok-text'>保存</Text></View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
