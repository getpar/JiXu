/**
 * 本地「模拟云」全链路验证脚本 — 纯 Node 运行，不需要微信开发者工具、不需要云环境
 *
 * 运行方式：cd miniapp && npm run verify:sync
 *
 * 验证的是与小程序上线时完全相同的同步核心（src/utils/cloudCore.ts）：
 * 模拟「桌面端 + 小程序」多台设备共用一个模拟云，依次跑通——
 *   ① 桌面记一笔 → 手机看得到
 *   ② 手机记一笔 → 桌面看得到
 *   ③ 反复同步不重复入账（幂等性）
 *   ④ 增量同步只拉新数据
 *   ⑤ 双端同记一笔 → 自动合并为一条
 *   ⑥ 不同同步码的两户互不可见（多用户隔离，方案 B）
 *   ⑦ 新设备输入相同同步码 → 拉回整户历史账
 *   ⑧ 同日同额同类两笔 → 按笔数配对，一笔不丢（v0.6.5，方案 C）
 *   ⑨ 桌面删一笔 → 小程序自动跟上标删，数据留底不真删（v0.6.6，方案乙）
 *   ⑩ 小程序改一笔 → 双端终态一致（编辑 = 旧笔凭证 + 新笔记账）
 *   ⑪ 两端各删一笔 → 新设备输入同步码，终态与两家完全一致
 *   ⑫ 回收站恢复一笔 → 上传撤销凭条，小程序自动跟着恢复（v0.6.7）
 *   ⑬ 删了又恢复反复横跳 → 凭证/撤销配对收敛，不倒灌不抽风
 *   ⑭ 删除+恢复混战后的新设备 → 终态与双端完全一致
 *   ⑮ 待办跨端 LWW 快照同步：新增跟随/编辑跟随/软删不复活/收敛（v0.7.3）
 *   ⑯ 周期账单改下次日期 → 对端跟随不倒灌；多用户隔离同样生效（v0.7.3）
 *   ⑰ 桌面彻底删除 → 注销凭条核销账单/凭证/撤销，对端回收站也清除，不回流（v0.8.5）
 *   ⑱ 小程序离线彻底删除 → 队列补传 + pid 幂等不重复，桌面跟随清除（v0.8.5）
 */
const path = require('path')
const {
  recordKey, cloudToLocal, localToCloud, createMockCloud, runSync,
} = require(path.join(__dirname, '..', '.sync-verify', 'cloudCore.js'))

// ---- 测试工具 ----

let failed = 0
function assert(cond, label) {
  if (cond) { console.log('  \x1b[32m✓\x1b[0m ' + label) }
  else { console.error('  \x1b[31m✗ ' + label + '\x1b[0m'); failed++ }
}

function memoryStore() {
  const m = new Map()
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v) }
}

// 全局虚拟时钟：所有设备共用，保证 updatedAt 大小关系可控
let clock = 1_700_000_000_000
const now = () => (clock += 1000)

function countBy(arr) {
  const m = new Map()
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1)
  return m
}

// 凭证/凭条的人话摘要（复刻 cloudCore.docLabel，供断言检查控制台可读性）
function docLabelOf(r) {
  return `${r.date} ${r.categoryName || ''}/${r.subcategoryName || ''} ¥${r.amount}${r.note ? ' 备注:' + r.note : ''}`
}

// ---- 模拟桌面端（复刻 desktop cloudbase.ts performSync v0.6.7 笔数配对 + 删除凭证 + 撤销凭条） ----

