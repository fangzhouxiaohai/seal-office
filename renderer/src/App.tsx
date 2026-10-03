// 应用外壳：按当前模块装配首页视图或编辑器视图，并统一挂载顶栏、侧栏与状态栏。
import React, { useEffect, useState } from 'react'
import { App as AntdApp, ConfigProvider, Modal, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppProvider, useAppStore } from './store'
import { MODULES } from './routes'
import { NEW_DOC_NAMES } from './navConfig'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import HomeRail from './components/HomeRail'
import HomeSidebar from './components/HomeSidebar'
import RecommendPanel from './components/RecommendPanel'
import HomePage from './pages/HomePage'
import { 注册最近文档错误弹窗, 通过对话框打开文件 } from './fileOpen'
import { 桥接 } from './ipc/bridge'
import type { DocItem } from './mock/recentDocs'
import HelpManual from './components/HelpManual'
import AboutDialog from './components/AboutDialog'
import Footer from './components/Footer'
import GlobalTabs from './components/GlobalTabs'
import AiAssistant from './assistant/AiAssistant'
import NewFileNotifier, { 本机通知事件名, type 本机通知 } from './components/NewFileNotifier'
import AssociatedFileOpener from './components/AssociatedFileOpener'
import ErrorBoundary from './components/ErrorBoundary'
import { SettingsErrorFeedback, SettingsProvider, useSettings } from './store/settingsStore'

/** 动态 Ant Design 主题配置 */
const 主题配置 = ({ 深色 }: { 深色: boolean }) => ({
  algorithm: 深色 ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: 深色 ? '#4A90E2' : '#2B6CF6',
    colorText: 深色 ? '#E8EAED' : '#1A1D24',
    colorTextSecondary: 深色 ? '#9AA0A6' : '#5C6472',
    colorBgContainer: 深色 ? '#252A33' : '#FFFFFF',
    colorBgElevated: 深色 ? '#2D333F' : '#FFFFFF',
    borderRadius: 6,
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  },
})

