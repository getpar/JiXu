/**
 * 云同步诊断脚本（一次性工具，不影响应用）
 * 用与桌面端完全相同的身份（CloudBase 匿名登录）查询 records 集合，
 * 回答三个问题：① 匿名登录通不通 ② 云端到底有哪些文档 ③ 小程序那笔"早餐"在不在
 * 运行：node scripts/diagnose-cloud.js（在 desktop 目录下）
 */
const cloudbase = require('@cloudbase/js-sdk')

const ENV_ID = 'daily-notes-d3gaotrwyc09ff44a'
const TARGET_OWNER = 'G4ZWDHPWKTEL' // 用户截图的同步码（去横杠形态）

async function main() {
  console.log('== 1. 初始化 + 匿名登录 ==')
  const app = cloudbase.init({ env: ENV_ID })
  const auth = app.auth({ persistence: 'memory' })
  await auth.anonymousAuthProvider().signIn()
  const state = await auth.getLoginState()
  console.log('登录成功, uid =', state && state.uid ? state.uid : '(取不到)')

  const db = app.database()

  console.log('\n== 2. 全集合前 100 条（匿名身份可见的全部文档）==')
  const all = await db.collection('records').limit(100).get()
  const docs = all.data || []
  console.log('可见文档总数:', docs.length)
  for (const d of docs) {
    console.log(JSON.stringify({
      _id: d._id, ownerId: d.ownerId, kind: d.kind || 'record',
      source: d.source, amount: d.amount, note: d.note, date: d.date,
      updatedAt: d.updatedAt,
    }))
  }

  console.log('\n== 3. 目标同步码 G4ZWDHPWKTEL 的文档 ==')
  const mine = await db.collection('records').where({ ownerId: TARGET_OWNER }).limit(100).get()
  console.log('匹配条数:', (mine.data || []).length)
  for (const d of mine.data || []) {
    console.log(JSON.stringify({ kind: d.kind || 'record', amount: d.amount, note: d.note, source: d.source, updatedAt: d.updatedAt }))
  }

  console.log('\n== 4. 带横杠形态的 ownerId 也查一下（排除格式不一致）==')
  const dash = await db.collection('records').where({ ownerId: 'G4ZW-DHPW-KTEL' }).limit(10).get()
  console.log('带横杠匹配条数:', (dash.data || []).length)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\n!! 诊断脚本报错:', e && (e.error || e).message ? (e.error || e).message : JSON.stringify(e))
  process.exit(1)
})
