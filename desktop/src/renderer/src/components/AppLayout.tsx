import { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography, Button, Switch, message, Modal, Input, Space, notification } from 'antd'
import {
  HomeOutlined, PlusCircleOutlined, UnorderedListOutlined, BarChartOutlined,
  TagsOutlined, SyncOutlined, SunOutlined, MoonOutlined,
  DownloadOutlined, UploadOutlined, ThunderboltOutlined, CloudOutlined, CheckSquareOutlined, CopyOutlined, DeleteOutlined,
} from '@ant-design/icons'
import {
  initCloud, isConnected, getEnvId, performSync, disconnect, CloudRecord,
  getOwnerId, setOwnerId, newOwnerId, formatOwnerId,
} from '../services/cloudbase'

const { Sider, Content } = Layout
const { Text } = Typography

// 默认云环境（与小程序端 cloud.ts 的 CLOUD_ENV_ID 一致），弹窗可改
const DEFAULT_CLOUD_ENV_ID = 'daily-notes-d3gaotrwyc09ff44a'

const menuItems = [
  { key: '/home', icon: <HomeOutlined />, label: '首页' },
  { key: '/add', icon: <PlusCircleOutlined />, label: '记一笔' },
  { key: '/history', icon: <UnorderedListOutlined />, label: '账单明细' },
  { key: '/stats', icon: <BarChartOutlined />, label: '统计分析' },
  { key: '/categories', icon: <TagsOutlined />, label: '分类管理' },
  { key: '/recurring', icon: <SyncOutlined />, label: '周期账单' },
  { key: '/todos', icon: <CheckSquareOutlined />, label: '待办事项' },
  { key: '/recycle-bin', icon: <DeleteOutlined />, label: '回收站' },
]