const 外壳 = () => {
  // 使用 App 上下文中的 message，使提示能沿用 ConfigProvider 的中文语言包与主题
  const { message, modal } = AntdApp.useApp()
  useEffect(() => 注册最近文档错误弹窗((选项) => { modal.warning(选项) }), [modal])
  const { module, navKey, handleNav, docs, documents, activeDocumentId, PDF待预览, workspaceTabs, showSettings, showHelp, goHome, createDoc, refreshRecents, 刷新工作状态备份, 备份恢复提示, 清除备份提示, 搜索词, set搜索词 } = useAppStore()
  const { 主题, 切换主题 } = useSettings()

  const 是首页 = module === 'home'
  // 帮助手册以独立弹窗打开，不再切换整页
  const [帮助弹窗打开, set帮助弹窗打开] = useState(false)
  // 关于我们弹窗
  const [关于弹窗打开, set关于弹窗打开] = useState(false)
  const [通知弹窗打开, set通知弹窗打开] = useState(false)
  const [本次通知, set本次通知] = useState<Array<本机通知 & { 标识: number; 时间: string }>>([])
  const 通知序号 = React.useRef(0)
  const [模板库打开, set模板库打开] = useState(false)
  const 当前模块 = MODULES[module]
  const 星标数 = docs.filter((文档) => 文档.starred).length

  // 编辑器顶栏展示实际打开的文档名；尚未打开具体文档时展示该模块的默认文件名
  const 当前文档名 = React.useMemo(() => {
    if (module === 'home') {
      return undefined
    }
    if (module === 'pdf') return PDF待预览?.名称 ?? NEW_DOC_NAMES.pdf
    const 已打开 = documents.find((文档) => 文档.id === activeDocumentId)
    return 已打开?.name ?? NEW_DOC_NAMES[module]
  }, [module, documents, activeDocumentId, PDF待预览])

  const 页面组件 = 当前模块.page

  useEffect(() => {
    if (!备份恢复提示) return
    modal.info({ title: '已恢复编辑内容', content: `${备份恢复提示}。请检查内容并及时保存。` })
    清除备份提示()
  }, [备份恢复提示, modal, 清除备份提示])

  useEffect(() => {
    const 记录通知 = (事件: Event) => {
      const 通知 = (事件 as CustomEvent<本机通知>).detail
      if (!通知 || typeof 通知.标题 !== 'string' || typeof 通知.内容 !== 'string') return
      通知序号.current += 1
      set本次通知((当前) => [{ ...通知, 标识: 通知序号.current, 时间: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }, ...当前].slice(0, 30))
    }
    window.addEventListener(本机通知事件名, 记录通知)
    return () => window.removeEventListener(本机通知事件名, 记录通知)
  }, [])

  const 打开本地文件 = () => {
    void 通过对话框打开文件(message, modal, (类型, 内容, 路径, 警告, 页面设置, 文件指纹) => createDoc(类型, 内容, { 路径, 警告, 页面设置, 文件指纹 }))
      .then((成功) => { if (成功) refreshRecents() })
  }

  // 关闭时先等待最新工作区备份，再答复当前标签状态；平时的异步上报仅供核验失败时提示先前风险。
  const 风险文档数 = workspaceTabs.filter((标签) => 标签.dirty).length
  const 最新风险文档数 = React.useRef(风险文档数)
  最新风险文档数.current = 风险文档数
  const 最新备份刷新 = React.useRef(刷新工作状态备份)
  最新备份刷新.current = 刷新工作状态备份
  useEffect(() => {
    if (!桥接.可用) return
    return 桥接.onCloseStateRequested((标识) => {
      void (async () => {
        let 备份: { 成功: boolean; 错误?: string }
        try { 备份 = await 最新备份刷新.current() }
        catch (错误) { 备份 = { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '无法刷新工作状态备份' } }
        const 结果 = await 桥接.respondCloseState(标识, {
          未保存数量: 最新风险文档数.current,
          备份成功: 备份.成功,
          ...(备份.错误 ? { 备份错误: 备份.错误 } : {}),
        })
        if (!结果.成功) modal.error({ title: '关闭保护不可用', content: 结果.错误 || '无法确认当前文档状态' })
      })().catch((错误: unknown) => {
        modal.error({ title: '关闭保护不可用', content: 错误 instanceof Error ? 错误.message : '无法确认当前文档状态' })
      })
    })
  }, [modal])
  useEffect(() => {
    if (!桥接.可用) return
    void 桥接.reportUnsavedCount(风险文档数).then((结果) => {
      if (!结果.成功) modal.error({ title: '关闭保护不可用', content: 结果.错误 || '无法向主进程同步文档状态' })
    }).catch((错误: unknown) => {
      modal.error({ title: '关闭保护不可用', content: 错误 instanceof Error ? 错误.message : '无法向主进程同步文档状态' })
    })
  }, [风险文档数, modal])

  // 特殊处理：设置、帮助、PDF 页面的渲染（不需要 editor 布局）
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
  } else if (module === 'pdf') {
    主内容 = React.createElement(
      'main',
      { className: 'wps-main wps-main--pdf' },
      React.createElement(ErrorBoundary, null, React.createElement(页面组件, null))
    )
  } else {
    主内容 = React.createElement(
      'main',
      { className: 是首页 ? 'wps-main' : 'wps-main wps-main--editor' },
      // 页面级兜底：单个页面异常时仍保留顶栏与侧栏可用
      React.createElement(ErrorBoundary, null, 是首页
        ? React.createElement(HomePage, { 模板库打开, 关闭模板库: () => set模板库打开(false) })
        : React.createElement(页面组件, null))
    )
  }

  return React.createElement(
    'div',
    { className: 'wps-app' },
    React.createElement(TitleBar, {
      pageName: 当前模块.label,
      documentName: 当前文档名,
      onHelp: () => set帮助弹窗打开(true),
      onShowSettings: showSettings,
      onShowHelp: () => set帮助弹窗打开(true),
      onCloud: () => message.info('云文档功能即将开放，当前文档均保存在本机'),
      onLogin: () => message.info('本机功能无需登录；云端服务暂未开放'),
      homeMode: 是首页,
      搜索词,
      on搜索变化: set搜索词,
      on通知: () => set通知弹窗打开(true),
      on客服: () => message.info('在线客服即将开放，可发送邮件至 24519660@qq.com'),
      on关于: () => set关于弹窗打开(true),
      主题深色: 主题 === '深色',
      on切换主题: 切换主题,
    }),
    是首页
      ? React.createElement(
          'div',
          { className: 'wps-homebody' },
          React.createElement(HomeRail, {
            activeKey: navKey,
            onNotify: (文本: string) => message.info(文本),
            onNavigate: (键: string) => handleNav(键, (文本: string) => message.info(文本)),
          }),
          React.createElement(HomeSidebar, {
            navKey,
            onNavigate: (键: string) => handleNav(键, (文本: string) => message.info(文本)),
            onNewDoc: (类型: 'word' | 'table' | 'ppt' | 'pdf') => createDoc(类型),
            onOpenTemplate: () => set模板库打开(true),
            onOpenFile: () => {
              // 与首页空状态共用同一条打开链路
              打开本地文件()
            },
            onOpenPdf: () => {
              createDoc('pdf')
            },
            onOpenHelp: () => set帮助弹窗打开(true),
            onNotify: (文本: string) => message.info(文本),
          }),
          React.createElement('main', { className: 'wps-home-main' }, 主内容),
          React.createElement(RecommendPanel, {
            onOpenFile: () => {
              打开本地文件()
            },
            onOpenPdf: () => createDoc('pdf'),
            onNewDoc: (类型: 'word' | 'table' | 'ppt') => createDoc(类型),
          })
        )
      : React.createElement(
      'div',
      { className: 'wps-body' },
      React.createElement(Sidebar, {
        mode: 是首页 ? 'home' : (module === 'settings' ? 'settings' : module === 'help' ? 'help' : module === 'pdf' ? 'pdf' : 'editor'),
        activeKey: navKey,
        onSelect: (键: string) => {
          if (键 === 'settings') {
            showSettings()
          } else if (键 === 'help') {
            showHelp()
          } else if (键 === 'pdf') {
            createDoc('pdf')
          } else {
            handleNav(键, (文本: string) => message.info(文本))
          }
        },
        moduleLabel: 当前模块.label,
        onBack: goHome,
        onShowSettings: showSettings,
        onShowHelp: () => set帮助弹窗打开(true),
        onShowPdf: () => createDoc('pdf'),
      }),
      主内容
    ),
    React.createElement(GlobalTabs, null),
    React.createElement(Footer, { total: docs.length, starred: 星标数 }),
    React.createElement(
      Modal,
      {
        open: 帮助弹窗打开,
        onCancel: () => set帮助弹窗打开(false),
        footer: null,
        width: 920,
        centered: true,
        title: '帮助手册',
        styles: { body: { maxHeight: '68vh', overflowY: 'auto', paddingTop: 0 } },
      },
      React.createElement(HelpManual, {
        打开状态: 帮助弹窗打开,
        关闭回调: () => set帮助弹窗打开(false),
      })
    ),
    React.createElement(AboutDialog, {
      打开状态: 关于弹窗打开,
      关闭回调: () => set关于弹窗打开(false),
    }),
    React.createElement(
      Modal,
      {
        open: 通知弹窗打开,
        onCancel: () => set通知弹窗打开(false),
        footer: null,
        width: 520,
        title: '通知',
        styles: { body: { maxHeight: '60vh', overflowY: 'auto' } },
      },
      本次通知.length === 0
        ? React.createElement('p', { className: 'wps-notice-empty' }, '本次运行暂无通知')
        : React.createElement('ul', { className: 'wps-notice-list' }, 本次通知.map((通知) => React.createElement(
            'li', { className: 'wps-notice-list__item', key: 通知.标识 },
            React.createElement('div', { className: 'wps-notice-list__head' },
              React.createElement('strong', null, 通知.标题),
              React.createElement('time', null, 通知.时间)),
            React.createElement('p', null, 通知.内容)
          )))
    ),
    React.createElement(AiAssistant, null),
    React.createElement(NewFileNotifier, null),
    React.createElement(AssociatedFileOpener, null)
  )
}

/** 在当前主题下创建组件库上下文，使弹窗和表单也随主题切换。 */
export const 动态主题容器 = ({ children }: { children: React.ReactNode }) => {
  const { 主题 } = useSettings()
  return React.createElement(ConfigProvider, {
    locale: zhCN,
    theme: 主题配置({ 深色: 主题 === '深色' }),
    button: { autoInsertSpace: false },
  }, children)
}

const App = ({ 初始最近文档 }: { 初始最近文档?: DocItem[] } = {}) =>
  React.createElement(
    SettingsProvider,
    null,
    React.createElement(
      动态主题容器,
      null,
      React.createElement(
        AntdApp,
        null,
        React.createElement(SettingsErrorFeedback, null),
        React.createElement(
          ErrorBoundary,
          null,
          React.createElement(AppProvider, { 初始最近文档, children: React.createElement(外壳, null) })
        )
      )
    )
  )

export default App
