import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['sql.js'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    // 分包交给 Vite 默认策略：页面本身用 React.lazy 按需加载，
    // 只有「账单/存钱罐」用到的 xlsx 会自然落到共享 chunk，首屏不带它。
    // 不要手写 manualChunks 把 react / antd 强行拆开——那会和它们在
    // node_modules 里的依赖互相 import 形成环，导致 React 初始化顺序错乱。
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
})
