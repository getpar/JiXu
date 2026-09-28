/**
 * 把 cloudfunctions/ 复制到 dist/cloudfunctions/
 *
 * 原因：微信开发者工具打开的是 miniapp/dist/ 目录，云函数必须位于该目录下才能被识别；
 * 而 dist/ 每次编译都会被清空，所以放在编译后自动复制一次（package.json 的 postbuild:weapp）。
 */
const fs = require('fs')
const path = require('path')

const from = path.join(__dirname, '..', 'cloudfunctions')
const to = path.join(__dirname, '..', 'dist', 'cloudfunctions')

if (!fs.existsSync(from)) {
  console.log('[copy-cloudfunctions] 未找到 cloudfunctions/，跳过')
  process.exit(0)
}

fs.rmSync(to, { recursive: true, force: true })
fs.cpSync(from, to, { recursive: true })
console.log('[copy-cloudfunctions] cloudfunctions/ -> dist/cloudfunctions/ 完成')

// 关键：微信开发者工具只有在 project.config.json 里声明了 cloudfunctionRoot
// 才会把该目录识别为「云函数目录」（否则右键没有「上传并部署」菜单）。
// Taro 每次编译都会重写 dist/project.config.json，所以这里编译后补一刀。
const projCfgPath = path.join(__dirname, '..', 'dist', 'project.config.json')
try {
  const cfg = JSON.parse(fs.readFileSync(projCfgPath, 'utf8'))
  if (cfg.cloudfunctionRoot !== 'cloudfunctions/') {
    cfg.cloudfunctionRoot = 'cloudfunctions/'
    fs.writeFileSync(projCfgPath, JSON.stringify(cfg, null, 2))
    console.log('[copy-cloudfunctions] 已写入 cloudfunctionRoot = "cloudfunctions/"')
  }
} catch (e) {
  console.log('[copy-cloudfunctions] 未能写入 cloudfunctionRoot：', e && e.message)
}
