import { useState, useEffect } from 'react'
import { Popconfirm, message, Pagination } from 'antd'
import { Mod, Icon, CatIcon, F, dateLabel } from '../components/ui'
import type { RecordItem } from '../types/electron'

const PAGE_SIZE = 15

/**
 * 回收站（v0.6.7）：展示软删除的记录，可一键恢复。
 * 数据只是打了 deleted=1 标记，从未真正消失；恢复后同步会把"撤销凭条"带上云，
 * 其它设备（小程序/另一台电脑）同步后也会跟着恢复回来。
 */
function RecycleBinPage(): JSX.Element {
  const [data, setData] = useState<RecordItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => { loadData() }, [page])

  async function loadData(): Promise<void> {
    try {
      const result = await window.electronAPI.getRecordList({ page, pageSize: PAGE_SIZE, onlyDeleted: true })
      setData(result.rows)
      setTotal(result.total)
    } catch {
      message.error('加载失败')
    }
  }

  async function handleRestore(id: number): Promise<void> {
    const res = await window.electronAPI.restoreRecord(id)
    if (res?.restored) {
      message.success('已恢复！点击左侧「云同步」按钮可让其它设备也跟着恢复')
      loadData()
    } else {
      message.warning('这条记录已经不在回收站了')
    }
  }

  // v0.8.5 彻底删除：本地物理删除 + 注销凭条入队，点「云同步」后所有设备的回收站都会清掉这一笔
  async function handlePurge(id: number): Promise<void> {
    const res = await window.electronAPI.purgeRecordById(id)
    if (res?.ok) {
      message.success('已彻底删除！点击「云同步」可让其它设备跟着清除')
      loadData()
    } else {
      message.warning('这条记录已经不在回收站了')
    }
  }

  return (
    <>
      <Mod
        className="mb8"
        title="回收站"
        en="TRASH"
        right={
          <button className="mini" onClick={loadData}>
            <Icon n="refresh" cls="s" />
            刷新
          </button>
        }
      >
        <p style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.7 }}>
          删除的记录都留在这里，随时可以恢复。开启云同步后，恢复动作也会跟着同步到你的另一台设备；这里的记录不参与统计和导出。
        </p>
      </Mod>

      <Mod id="T-01" className="logm" title="已删除记录" en={`TRASH · ${total}`}>
        {data.length === 0 && (
          <div className="nosig">
            <b>回收站是空的</b>
            <p>删错的账都会先回到这里，别担心</p>
          </div>
        )}
        <div className="rows trash">
          {data.map((r) => {
            const inc = r.type === 'income'
            return (
              <div className="row" key={r.id}>
                <div className="rw">
                  <span className="pict">
                    <CatIcon k={r.category_key} />
                  </span>
                  <span className="tx">
                    <b>{r.subcategory_name}</b>
                    <i>
                      {dateLabel(r.record_date)} · {r.note || r.category_name}
                      {r.person ? ` · ${r.person}` : ''}
                    </i>
                  </span>
                  <span className={`amt${inc ? ' in' : ''}`}>
                    {inc ? '+' : '−'}
                    {F(r.amount)}
                  </span>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Popconfirm title="恢复这笔记录？" description="恢复后账单页面会重新显示它" onConfirm={() => handleRestore(r.id)}>
                      <button className="mini">
                        <Icon n="restore" cls="s" />
                        恢复
                      </button>
                    </Popconfirm>
                    <Popconfirm
                      title="彻底删除？"
                      description="将从这台电脑和所有设备上永久清除，无法恢复"
                      okText="彻底删除"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handlePurge(r.id)}
                    >
                      <button className="ib del" aria-label="彻底删除">
                        <Icon n="trash" cls="s" />
                      </button>
                    </Popconfirm>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              onChange={setPage}
              showSizeChanger={false}
              size="small"
            />
          </div>
        )}
      </Mod>
    </>
  )
}

export default RecycleBinPage
