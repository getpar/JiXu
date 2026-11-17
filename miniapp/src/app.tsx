import { PropsWithChildren, useEffect } from 'react'
import { ensureWechatAccount } from './utils/cloudAccount'
import { syncNow } from './utils/storage'
import './app.scss'

function App({ children }: PropsWithChildren): JSX.Element {
  // 小程序冷启动：先把本机同步码与微信身份对上（云函数解析/首次认领），再后台静默同步一次。
  // 两步都失败也不阻塞启动 —— 本地记账始终可用。
  useEffect(() => {
    ensureWechatAccount()
      .catch(() => undefined)
      .then(() => syncNow())
      .catch(() => { /* 同步失败不阻塞启动 */ })
  }, [])
  return <>{children}</>
}

export default App
