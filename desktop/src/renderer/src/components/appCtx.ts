import { createContext, useContext } from 'react'

export type Theme = 'dark' | 'light'
export type UiStyle = 'instrument' | 'miniapp'

const listeners = new Set<(t: Theme) => void>()
const styleListeners = new Set<(s: UiStyle) => void>()

export function getTheme(): Theme {
  const t = document.documentElement.dataset.theme
  return t === 'light' ? 'light' : 'dark'
}

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('jixu-theme', t)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(t))
}

export function subscribeTheme(l: (t: Theme) => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function getUiStyle(): UiStyle {
  const s = document.documentElement.dataset.ui || (() => {
    try { return localStorage.getItem('jixu-ui-style') } catch { return null }
  })()
  return s === 'miniapp' ? 'miniapp' : 'instrument'
}

export function setUiStyle(s: UiStyle): void {
  document.documentElement.dataset.ui = s
  try {
    localStorage.setItem('jixu-ui-style', s)
  } catch {
    /* ignore */
  }
  styleListeners.forEach((l) => l(s))
}

export function subscribeUiStyle(l: (s: UiStyle) => void): () => void {
  styleListeners.add(l)
  return () => {
    styleListeners.delete(l)
  }
}

export interface AppShared {
  theme: Theme
  toggleTheme: () => void
  uiStyle: UiStyle
  setUiStyle: (s: UiStyle) => void
  syncing: boolean
  cloudEnabled: boolean
  syncCode: string
  lastSyncAt: number
  sync: () => void
  openCloud: () => void
}

export const AppCtx = createContext<AppShared>({
  theme: 'dark',
  toggleTheme: () => undefined,
  uiStyle: 'instrument',
  setUiStyle: () => undefined,
  syncing: false,
  cloudEnabled: false,
  syncCode: '',
  lastSyncAt: 0,
  sync: () => undefined,
  openCloud: () => undefined,
})

export const useApp = (): AppShared => useContext(AppCtx)
