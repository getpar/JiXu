import { View, Text } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useRef, useState } from 'react'
import { confirmAndroidPairByToken, ensureWechatAccount } from '../../utils/cloudAccount'
import { useThemeDark } from '../../utils/theme'
import './index.scss'

type PairStatus = 'loading' | 'ok' | 'error'

/** scene 形如 p=<pairToken>，可能被 URL 编码（p%3D<token>）；只 decode 一次 */
function parsePairToken(raw?: string): string {
  let s = String(raw || '').trim()
  try { s = decodeURIComponent(s) } catch { /* 编码不合法就按原文解析 */ }
  s = s.trim()
  const m = /(?:^|[?&])p=([A-Za-z0-9]{8,32})/.exec(s)
  if (m) return m[1]
  // 兼容只传了 token 的场景
  if (/^[A-Za-z0-9]{8,32}$/.test(s)) return s
  return ''
}

export default function Pair(): JSX.Element {
  const dark = useThemeDark()
  const router = useRouter()
  const [status, setStatus] = useState<PairStatus>('loading')
  const [message, setMessage] = useState('正在与安卓设备确认配对，请稍候')
  const [deviceName, setDeviceName] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function goHome(): void {
    Taro.switchTab({ url: '/pages/index/index' }).catch(() => {
      // 极端情况下（页面栈异常 / 非 tab 环境）退回 reLaunch
      Taro.reLaunch({ url: '/pages/index/index' }).catch(() => { /* ignore */ })
    })
  }

  useEffect(() => {
    let cancelled = false

    let scene = ''
    try { scene = String((router.params as any)?.scene || '') } catch { /* ignore */ }
    if (!scene) {
      try { scene = String((Taro.getLaunchOptionsSync().query as any)?.scene || '') } catch { /* ignore */ }
    }
    if (!scene) {
      // 小程序已在前台时再次扫码进入，用 getEnterOptionsSync 兜底（老基础库没有就跳过）
      try { scene = String((Taro as any).getEnterOptionsSync?.()?.query?.scene || '') } catch { /* ignore */ }
    }
    const token = parsePairToken(scene)
    if (!token) {
      setStatus('error')
      setMessage('没有拿到配对参数，请在安卓 App 重新生成小程序码')
      return
    }

    // 先等微信身份解析完（拿到 account 返回的 ownerId），再写 pair_ack；
    // 解析失败就退回本机同步码，不阻塞配对流程
    ensureWechatAccount()
      .catch(() => undefined)
      .then(() => confirmAndroidPairByToken(token))
      .then((r) => {
        if (cancelled) return
        if (r.ok) {
          setStatus('ok')
          setDeviceName(r.deviceName || '安卓手机')
          timerRef.current = setTimeout(() => {
            if (!cancelled) goHome()
          }, 1500)
        } else {
          setStatus('error')
          setMessage(r.error || '确认失败，请重试')
        }
      })
      .catch((e: any) => {
        if (cancelled) return
        setStatus('error')
        setMessage(`确认失败：${e?.message || e || '网络异常'}`)
      })

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // 只在页面初始化时执行一次（router 参数不会变）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = status === 'loading'
    ? '正在确认安卓设备…'
    : status === 'ok'
      ? '已确认，可以回到安卓 App'
      : '确认失败'
  const desc = status === 'loading'
    ? '正在与安卓设备确认配对，请稍候'
    : status === 'ok'
      ? '正在返回首页…'
      : message

  return (
    <View className={`wrap${dark ? ' theme-dark' : ''}`}>
      <View className='pair-card'>
        {status === 'loading' ? (
          <View className='pair-spinner' />
        ) : (
          <View className={`pair-mark ${status}`}>
            <Text className='pair-mark-text'>{status === 'ok' ? '✓' : '!'}</Text>
          </View>
        )}
        <Text className='pair-title'>{title}</Text>
        <Text className='pair-desc'>{desc}</Text>
        {status === 'ok' && deviceName ? <Text className='pair-device'>设备：{deviceName}</Text> : null}
        {status === 'error' ? (
          <View className='pair-btn' onClick={goHome}>
            <Text className='pair-btn-text'>返回首页</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
