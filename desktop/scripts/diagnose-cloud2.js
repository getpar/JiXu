/**
 * 云同步深度体检（一次性诊断工具）
 * 回答：① 云上有哪些户(ownerId) ② 每户各端传了多少、是否重复传（只存不拉的症状）
 *      ③ 小程序/桌面写入时间线 ④ 匿名身份能否看到别人写的文档（读权限验证）
 * 运行：node scripts/diagnose-cloud2.js（在 desktop 目录下）
 */
const cloudbase = require('@cloudbase/js-sdk')

const ENV_ID = 'daily-notes-d3gaotrwyc09ff44a'

async function main() {
  const app = cloudbase.init({ env: ENV_ID })
  const auth = app.auth({ persistence: 'memory' })
  await auth.anonymousAuthProvider().signIn()
  const state = await auth.getLoginState()
  console.log('匿名登录成功, uid =', state && state.uid ? state.uid : '(取不到)')

  const db = app.database()
  const _ = db.command
  // 全量分页拉取（按 _id 存在与否粗拉，不带 where = 能看到什么全看读权限）
  const all = []
  let offset = 0
  while (true) {
    const res = await db.collection('records').skip(offset).limit(100).orderBy('updatedAt', 'asc').get()
    const rows = res.data || []
    if (rows.length === 0) break
    all.push(...rows)
    if (rows.length < 100) break
    offset += 100
    if (offset > 3000) { console.log('(!) 超过3000条，截断'); break }
  }
  console.log('匿名身份可见文档总数:', all.length)
  if (all.length === 0) {
    console.log('(!) 一条都看不到 — 读权限或集合名有问题')
    return
  }

  // 按 ownerId 分组
  const byOwner = new Map()
  for (const d of all) {
    const o = d.ownerId || '(无ownerId)'
    if (!byOwner.has(o)) byOwner.set(o, [])
    byOwner.get(o).push(d)
  }
  console.log('\n===== 各同步码(户)概况 =====')
  for (const [o, docs] of byOwner) {
    const src = {}
    const kind = {}
    for (const d of docs) {
      const s = d.source || '?'
      const k = d.kind || 'record'
      src[s + '/' + k] = (src[s + '/' + k] || 0) + 1
    }
    const times = docs.map((d) => d.updatedAt || 0).filter(Boolean)
    const fmt = (t) => new Date(t).toLocaleString('zh-CN', { hour12: false })
    console.log(`户 ${o}: ${docs.length} 条  [${Object.entries(src).map(([k, v]) => k + '=' + v).join(', ')}]  时间 ${times.length ? fmt(Math.min(...times)) + ' ~ ' + fmt(Math.max(...times)) : '?'}`)
  }

  // 账单重复度：同键(日期|金额|子分类|类型)文档数 > 1 的（双端各推各的 = 只存不拉症状）
  console.log('\n===== 账单重复检测（同键多份 = 有端在重复上传）=====')
  for (const [o, docs] of byOwner) {
    const recs = docs.filter((d) => !d.kind)
    const keys = new Map()
    for (const r of recs) {
      const k = `${r.date}|${r.amount}|${r.subcategoryKey}|${r.type}`
      if (!keys.has(k)) keys.set(k, [])
      keys.get(k).push(r)
    }
    const dup = [...keys.entries()].filter(([, v]) => v.length > 1)
    console.log(`户 ${o}: 账单 ${recs.length} 条, 去重键 ${keys.size} 个, 重复键 ${dup.length} 个`)
    for (const [k, v] of dup.slice(0, 8)) {
      console.log(`   ${k} ×${v.length} 来源[${v.map((d) => d.source + '@' + new Date(d.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })).join(' | ')}]`)
    }
  }

  // 最近 15 条写入时间线（看两端各自在什么时间写了什么）
  console.log('\n===== 最近 15 条写入 =====')
  const recent = [...all].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 15)
  for (const d of recent) {
    console.log(new Date(d.updatedAt || 0).toLocaleString('zh-CN', { hour12: false }), `owner=${(d.ownerId || '?').slice(0, 12)}`, `src=${d.source || '?'}`, `kind=${d.kind || 'record'}`, d.amount ? `¥${d.amount}` + (d.date ? ' ' + d.date : '') : '', d.note || d.targetKey || '')
  }

  // ===== 5. 复刻桌面端 app 的查询姿势（where ownerId + orderBy desc + skip/limit 分页）=====
  console.log('\n===== 复刻桌面端 downloadAllRecords 查询 =====')
  for (const target of ['CM4JM4PHGEL0', 'G4ZWDHPWKTEL']) {
    try {
      const p1 = await db.collection('records').where({ ownerId: target }).skip(0).limit(100).orderBy('updatedAt', 'desc').get()
      const n = (p1.data || []).length
      const fromMiniapp = (p1.data || []).filter((d) => (d.source || '').startsWith('miniapp')).length
      console.log(`户 ${target}: 桌面查询姿势可见 ${n} 条, 其中 miniapp 来源 ${fromMiniapp} 条 ${n < 100 ? '(已拉完)' : '(还有第二页)'}`)
    } catch (e) {
      console.log(`户 ${target}: 查询报错 → ${(e && (e.error || e).message) || JSON.stringify(e).slice(0, 200)}`)
    }
  }

  // ===== 6. 复刻小程序端查询（无 orderBy，limit 100 — wx 端真实上限 20，node 里看 where+limit 是否报错）=====
  console.log('\n===== 复刻小程序端 listAll 查询 =====')
  try {
    const r6 = await db.collection('records').where({ ownerId: 'CM4JM4PHGEL0' }).orderBy('updatedAt', 'asc').skip(0).limit(100).get()
    console.log('小程序查询姿势(asc+limit100): 可见', (r6.data || []).length, '条')
  } catch (e) {
    console.log('小程序查询姿势报错 →', (e && (e.error || e).message) || JSON.stringify(e).slice(0, 200))
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('诊断失败:', e && (e.error || e).message || e)
  process.exit(1)
})
