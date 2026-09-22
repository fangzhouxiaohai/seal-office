// 应用外壳：按当前模块装配首页视图或编辑器视图，并统一挂载顶栏、侧栏与状态栏。
import React from 'react'
import { ConfigProvider, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppProvider, useAppStore } from './store'
import { MODULES } from './routes'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'

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
  const { module, setModule, navKey, handleNav, docs } = useAppStore()

  const 是首页 = module === 'home'
  const 当前模块 = MODULES[module]
  const 星标数 = docs.filter((文档) => 文档.starred).length

  // 编辑器视图下顶栏展示打开中的文档名，首页视图下展示搜索框
  const 当前文档名 = React.useMemo(() => {
    if (是首页) {
      return undefined
    }
    const 类型匹配 = docs.find((文档) => 文档.type === module)
    return 类型匹配?.name
  }, [是首页, module, docs])

  const 页面组件 = 当前模块.page

  return React.createElement(
    'div',
    { className: 'wps-app' },
    React.createElement(TitleBar, {
      pageName: 当前模块.label,
      documentName: 当前文档名,
      onSetting: () => message.info('设置功能开发中'),
      onHelp: () => message.info('帮助与反馈功能开发中'),
    }),
    React.createElement(
      'div',
      { className: 'wps-body' },
      React.createElement(Sidebar, {
        mode: 是首页 ? 'home' : 'editor',
        activeKey: navKey,
        onSelect: (键: string) => handleNav(键, (文本: string) => message.info(文本)),
        moduleLabel: 当前模块.label,
        onBack: () => setModule('home'),
      }),
      React.createElement(
        'main',
        { className: 'wps-main' },
        React.createElement(ErrorBoundary, null, React.createElement(页面组件, null))
      )
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
    React.createElement(AppProvider, null, React.createElement(外壳, null))
  )

export default App
