import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'

/** v0.7.0 主题引擎：浅色 / 深色 / 跟随手机系统（默认）
 * 偏好存 Storage 永久记忆；系统深色切换时（Taro.onThemeChange）实时刷新所有页面 */

export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_PREFS: { key: ThemePref; label: string }[] = [
  { key: 'system', label: '跟随系统' },
  { key: 'light', label: '始终浅色' },
  { key: 'dark', label: '始终深色' },
]

let pref: ThemePref = 'system'
let sysTheme: 'light' | 'dark' = 'light'
let inited = false

function loadPref(): void {
  if (inited) return
  inited = true
  try {
    const saved = Taro.getStorageSync('ui_theme_pref')
    if (saved === 'light' || saved === 'dark' || saved === 'system') pref = saved
    const info = Taro.getSystemInfoSync()
    sysTheme = info.theme === 'dark' ? 'dark' : 'light'
    // 监听手机系统深浅色切换（跟随模式实时生效）
    Taro.onThemeChange?.((res) => {
      sysTheme = res.theme === 'dark' ? 'dark' : 'light'
      Taro.eventCenter.trigger('themeChanged')
    })
  } catch { /* 老基础库不支持 onThemeChange 时静默降级 */ }
}

export function getThemePref(): ThemePref {
  loadPref()
  return pref
}

/** 当前是否应显示深色 */
export function isDark(): boolean {
  loadPref()
  return pref === 'dark' || (pref === 'system' && sysTheme === 'dark')
}

/** 用户手动切换偏好 → 记忆并广播所有页面 */
export function setThemePref(p: ThemePref): void {
  loadPref()
  pref = p
  try { Taro.setStorageSync('ui_theme_pref', p) } catch { /* ignore */ }
  Taro.eventCenter.trigger('themeChanged')
}

/** 页面 hook：返回 dark，供根节点挂 theme-dark 类；主题变化自动重渲染 */
export function useThemeDark(): boolean {
  const [dark, setDark] = useState(isDark())
  useEffect(() => {
    const handler = () => setDark(isDark())
    Taro.eventCenter.on('themeChanged', handler)
    handler() // 挂载时对一次，防止上一页停留期间系统主题已变
    return () => { Taro.eventCenter.off('themeChanged', handler) }
  }, [])
  return dark
}
