import { useEffect, useState } from 'react'
import { Modal, InputNumber, Input, DatePicker, Popconfirm, message } from 'antd'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { Mod, Icon, HeroAmount, Ro, F, dateLabel, todayStr } from '../components/ui'
import { runSavingsSync } from '../services/savingsCloud'
import type { SavingsItem, SavingsSummary } from '../types/electron'

const EMPTY_SUMMARY: SavingsSummary = { total: 0, totalIn: 0, totalOut: 0, monthIn: 0, monthOut: 0 }

function SavingsPage(): JSX.Element {
  const [items, setItems] = useState<SavingsItem[]>([])
  const [deleted, setDeleted] = useState<SavingsItem[]>([])
  const [summary, setSummary] = useState<SavingsSummary>(EMPTY_SUMMARY)
  const [showDeleted, setShowDeleted] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<SavingsItem | null>(null)
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')

  async function load(): Promise<void> {
    const [list, deletedList, sum] = await Promise.all([
      window.electronAPI.getSavings(),
      window.electronAPI.getDeletedSavings(),
      window.electronAPI.getSavingsSummary(),
    ])
    setItems(list)
    setDeleted(deletedList)
    setSummary(sum)
  }

  useEffect(() => {
    load()
    runSavingsSync().then((r) => {
      if (r.success) load()
    }).catch(() => { /* 未连云时本地仍可用 */ })
  }, [])

  async function syncNow(): Promise<void> {
    setSyncing(true)
    try {
      const r = await runSavingsSync()
      if (r.success) {
        message.success(`存钱罐已同步：上传 ${r.pushed} 条，更新 ${r.applied} 条`)
        await load()
      } else {
        message.warning(`存钱云端暂不可用：${r.error || '未连接'}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  function openAdd(dir: 'in' | 'out'): void {
    if (dir === 'out' && summary.total <= 0) {
      message.info('还没有存款，先存一笔吧')
      return
    }
    setEditing(null)
    setDirection(dir)
    setAmount(null)
    setDate(todayStr())
    setNote('')
    setModalOpen(true)
  }

  function openEdit(item: SavingsItem): void {
    setEditing(item)
    setDirection(item.direction)
    setAmount(item.amount)
    setDate(item.date)
    setNote(item.note)
    setModalOpen(true)
  }

  async function save(): Promise<void> {
    if (!amount || amount <= 0) {
      message.warning('请输入正确金额')
      return
    }
    const maxOut = summary.total + (editing?.direction === 'out' ? editing.amount : 0)
    if (direction === 'out' && amount > maxOut + 0.004) {
      message.warning('取钱金额不能大于存款总额')
      return
    }
    if (editing) {
      await window.electronAPI.updateSaving(editing.id, { amount, date, note })
      message.success('已修改')
    } else {
      const r = await window.electronAPI.addSaving({ direction, amount, date, note })
      if (!r.success) {
        message.error(r.error || '保存失败')
        return
      }
      message.success(direction === 'in' ? `已存入 ¥${F(amount)}` : `已取出 ¥${F(amount)}`)
    }
    setModalOpen(false)
    await load()
    runSavingsSync().catch(() => { /* 下次同步补传 */ })
  }

  async function remove(id: string): Promise<void> {
    await window.electronAPI.deleteSaving(id)
    message.success('已删除，可在「已删除」里恢复')
    await load()
    runSavingsSync().catch(() => { /* 下次同步补传 */ })
  }

  async function restore(id: string): Promise<void> {
    await window.electronAPI.restoreSaving(id)
    message.success('已恢复')
    await load()
    runSavingsSync().catch(() => { /* 下次同步补传 */ })
  }

  async function exportExcel(): Promise<void> {
    if (items.length === 0) {
      message.warning('无数据可导出')
      return
    }
    const rows = items.map((x) => ({
      日期: x.date,
      类型: x.direction === 'in' ? '存入' : '取出',
      金额: x.amount,
      备注: x.note || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '存钱罐')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const result = await window.electronAPI.saveFile(`计序_存钱罐_${todayStr()}.xlsx`, Array.from(new Uint8Array(buf)))
    if (result.success) message.success(`已导出到：${result.path}`)
  }

  return (
    <div className="grid" style={{ rowGap: 'var(--gap)' }}>
      <Mod
        id="S-01"
        className="s-7 hero"
        title="存钱罐"
        en="SAVINGS · INDEPENDENT"
        right={
          <div className="ch">
            <button className="mini" onClick={syncNow} disabled={syncing}>
              <Icon n="refresh" cls="s" />
              {syncing ? '同步中…' : '同步'}
            </button>
            <button className="mini" onClick={exportExcel}>
              <Icon n="down" cls="s" />
              导出
            </button>
          </div>
        }
      >
        <HeroAmount v={summary.total} />
        <div className="ros" style={{ marginTop: 14 }}>
          <Ro cn="累计存入" en="IN" v={summary.totalIn} />
          <Ro cn="累计取出" en="OUT" v={summary.totalOut} />
          <Ro cn="本月存入" en="THIS MONTH" v={summary.monthIn} />
        </div>
        <div className="savings-actions">
          <button className="mini ac" onClick={() => openAdd('in')}>+ 存一笔</button>
          <button className="mini" onClick={() => openAdd('out')}>− 取一笔</button>
          <span className="savings-hint">独立小账本 · 不计入本月结余</span>
        </div>
      </Mod>

      <Mod id="S-02" className="s-5" title="存钱记录" en={`SAVINGS · ${items.length}`}>
        {items.length === 0 ? (
          <div className="nosig">
            <b>还没有存钱记录</b>
            <p>发工资后存一笔，这里就会亮起来</p>
          </div>
        ) : (
          <div className="savings-list">
            {items.map((x) => (
              <div className="savings-row" key={x.id}>
                <div className="savings-info">
                  <b>{x.direction === 'in' ? '存入' : '取出'}</b>
                  <span>{dateLabel(x.date)} · {x.note || '现金'}</span>
                </div>
                <span className={`savings-amt${x.direction === 'out' ? ' out' : ''}`}>
                  {x.direction === 'in' ? '+' : '−'}¥{F(x.amount)}
                </span>
                <button className="mini" onClick={() => openEdit(x)}>编辑</button>
                <Popconfirm
                  title="删除这条存钱记录？"
                  description="删除后可在「已删除」里恢复，不影响任何账单"
                  onConfirm={() => remove(x.id)}
                >
                  <button className="ib del" aria-label="删除"><Icon n="trash" cls="s" /></button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </Mod>

      {deleted.length > 0 && (
        <Mod className="s-12 flat" title={`已删除 (${deleted.length})`} en="RECYCLE">
          <button className="mini" onClick={() => setShowDeleted(!showDeleted)}>
            {showDeleted ? '收起' : '展开'}
          </button>
          {showDeleted && deleted.map((x) => (
            <div className="savings-row" key={x.id}>
              <div className="savings-info">
                <b>{x.direction === 'in' ? '存入' : '取出'} · ¥{F(x.amount)}</b>
                <span>{dateLabel(x.date)} · {x.note || '现金'}</span>
              </div>
              <Popconfirm title="恢复这条存钱记录？" onConfirm={() => restore(x.id)}>
                <button className="mini"><Icon n="restore" cls="s" />恢复</button>
              </Popconfirm>
            </div>
          ))}
        </Mod>
      )}

      <Modal
        open={modalOpen}
        title={editing ? '编辑存款记录' : direction === 'in' ? '存一笔' : '取一笔'}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        okText="保存"
        cancelText="取消"
      >
        <div className="savings-form">
          <label>金额</label>
          <InputNumber
            value={amount}
            min={0.01}
            max={999999999.99}
            precision={2}
            prefix="¥"
            style={{ width: '100%' }}
            onChange={(v) => setAmount(typeof v === 'number' ? v : null)}
          />
          <label>日期</label>
          <DatePicker
            value={dayjs(date)}
            allowClear={false}
            format="YYYY-MM-DD"
            style={{ width: '100%' }}
            onChange={(v) => v && setDate(v.format('YYYY-MM-DD'))}
          />
          <label>备注</label>
          <Input value={note} maxLength={50} placeholder="可选：给妈妈保管、放在抽屉" onChange={(e) => setNote(e.target.value)} />
          <span className="savings-hint">存钱罐独立记账，不影响首页收入、支出、结余。</span>
        </div>
      </Modal>
    </div>
  )
}

export default SavingsPage
