#!/usr/bin/env node
/**
 * 计序 · 一键自检
 *
 * 用法：
 *   node scripts/check.mjs                  # 跑全部
 *   node scripts/check.mjs desktop miniapp  # 只跑指定端
 *
 * 顺序：桌面类型检查 → 小程序同步回归 → 小程序云函数回归 → 小程序构建 → 安卓单测
 * 任何一步失败都会继续跑完剩下的，最后给一张汇总表并以非 0 退出。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 安卓构建需要 JDK17 + Android SDK。
 * 本机全局 JAVA_HOME 是 JDK8（会直接报 "Gradle requires JVM 17"），
 * 所以优先用 JIXU_JAVA_HOME / JDK17 的常见安装位置，最后才退回 JAVA_HOME。
 */
function androidEnv() {
  const env = { ...process.env }
  const hasJavac = (p) =>
    existsSync(path.join(p, 'bin', 'javac.exe')) || existsSync(path.join(p, 'bin', 'javac'))
  const jdkCandidates = [process.env.JIXU_JAVA_HOME, 'D:/Software/JDK/JDK17', process.env.JAVA_HOME]
  const jdk = jdkCandidates.find((p) => p && hasJavac(p))
  if (jdk) env.JAVA_HOME = jdk
  const sdkCandidates = [process.env.JIXU_ANDROID_HOME, process.env.ANDROID_HOME, 'D:/Software/Android/Sdk']
  const sdk = sdkCandidates.find((p) => p && existsSync(p))
  if (sdk) env.ANDROID_HOME = sdk
  return env
}

const STEPS = [
  {
    id: 'desktop',
    name: '桌面端 tsc',
    cwd: 'desktop',
    cmd: 'npx tsc --noEmit',
  },
  {
    id: 'miniapp',
    name: '小程序 同步回归',
    cwd: 'miniapp',
    cmd: 'npm run verify:sync',
  },
  {
    id: 'miniapp',
    name: '小程序 云函数回归',
    cwd: 'miniapp',
    cmd: 'npm run verify:account',
  },
  {
    id: 'miniapp',
    name: '小程序 构建',
    cwd: 'miniapp',
    cmd: 'npm run build:weapp',
  },
  {
    id: 'android',
    name: '安卓 单元测试',
    cwd: 'android',
    cmd: process.platform === 'win32' ? 'gradlew.bat :app:testDebugUnitTest' : './gradlew :app:testDebugUnitTest',
    env: androidEnv(),
  },
]

const picked = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const steps = picked.length > 0 ? STEPS.filter((s) => picked.includes(s.id)) : STEPS
if (steps.length === 0) {
  console.error(`没有匹配的任务。可选：${[...new Set(STEPS.map((s) => s.id))].join(' / ')}`)
  process.exit(2)
}

const results = []
for (const step of steps) {
  process.stdout.write(`\n▶ ${step.name} … `)
  const startedAt = Date.now()
  const r = spawnSync(step.cmd, {
    cwd: path.join(root, step.cwd),
    env: step.env || process.env,
    shell: true,
    stdio: 'pipe',
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  const ms = Date.now() - startedAt
  const ok = r.status === 0
  console.log(`${ok ? '✅' : '❌'} ${(ms / 1000).toFixed(1)}s`)
  if (!ok) {
    const tail = `${r.stdout || ''}\n${r.stderr || ''}`.trim().split('\n').slice(-25).join('\n')
    console.log(tail)
  }
  results.push({ ...step, ok, ms })
}

console.log('\n──────── 汇总 ────────')
for (const r of results) {
  console.log(`${r.ok ? '✅' : '❌'}  ${r.name.padEnd(18, ' ')} ${(r.ms / 1000).toFixed(1)}s`)
}
const failed = results.filter((r) => !r.ok)
console.log(failed.length === 0 ? '\n全部通过' : `\n${failed.length} 项失败`)
process.exit(failed.length === 0 ? 0 : 1)
