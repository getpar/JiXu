import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import {
  SavingsItem, SavingsSummary, getSavingsRecords, getDeletedSavings, getSavingsSummary,
  addSaving, updateSaving, deleteSaving, restoreSaving, syncSavingsNow,
} from '../../utils/savings'
import { formatMoney, formatMoneyExact, parseAmountInput, sanitizeAmountInput, AMOUNT_INPUT_MAX_LENGTH } from '../../utils/money'
import { localDateStr } from '../../utils/dates'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

const EMPTY_SUMMARY: SavingsSummary = { total: 0, totalIn: 0, totalOut: 0, monthIn: 0, monthOut: 0 }

export default function Savings(): JSX.Element {
  const dark = useThemeDark()
  const [items, setItems] = useState<SavingsItem[]>([])
  const [deleted, setDeleted] = useState<SavingsItem[]>([])
  const [summary, setSummary] = useState<SavingsSummary>(EMPTY_SUMMARY)
  const [showDeleted, setShowDeleted] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editing, setEditing] = useState<SavingsItem | null>(null)
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(localDateStr())
  const [note, setNote] = useState('')
  const [syncing, setSyncing] = useState(false)

  function refresh(): void {
    setItems(getSavingsRecords())
    setDeleted(getDeletedSavings())
    setSummary(getSavingsSummary())
  }

  async function doSync(showMessage = false): Promise<void> {
    if (syncing) return
    setSyncing(true)
    try {
      const r = await syncSavingsNow()
      if (r.ok) {
        refresh()
        if (showMessage) Taro.showToast({ title: `已同步：上传 ${r.pushed} 条、更新 ${r.applied} 条`, icon: 'none' })
      } else if (showMessage) {
        Taro.showToast({ title: '存钱云端暂不可用，先存本机', icon: 'none' })
      }
    } finally {
      setSyncing(false)
    }
  }

  useDidShow(() => {
    refresh()
    doSync(false)
  })

  function openAdd(dir: 'in' | 'out'): void {
    setEditing(null)
    setDirection(dir)
    setAmount('')
    setDate(localDateStr())
    setNote('')
    setShowDialog(true)
  }

  function openTake(): void {
    if (summary.total <= 0) {
      Taro.showToast({ title: '还没有存款，先存一笔吧', icon: 'none' })
      return
    }
    openAdd('out')
  }

  function openEdit(item: SavingsItem): void {
    setEditing(item)
    setDirection(item.direction)
    setAmount(String(item.amount))
    setDate(item.date)
    setNote(item.note || '')
    setShowDialog(true)
  }

  async function save(): Promise<void> {
    const parsed = parseAmountInput(amount)
    if (!parsed.ok) { Taro.showToast({ title: parsed.message, icon: 'none' }); return }
    if (direction === 'out' && parsed.value > summary.total + 0.004) {
      Taro.showToast({ title: '取钱金额不能大于存款总额', icon: 'none' })
      return
    }
    if (editing) {
      updateSaving(editing.id, parsed.value, date, note)
      Taro.showToast({ title: '已修改', icon: 'none' })
    } else {
      addSaving(direction, parsed.value, date, note)
      Taro.showToast({ title: direction === 'in' ? `已存入 ¥${formatMoneyExact(parsed.value)}` : `已取出 ¥${formatMoneyExact(parsed.value)}`, icon: 'none' })
    }
    setShowDialog(false)
    refresh()
  }

  function remove(item: SavingsItem): void {
    Taro.showModal({
      title: '删除这条存钱记录？',
      content: '删除后可在「已删除」里恢复，不影响任何账单。',
      success: (res) => {
        if (!res.confirm) return
        deleteSaving(item.id)
        refresh()
        Taro.showToast({ title: '已删除', icon: 'none' })
      },
    })
  }

  function restore(item: SavingsItem): void {
    Taro.showModal({
      title: '恢复这条存钱记录？',
      content: '恢复后会重新计入存钱罐总额。',
      success: (res) => {
        if (!res.confirm) return
        restoreSaving(item.id)
        refresh()
        Taro.showToast({ title: '已恢复', icon: 'none' })
      },
    })
  }

  function exportExcel(): void {
    if (items.length === 0) { Taro.showToast({ title: '无数据可导出', icon: 'none' }); return }
    const data = items.map((x) => ({
      '日期': x.date,
      '类型': x.direction === 'in' ? '存入' : '取出',
      '金额': x.amount,
      '备注': x.note || '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '存钱罐')
    const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    const fs = Taro.getFileSystemManager()
    const path = `${Taro.env.USER_DATA_PATH}/计序_存钱罐_${localDateStr()}.xlsx`
    fs.writeFile({
      filePath: path,
      data: new Uint8Array(wbout).buffer as any,
      success: () => {
        Taro.showActionSheet({
          itemList: ['发送给微信好友（也可发给自己保存）', '本机预览'],
          success: (res) => {
            if (res.tapIndex === 0) {
              Taro.shareFileMessage({
                filePath: path,
                fileName: `计序_存钱罐_${localDateStr()}.xlsx`,
                fail: (e) => {
                  if (e?.errMsg && e.errMsg.indexOf('cancel') >= 0) return
                  Taro.showToast({ title: '发送失败，请升级微信后重试', icon: 'none' })
                },
              })
            } else {
              Taro.openDocument({ filePath: path, showMenu: true })
            }
          },
          fail: () => { Taro.openDocument({ filePath: path, showMenu: true }) },
        })
      },
      fail: () => { Taro.showToast({ title: '导出失败', icon: 'none' }) },
    })
  }

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      <View className='sv-head'>
        <View>
          <Text className='sv-title'>存钱罐</Text>
          <Text className='sv-sub'>独立小账本 · 不计入本月结余</Text>
        </View>
        <Text className='sv-sync' onClick={() => doSync(true)}>{syncing ? '同步中…' : '同步'}</Text>
      </View>

      <View className='sv-hero'>
        <Text className='sv-hero-label'>当前存款</Text>
        <Text className='sv-hero-value'>¥{formatMoney(summary.total)}</Text>
        <View className='sv-hero-row'>
          <Text>累计存入 ¥{formatMoney(summary.totalIn)}</Text>
          <Text>累计取出 ¥{formatMoney(summary.totalOut)}</Text>
          <Text>本月存入 ¥{formatMoney(summary.monthIn)}</Text>
        </View>
      </View>

      <View className='sv-ops'>
        <View className='sv-op primary' onClick={() => openAdd('in')}><Text>+ 存一笔</Text></View>
        <View className={`sv-op${summary.total <= 0 ? ' disabled' : ''}`} onClick={openTake}><Text>− 取一笔</Text></View>
      </View>

      <View className='panel sv-panel'>
        <View className='sv-section-head'>
          <Text className='sv-section-title'>存钱记录</Text>
          <Text className='sv-export' onClick={exportExcel}>导出Excel</Text>
        </View>
        {items.length === 0 ? (
          <View className='sv-empty'><Text>还没有存钱记录，点「存一笔」开始吧</Text></View>
        ) : items.map((x) => (
          <View key={x.id} className='sv-row' onClick={() => openEdit(x)}>
            <View className='sv-row-info'>
              <Text className='sv-row-title'>{x.direction === 'in' ? '存入' : '取出'}</Text>
              <Text className='sv-row-meta'>{x.date} · {x.note || '现金'}</Text>
            </View>
            <Text className={`sv-row-amt${x.direction === 'out' ? ' out' : ''}`}>
              {x.direction === 'in' ? '+' : '−'}¥{formatMoneyExact(x.amount)}
            </Text>
            <Text className='sv-del' onClick={(e) => { e.stopPropagation(); remove(x) }}>删除</Text>
          </View>
        ))}
      </View>

      {deleted.length > 0 && (
        <View className='panel sv-panel'>
          <View className='sv-section-head' onClick={() => setShowDeleted(!showDeleted)}>
            <Text className='sv-section-title'>已删除 ({deleted.length})</Text>
            <Text className='sv-export'>{showDeleted ? '收起' : '展开'}</Text>
          </View>
          {showDeleted && deleted.map((x) => (
            <View key={x.id} className='sv-row'>
              <View className='sv-row-info'>
                <Text className='sv-row-title deleted'>{x.direction === 'in' ? '存入' : '取出'} ¥{formatMoneyExact(x.amount)}</Text>
                <Text className='sv-row-meta'>{x.date} · {x.note || '现金'}</Text>
              </View>
              <Text className='sv-restore' onClick={() => restore(x)}>恢复</Text>
            </View>
          ))}
        </View>
      )}

      {showDialog && (
        <View className='modal' onClick={() => setShowDialog(false)}>
          <View className='modal-box' onClick={(e) => e.stopPropagation()}>
            <Text className='sv-modal-title'>{editing ? '编辑存款记录' : direction === 'in' ? '存一笔' : '取一笔'}</Text>
            <Text className='sv-label'>金额</Text>
            <View className='sv-amount-wrap'>
              <Text className='sv-currency'>¥</Text>
              <Input
                className='sv-amount-input'
                type='digit'
                value={amount}
                placeholder='0.00'
                maxlength={AMOUNT_INPUT_MAX_LENGTH}
                onInput={(e) => setAmount(sanitizeAmountInput(e.detail.value))}
              />
            </View>
            <Text className='sv-label'>日期</Text>
            <Picker mode='date' value={date} onChange={(e) => setDate(e.detail.value)}>
              <View className='sv-picker'><Text>{date}</Text><Text className='sv-arrow'>›</Text></View>
            </Picker>
            <Text className='sv-label'>备注</Text>
            <Input className='sv-note' value={note} placeholder='可选：给妈妈保管、放在抽屉' maxlength={50} onInput={(e) => setNote(e.detail.value)} />
            <Text className='sv-modal-hint'>存钱罐独立记账，不影响首页收入、支出、结余。</Text>
            <View className='sv-modal-btns'>
              <View className='sv-btn cancel' onClick={() => setShowDialog(false)}><Text>取消</Text></View>
              <View className='sv-btn ok' onClick={save}><Text className='sv-btn-ok'>保存</Text></View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