function AppLayout(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [darkMode, setDarkMode] = useState(false)
  const [shortcut, setShortcut] = useState('Ctrl+Shift+N')
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false)
  const [shortcutInput, setShortcutInput] = useState('')
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [cloudModalOpen, setCloudModalOpen] = useState(false)
  const [cloudEnvId, setCloudEnvId] = useState(localStorage.getItem('cloud_envId') || DEFAULT_CLOUD_ENV_ID)
  const [cloudCode, setCloudCode] = useState('')
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (localStorage.getItem('darkMode') === 'true') setDarkMode(true)
    loadShortcut()
    loadCloudStatus()
    // 键盘导航：Ctrl+数字 切换页面
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const keyMap: Record<string, string> = {
        '1': '/home', '2': '/add', '3': '/history',
        '4': '/stats', '5': '/categories', '6': '/recurring', '7': '/todos',
      }
      if (keyMap[e.key]) { e.preventDefault(); navigate(keyMap[e.key]) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  useEffect(() => {
    // 周期账单到期后由主进程自动入账 → 这里接收通知弹右下角浮窗提醒
    window.electronAPI.onRecurringAutoRun?.((list) => {
      if (!list || list.length === 0) return
      const summary = list
        .map((b) => `${b.name} ${b.type === 'income' ? '+' : '-'}¥${b.amount.toFixed(2)}`)
        .join('、')
      notification.success({
        message: `周期账单已自动入账 ${list.length} 笔`,
        description: `${summary}，下次到期日已自动更新`,
        placement: 'bottomRight',
        duration: 8,
      })
    })
  }, [])

  async function loadShortcut(): Promise<void> {
    try {
      const val = await window.electronAPI.getShortcut()
      if (val) { setShortcut(val); setShortcutInput(val) }
    } catch { /* ignore */ }
  }

  function handleKeyCapture(e: React.KeyboardEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const key = e.key
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    const keyMap: Record<string, string> = { ' ': 'Space', 'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right' }
    parts.push(keyMap[key] || (key.length === 1 ? key.toUpperCase() : key))
    setShortcutInput(parts.join('+'))
  }

  async function saveShortcut(): Promise<void> {
    try {
      await window.electronAPI.setShortcut(shortcutInput)
      setShortcut(shortcutInput)
      message.success(`快捷键已设为 ${shortcutInput}`)
      setShortcutModalOpen(false)
    } catch { message.error('快捷键设置失败') }
  }

  function toggleDarkMode(val: boolean): void {
    setDarkMode(val)
    localStorage.setItem('darkMode', String(val))
    document.documentElement.style.filter = val ? 'invert(0.9) hue-rotate(180deg)' : ''
    document.documentElement.style.background = val ? '#111' : ''
  }

  async function handleBackup(): Promise<void> {
    try {
      const result = await window.electronAPI.createBackup()
      if (result.success) message.success(`备份已保存到：${result.path}`)
    } catch { message.error('备份失败') }
  }

  async function handleRestore(): Promise<void> {
    try {
      const result = await window.electronAPI.restoreBackup()
      if (result.success) {
        message.success('数据已恢复，请重启应用')
        setTimeout(() => window.close(), 1500)
      } else if (result.error) {
        message.error(result.error)
      }
    } catch { message.error('恢复失败') }
  }

  async function loadCloudStatus(): Promise<void> {
    // 检查 localStorage 中是否保存了 envId（没填过则用默认环境），自动静重连
    const savedEnvId = localStorage.getItem('cloud_envId') || DEFAULT_CLOUD_ENV_ID
    if (savedEnvId) {
      setCloudEnvId(savedEnvId)
      try {
        const ok = await initCloud(savedEnvId)
        setCloudEnabled(ok)
        if (ok) localStorage.setItem('cloud_envId', savedEnvId)
      } catch { /* ignore */ }
    }
  }

  async function handleSync(): Promise<void> {
    if (syncing) return

    // 如果未连接，打开配置弹窗
    if (!isConnected()) {
      openCloudModal()
      return
    }

    setSyncing(true)
    try {
      // 1. 拉取全部本地记录（v0.6.6：includeDeleted 取全量底数，含已软删行；引擎按"本地总行数↔云端账单数"配对）
      const { rows } = await window.electronAPI.getRecordList({ page: 1, pageSize: 100000, includeDeleted: true })
      const localRecords = rows.map((r: any) => ({
        type: r.type,
        amount: Number(r.amount) || 0,
        categoryKey: r.category_key || '',
        categoryName: r.category_name || '',
        subcategoryKey: r.subcategory_key || '',
        subcategoryName: r.subcategory_name || '',
        note: r.note || '',
        date: r.record_date || '',
        person: r.person || '',
        deleted: r.deleted ? 1 : 0,
        reviveCount: r.revive_count || 0,
      }))

      // 2. 执行同步（v0.7.3：附带待办/周期账单快照，含软删项，LWW 由引擎计算）
      let localTodos: any[] = []
      let localRecurring: any[] = []
      try { localTodos = await window.electronAPI.getTodosForSync() || [] } catch { /* 老库无表时忽略 */ }
      try { localRecurring = await window.electronAPI.getRecurringForSync() || [] } catch { /* 同上 */ }
      // v0.8.5 本端待上传的"注销凭条"队列（回收站彻底删除产生，离线积压也在此补传）
      let pendingPurges: any[] = []
      try { pendingPurges = (await window.electronAPI.listPurges()).map((p: any) => ({ pid: p.pid, targetKey: p.target_key, cancelRec: p.cancel_rec, cancelTomb: p.cancel_tomb, cancelRev: p.cancel_rev, label: p.label })) } catch { /* 老库无表时忽略 */ }
      const { result, newCloudRecords, toMark, toAlive, toPurge, purgeUploadedPids, todoIncoming, recurringIncoming } = await performSync(localRecords, localTodos, localRecurring, pendingPurges)

      if (result.success) {
        // 3. 将云端新记录写入本地 SQLite
        let imported = 0
        for (const cr of newCloudRecords) {
          if (!cr.categoryKey || !cr.subcategoryKey) continue // 跳过缺分类键的历史残缺数据，不污染本地
          try {
            await window.electronAPI.addRecord({
              type: cr.type || 'expense',
              amount: cr.amount,
              category_key: cr.categoryKey,
              subcategory_key: cr.subcategoryKey,
              note: cr.note || '',
              record_date: cr.date,
              person: cr.person || '',
            })
            imported++
          } catch { /* skip duplicates */ }
        }

        // 4. 按云端"删除凭证"软删本地记录；按"撤销凭条"恢复（v0.6.7 回收站恢复跨端生效）
        let marked = 0
        for (const m of toMark) {
          try {
            const res = await window.electronAPI.markRecordByFingerprint(m.parts, m.count)
            marked += res?.marked || 0
          } catch { /* skip */ }
        }
        let revived = 0
        for (const a of toAlive) {
          try {
            const res = await window.electronAPI.restoreRecordByFingerprint(a.parts, a.count)
            revived += res?.restored || 0
          } catch { /* skip */ }
        }

        // 4a. v0.8.5 消费对端"注销凭条"：其它设备彻底删除的账，本端回收站也物理清除；
        //     本端已成功上云的凭条从待传队列清除（pid 幂等，失败下轮自动补传）
        let purged = 0
        for (const p of toPurge) {
          try {
            const res = await window.electronAPI.purgeLocalRecords(p.parts, p.count)
            purged += res?.removed || 0
          } catch { /* skip */ }
        }
        if (purgeUploadedPids?.length > 0) {
          try { await window.electronAPI.clearPurges(purgeUploadedPids) } catch { /* skip */ }
        }

        // 4b. v0.7.3 应用云端待办/周期账单快照（按 cloud_id upsert，含软删跟删）
        let entitiesApplied = 0
        try {
          if (todoIncoming?.length > 0) {
            const res = await window.electronAPI.applyCloudTodos(todoIncoming)
            entitiesApplied += res?.changed || 0
          }
          if (recurringIncoming?.length > 0) {
            const res = await window.electronAPI.applyCloudRecurring(recurringIncoming)
            entitiesApplied += res?.changed || 0
          }
        } catch { /* 回写失败不阻断账单同步结果 */ }

        if (result.uploaded === 0 && imported === 0 && marked === 0 && revived === 0 && purged === 0 && entitiesApplied === 0) {
          message.success('数据已是最新，无需同步')
        } else {
          const parts: string[] = []
          if (result.uploaded > 0) parts.push(`上传 ${result.uploaded} 条`)
          if (imported > 0) parts.push(`下载 ${imported} 条`)
          if (marked > 0) parts.push(`按云端凭证删除 ${marked} 条`)
          if (revived > 0) parts.push(`按云端凭条恢复 ${revived} 条`)
          if (purged > 0) parts.push(`清除彻底删除 ${purged} 条`)
          if (entitiesApplied > 0) parts.push(`同步待办/周期规则 ${entitiesApplied} 条`)
          message.success(`同步完成：${parts.join('，')}`)
          // 实体变化后通知当前页面刷新（待办/周期页监听）
          if (entitiesApplied > 0) window.dispatchEvent(new CustomEvent('entity-synced'))
        }
      } else {
        message.warning(result.error || '同步失败，请检查网络和环境 ID')
      }
    } catch (e: any) {
      message.error(`同步失败：${e.message || '未知错误'}`)
    } finally {
      setSyncing(false)
    }
  }

  function openCloudModal(): void {
    setCloudCode(formatOwnerId(getOwnerId()))
    setCloudModalOpen(true)
  }

  async function handleConnectCloud(): Promise<void> {
    const envId = cloudEnvId.trim()
    if (!envId) { message.warning('请输入 CloudBase 环境 ID'); return }

    // 同步码：填了就先校验再保存；没填则沿用/自动生成现有码
    const code = cloudCode.trim()
    if (code && !setOwnerId(code)) {
      message.error('同步码格式不对（至少 8 位字母或数字）')
      return
    }

    message.loading({ content: '正在连接...', key: 'cloud' })
    try {
      const ok = await initCloud(envId)
      if (ok) {
        localStorage.setItem('cloud_envId', envId)
        setCloudEnabled(true)
        setCloudModalOpen(false)
        message.success({ content: '云同步已连接', key: 'cloud' })
      } else {
        message.error({ content: '连接失败，请检查环境 ID 是否正确', key: 'cloud' })
      }
    } catch {
      message.error({ content: '连接失败', key: 'cloud' })
    }
  }

  async function handleDisconnectCloud(): Promise<void> {
    disconnect()
    localStorage.removeItem('cloud_envId')
    setCloudEnabled(false)
    setCloudEnvId('')
    message.success('已断开云同步')
  }

  const selectedKey = '/' + location.pathname.split('/')[1]

  // 侧边栏样式
  const siderStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
    borderRight: 'none',
    boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
  }

  const logoStyle: React.CSSProperties = {
    height: 68,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  }

  const footerStyle: React.CSSProperties = {
    padding: 12,
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.15)',
    flexShrink: 0,
  }

  const contentStyle: React.CSSProperties = {
    padding: 28,
    minHeight: '100vh',
    overflow: 'auto',
    background: '#F1F5F9',
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={siderStyle}
        trigger={null}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Logo */}
          <div style={logoStyle}>
            {collapsed ? (
              <span style={{ fontSize: 24 }}>📒</span>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#FF6B35', letterSpacing: 1 }}>
                  每日小记
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2, letterSpacing: 2 }}>
                  DAILY NOTES
                </div>
              </div>
            )}
          </div>

          {/* 菜单 */}
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            style={{
              background: 'transparent',
              borderRight: 0,
              marginTop: 12,
              flex: 1,
              overflow: 'auto',
            }}
            theme="dark"
          />

          {/* 底部操作区 */}
          <div style={footerStyle}>
            {!collapsed ? (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 10, padding: '0 4px',
                }}>
                  <span style={{ fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {darkMode ? <MoonOutlined /> : <SunOutlined />}
                    {darkMode ? '暗色模式' : '亮色模式'}
                  </span>
                  <Switch
                    size="small"
                    checked={darkMode}
                    onChange={toggleDarkMode}
                  />
                </div>
                <Button
                  ghost
                  size="small"
                  block
                  icon={<ThunderboltOutlined />}
                  onClick={() => { setShortcutModalOpen(true); setShortcutInput(shortcut) }}
                  style={{ marginBottom: 6, borderRadius: 8, borderColor: 'rgba(255,255,255,0.15)', color: '#CBD5E1' }}
                >
                  快捷键
                </Button>
                <Button
                  ghost
                  size="small"
                  block
                  icon={<CloudOutlined />}
                  onClick={cloudEnabled ? handleSync : openCloudModal}
                  loading={syncing}
                  style={{
                    marginBottom: 6, borderRadius: 8,
                    borderColor: cloudEnabled ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.15)',
                    color: cloudEnabled ? '#10B981' : '#CBD5E1',
                  }}
                >
                  {cloudEnabled ? '同步数据' : '配置云端'}
                </Button>
                {/* v0.6.8 修复：连接后也能重新打开弹窗查看/复制/更换同步码 */}
                <Button
                  ghost
                  size="small"
                  block
                  icon={<CopyOutlined />}
                  onClick={openCloudModal}
                  style={{ marginBottom: 6, borderRadius: 8, borderColor: 'rgba(255,255,255,0.15)', color: '#94A3B8', fontSize: 12 }}
                >
                  同步码 / 云设置
                </Button>
                <Button
                  ghost
                  size="small"
                  block
                  icon={<DownloadOutlined />}
                  onClick={handleBackup}
                  style={{ marginBottom: 6, borderRadius: 8, borderColor: 'rgba(255,255,255,0.15)', color: '#CBD5E1' }}
                >
                  备份数据
                </Button>
                <Button
                  ghost
                  size="small"
                  block
                  icon={<UploadOutlined />}
                  onClick={handleRestore}
                  style={{ borderRadius: 8, borderColor: 'rgba(255,255,255,0.15)', color: '#CBD5E1' }}
                >
                  恢复数据
                </Button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Switch size="small" checked={darkMode} onChange={toggleDarkMode} />
                <Button ghost size="small" type="text" icon={<ThunderboltOutlined />}
                  onClick={() => { setShortcutModalOpen(true); setShortcutInput(shortcut) }}
                  style={{ color: '#CBD5E1' }} />
                <Button ghost size="small" type="text" icon={<CloudOutlined />}
                  onClick={cloudEnabled ? handleSync : openCloudModal} loading={syncing}
                  style={{ color: cloudEnabled ? '#10B981' : '#CBD5E1' }} />
                <Button ghost size="small" type="text" icon={<CopyOutlined />}
                  onClick={openCloudModal} title="同步码 / 云设置"
                  style={{ color: '#94A3B8' }} />
                <Button ghost size="small" type="text" icon={<DownloadOutlined />}
                  onClick={handleBackup} style={{ color: '#CBD5E1' }} />
                <Button ghost size="small" type="text" icon={<UploadOutlined />}
                  onClick={handleRestore} style={{ color: '#CBD5E1' }} />
              </div>
            )}
          </div>
        </div>
      </Sider>

      {/* 收起按钮 */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'fixed',
          left: collapsed ? 64 : 204,
          bottom: 32,
          zIndex: 100,
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#FF6B35',
          color: '#FFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(255,107,53,0.4)',
          transition: 'all 0.2s ease',
          fontSize: 14,
          fontWeight: 700,
          userSelect: 'none',
        }}
        title={collapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        {collapsed ? '☰' : '✕'}
      </div>

      {/* 内容区 */}
      <Layout>
        <Content style={contentStyle}>
          <Outlet />
        </Content>
      </Layout>

      {/* 云同步配置弹窗 */}
      <Modal
        title="☁️ 云同步设置"
        open={cloudModalOpen}
        onOk={handleConnectCloud}
        onCancel={() => setCloudModalOpen(false)}
        okText="连接"
        cancelText="取消"
        width={480}
      >
        <div style={{ marginBottom: 20 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, color: '#1E293B' }}>CloudBase 环境 ID</div>
              <Input
                placeholder="输入环境 ID，例如：daily-notes-xxx"
                value={cloudEnvId}
                onChange={(e) => setCloudEnvId(e.target.value)}
                size="large"
                style={{ borderRadius: 10 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 500, color: '#1E293B' }}>同步码（同一本账的钥匙）</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="输入小程序上显示的同步码，或直接点右边生成"
                  value={cloudCode}
                  onChange={(e) => setCloudCode(e.target.value)}
                  size="large"
                  style={{ borderRadius: '10px 0 0 10px', letterSpacing: 1 }}
                />
                <Button size="large" onClick={() => setCloudCode(formatOwnerId(newOwnerId()))}>重新生成</Button>
                <Button size="large" icon={<CopyOutlined />}
                  onClick={() => { navigator.clipboard.writeText(cloudCode); message.success('同步码已复制，去小程序里粘贴即可') }} />
              </Space.Compact>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                手机小程序和电脑输入同一个码 = 同一本账；别人用你的安装包也会自动分到各自的账本，互相看不到
              </Text>
            </div>
            <div style={{
              background: '#FFFBF8', border: '1px solid #FFE0CC',
              borderRadius: 10, padding: 14, fontSize: 13, color: '#B45309',
            }}>
              <p style={{ margin: 0, lineHeight: 1.6 }}>
                💡 <strong>如何获取环境 ID？</strong><br />
                1. 打开 <a href="https://console.cloud.tencent.com/tcb" target="_blank" rel="noreferrer">腾讯云 CloudBase 控制台</a><br />
                2. 创建或选择一个环境<br />
                3. 在「环境设置」中开启<strong>匿名登录</strong><br />
                4. 复制环境 ID 粘贴到上方
              </p>
            </div>
          </Space>
        </div>
      </Modal>

      {/* 快捷键设置弹窗 */}
      <Modal
        title="自定义快捷键"
        open={shortcutModalOpen}
        onOk={saveShortcut}
        onCancel={() => setShortcutModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={420}
      >
        <p style={{ color: '#64748B', marginBottom: 16, lineHeight: 1.8 }}>
          输入想要的快捷键组合，修改后立即生效。常用格式：
          <code style={{ margin: '0 4px', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>Ctrl+Shift+N</code>
          <code style={{ margin: '0 4px', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>Alt+Space</code>
          <code style={{ marginLeft: 4, background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>Ctrl+Shift+K</code>
        </p>
        <div
          tabIndex={0}
          onKeyDown={handleKeyCapture}
          onClick={(e) => (e.target as HTMLElement).focus()}
          style={{
            border: '2px solid #FF6B35',
            borderRadius: 12,
            padding: '12px 18px',
            fontSize: 18,
            fontFamily: 'monospace',
            cursor: 'pointer',
            minHeight: 50,
            display: 'flex',
            alignItems: 'center',
            background: '#FFFBF8',
            outline: 'none',
            transition: 'box-shadow 0.2s',
          }}
        >
          {shortcutInput || <span style={{ color: '#bbb' }}>点击这里，然后按下组合键…</span>}
        </div>
      </Modal>
    </Layout>
  )
}

export default AppLayout
