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
import { 基准文件名, 注册最近文档错误弹窗, 通过对话框打开文件, 通过路径打开文件 } from './fileOpen'
import { 分组拖入文件, 在局部投放区, 携带文件, 读取拖入路径 } from './fileDrop'
import { 桥接 } from './ipc/bridge'
import type { 保存全部应答 } from './ipc/bridge'
import { 保存全部文档 } from './editor/saveAll'
import type { DocItem } from './mock/recentDocs'
import HelpManual from './components/HelpManual'
import AboutDialog from './components/AboutDialog'
import Footer from './components/Footer'
import GlobalTabs from './components/GlobalTabs'
import AiAssistant from './assistant/AiAssistant'
import NewFileNotifier, { 本机通知事件名, type 本机通知 } from './components/NewFileNotifier'
import AssociatedFileOpener from './components/AssociatedFileOpener'
import DefaultAppPrompt from './components/DefaultAppPrompt'
import ErrorBoundary from './components/ErrorBoundary'
import {CloudProvider,useCloud} from './cloud/CloudProvider'
import CloudAutosave from './cloud/CloudAutosave'
import {flushCloudBeforeClose} from './cloud/autosaveLifecycle'
import './cloud/cloud.css'
import { useIconPlatform } from './components/IconPlatform'
import { SettingsErrorFeedback, SettingsProvider, useSettings } from './store/settingsStore'

/** 动态 Ant Design 主题配置 */
const 主题配置 = ({ 深色, 移动 }: { 深色: boolean; 移动: boolean }) => ({
  algorithm: 深色 ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: 深色 ? '#4A90E2' : '#2B6CF6',
    colorText: 深色 ? '#E8EAED' : '#1A1D24',
    colorTextSecondary: 深色 ? '#9AA0A6' : '#5C6472',
    colorBgContainer: 深色 ? '#252A33' : '#FFFFFF',
    colorBgElevated: 深色 ? '#2D333F' : '#FFFFFF',
    borderRadius: 移动 ? 6 : 4,
    boxShadow: 移动 ? '0 6px 16px rgba(0,0,0,.08)' : '0 3px 12px rgba(30,38,50,.08)',
    boxShadowSecondary: '0 4px 16px rgba(30,38,50,.09)',
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  },
})

