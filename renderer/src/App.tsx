// 应用外壳：按当前模块装配首页视图或编辑器视图，并统一挂载顶栏、侧栏与状态栏。
import React from 'react'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppProvider, useAppStore } from './store'
import { MODULES } from './routes'
import { NEW_DOC_NAMES } from './navConfig'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'
import { SettingsProvider } from './store/settingsStore'

const 主题 = {
  token: {
    colorPrimary: '#2B6CF6',
    colorText: '#1A1D24',
    colorTextSecondary: '#5C6472',
    borderRadius: 6,
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  },
}

const 外壳 = () => {
  // 使用 App 上下文中的 message，使提示能沿用 ConfigProvider 的中文语言包与主题
  const { message } = AntdApp.useApp()
  const { module, navKey, handleNav, docs, documents, activeDocumentId, showSettings, showHelp, goHome } = useAppStore()

  const 是首页 = module === 'home'
  const 当前模块 = MODULES[module]
  const 星标数 = docs.filter((文档) => 文档.starred).length

  // 编辑器顶栏展示实际打开的文档名；尚未打开具体文档时展示该模块的默认文件名
  const 当前文档名 = React.useMemo(() => {
    if (module === 'home') {
      return undefined
    }
    const 已打开 = documents.find((文档) => 文档.id === activeDocumentId)
    return 已打开?.name ?? NEW_DOC_NAMES[module]
  }, [module, documents, activeDocumentId])

  const 页面组件 = 当前模块.page

  // 特殊处理：设置和帮助页面的渲染（不需要editor布局）
  let 主内容
  if (module === 'settings') {
    主内容 = React.createElement(
      'main',
      { className: 'wps-main wps-main--settings' },
      React.createElement(ErrorBoundary, null, React.createElement(页面组件, null))
    )
  } else if (module === 'help') {
    主内容 = React.createElement(
      'main',
      { className: 'wps-main wps-main--help' },
      React.createElement(ErrorBoundary, null, React.createElement(页面组件, null))
    )
  } else {
    主内容 = React.createElement(
      'main',
      { className: 是首页 ? 'wps-main' : 'wps-main wps-main--editor' },
      // 页面级兜底：单个页面异常时仍保留顶栏与侧栏可用
      React.createElement(ErrorBoundary, null, React.createElement(页面组件, null))
    )
  }

  return React.createElement(
    'div',
    { className: 'wps-app' },
    React.createElement(TitleBar, {
      pageName: 当前模块.label,
      documentName: 当前文档名,
      onSetting: showSettings,
      onHelp: showHelp,
      onShowSettings: showSettings,
      onShowHelp: showHelp,
    }),
    React.createElement(
      'div',
      { className: 'wps-body' },
      React.createElement(Sidebar, {
        mode: 是首页 ? 'home' : (module === 'settings' ? 'settings' : module === 'help' ? 'help' : 'editor'),
        activeKey: navKey,
        onSelect: (键: string) => {
          if (键 === 'settings') {
            showSettings()
          } else if (键 === 'help') {
            showHelp()
          } else {
            handleNav(键, (文本: string) => message.info(文本))
          }
        },
        moduleLabel: 当前模块.label,
        onBack: goHome,
      }),
      主内容
    ),
    React.createElement(Footer, { total: docs.length, starred: 星标数 })
  )
}

const App = () =>
  React.createElement(
    ConfigProvider,
    {
      locale: zhCN,
      theme: 主题,
      // 关闭两个汉字按钮的自动空格，保证界面文案与设计稿完全一致
      button: { autoInsertSpace: false },
    },
    React.createElement(
      AntdApp,
      null,
      // 应用级兜底：顶栏、侧栏或状态栏异常时展示中文说明而非整窗白屏
      React.createElement(
        SettingsProvider,
        null,
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(AppProvider, null, React.createElement(外壳, null))
        )
      )
    )
  )

export default App
