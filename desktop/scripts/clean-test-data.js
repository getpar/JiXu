/**
 * 一次性清理脚本（v0.7.1 正式启用前清测试数据）
 * 用法（在 desktop 目录下）：
 *   node scripts/clean-test-data.js cloud    只清云端 records 集合全部文档
 *   node scripts/clean-test-data.js local    只清桌面本地（需先关闭桌面端应用！清理前自动备份 db 文件）
 *   node scripts/clean-test-data.js all      两段都做
 * 说明：
 * - 云端所有文档都是桌面端匿名身份上传的测试数据（小程序从未连上过真云，手机上的"早餐"不在其中，不会被清）
 * - 本地清理 = 把 daily-notes.db 改名为备份文件，应用下次启动自动重建空账本（默认分类自动恢复）
 * - 同步码/预算/外观设置不在 db 里，不受影响
 */
const fs = require('fs')
const path = require('path')
const cloudbase = require('@cloudbase/js-sdk')

const ENV_ID = 'daily-notes-d3gaotrwyc09ff44a'

async function cleanCloud() {
  console.log('== 云端清理 ==')
  const app = cloudbase.init({ env: ENV_ID })
  const auth = app.auth({ persistence: 'memory' })
  await auth.anonymousAuthProvider().signIn()
  const db = app.database()
  const _ = db.command

  // 分页收集全部 _id
  const ids = []
  while (true) {
    const res = await db.collection('records').skip(0).limit(100).field({ _id: true }).get()
    const rows = res.data || []
    ids.push(...rows.map((r) => r._id))
    if (rows.length < 100) break
  }
  console.log('云端待删文档数:', ids.length)
  if (ids.length === 0) { console.log('云端已是空的 ✓'); return }

  // 分批删（每批 50）
  let deleted = 0
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    try {
      const res = await db.collection('records').where({ _id: _.in(batch) }).remove()
      deleted += res.deleted || 0
    } catch (e) {
      console.error('批量删除被拒:', e.message || e)
      console.error('→ 请到 CloudBase 控制台「文档型数据库 → records → 记录列表」勾选全部 → 删除，然后重跑本脚本确认')
      process.exit(1)
    }
  }
  if (deleted === 0) {
    console.error('⚠ 一条都没删掉：集合规则是「仅创建者可读写」，这些文档由桌面端应用的身份创建，脚本的新匿名身份无权删。')
    console.error('→ 请在 CloudBase 控制台（管理员权限）操作：文档型数据库 → records → 记录列表 → 勾选全部 → 删除；完成后重跑本脚本验证应为“云端已是空的”')
    process.exit(1)
  }
  // 复查
  const check = await db.collection('records').limit(1).get()
  console.log(`云端已删除 ${deleted} 条，复查剩余可见文档: ${(check.data || []).length === 0 ? 0 : '若干（可能有他人身份创建的文档，需控制台删）'}`)
}

function cleanLocal() {
  console.log('\n== 桌面本地清理 ==')
  const dir = path.join(process.env.APPDATA, 'daily-notes')
  const dbPath = path.join(dir, 'daily-notes.db')
  if (!fs.existsSync(dbPath)) { console.log('未找到数据库文件（可能已是空账本）:', dbPath); return }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  const backup = path.join(dir, `daily-notes-backup-${stamp}.db`)
  try {
    fs.renameSync(dbPath, backup) // 文件被应用锁着会失败 = 应用没关
  } catch (e) {
    console.error('❌ 备份/移除失败（通常是桌面端还没关闭，文件被占用）。请完全退出「每日小记」后重试。')
    console.error('   原始错误:', e.message)
    process.exit(1)
  }
  console.log('✅ 本地账本已清空，原数据备份到:', backup)
  console.log('   下次启动桌面端会自动重建空账本（默认分类自动恢复，同步码不变）')
}

const mode = (process.argv[2] || '').toLowerCase()
if (mode === 'cloud' || mode === 'all') {
  cleanCloud()
    .then(() => { if (mode === 'all') cleanLocal(); console.log('\n全部完成 ✓') })
    .catch((e) => { console.error('脚本报错:', e.message || e); process.exit(1) })
} else if (mode === 'local') {
  cleanLocal()
} else {
  console.log('用法: node scripts/clean-test-data.js cloud|local|all')
}