const 外壳 = () => {
  // 使用 App 上下文中的 message，使提示能沿用 ConfigProvider 的中文语言包与主题
  const { message, modal } = AntdApp.useApp()
  useEffect(() => 注册最近文档错误弹窗((选项) => { modal.warning(选项) }), [modal])
  const { module, navKey, handleNav, docs, documents, activeDocumentId, PDF待预览, pdfDocuments, 保存PDF文档, workspaceTabs, showSettings, showHelp, goHome, createDoc, refreshRecents, 刷新工作状态备份, 备份恢复提示, 清除备份提示, 搜索词, set搜索词, 表格文档模型, 演示文档模型, markDocumentSaved, set文档路径, 更新文件指纹 } = useAppStore()
  const { 主题, 切换主题 } = useSettings()
  const cloud = useCloud()

  const 是首页 = module === 'home'
  // 帮助手册以独立弹窗打开，不再切换整页
  const [帮助弹窗打开, set帮助弹窗打开] = useState(false)
  // 关于我们弹窗
  const [关于弹窗打开, set关于弹窗打开] = useState(false)
  const [通知弹窗打开, set通知弹窗打开] = useState(false)
  const [客服弹窗打开, set客服弹窗打开] = useState(false)
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
    清除备份提示()
  }, [备份恢复提示, 清除备份提示])

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

  // 拖入文件打开：编辑区自身处理的拖放（插入图片、调整幻灯片顺序等）会先调用 preventDefault，这里不再接管。
  const [拖入中, set拖入中] = useState(false)
  const 拖入层级 = React.useRef(0)
  const 最新拖入打开 = React.useRef<(路径列表: string[]) => Promise<void>>(async () => {})
  最新拖入打开.current = async (路径列表: string[]) => {
    const { 可打开, 不支持 } = 分组拖入文件(路径列表)
    if (不支持.length > 0) {
      modal.warning({
        title: '部分文件无法打开',
        content: `暂不支持以下格式：${不支持.map(基准文件名).join('、')}。可打开 DOCX、XLSX、PPTX、PDF、CSV、TXT、MD、HTML 等文件。`,
        okText: '确定',
      })
    }
    let 已打开 = 0
    for (const 路径 of 可打开) {
      if (await 通过路径打开文件(路径, message, modal, (类型, 内容, 文件路径, 警告, 页面设置, 文件指纹) =>
        createDoc(类型, 内容, { 路径: 文件路径, 警告, 页面设置, 文件指纹 }))) 已打开 += 1
    }
    if (已打开 > 0) {
      refreshRecents()
      if (已打开 > 1) message.success(`已打开 ${已打开} 个文件`)
    }
  }
  useEffect(() => {
    // 落在编辑区自己的投放区（幻灯片舞台等）里时，交给该区域处理，窗口级拖入不介入
    const 交给局部 = (事件: DragEvent) => 在局部投放区(事件.target)
    const 进入 = (事件: DragEvent) => {
      if (!携带文件(事件.dataTransfer) || 交给局部(事件)) return
      拖入层级.current += 1
      set拖入中(true)
    }
    const 离开 = (事件: DragEvent) => {
      if (!携带文件(事件.dataTransfer) || 交给局部(事件)) return
      拖入层级.current = Math.max(0, 拖入层级.current - 1)
      if (拖入层级.current === 0) set拖入中(false)
    }
    const 经过 = (事件: DragEvent) => {
      if (!携带文件(事件.dataTransfer)) return
      if (交给局部(事件)) {
        拖入层级.current = 0
        set拖入中(false)
        return
      }
      // 不阻止默认行为就收不到 drop；同时避免窗口把文件当作网页导航打开
      事件.preventDefault()
      if (事件.dataTransfer) 事件.dataTransfer.dropEffect = 'copy'
    }
    const 放下 = (事件: DragEvent) => {
      if (!携带文件(事件.dataTransfer)) return
      拖入层级.current = 0
      set拖入中(false)
      // 编辑区内的拖放（插入图片、调整幻灯片顺序）会先调用 preventDefault，这里不接管
      if (事件.defaultPrevented || 交给局部(事件)) return
      事件.preventDefault()
      const 路径列表 = 读取拖入路径(事件.dataTransfer)
      if (路径列表.length === 0) {
        modal.warning({ title: '无法打开拖入的内容', content: '只能打开本机磁盘上的文件，请从资源管理器拖入。', okText: '确定' })
        return
      }
      void 最新拖入打开.current(路径列表)
    }
    window.addEventListener('dragenter', 进入)
    window.addEventListener('dragleave', 离开)
    window.addEventListener('dragover', 经过)
    window.addEventListener('drop', 放下)
    return () => {
      window.removeEventListener('dragenter', 进入)
      window.removeEventListener('dragleave', 离开)
      window.removeEventListener('dragover', 经过)
      window.removeEventListener('drop', 放下)
    }
  }, [modal])

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
        try { 备份 = await 最新备份刷新.current(); await flushCloudBeforeClose() }
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

  // “保存后退出”：把每个未保存文档写回原路径（没有路径的先询问位置），并把结果回报给主进程。
  const 最新保存全部 = React.useRef<() => Promise<保存全部应答>>(async () => ({ 成功: true, 已保存: [], 失败: [], 已取消: false }))
  最新保存全部.current = async () => {
    const 待保存标签 = workspaceTabs.filter((标签) => 标签.dirty)
    const 待保存 = 待保存标签.map((标签) => {
      const 文档 = documents.find((项) => 项.id === 标签.id)
      return {
        标识: 标签.id,
        名称: 标签.name,
        类型: 标签.type as 'word' | 'table' | 'ppt' | 'pdf',
        路径: 标签.path,
        ...(文档 === undefined ? {} : {
          html: 文档.html,
          页面设置: 文档.页面设置,
          文件指纹: 文档.文件指纹,
          来源路径: 文档.来源路径,
          警告: 文档.警告,
        }),
        ...(标签.type === 'pdf' ? {PDF数据:pdfDocuments.find(d=>d.id===标签.id)?.data||undefined} : {}),
        ...(标签.type === 'table' ? { 表格模型: 表格文档模型[标签.id] } : {}),
        ...(标签.type === 'ppt' ? { 演示模型: 演示文档模型[标签.id] } : {}),
      }
    })
    const 结果 = await 保存全部文档(待保存)
    for (const 项 of 结果.已保存) {
      const 标签 = 待保存标签.find((当前) => 当前.id === 项.标识)
      const 文档 = documents.find((当前) => 当前.id === 项.标识)
      if (标签?.type === 'pdf') { 保存PDF文档(项.标识,项.路径,pdfDocuments.find(d=>d.id===项.标识)?.data||''); continue }
      if (标签?.type === 'table') markDocumentSaved(项.标识, '', JSON.stringify(表格文档模型[项.标识] ?? []))
      else if (标签?.type === 'ppt') markDocumentSaved(项.标识, '', JSON.stringify(演示文档模型[项.标识]))
      else markDocumentSaved(项.标识, 文档?.html ?? '', undefined, { 页面设置: 文档?.页面设置 })
      set文档路径(项.标识, 项.路径)
      if (项.文件指纹) 更新文件指纹(项.标识, 项.文件指纹)
    }
    if (结果.已保存.length > 0) message.success(`已保存 ${结果.已保存.length} 个文档`)
    return {
      成功: 结果.失败.length === 0 && !结果.已取消,
      已保存: 结果.已保存.map((项) => 项.名称),
      失败: 结果.失败.map((项) => ({ 名称: 项.名称, 原因: 项.原因 })),
      已取消: 结果.已取消,
    }
  }
  useEffect(() => {
    if (!桥接.可用) return
    return 桥接.onSaveAllRequested((标识) => {
      void (async () => {
        let 应答: 保存全部应答
        try { 应答 = await 最新保存全部.current() }
        catch (错误) {
          应答 = { 成功: false, 已保存: [], 失败: [{ 名称: '当前窗口', 原因: 错误 instanceof Error ? 错误.message : '保存全部文档失败' }], 已取消: false }
        }
        const 回报 = await 桥接.respondSaveAll(标识, 应答)
        if (!回报.成功) modal.error({ title: '保存后退出不可用', content: 回报.错误 || '无法回报保存结果' })
      })()
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
    { className: 'wps-app', 'data-module': module },
    React.createElement(TitleBar, {
      pageName: 当前模块.label,
      documentName: 当前文档名,
      onHelp: () => set帮助弹窗打开(true),
      onShowSettings: showSettings,
      onShowHelp: () => set帮助弹窗打开(true),
      onCloud: cloud.configure,
      onLogin: cloud.configure,
      homeMode: 是首页,
      搜索词,
      on搜索变化: set搜索词,
      on通知: () => set通知弹窗打开(true),
      on客服: () => set客服弹窗打开(true),
      on关于: () => set关于弹窗打开(true),
      主题深色: 主题 === '深色',
      on切换主题: 切换主题,
    }),
    React.createElement(CloudAutosave),
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
      (module === 'settings' || module === 'help') ? React.createElement(Sidebar, {
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
      }) : null,
      React.createElement('div', { style: { display:'flex',flexDirection:'column',flex:1,minWidth:0,minHeight:0 } }, 主内容)
    ),
    React.createElement(GlobalTabs, null),
    React.createElement(Footer, { total: docs.length, starred: 星标数 }),
    React.createElement(Modal, {
      open: 客服弹窗打开, onCancel: () => set客服弹窗打开(false),
      onOk: () => set客服弹窗打开(false), centered: true, width: 480,
      title: '联系客服', okText: '关闭', cancelButtonProps: { style: { display: 'none' } },
    }, React.createElement('div', { className: 'seal-contact' },
      React.createElement('p', null, '如需反馈问题或咨询，请联系：'),
      React.createElement('dl', null,
        React.createElement('dt', null, '联系邮箱'), React.createElement('dd', null, '24519660@qq.com')),
      React.createElement('p', { className: 'seal-contact__hint' }, '反馈问题时请附上软件版本、操作步骤和相关截图，方便定位。'))),
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
    拖入中 ? React.createElement('div', { className: 'wps-drop-overlay', role: 'status', 'aria-live': 'polite' },
      React.createElement('div', { className: 'wps-drop-overlay__panel' },
        React.createElement('strong', null, '松开鼠标即可打开文件'),
        React.createElement('span', null, '支持 DOCX、XLSX、PPTX、PDF、CSV、TXT、MD、HTML，可一次拖入多个'))) : null,
    React.createElement(AiAssistant, null),
    React.createElement(NewFileNotifier, null),
    React.createElement(AssociatedFileOpener, null),
    React.createElement(DefaultAppPrompt, null)
  )
}

/** 在当前主题下创建组件库上下文，使弹窗和表单也随主题切换。 */
export const 动态主题容器 = ({ children }: { children: React.ReactNode }) => {
  const { 主题 } = useSettings()
  return React.createElement(ConfigProvider, {
    locale: zhCN,
    theme: 主题配置({ 深色: 主题 === '深色', 移动: useIconPlatform() === 'mobile' }),
    button: { autoInsertSpace: false },
  }, children)
}

const App = ({ 初始最近文档, 跨端导航 }: { 初始最近文档?: DocItem[]; 跨端导航?: React.ComponentType } = {}) =>
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
          React.createElement(CloudProvider, { children: React.createElement(AppProvider, { 初始最近文档, children: React.createElement(React.Fragment, null, React.createElement(外壳, null), 跨端导航 ? React.createElement(跨端导航) : null) }) })
        )
      )
    )
  )

export default App
