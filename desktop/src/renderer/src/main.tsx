import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import {
  getTheme,
  getUiStyle,
  subscribeTheme,
  subscribeUiStyle,
  type Theme,
  type UiStyle,
} from './components/appCtx'
import './App.css'

const FONT = `'Inter Tight', 'PingFang SC', 'HarmonyOS Sans SC', 'MiSans', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif`

/** B 设计系统 → antd token；小程序靛风使用另一套令牌，圆角 14px。 */
function tokens(dark: boolean, style: UiStyle): Record<string, string | number> {
  const mini = style === 'miniapp'
  return {
    colorPrimary: mini ? (dark ? '#7C89E0' : '#2E3A8C') : dark ? '#D4FF3F' : '#4B6400',
    colorTextLightSolid: '#FFFFFF',
    colorSuccess: mini ? (dark ? '#6FBF97' : '#2F7A5A') : dark ? '#3FE0A5' : '#0A7452',
    colorWarning: mini ? (dark ? '#D3A45E' : '#B4823C') : dark ? '#FFB020' : '#8F5300',
    colorError: mini ? (dark ? '#E07A72' : '#C0453C') : dark ? '#FF6B57' : '#C2301C',
    colorInfo: dark ? '#8B919A' : '#585D65',
    colorBgBase: mini ? (dark ? '#0E0F13' : '#F5F6F8') : dark ? '#0A0B0D' : '#E6E7E2',
    colorBgContainer: mini ? (dark ? '#1A1C22' : '#FFFFFF') : dark ? '#111316' : '#F8F8F5',
    colorBgElevated: mini ? (dark ? '#23262E' : '#FFFFFF') : dark ? '#171A1E' : '#F0F1EC',
    colorBgSpotlight: mini ? (dark ? '#2A2D36' : '#F1F2F5') : dark ? '#1D2126' : '#E8E9E4',
    colorText: mini ? (dark ? '#E8E9EC' : '#17181C') : dark ? '#E9EBEE' : '#0C0D0F',
    colorTextSecondary: mini ? (dark ? '#8A909C' : '#7A7F8A') : dark ? '#8B919A' : '#585D65',
    colorTextTertiary: mini ? (dark ? '#6E7480' : '#9AA0AB') : dark ? '#5C626B' : '#9A9EA4',
    colorTextQuaternary: dark ? '#464C54' : '#B4B8BC',
    colorBorder: mini ? (dark ? '#3A3E48' : '#D9DDE5') : dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)',
    colorBorderSecondary: mini ? (dark ? '#2A2D36' : '#EAECF0') : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
    colorSplit: mini ? (dark ? '#2A2D36' : '#EAECF0') : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',
    borderRadius: mini ? 14 : 2,
    borderRadiusLG: mini ? 18 : 2,
    borderRadiusSM: mini ? 10 : 2,
    fontFamily: FONT,
    fontSize: 13,
    controlHeight: mini ? 38 : 32,
    lineHeight: 1.5,
    boxShadow: mini
      ? '0 4px 16px rgba(23,24,28,0.04)'
      : dark
        ? '0 8px 24px rgba(0,0,0,0.5)'
        : '0 8px 24px rgba(0,0,0,0.12)',
    boxShadowSecondary: dark ? '0 6px 20px rgba(0,0,0,0.45)' : '0 6px 20px rgba(0,0,0,0.1)',
  }
}

function Root(): JSX.Element {
  const [theme, setTheme] = React.useState<Theme>(getTheme())
  const [uiStyle, setUiStyleState] = React.useState<UiStyle>(getUiStyle())
  React.useEffect(() => {
    document.documentElement.dataset.ui = uiStyle
  }, [uiStyle])
  React.useEffect(() => subscribeTheme(setTheme), [])
  React.useEffect(() => subscribeUiStyle(setUiStyleState), [])
  const dark = theme === 'dark'
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: tokens(dark, uiStyle),
        components: {
          Modal: {
            contentBg: uiStyle === 'miniapp'
              ? (dark ? '#1A1C22' : '#FFFFFF')
              : (dark ? '#111316' : '#F8F8F5'),
            headerBg: 'transparent',
          },
          Message: { contentBg: dark ? '#171A1E' : '#FFFFFF' },
          Notification: { colorBgElevated: dark ? '#171A1E' : '#F8F8F5' },
        },
      }}
    >
      <HashRouter>
        <App />
      </HashRouter>
    </ConfigProvider>
  )
}

document.documentElement.dataset.ui = getUiStyle()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
