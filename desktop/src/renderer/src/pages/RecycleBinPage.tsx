import { useState, useEffect } from 'react'
import { Card, Table, Tag, Space, Typography, Popconfirm, message, Button, Alert } from 'antd'
import { UndoOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

/**
 * 回收站（v0.6.7）：展示软删除的记录，可一键恢复。
 * 数据只是打了 deleted=1 标记，从未真正消失；恢复后同步会把"撤销凭条"带上云，
 * 其它设备（小程序/另一台电脑）同步后也会跟着恢复回来。
 */
function RecycleBinPage(): JSX.Element {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const pageSize = 15

  useEffect(() => { loadData() }, [page])

  async function loadData(): Promise<void> {
    setLoading(true)
    try {
      const result = await window.electronAPI.getRecordList({ page, pageSize, onlyDeleted: true })
      setData(result.rows)
      setTotal(result.total)
    } catch {
      message.error('加载失败')
    } finally {
      setLoading(false)
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

  const columns = [
    { title: '日期', dataIndex: 'record_date', key: 'date', width: 110 },
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (t: string) => t === 'income'
        ? <Tag color="green">收入</Tag>
        : <Tag color="volcano">支出</Tag>,
    },
    { title: '一级分类', dataIndex: 'category_name', key: 'cat', width: 110, render: (v: string) => v || '-' },
    { title: '二级分类', dataIndex: 'subcategory_name', key: 'sub', width: 110, render: (v: string) => v || '-' },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 100,
      render: (v: number) => <Text strong>¥{Number(v).toFixed(2)}</Text>,
    },
    { title: '备注', dataIndex: 'note', key: 'note', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 210,
      render: (_: any, r: any) => (
        <Space size={8}>
          <Popconfirm title="恢复这笔记录？" description="恢复后账单页面会重新显示它" onConfirm={() => handleRestore(r.id)}>
            <Button size="small" type="primary" ghost icon={<UndoOutlined />}>恢复</Button>
          </Popconfirm>
          <Popconfirm title="彻底删除？" description="将从这台电脑和所有设备上永久清除，无法恢复" okText="彻底删除" okButtonProps={{ danger: true }} onConfirm={() => handlePurge(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>彻底删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 4 }}>
      <Title level={4} style={{ marginBottom: 4 }}>
        <Space><DeleteOutlined style={{ color: '#94A3B8' }} />回收站</Space>
      </Title>
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="删除的记录都留在这里，随时可以恢复"
        description="开启云同步后，恢复动作也会跟着同步到你的另一台设备；这里的记录不参与统计和导出。"
      />
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          locale={{ emptyText: '回收站是空的 — 删错的账都会先回到这里，别担心' }}
          pagination={{ current: page, pageSize, total, onChange: setPage, showTotal: (t) => `共 ${t} 条已删除记录` }}
          size="middle"
        />
        <Button icon={<ReloadOutlined />} onClick={loadData} style={{ marginTop: 8 }}>刷新</Button>
      </Card>
    </div>
  )
}

export default RecycleBinPage

