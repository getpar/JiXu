import { formatMoneyExact } from '../utils/money'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { message, Modal, Input, QRCode, notification } from 'antd'
import { Icon } from './ui'
import {
  AppCtx,
  getTheme,
  setTheme,
  subscribeTheme,
  getUiStyle,
  setUiStyle,
  subscribeUiStyle,
  type Theme,
  type UiStyle,
} from './appCtx'
import {
  initCloud, isConnected, performSync, disconnect,
  getOwnerId, setOwnerId, newOwnerId, formatOwnerId, getEnvId,
  createPairRequest, pollPairAck, deletePairRequest, type PairRequest,
} from '../services/cloudbase'
import { runSavingsSync } from '../services/savingsCloud'

// 默认云环境（与小程序端 cloud.ts 的 CLOUD_ENV_ID 一致），弹窗可改
const DEFAULT_CLOUD_ENV_ID = 'daily-notes-d3gaotrwyc09ff44a'
// 配对时显示的电脑名称（写进 pair_req / 二维码，手机端可见）
const PAIR_DEVICE_NAME = 'Windows 电脑'

interface NavItem {
  key: string
  icon: string
  label: string
  cn: string
  en: string
  id: string
}

const NAV: NavItem[] = [
  { key: '/home', icon: 'home', label: '首页', cn: '总览', en: 'OVERVIEW', id: '01' },
  { key: '/add', icon: 'add', label: '记一笔', cn: '记一笔', en: 'ENTRY', id: '02' },
  { key: '/history', icon: 'log', label: '账单', cn: '账单', en: 'LOG', id: '03' },
  { key: '/stats', icon: 'stats', label: '统计', cn: '统计', en: 'ANALYSIS', id: '04' },
  { key: '/categories', icon: 'tag', label: '分类', cn: '分类', en: 'CATEGORIES', id: '05' },
  { key: '/recurring', icon: 'cyc', label: '周期', cn: '周期', en: 'RECURRING', id: '06' },
  { key: '/todos', icon: 'todo', label: '待办', cn: '待办', en: 'TODO', id: '07' },
  { key: '/savings', icon: 'db', label: '存钱', cn: '存钱罐', en: 'SAVINGS', id: '08' },
  { key: '/recycle-bin', icon: 'trash', label: '回收站', cn: '回收站', en: 'TRASH', id: '09' },
]

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function AppLayout(): JSX.Element {
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [uiStyle, setUiStyleState] = useState<UiStyle>(getUiStyle())
  const [shortcut, setShortcut] = useState('Ctrl+Shift+N')
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false)
  const [shortcutInput, setShortcutInput] = useState('')
  const [cloudEnabled, setCloudEnabled] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [cloudModalOpen, setCloudModalOpen] = useState(false)
  const [cloudEnvId, setCloudEnvId] = useState(localStorage.getItem('cloud_envId') || DEFAULT_CLOUD_ENV_ID)
  const [cloudCode, setCloudCode] = useState('')
  const [syncCode, setSyncCode] = useState('')
  // 扫码配对（方案B）
  const [pairReq, setPairReq] = useState<PairRequest | null>(null)
  const [pairLoading, setPairLoading] = useState(false)
  const [pairWaiting, setPairWaiting] = useState(false)
  const [pairError, setPairError] = useState('')
  const pairTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pairDocRef = useRef<string | null>(null)
  const pairEnvRef = useRef('')
  const pairOpenRef = useRef(false)          // 弹窗是否仍打开（防取消后异步回调继续生成/绑定）
  const pairActiveRef = useRef<string | null>(null) // 当前有效的 pairingId（防取消后旧请求回来误绑定）
  const syncRef = useRef<(() => Promise<void>) | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState(Date.now())
  const [now, setNow] = useState(() => new Date())
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => subscribeTheme(setThemeState), [])
  useEffect(() => subscribeUiStyle(setUiStyleState), [])

  // 始终保持最新的同步函数引用（配对成功后自动同步用，避免拿到旧闭包）
  useEffect(() => {
    syncRef.current = handleSync
  })

  // 云同步弹窗关闭（取消 / 遮罩 / ESC / 绑定成功）时：停止轮询并尽力删除配对请求
  useEffect(() => {
    if (cloudModalOpen) return
    pairOpenRef.current = false
    stopPairPolling()
    cleanupPairRequest()
    setPairReq(null)
    setPairError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudModalOpen])

  // 组件卸载时清 interval + 删除配对请求（尽力清理）
  useEffect(() => {
    return () => {
      pairOpenRef.current = false
      pairActiveRef.current = null
      if (pairTimerRef.current !== null) {
        clearInterval(pairTimerRef.current)
        pairTimerRef.current = null
      }
      const docId = pairDocRef.current
      pairDocRef.current = null
      if (docId) void deletePairRequest(docId)
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    loadShortcut()
    loadCloudStatus()
    setSyncCode(formatOwnerId(getOwnerId()))
    // 键盘导航：Ctrl+数字 切换页面
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const keyMap: Record<string, string> = {
        '1': '/home', '2': '/add', '3': '/history',
        '4': '/stats', '5': '/categories', '6': '/recurring', '7': '/todos', '8': '/savings',
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
        .map((b) => `${b.name} ${b.type === 'income' ? '+' : '-'}¥${formatMoneyExact(b.amount)}`)
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

  const toggleTheme = useCallback((): void => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme])

  const changeUiStyle = useCallback((s: UiStyle): void => {
    setUiStyle(s)
  }, [])

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

  // v0.8.6 一键清空全部账单：软删全部→同步(删凭证)→彻底删除(注销凭条)→同步，全程走真实同步链路，
  // 对端（小程序/另一台电脑）同步后回收站也会一并清除，不回流。彻底删除本地行前务必提示用户先备份。
  async function handleClearAll(): Promise<void> {
    Modal.confirm({
      title: '确定清空全部账单？',
      content: '这会删除本机上所有账单记录（含回收站），且不可撤销。若已开启云同步，其它设备同步后也会跟着清空。建议先点「备份数据」。',
      okText: '确定清空',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        if (syncing) { message.warning('请先等待当前同步完成'); return }
        setClearing(true)
        try {
          const online = isConnected() // 未连云端时跳过同步步骤，注销凭条留在队列里下次同步自动补传
          await window.electronAPI.softDeleteAllRecords()
          if (online) await handleSync() // 删除凭证上云
          const res = await window.electronAPI.purgeAllRecords()
          if (res?.removed > 0 || res?.purgeKeys > 0) {
            if (online) await handleSync() // 注销凭条上云
            message.success(online
              ? `已清空 ${res.removed} 条账单，其它设备同步后会自动跟随清除`
              : `已清空 ${res.removed} 条账单（未连云同步，其它设备需在你下次同步后跟随清除）`)
            setTimeout(() => window.location.reload(), 1200) // 刷新各页面数据展示
          } else {
            message.info('本机已经没有账单了')
          }
        } catch (e: any) {
          message.error(`清空失败：${e.message || '未知错误'}`)
        } finally {
          setClearing(false)
        }
      },
    })
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

  /** 'YYYY-MM-DD HH:mm:ss'（本地时区）→ 毫秒时间戳；解析失败退 0（v0.8.7 提交时间随云同步用） */
  function dateStrToMs(s: string | undefined): number {
    if (!s) return 0
    const t = new Date(s.replace(' ', 'T')).getTime()
    return Number.isFinite(t) ? t : 0
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
        createdAt: dateStrToMs(r.created_at), // v0.8.7 提交时刻随云上云，对端同日排序一致
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
              created_at: cr.createdAt || cr.updatedAt, // v0.8.7 落库保留对端提交时刻（老云端数据退上云时刻）
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
        setLastSyncAt(Date.now())
        // 存钱罐独立同步：失败不影响账单同步结果（savings 集合未建时页面会提示仅本机）
        runSavingsSync().catch(() => { /* 下次进存钱页补同步 */ })
      } else {
        message.warning(result.error || '同步失败，请检查网络和环境 ID')
      }
    } catch (e: any) {
      message.error(`同步失败：${e.message || '未知错误'}`)
    } finally {
      setSyncing(false)
    }
  }

  // ---- 扫码配对（方案B：电脑显示二维码，手机小程序扫码绑定）----

  function stopPairPolling(): void {
    pairActiveRef.current = null
    if (pairTimerRef.current !== null) {
      clearInterval(pairTimerRef.current)
      pairTimerRef.current = null
    }
    setPairWaiting(false)
  }

  function cleanupPairRequest(): void {
    const docId = pairDocRef.current
    pairDocRef.current = null
    if (docId) void deletePairRequest(docId)
  }

  function startPairPolling(req: PairRequest): void {
    stopPairPolling()
    pairActiveRef.current = req.pairingId
    setPairWaiting(true)
    let inFlight = false
    const timer = setInterval(async () => {
      if (inFlight) return
      // 请求过期：停止轮询，提示重新生成
      if (Date.now() > req.expiresAt) {
        stopPairPolling()
        setPairError('二维码已过期，请重新生成')
        return
      }
      inFlight = true
      try {
        const owner = await pollPairAck(req.pairingId)
        // 等待期间弹窗被关闭 / 已重新生成：丢弃这次结果，不能让旧请求偷偷绑定
        if (pairActiveRef.current !== req.pairingId || !pairOpenRef.current) return
        if (!owner) return
        // 绑定成功
        stopPairPolling()
        if (!setOwnerId(owner)) {
          setPairError('收到的微信账本标识无效，请重新生成二维码')
          return
        }
        setSyncCode(formatOwnerId(owner))
        setCloudEnabled(true)
        if (pairEnvRef.current) localStorage.setItem('cloud_envId', pairEnvRef.current)
        message.success('已绑定微信账本')
        cleanupPairRequest()
        setPairReq(null)
        setPairError('')
        setCloudModalOpen(false)
        // handleSync 内部用 isConnected() 判断连接，不依赖 cloudEnabled state；这里直接触发一次完整同步
        window.setTimeout(() => { void syncRef.current?.() }, 0)
      } finally {
        inFlight = false
      }
    }, 1500)
    pairTimerRef.current = timer
  }

  async function handleGeneratePairQr(): Promise<void> {
    if (pairLoading) return
    setPairLoading(true)
    setPairError('')
    // 重新生成：先停旧轮询、清理旧请求
    stopPairPolling()
    cleanupPairRequest()
    setPairReq(null)
    try {
      const env = cloudEnvId.trim()
      if (!env) { message.warning('请先填写 CloudBase 环境 ID'); return }
      // 未连接（或环境换了）先初始化云连接
      if (!isConnected() || getEnvId() !== env) {
        const ok = await initCloud(env)
        if (!ok) {
          message.error('连接云端失败，请检查环境 ID 与匿名登录设置')
          return
        }
        // 初始化期间用户关掉了弹窗：不再继续生成
        if (!pairOpenRef.current) return
        setCloudEnabled(true)
      }
      pairEnvRef.current = env
      const req = await createPairRequest(PAIR_DEVICE_NAME)
      if (!pairOpenRef.current) {
        // 生成期间弹窗已关闭：顺手清掉刚创建的请求
        if (req?.docId) void deletePairRequest(req.docId)
        return
      }
      if (!req) {
        setPairError('生成绑定二维码失败，请稍后重试')
        return
      }
      pairDocRef.current = req.docId
      setPairReq(req)
      startPairPolling(req)
    } finally {
      setPairLoading(false)
    }
  }

  function closeCloudModal(): void {
    pairOpenRef.current = false
    stopPairPolling()
    cleanupPairRequest()
    setPairReq(null)
    setPairError('')
    setCloudModalOpen(false)
  }

  function openCloudModal(): void {
    pairOpenRef.current = true
    setPairError('')
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
        setSyncCode(formatOwnerId(getOwnerId()))
        message.success({ content: '云同步已连接', key: 'cloud' })
      } else {
        message.error({ content: '连接失败，请检查环境 ID 是否正确', key: 'cloud' })
      }
    } catch {
      message.error({ content: '连接失败', key: 'cloud' })
    }
  }

  function handleDisconnectCloud(): void {
    // 先清理配对请求（还需要 db 才能删），再断开
    stopPairPolling()
    cleanupPairRequest()
    setPairReq(null)
    setPairError('')
    disconnect()
    localStorage.removeItem('cloud_envId')
    setCloudEnabled(false)
    setCloudEnvId('')
    message.success('已断开云同步')
  }

  const active = '/' + location.pathname.split('/')[1]
  const nav = NAV.find((n) => n.key === active) || NAV[0]

  const clock = useMemo(() => {
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
  }, [now])
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const wd = WD[now.getDay()]

  const mins = Math.floor((Date.now() - lastSyncAt) / 60000)
  const syncTxt = syncing
    ? '同步中'
    : !cloudEnabled
      ? '未连接云端'
      : mins < 1
        ? '刚刚已同步'
        : `${mins} 分钟前已同步`

  const shared = useMemo(
    () => ({
      theme,
      toggleTheme,
      uiStyle,
      setUiStyle: changeUiStyle,
      syncing,
      cloudEnabled,
      syncCode,
      lastSyncAt,
      sync: handleSync,
      openCloud: openCloudModal,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, toggleTheme, uiStyle, changeUiStyle, syncing, cloudEnabled, syncCode, lastSyncAt],
  )

  return (
    <AppCtx.Provider value={shared}>
      <div className="app">
        <nav className="rail" aria-label="主导航">
          <button className="logo" onClick={() => navigate('/home')} aria-label="计序 首页">
            <b>计序</b>
            <i />
            <span>JX-26</span>
          </button>
          <div className="rail-g">
            {NAV.map((n) => (
              <button
                key={n.key}
                className={`ri ${active === n.key ? 'on' : ''}`}
                onClick={() => navigate(n.key)}
                title={n.cn}
                aria-current={active === n.key ? 'page' : undefined}
              >
                <Icon n={n.icon} />
                <span>{n.label}</span>
              </button>
            ))}
          </div>
          <div className="rail-end">
            <button
              className="ri2"
              onClick={() => changeUiStyle(uiStyle === 'miniapp' ? 'instrument' : 'miniapp')}
              title={uiStyle === 'miniapp' ? '界面风格：小程序靛风（点击切回夜航仪表）' : '界面风格：夜航仪表（点击切到小程序靛风）'}
              aria-label="切换界面风格"
            >
              <span className="ui-style-glyph">{uiStyle === 'miniapp' ? '靛' : '仪'}</span>
            </button>
            <button className="ri2" onClick={toggleTheme} title={theme === 'dark' ? '切换日间 / 夜航' : '切换日间 / 夜航'} aria-label="切换主题">
              <Icon n="theme" />
            </button>
            <button
              className="ri2"
              onClick={cloudEnabled ? handleSync : openCloudModal}
              title={cloudEnabled ? '同步数据' : '配置云端'}
              aria-label="同步"
            >
              <Icon n={syncing ? 'refresh' : 'up'} />
            </button>
            <button className="ri2" onClick={() => { setShortcutModalOpen(true); setShortcutInput(shortcut) }} title="快捷键" aria-label="快捷键">
              <Icon n="kb" />
            </button>
            <button className="ri2" onClick={handleBackup} title="备份数据" aria-label="备份数据">
              <Icon n="db" />
            </button>
            <button className="ri2" onClick={handleRestore} title="恢复数据" aria-label="恢复数据">
              <Icon n="down" />
            </button>
            <button className={`ri2 cor ${clearing ? 'amb' : ''}`} onClick={handleClearAll} title="清空全部账单" aria-label="清空全部账单">
              <Icon n="trash" />
            </button>
          </div>
        </nav>

        <header className="bar">
          <div className="crumb">
            <span className="id">{nav.id}</span>
            <b>{nav.cn}</b>
            <span className="en">{nav.en}</span>
          </div>
          <div className="clock">
            <span>
              {dateStr} {wd}
            </span>
            <span className="sep" />
            <b>{clock}</b>
            <span>LOCAL</span>
          </div>
          <div className="bar-r">
            <div className="sync" data-sync={syncing ? 'busy' : 'idle'}>
              <button className="sync-main" onClick={cloudEnabled ? handleSync : openCloudModal} aria-label="云同步">
                <i className="led" />
                <span>{syncTxt}</span>
                <span className="scanbar">
                  <i />
                </span>
              </button>
              {cloudEnabled && (
                <button className="code" onClick={openCloudModal} title="云同步设置">
                  已连接
                </button>
              )}
            </div>
            <button
              className="ghost"
              onClick={() => changeUiStyle(uiStyle === 'miniapp' ? 'instrument' : 'miniapp')}
              title="切换界面风格"
            >
              界面 · {uiStyle === 'miniapp' ? '小程序' : '仪表'}
            </button>
            <button className="ghost ic" onClick={toggleTheme} aria-label="切换日间 / 夜航">
              <Icon n="theme" />
            </button>
            <button className="cta" onClick={() => navigate('/add')}>
              + 记一笔
              <span className="kbd">Ctrl+2</span>
            </button>
          </div>
        </header>

        <main className="main">
          <div className="view">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 云同步配置弹窗（方案B：扫码配对优先，同步码折叠为高级备用） */}
      <Modal
        title="云同步设置"
        open={cloudModalOpen}
        onOk={handleConnectCloud}
        onCancel={closeCloudModal}
        okText="连接"
        cancelText="取消"
        width={520}
        footer={[
          cloudEnabled ? (
            <button key="off" className="mini" style={{ marginRight: 8 }} onClick={handleDisconnectCloud}>
              断开同步
            </button>
          ) : null,
          <button key="cancel" className="mini" style={{ marginRight: 8 }} onClick={closeCloudModal}>
            取消
          </button>,
          <button key="ok" className="mini ac" onClick={handleConnectCloud}>
            连接
          </button>,
        ]}
      >
        {/* 方案B：用手机小程序扫码绑定（推荐入口） */}
        <div className="pair-box">
          <div className="pair-head">用手机小程序绑定（推荐）</div>
          <p className="pair-desc">电脑显示二维码，手机打开计序小程序 → 云同步 → 扫码绑定电脑</p>
          {!pairReq ? (
            <button className="mini ac" onClick={handleGeneratePairQr} disabled={pairLoading}>
              {pairLoading ? '正在生成…' : '生成绑定二维码'}
            </button>
          ) : (
            <div className="pair-qr">
              <QRCode
                value={JSON.stringify({ v: 1, t: 'jixu-pair', pid: pairReq.pairingId, code: pairReq.shortCode, name: PAIR_DEVICE_NAME })}
                size={168}
                color="#000000"
                bgColor="#ffffff"
              />
              <div className="pair-code">{pairReq.shortCode}</div>
              <p className="pair-hint">手机扫码，或在手机小程序「云同步」里输入上方 6 位配对码</p>
              {pairWaiting && <p className="pair-wait">等待手机确认…</p>}
              <button className="mini" onClick={handleGeneratePairQr} disabled={pairLoading}>
                重新生成
              </button>
            </div>
          )}
          {pairError && <p className="pair-error">{pairError}</p>}
        </div>

        <div className="fields" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
          <span className="lb">环境 ID</span>
          <div className="fv">
            <Input
              placeholder="输入环境 ID，例如：daily-notes-xxx"
              value={cloudEnvId}
              onChange={(e) => setCloudEnvId(e.target.value)}
            />
          </div>
        </div>
        <p className="pair-env-hint">
          环境 ID 在腾讯云 CloudBase 控制台「环境设置」里复制，并开启<strong style={{ color: 'var(--tx)' }}>匿名登录</strong>。
        </p>

        {/* 原同步码输入折叠为「高级（备用同步码）」，保留输入 / 重新生成 / 复制 */}
        <details className="adv">
          <summary>高级（备用同步码）</summary>
          <div className="fields" style={{ gridTemplateColumns: '84px minmax(0,1fr)' }}>
            <span className="lb">同步码</span>
            <div className="fv">
              <Input
                placeholder="输入小程序上显示的同步码"
                value={cloudCode}
                onChange={(e) => setCloudCode(e.target.value)}
                style={{ letterSpacing: 1 }}
              />
              <button className="mini" onClick={() => setCloudCode(formatOwnerId(newOwnerId()))}>重新生成</button>
              <button
                className="mini"
                onClick={() => { navigator.clipboard.writeText(cloudCode); message.success('同步码已复制，去小程序里粘贴即可') }}
              >
                <Icon n="copy" cls="s" />
              </button>
            </div>
            <span className="lb">说明</span>
            <div className="fv" style={{ alignItems: 'flex-start' }}>
              <p style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--dim)', margin: 0 }}>
                手机小程序和电脑输入同一个码 = 同一本账；别人用你的安装包也会自动分到各自的账本，互相看不到。
                扫码绑定失败时，可在这里手动输入同步码后点「连接」。
              </p>
            </div>
          </div>
        </details>
      </Modal>

      {/* 快捷键设置弹窗 */}
      <Modal
        title="自定义快捷键"
        open={shortcutModalOpen}
        onCancel={() => setShortcutModalOpen(false)}
        width={440}
        footer={[
          <button key="cancel" className="mini" style={{ marginRight: 8 }} onClick={() => setShortcutModalOpen(false)}>
            取消
          </button>,
          <button key="ok" className="mini ac" onClick={saveShortcut}>
            保存
          </button>,
        ]}
      >
        <p style={{ color: 'var(--dim)', fontSize: 12, lineHeight: 1.8, marginBottom: 14 }}>
          输入想要的快捷键组合，修改后立即生效。常用格式：
          <span className="kbd" style={{ margin: '0 4px' }}>Ctrl+Shift+N</span>
          <span className="kbd" style={{ margin: '0 4px' }}>Alt+Space</span>
          <span className="kbd" style={{ marginLeft: 4 }}>Ctrl+Shift+K</span>
        </p>
        <div
          tabIndex={0}
          onKeyDown={handleKeyCapture}
          onClick={(e) => (e.target as HTMLElement).focus()}
          style={{
            border: '1px solid var(--ac)',
            borderRadius: 2,
            padding: '10px 16px',
            fontSize: 17,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            background: 'var(--p2)',
            outline: 'none',
          }}
        >
          {shortcutInput || <span style={{ color: 'var(--fnt)' }}>点击这里，然后按下组合键…</span>}
        </div>
      </Modal>
    </AppCtx.Provider>
  )
}

export default AppLayout