function createDesktopDevice(cloud, ownerId) {
  let local = []
  let pendingPurges = [] // v0.8.5 待上传注销凭条队列（彻底删除产生，离线也不丢）
  let lastSyncAt = 0
  const isTomb = (d) => d.kind === 'tombstone'
  const isRev = (d) => d.kind === 'revive'
  const isPur = (d) => d.kind === 'purge'
  const device = {
    /** 模拟用户在桌面端记一笔（写进本地 SQLite） */
    appAdd(r) { local.push({ ...r, id: local.length + 1, deleted: 0, reviveCount: 0 }) },
    /** 模拟点"删除"：只打标记，不同步（v0.6.6 软删除） */
    appDelete(filterFn) {
      const rec = local.find((r) => !(r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('桌面端没找到要删的记录')
      rec.deleted = 1
      return rec
    },
    /** 模拟"编辑"：旧行标删 + 新增一笔（与主进程 records:update 一致） */
    appUpdate(filterFn, patch) {
      const rec = local.find((r) => !(r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('桌面端没找到要改的记录')
      rec.deleted = 1
      local.push({ ...rec, ...patch, id: local.length + 1, deleted: 0, reviveCount: 0 })
      return rec
    },
    /** 模拟回收站"恢复"（v0.6.7：deleted 归 0、reviveCount+1，与 records:restore 一致） */
    appRestore(filterFn) {
      const rec = local.find((r) => (r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('桌面端回收站没找到要恢复的记录')
      rec.deleted = 0
      rec.reviveCount = (rec.reviveCount || 0) + 1
      return rec
    },
    /** 模拟回收站"彻底删除"（v0.8.5，与 records:purgeById 一致）：物理删行 + 注销凭条入队 */
    appPurge(filterFn) {
      const rec = local.find((r) => (r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('桌面端回收站没找到要彻底删除的记录')
      const v = rec.reviveCount || 0
      pendingPurges.push({ pid: `dpur_${now()}`, targetKey: recordKey(rec), cancelRec: 1, cancelTomb: 1 + v, cancelRev: v, label: docLabelOf(rec) })
      local = local.filter((r) => r !== rec)
      return rec
    },
    getLocal: () => local,
    /** 页面可见记录（已删的不显示，但库里留底） */
    visible: () => local.filter((r) => !(r.deleted > 0)),
    /** 模拟桌面端点击"同步"按钮 */
    async performSync() {
      const docs = await cloud.listAll(ownerId)
      const cloudPurges = docs.filter(isPur)
      const cloudRecs = docs.filter((d) => !isTomb(d) && !isRev(d) && !isPur(d))
      const cloudTombs = docs.filter(isTomb)
      const cloudRevs = docs.filter(isRev)
      // 0. v0.8.5 消费对端注销凭条：本端回收站那笔也物理删除（自己的不消费）
      let purged = 0
      const consume = new Map()
      for (const p of cloudPurges) {
        if (p.source === 'desktop') continue
        consume.set(p.targetKey, (consume.get(p.targetKey) || 0) + Math.max(0, p.cancelRec || 0))
      }
      consume.forEach((n, k) => {
        let left = n
        for (let i = local.length - 1; i >= 0 && left > 0; i--) {
          if ((local[i].deleted || 0) > 0 && recordKey(local[i]) === k) { local.splice(i, 1); left--; purged++ }
        }
      })
      // 注销核销聚合（v0.8.5b 时间戳感知）
      const cancelRec = new Map()
      const cancelTomb = new Map()
      const cancelRev = new Map()
      for (const p of cloudPurges) {
        const k = p.targetKey
        const pTime = p.updatedAt || 0
        const wantRec = Math.max(0, p.cancelRec || 0)
        const wantTomb = Math.max(0, p.cancelTomb || 0)
        const wantRev = Math.max(0, p.cancelRev || 0)
        const alreadyRec = cancelRec.get(k) || 0
        const alreadyTomb = cancelTomb.get(k) || 0
        const alreadyRev = cancelRev.get(k) || 0
        if (wantRec > 0) {
          const recBefore = cloudRecs.filter(r => recordKey(r) === k && (r.updatedAt || 0) < pTime).length
          cancelRec.set(k, alreadyRec + Math.min(wantRec, Math.max(0, recBefore - alreadyRec)))
        }
        if (wantTomb > 0) {
          const tombBefore = cloudTombs.filter(t => t.targetKey === k && (t.updatedAt || 0) < pTime).length
          cancelTomb.set(k, alreadyTomb + Math.min(wantTomb, Math.max(0, tombBefore - alreadyTomb)))
        }
        if (wantRev > 0) {
          const revBefore = cloudRevs.filter(v => v.targetKey === k && (v.updatedAt || 0) < pTime).length
          cancelRev.set(k, alreadyRev + Math.min(wantRev, Math.max(0, revBefore - alreadyRev)))
        }
      }
      const cloudRecCounts = countBy(cloudRecs.map(recordKey))
      const cloudTombCounts = countBy(cloudTombs.map((t) => t.targetKey))
      const cloudReviveCounts = countBy(cloudRevs.map((v) => v.targetKey))
      const effRec = (k) => Math.max(0, (cloudRecCounts.get(k) || 0) - (cancelRec.get(k) || 0))
      const effTomb = (k) => Math.max(0, (cloudTombCounts.get(k) || 0) - (cancelTomb.get(k) || 0))
      const effRev = (k) => Math.max(0, (cloudReviveCounts.get(k) || 0) - (cancelRev.get(k) || 0))
      const localTotals = countBy(local.map(recordKey))            // 存活 + 已删
      const deadList = local.filter((r) => (r.deleted || 0) > 0)
      const localDeadCounts = countBy(deadList.map(recordKey))
      // 凭证配额：死过 = 一张；每恢复过一次 = 历史再多一张（配额 = D + V）
      const tombDonors = []
      const reviveDonors = []
      for (const r of local) {
        if ((r.deleted || 0) > 0) tombDonors.push(r)
        for (let i = 0; i < (r.reviveCount || 0); i++) { tombDonors.push(r); reviveDonors.push(r) }
      }
      const tombQuota = countBy(tombDonors.map(recordKey))
      const localReviveCounts = countBy(reviveDonors.map(recordKey))
      let uploaded = 0
      // 0d. v0.8.5 上传本端注销凭条（pid 不在云端的才传，防重复核销）
      const cloudPids = new Set(cloudPurges.map((p) => p.pid))
      const uploading = pendingPurges.filter((p) => !cloudPids.has(p.pid))
      for (const p of uploading) {
        await cloud.add({ kind: 'purge', ...p, ownerId, updatedAt: now(), source: 'desktop' })
        uploaded++
        cancelRec.set(p.targetKey, (cancelRec.get(p.targetKey) || 0) + p.cancelRec)
        cancelTomb.set(p.targetKey, (cancelTomb.get(p.targetKey) || 0) + p.cancelTomb)
        cancelRev.set(p.targetKey, (cancelRev.get(p.targetKey) || 0) + p.cancelRev)
      }
      pendingPurges = pendingPurges.filter((p) => !uploading.includes(p))
      // 1. 补传账单：本地总行数超出云端有效账单数的部分（已删行也算底数）
      const pushPerKey = new Map()
      for (const r of local) {
        const k = recordKey(r)
        const need = (localTotals.get(k) || 0) - effRec(k)
        const done = pushPerKey.get(k) || 0
        if (need > 0 && done < need) {
          await cloud.add(localToCloud(r, 'desktop', now(), ownerId))
          uploaded++
          pushPerKey.set(k, done + 1)
        }
      }
      // 2a. 补传删除凭证：配额(D+V)超出云端有效凭证数的部分
      const pushTomb = new Map()
      for (const r of tombDonors) {
        const k = recordKey(r)
        const need = (tombQuota.get(k) || 0) - effTomb(k)
        const done = pushTomb.get(k) || 0
        if (need > 0 && done < need) {
          await cloud.add({ kind: 'tombstone', targetKey: k, ownerId, updatedAt: now(), source: 'desktop', label: docLabelOf(r) })
          uploaded++
          pushTomb.set(k, done + 1)
        }
      }
      // 2b. 补传撤销凭条：本地恢复数超出云端有效撤销数的部分
      const pushRev = new Map()
      for (const r of reviveDonors) {
        const k = recordKey(r)
        const need = (localReviveCounts.get(k) || 0) - effRev(k)
        const done = pushRev.get(k) || 0
        if (need > 0 && done < need) {
          await cloud.add({ kind: 'revive', targetKey: k, ownerId, updatedAt: now(), source: 'desktop', label: docLabelOf(r) })
          uploaded++
          pushRev.set(k, done + 1)
        }
      }
      // 3. 补拉账单：差额驱动防重复（v0.8.3 去掉时间窗，与真实 performSync 对齐）
      const cloudAllCounts = new Map()
      cancelRec.forEach((n, k) => cloudAllCounts.set(k, Math.max(0, (cloudRecCounts.get(k) || 0) - n)))
      cloudRecCounts.forEach((n, k) => { if (!cloudAllCounts.has(k)) cloudAllCounts.set(k, n) })
      pushPerKey.forEach((n, k) => cloudAllCounts.set(k, (cloudAllCounts.get(k) || 0) + n))
      const takenPerKey = new Map()
      let downloaded = 0
      for (const r of cloudRecs) {
        const k = recordKey(r)
        const cap = (cloudAllCounts.get(k) || 0) - (localTotals.get(k) || 0)
        const taken = takenPerKey.get(k) || 0
        if (cap > 0 && taken < cap) {
          takenPerKey.set(k, taken + 1)
          local.push({ ...cloudToLocal(r), deleted: 0, reviveCount: 0 })
          downloaded++
        }
      }
      // 4. 按净额跟随标删/恢复：净删除 = max(有效凭证 - 有效撤销, 0)，不设窗口，必收敛；本轮刚传的凭证/撤销也计入
      let marked = 0
      let revived = 0
      const netDel = new Map()
      cloudTombCounts.forEach((n, k) => netDel.set(k, Math.max(0, n - (cancelTomb.get(k) || 0))))
      pushTomb.forEach((n, k) => netDel.set(k, (netDel.get(k) || 0) + n))
      cloudReviveCounts.forEach((n, k) => netDel.set(k, Math.max(0, (netDel.get(k) || 0) - Math.max(0, n - (cancelRev.get(k) || 0)))))
      pushRev.forEach((n, k) => netDel.set(k, Math.max(0, (netDel.get(k) || 0) - n)))
      netDel.forEach((cnt, k) => {
        const d = localDeadCounts.get(k) || 0
        if (cnt > d) {
          let done = 0
          for (const r of local) {
            if (done >= cnt - d) break
            if (!(r.deleted > 0) && recordKey(r) === k) { r.deleted = 1; done++; marked++ }
          }
        } else if (cnt < d) {
          // 优先恢复 reviveCount 少的行（对齐 records:restoreByFingerprint 的 ORDER BY）
          const need = d - cnt
          const cands = local.filter((r) => (r.deleted > 0) && recordKey(r) === k)
            .sort((a, b) => (a.reviveCount || 0) - (b.reviveCount || 0))
          for (let i = 0; i < need && i < cands.length; i++) {
            cands[i].deleted = 0
            cands[i].reviveCount = (cands[i].reviveCount || 0) + 1
            revived++
          }
        }
      })
      lastSyncAt = now()
      return { uploaded, downloaded, marked, revived, purged }
    },
  }
  return device
}

// ---- 模拟小程序端（走真正的上线代码 runSync；删/改 = 写本地标记后由引擎推凭证） ----

function createMiniappDevice(cloud, ownerId) {
  let local = []
  let pendingPurges = [] // v0.8.5 待上传注销凭条队列
  const store = memoryStore()
  async function addLocal(recs) {
    let added = 0
    for (const r of recs) {
      if (r.id && local.some((l) => String(l.id) === String(r.id))) continue // 只防同一条云端记录重复导入
      local.push({ ...r, deleted: 0 })
      added++
    }
    return added
  }
  /** 模拟 storage.ts markLocalDeleted：按去重键把前 count 笔存活记录标删 */
  async function markLocal(key, count) {
    let done = 0
    for (const r of local) {
      if (done >= count) break
      if (!(r.deleted > 0) && recordKey(r) === key) { r.deleted = 1; done++ }
    }
    return done
  }
  /** 模拟 storage.ts markLocalAlive（v0.6.7）：按去重键把已删记录复活，reviveCount+1 */
  async function markLocalAlive(key, count) {
    let done = 0
    for (const r of local) {
      if (done >= count) break
      if ((r.deleted > 0) && recordKey(r) === key) {
        r.deleted = 0
        r.reviveCount = (r.reviveCount || 0) + 1
        done++
      }
    }
    return done
  }
  /** 模拟 storage.ts purgeLocalRecords（v0.8.5）：按去重键物理删除回收站行 */
  async function purgeLocal(key, count) {
    let done = 0
    for (let i = local.length - 1; i >= 0 && done < count; i--) {
      if ((local[i].deleted || 0) > 0 && recordKey(local[i]) === key) { local.splice(i, 1); done++ }
    }
    return done
  }
  function sync() {
    return runSync({
      cloud, source: 'miniapp', ownerId,
      getLocal: async () => local, addLocal, markLocal, markAlive: markLocalAlive,
      purgeLocal,
      purges: {
        getPending: () => pendingPurges,
        clearPending: (pids) => { const gone = new Set(pids); pendingPurges = pendingPurges.filter((p) => !gone.has(p.pid)) },
      },
      store, now,
    })
  }
  return {
    /** 模拟 storage.ts addRecord：写本地 + 立即触发一次同步（由引擎按笔数上云），返回同步结果 */
    async appAdd(r) {
      local.unshift({ ...r, id: String(now()), deleted: 0, reviveCount: 0 })
      return sync()
    },
    /** 模拟 storage.ts deleteRecord：标删 + 立即同步（凭证随同步上云） */
    async appDelete(filterFn) {
      const rec = local.find((r) => !(r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('小程序没找到要删的记录')
      rec.deleted = 1
      return sync()
    },
    /** 模拟 storage.ts updateRecord：旧笔标删 + 新笔插入 + 立即同步 */
    async appUpdate(filterFn, patch) {
      const rec = local.find((r) => !(r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('小程序没找到要改的记录')
      rec.deleted = 1
      local.unshift({ ...rec, ...patch, id: String(now()), deleted: 0, reviveCount: 0 })
      return sync()
    },
    /** 模拟回收站恢复（v0.6.7）：复活 + 上送撤销凭条 */
    async appRestore(filterFn) {
      const rec = local.find((r) => (r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('小程序没找到要恢复的记录')
      rec.deleted = 0
      rec.reviveCount = (rec.reviveCount || 0) + 1
      return sync()
    },
    /** 模拟回收站"彻底删除"（v0.8.5，与 storage.ts purgeRecord 一致）：物理删行 + 注销凭条入队。
     *  故意不自动 sync —— 验证离线积压场景，由测试显式调用 sync() 补传 */
    appPurge(filterFn) {
      const rec = local.find((r) => (r.deleted > 0) && filterFn(r))
      if (!rec) throw new Error('小程序回收站没找到要彻底删除的记录')
      const v = rec.reviveCount || 0
      pendingPurges.push({ pid: `mpur_${now()}`, targetKey: recordKey(rec), cancelRec: 1, cancelTomb: 1 + v, cancelRev: v, label: docLabelOf(rec) })
      local = local.filter((r) => r !== rec)
      return rec
    },
    getLocal: () => local,
    visible: () => local.filter((r) => !(r.deleted > 0)),
    /** 模拟页面 useDidShow 时触发的 syncNow */
    sync,
  }
}

// ---- v0.7.3 实体设备（待办/周期账单 LWW 快照，两端都走真正的上线引擎 runSync） ----

function createEntityDevice(cloud, ownerId, store) {
  const todos = []
  const recurring = []
  const holder = { todos, recurring }
  const specOf = (arr) => ({
    getLocal: async () => arr.map((e) => ({ ...e })),
    apply: async (items) => {
      let changed = 0
      for (const it of items) {
        const i = arr.findIndex((e) => String(e.id) === String(it.id))
        if (i >= 0) { arr[i] = { ...arr[i], ...it }; changed++ }
        else { arr.push({ ...it }); changed++ }
      }
      return changed
    },
  })
  return {
    holder,
    /** 模拟用户新增/编辑一个实体（每次改动刷 updatedAt，与 storage.ts 一致） */
    appPut(arrName, entity) {
      const arr = holder[arrName]
      const e = { ...entity, updatedAt: now() }
      const i = arr.findIndex((x) => String(x.id) === String(e.id))
      if (i >= 0) arr[i] = { ...arr[i], ...e }
      else arr.push(e)
      return e
    },
    /** 模拟页面可见列表：软删的不显示 */
    visible: (arrName) => holder[arrName].filter((e) => !e.deleted),
    /** 模拟一次同步：账单链路空转，只跑实体 LWW */
    sync() {
      return runSync({
        cloud, source: 'entity', ownerId,
        getLocal: async () => [], addLocal: async () => 0, markLocal: async () => 0, markAlive: async () => 0,
        store, now, todos: specOf(todos), recurring: specOf(recurring),
      })
    },
  }
}

const REC = {
  lunch:  { type: 'expense', amount: 25,   categoryKey: 'food',      categoryName: '餐饮饮食', subcategoryKey: 'lunch',  subcategoryName: '午餐',     note: '公司楼下', date: '2026-09-18' },
  bus:    { type: 'expense', amount: 2,    categoryKey: 'transport', categoryName: '交通出行', subcategoryKey: 'bus',    subcategoryName: '公交地铁', note: '', date: '2026-09-19' },
  rent:   { type: 'expense', amount: 2400, categoryKey: 'housing',   categoryName: '住房居家', subcategoryKey: 'rent',   subcategoryName: '房租/房贷', note: '9月', date: '2026-09-01' },
  salary: { type: 'income',  amount: 8000, categoryKey: 'finance',   categoryName: '金融保险', subcategoryKey: 'invest', subcategoryName: '投资理财', note: '工资', date: '2026-09-10' },
  coffee: { type: 'expense', amount: 18,   categoryKey: 'food',      categoryName: '餐饮饮食', subcategoryKey: 'snack',  subcategoryName: '零食饮料', note: '拿铁', date: '2026-09-20' },
}

// 两户人家的同步码（12 位，与线上格式一致）
const HOUSE_A = 'ABCD1EFG2HJK'
const HOUSE_B = 'MNOP3QRS4TUV'

// ---- 开始验证 ----

async function main() {
  console.log('\n☁️  本地模拟云 · 多设备 + 多用户隔离 同步全链路验证\n')

  const cloud = createMockCloud(memoryStore())
  const desktop = createDesktopDevice(cloud, HOUSE_A)
  const miniapp = createMiniappDevice(cloud, HOUSE_A)

  console.log('【场景①】桌面端记 3 笔账 → 同步上云 → 小程序打开首页')
  desktop.appAdd(REC.lunch); desktop.appAdd(REC.bus); desktop.appAdd(REC.rent)
  let dr = await desktop.performSync()
  assert(dr.uploaded === 3, `桌面端上传 3 条（实际 ${dr.uploaded}）`)
  let mr = await miniapp.sync()
  assert(mr.ok && mr.pulled === 3, `小程序拉到 3 条（实际 ${mr.pulled}）`)
  assert(
    miniapp.getLocal().some((r) => r.amount === 2400 && r.subcategoryName === '房租/房贷' && r.date === '2026-09-01'),
    '字段完整映射（金额/分类名/日期）',
  )

  console.log('\n【场景②】小程序记 2 笔账（写本地后由引擎自动推上云）→ 桌面端点同步')
  let ar = await miniapp.appAdd(REC.salary)
  assert(ar.ok && ar.pushed === 1, `小程序记账后引擎推上 1 笔（pushed=${ar.pushed}）`)
  ar = await miniapp.appAdd(REC.coffee)
  assert(ar.pushed === 1, `咖啡 ¥18 同样推上 1 笔（pushed=${ar.pushed}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0, `桌面端不把云端已有的自家记录重复上传（上传 ${dr.uploaded} 条）`)
  assert(dr.downloaded === 2, `桌面端拉到小程序的 2 笔（实际 ${dr.downloaded}）`)
  const dl = desktop.getLocal()
  assert(
    dl.some((r) => r.amount === 8000 && r.type === 'income') && dl.some((r) => r.amount === 18 && r.date === '2026-09-20'),
    '桌面端本地已含收入 ¥8000 与咖啡 ¥18',
  )

  console.log('\n【场景③】反复同步 → 不重复入账（幂等性）')
  mr = await miniapp.sync()
  assert(mr.pushed === 0 && mr.pulled === 0, `小程序再次同步 0 进 0 出（pushed=${mr.pushed}, pulled=${mr.pulled}）`)
  assert(miniapp.getLocal().length === 5, `小程序本地仍为 5 条（实际 ${miniapp.getLocal().length}）`)
  dr = await desktop.performSync()
  assert(desktop.getLocal().length === 5, `桌面端仍为 5 条（实际 ${desktop.getLocal().length}）`)

  console.log('\n【场景④】增量同步：桌面再记 1 笔新账 → 小程序只拉这 1 条')
  desktop.appAdd({ ...REC.lunch, date: '2026-09-20', note: '加班餐' }) // 新日期 = 新记录
  await desktop.performSync()
  mr = await miniapp.sync()
  assert(mr.pulled === 1, `小程序只拉到 1 条新增（实际 ${mr.pulled}）`)
  assert(miniapp.getLocal().length === 6, `小程序本地共 6 条（实际 ${miniapp.getLocal().length}）`)

  console.log('\n【场景⑤】双端同时记同一笔账 → 合并为一条（跨端去重键一致）')
  const same = { ...REC.coffee, date: '2026-09-21' }
  desktop.appAdd(same)
  await desktop.performSync()
  mr = await miniapp.appAdd(same) // 小程序也记了一模一样的（v0.6.5：引擎按笔数配对，不补传也不补拉）
  assert(mr.pushed === 0 && mr.pulled === 0, `同步引擎识别同键记录，不再上传也不再拉取（pushed=${mr.pushed}, pulled=${mr.pulled}）`)
  assert(miniapp.getLocal().filter((r) => r.date === '2026-09-21').length === 1, '同一天同金额同分类只有 1 条')

  console.log('\n【场景⑥】另一户（不同同步码）共用同一云环境 → 互相看不到')
  const bobDesktop = createDesktopDevice(cloud, HOUSE_B)
  const bobMiniapp = createMiniappDevice(cloud, HOUSE_B)
  bobDesktop.appAdd({ ...REC.rent, amount: 999, note: '鲍勃的房租' })
  await bobDesktop.performSync()
  mr = await miniapp.sync() // A 户小程序同步
  assert(mr.pushed === 0 && mr.pulled === 0, `A 户同步 0 进 0 出，完全无感（pushed=${mr.pushed}, pulled=${mr.pulled}）`)
  assert(miniapp.getLocal().length === 7, `A 户小程序本地仍 7 条（实际 ${miniapp.getLocal().length}）`)
  const bobBeforeCount = bobMiniapp.getLocal().length
  await bobMiniapp.sync()
  assert(bobMiniapp.getLocal().length === bobBeforeCount + 1, `B 户小程序只拉到 B 户自己的 1 条（实际 ${bobMiniapp.getLocal().length - bobBeforeCount}）`)
  assert(!bobMiniapp.getLocal().some((r) => r.amount === 2400), 'B 户看不到 A 户的房租 ¥2400')

  console.log('\n【场景⑦】新电脑输入 A 户同步码 → 拉回 A 户全部历史账')
  const newDesktop = createDesktopDevice(cloud, HOUSE_A)
  dr = await newDesktop.performSync()
  assert(dr.uploaded === 0 && dr.downloaded === 7, `新机拉到 A 户全部 7 条（uploaded=${dr.uploaded}, downloaded=${dr.downloaded}）`)
  assert(newDesktop.getLocal().some((r) => r.amount === 2400) && !newDesktop.getLocal().some((r) => r.amount === 999),
    '新机能 see A 户房租、看不见 B 户的记录')

  console.log('\n【场景⑧】同日同额同类两笔 → 按笔数配对，一笔不丢（v0.6.5 方案 C）')
  const twin = { type: 'expense', amount: 888, categoryKey: 'food', categoryName: '餐饮饮食', subcategoryKey: 'dinner', subcategoryName: '晚餐', note: '请客A', date: '2026-09-23' }
  desktop.appAdd(twin)
  desktop.appAdd({ ...twin, note: '请客B' }) // 同一笔指纹（日期/金额/小类/类型完全相同），备注不同也算同键
  dr = await desktop.performSync()
  assert(dr.uploaded === 2, `同键两笔一起传上云，不合并（uploaded=${dr.uploaded}）`)
  mr = await miniapp.sync()
  assert(mr.pulled === 2, `小程序两笔都拉到（pulled=${mr.pulled}）`)
  assert(miniapp.getLocal().filter((r) => r.amount === 888).length === 2, `小程序本地同键 2 笔未被合成 1 笔（实际 ${miniapp.getLocal().filter((r) => r.amount === 888).length}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.downloaded === 0, `收敛：平衡后再同步 0 推 0 拉（uploaded=${dr.uploaded}, downloaded=${dr.downloaded}）`)

  console.log('\n【场景⑨】桌面删一笔 → 上传删除凭证 → 小程序自动跟上标删，数据留底（v0.6.6 方案乙）')
  desktop.appDelete((r) => r.amount === 2 && r.date === '2026-09-19') // 公交 ¥2
  dr = await desktop.performSync()
  assert(dr.uploaded === 1 && dr.downloaded === 0 && dr.marked === 0, `桌面只传 1 条删除凭证，已删行不倒灌（uploaded=${dr.uploaded}）`)
  mr = await miniapp.sync()
  assert(mr.ok && mr.pushed === 0 && mr.pulled === 1, `小程序拉到凭证并标删 1 笔（pulled=${mr.pulled}）`)
  assert(!miniapp.visible().some((r) => r.amount === 2), '小程序页面不再显示公交 ¥2')
  assert(miniapp.getLocal().some((r) => r.amount === 2 && r.deleted === 1), '小程序库里仍保留该笔 deleted=1（可恢复）')
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.downloaded === 0 && dr.marked === 0, `收敛：桌面再同步 0 推 0 拉，自己的凭证不会回敲自己`)

  console.log('\n【场景⑩】小程序编辑一笔拿铁 ¥18 → ¥28 → 双端终态一致（编辑 = 旧笔凭证 + 新笔记账）')
  mr = await miniapp.appUpdate((r) => r.amount === 18 && r.date === '2026-09-20', { amount: 28, note: '摩卡' })
  assert(mr.ok && mr.pushed === 2, `小程序上云 1 凭证 + 1 新记录（pushed=${mr.pushed}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.downloaded === 1 && dr.marked === 1, `桌面拉回新 1 笔、旧笔跟上标删（downloaded=${dr.downloaded}, marked=${dr.marked}）`)
  assert(desktop.visible().some((r) => r.amount === 28 && r.note === '摩卡'), '桌面看到改后的 ¥28 新记录')
  assert(!desktop.visible().some((r) => r.amount === 18 && r.date === '2026-09-20'), '桌面不再显示旧记录 ¥18（9月21日那笔同价咖啡不受影响）')

  console.log('\n【场景⑪】桌面删加班餐 ¥25、小程序删一笔 888 → 新设备终态完全一致')
  desktop.appDelete((r) => r.amount === 25 && r.date === '2026-09-20')
  await desktop.performSync()
  mr = await miniapp.appDelete((r) => r.amount === 888) // 只标删其中一笔
  assert(mr.pushed === 1 && mr.pulled === 1, `小程序推 888 凭证 1 条 + 拉回 25 的标删（pushed=${mr.pushed}, pulled=${mr.pulled}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.marked === 1, `桌面跟上小程序的删除，另一笔 888 仍完好（marked=${dr.marked}）`)
  assert(desktop.visible().filter((r) => r.amount === 888).length === 1, '桌面可见 888 剩 1 笔（两笔各删一半）')
  const freshDesktop = createDesktopDevice(cloud, HOUSE_A)
  dr = await freshDesktop.performSync()
  assert(dr.uploaded === 0 && dr.downloaded === 10, `新设备拉到全部 10 条账单（含被删的，downloaded=${dr.downloaded}）`)
  assert(freshDesktop.visible().length === 6, `新设备显示 6 笔，与双端一致（visible=${freshDesktop.visible().length}）`)
  assert(!freshDesktop.visible().some((r) => r.amount === 2 || (r.amount === 18 && r.date === '2026-09-20') || (r.amount === 25 && r.date === '2026-09-20')),
    '4 笔被删的（公交/旧拿铁/加班餐/一笔 888）在新设备上也已标删')
  assert(freshDesktop.visible().some((r) => r.amount === 28) && freshDesktop.visible().some((r) => r.amount === 2400),
    '改后的 ¥28 与房租 ¥2400 完好可见')

  console.log('\n【场景⑫】桌面回收站恢复公交 ¥2 → 上传撤销凭条 → 小程序自动跟着恢复（v0.6.7）')
  desktop.appRestore((r) => r.amount === 2)
  dr = await desktop.performSync()
  assert(dr.uploaded === 1 && dr.marked === 0 && dr.revived === 0, `桌面只传 1 条撤销凭条，凭证不回灌（uploaded=${dr.uploaded}）`)
  assert(desktop.visible().some((r) => r.amount === 2), '桌面恢复后公交 ¥2 重新可见')
  mr = await miniapp.sync()
  assert(mr.ok && mr.pushed === 0 && mr.pulled === 1, `小程序拉到凭条恢复 1 笔（pushed=${mr.pushed}, pulled=${mr.pulled}）`)
  assert(miniapp.visible().some((r) => r.amount === 2), '小程序端公交 ¥2 也恢复显示')
  const cloudDocs = await cloud.listAll(HOUSE_A)
  const revDoc = cloudDocs.find((d) => d.kind === 'revive')
  assert(!!revDoc, '云端存在 revive 撤销凭条')
  assert(!!revDoc && revDoc.label && revDoc.label.includes('¥2'), `凭条带人话摘要：${revDoc && revDoc.label}`)
  assert(cloudDocs.some((d) => d.kind === 'tombstone' && d.label && d.label.includes('¥2')), '删除凭证同样带可读 label（控制台能看懂删的是哪笔）')

  console.log('\n【场景⑬】咖啡 ¥18（9月21日）删→恢复→再删→再恢复 → 配对收敛不抽风')
  const c21 = (r) => r.amount === 18 && r.date === '2026-09-21'
  mr = await miniapp.appDelete(c21)
  assert(mr.pushed === 1 && mr.pulled === 0, `小程序删 → 推 1 凭证（pushed=${mr.pushed}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.marked === 1, `桌面跟随标删（marked=${dr.marked}）`)
  desktop.appRestore(c21)
  dr = await desktop.performSync()
  assert(dr.uploaded === 1 && dr.marked === 0 && dr.revived === 0, `桌面先恢复 → 传 1 撤销凭条（uploaded=${dr.uploaded}）`)
  mr = await miniapp.sync()
  assert(mr.pulled === 1 && mr.pushed === 0, `小程序跟随恢复（pulled=${mr.pulled}）`)
  assert(miniapp.visible().some(c21) && desktop.visible().some(c21), '双端这笔咖啡又都可见了')
  mr = await miniapp.appDelete(c21)
  assert(mr.pushed === 1, `第二次删 → 再补 1 凭证（pushed=${mr.pushed}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.marked === 1, `桌面第二次跟随标删（marked=${dr.marked}）`)
  mr = await miniapp.appRestore(c21)
  assert(mr.pushed === 1, `第二次恢复 → 再补 1 撤销（pushed=${mr.pushed}）`)
  dr = await desktop.performSync()
  assert(dr.uploaded === 0 && dr.marked === 0 && dr.revived === 1, `桌面再次跟随恢复，全程无重复文档（revived=${dr.revived}）`)
  dr = await desktop.performSync()
  mr = await miniapp.sync()
  assert(dr.uploaded === 0 && dr.marked === 0 && dr.revived === 0 && mr.pushed === 0 && mr.pulled === 0,
    '收敛：横跳之后再同步 0 进 0 出')

  console.log('\n【场景⑭】删/改/恢复全部混战过之后：新设备输入同步码 → 三端终态完全一致')
  const freshMini = createMiniappDevice(cloud, HOUSE_A)
  mr = await freshMini.sync()
  assert(mr.ok, '新设备首次同步成功')
  const visCount = desktop.visible().length
  assert(visCount === miniapp.visible().length && visCount === freshMini.visible().length,
    `三端可见数一致（${visCount}/${miniapp.visible().length}/${freshMini.visible().length}）`)
  assert(freshMini.visible().length === 7, `新设备显示 7 笔（10 账单 - 3 净删除，visible=${freshMini.visible().length}）`)
  assert(freshMini.visible().some((r) => r.amount === 2) && freshMini.visible().some(c21),
    '被恢复过的公交 ¥2 和咖啡 ¥18 在新设备上也存活')
  assert(!freshMini.visible().some((r) => r.amount === 25 && r.date === '2026-09-20'), '被删未恢复的加班餐 ¥25 在新设备上也不显示')

  console.log('\n【场景⑮】v0.7.3 待办跨端 LWW 快照：新增跟随 → 编辑跟随 → 软删不复活 → 收敛')
  const entStoreA = memoryStore()
  const entA = createEntityDevice(cloud, HOUSE_A, entStoreA)
  const entB = createEntityDevice(cloud, HOUSE_A, entStoreA) // 同户两台设备（共用 lastSyncAt 键，互不干扰）
  entA.appPut('todos', { id: 't-rent', title: '交房租', cycle: 'monthly', nextDate: '2026-10-01', isActive: true, completedDates: [] })
  let er = await entA.sync()
  assert(er.ok && er.pushed === 1 && er.pulled === 0, `A 新增待办 → 上云 1 快照（pushed=${er.pushed}）`)
  er = await entB.sync()
  assert(er.ok && er.pushed === 0 && er.pulled === 1, `B 拉到待办 1 条（pulled=${er.pulled}）`)
  assert(!!entB.holder.todos.find((t) => t.id === 't-rent') && entB.visible('todos').length === 1, 'B 端可见新待办「交房租」')
  entB.appPut('todos', { id: 't-rent', title: '交房租', cycle: 'monthly', nextDate: '2026-10-01', isActive: true, amount: 2400, categoryKey: 'housing', subcategoryKey: 'rent', categoryName: '住房居家', subcategoryName: '房租/房贷', completedDates: ['2026-09-20'] }) // B 端补全金额并完成
  await entB.sync()
  er = await entA.sync()
  assert(er.pulled === 1 && entA.holder.todos[0].completedDates?.[0] === '2026-09-20' && entA.holder.todos[0].amount === 2400,
    `A 端跟随 B 的编辑快照（完成日期/金额已更新，pulled=${er.pulled}）`)
  entA.appPut('todos', { id: 't-rent', title: '交房租', cycle: 'monthly', nextDate: '2026-10-01', isActive: true, completedDates: ['2026-09-20'], deleted: true }) // A 端软删
  await entA.sync()
  er = await entB.sync()
  assert(er.ok && er.pulled === 1 && entB.visible('todos').length === 0, 'B 端待办随软删快照消失（不是被旧快照复活）')
  er = await entA.sync()
  const er2 = await entB.sync()
  assert(er.pushed === 0 && er.pulled === 0 && er2.pushed === 0 && er2.pulled === 0, '收敛：删后再同步 0 进 0 出，快照不膨胀回灌')

  console.log('\n【场景⑯】v0.7.3 周期账单跨端改下次日期 → 对端跟随不倒灌；他户不可见')
  const entC = createEntityDevice(cloud, HOUSE_A, memoryStore()) // 同户第三台（空本地，验证从云端全量拉回）
  entB.appPut('recurring', { id: 'r-sub', type: 'expense', amount: 25, cycle: 'monthly', nextDate: '2026-10-05', isActive: true, categoryName: '娱乐休闲', subcategoryName: '游戏充值' })
  await entB.sync()
  entB.appPut('recurring', { id: 'r-sub', type: 'expense', amount: 25, cycle: 'monthly', nextDate: '2026-11-05', isActive: true, categoryName: '娱乐休闲', subcategoryName: '游戏充值' }) // 执行后自动推进日期
  er = await entB.sync()
  assert(er.ok && er.pushed === 1, `B 改 nextDate 后上云最新快照（pushed=${er.pushed}）`)
  er = await entC.sync()
  const rOnC = entC.holder.recurring.find((r) => r.id === 'r-sub')
  assert(er.ok && !!rOnC && rOnC.nextDate === '2026-11-05', `新设备只拿到最新日期 11-05，旧快照 10-05 不生效（实际 ${rOnC && rOnC.nextDate}）`)
  const bobEnt = createEntityDevice(cloud, HOUSE_B, memoryStore())
  er = await bobEnt.sync()
  assert(er.ok && er.pushed === 0 && er.pulled === 0 && bobEnt.holder.todos.length === 0 && bobEnt.holder.recurring.length === 0,
    'B 户（不同同步码）完全看不到 A 户的待办/周期快照')

  console.log('\n【场景⑰】v0.8.5 彻底删除：桌面删→小程序跟标删→桌面彻底删除→小程序回收站也清除，不回流')
  const lunchA = (r) => r.amount === 25 && r.date === '2026-09-18'
  desktop.appDelete(lunchA)
  dr = await desktop.performSync()
  assert(dr.uploaded === 1, `桌面删午餐 ¥25 → 上云 1 凭证（uploaded=${dr.uploaded}）`)
  mr = await miniapp.sync()
  assert(mr.ok && mr.pushed === 0 && mr.pulled === 1 && miniapp.getLocal().some((r) => lunchA(r) && r.deleted === 1),
    '小程序跟随标删，回收站留底（pulled=${mr.pulled}）')
  desktop.appPurge(lunchA) // 桌面回收站彻底删除（本地物理删行 + 注销凭条入队）
  assert(!desktop.getLocal().some(lunchA), '桌面本地库已物理删除，回收站也没有了')
  dr = await desktop.performSync()
  assert(dr.uploaded === 1 && dr.downloaded === 0 && dr.marked === 0 && dr.revived === 0,
    `桌面同步：只补传 1 条注销凭条，已删账单不复活不回填（uploaded=${dr.uploaded}）`)
  mr = await miniapp.sync()
  assert(mr.ok && !miniapp.getLocal().some(lunchA), '小程序消费凭条：回收站那笔也物理删除')
  dr = await desktop.performSync(); mr = await miniapp.sync()
  assert(dr.uploaded === 0 && dr.downloaded === 0 && mr.pushed === 0 && mr.pulled === 0,
    '收敛：彻底删除后再同步 0 进 0 出，注销凭条不重复上传、账单不回流')
  const freshP = createMiniappDevice(cloud, HOUSE_A)
  mr = await freshP.sync()
  assert(mr.ok && !freshP.getLocal().some(lunchA), '新设备输入同步码 → 被彻底删除的账永远拉不到')

  console.log('\n【场景⑱】v0.8.5 小程序离线彻底删除 → 队积压补传 + pid 幂等 → 桌面回收站跟随清除')
  const co = (r) => r.amount === 18 && r.date === '2026-09-21'
  mr = await miniapp.appDelete(co)
  assert(mr.pushed === 1 && mr.pulled === 0, `小程序删咖啡 ¥18 → 推 1 凭证（pushed=${mr.pushed}）`)
  dr = await desktop.performSync()
  assert(dr.marked === 1, '桌面跟随标删，进回收站')
  miniapp.appPurge(co) // 只入队不同步，模拟离线彻底删除
  assert(!miniapp.getLocal().some(co), '小程序本地已物理删行')
  mr = await miniapp.sync()
  assert(mr.ok && mr.pushed === 1 && mr.pulled === 0, `联网补传：注销凭条补上云 1 条（pushed=${mr.pushed}）`)
  const purgeDocs1 = (await cloud.listAll(HOUSE_A)).filter((d) => d.kind === 'purge').length
  mr = await miniapp.sync()
  const purgeDocs2 = (await cloud.listAll(HOUSE_A)).filter((d) => d.kind === 'purge').length
  assert(mr.pushed === 0 && purgeDocs2 === purgeDocs1, `pid 幂等：再同步不重复传凭条（云端 purge 文档仍 ${purgeDocs2} 条）`)
  dr = await desktop.performSync()
  assert(!desktop.getLocal().some(co), '桌面消费凭条：回收站那杯咖啡也物理删除')
  dr = await desktop.performSync(); mr = await miniapp.sync()
  assert(dr.uploaded === 0 && dr.downloaded === 0 && dr.revived === 0 && mr.pushed === 0 && mr.pulled === 0,
    '收敛：小程序端彻底删除全链路走完后再同步 0 进 0 出')

  console.log('\n【场景⑲】v0.8.5b 旧注销凭条不误杀之后新加的同号账（时间戳感知回归）')
  // 场景：桌面彻底删除了一笔 ¥50 午餐 → 之后用户重新记了一笔完全相同指纹的 ¥50 午餐
  const lunchB = (r) => r.amount === 50 && r.date === '2026-09-25'
  const rec50 = { type: 'expense', amount: 50, categoryKey: 'food', categoryName: '餐饮饮食', subcategoryKey: 'lunch', subcategoryName: '午餐', note: '', date: '2026-09-25' }
  desktop.appAdd(rec50)
  await desktop.performSync() // 上传 ¥50
  desktop.appDelete(lunchB) // 删除
  await desktop.performSync() // 上传凭证
  desktop.appPurge(lunchB) // 彻底删除 → 产生 purge
  await desktop.performSync() // 上传 purge
  // 现在云端有：¥50 记录 + ¥50 凭证 + ¥50 purge（purge 核销了记录和凭证）
  // 用户重新记一笔同键 ¥50
  desktop.appAdd(rec50)
  dr = await desktop.performSync()
  assert(dr.uploaded === 1, `新 ¥50 上传成功（uploaded=${dr.uploaded}）`)
  mr = await miniapp.sync()
  assert(mr.ok && miniapp.getLocal().some((r) => lunchB(r) && !(r.deleted > 0)),
    '小程序能拉到新 ¥50（旧 purge 不误杀后加的同号账）')

  // ---- 汇总 ----

  console.log('')
  if (failed === 0) {
    console.log('\x1b[32m✅ 全部通过 — 含多用户隔离验证，同步码机制工作正常\x1b[0m\n')
  } else {
    console.error(`\x1b[31m❌ 有 ${failed} 项未通过\x1b[0m\n`)
    process.exit(1)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
