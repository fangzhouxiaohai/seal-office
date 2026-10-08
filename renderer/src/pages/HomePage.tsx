// 首页：新建入口与最近文档区块的组合页。
import React, { useEffect, useState } from 'react'
import { App as AntdApp, Dropdown } from 'antd'
import Icon from '../components/Icon'
import { useAppStore } from '../store'
import type { DocType } from '../mock/recentDocs'
import { filterDocs, sortDocs } from '../mock/recentDocs'
import RecentDocs from '../components/RecentDocs'
import TemplateLibrary from '../components/TemplateLibrary'
import { 生成演示模板文稿, type 模板项 } from '../data/templates'
import { 通过对话框打开文件 } from '../fileOpen'
import CalendarPage from '../localTools/CalendarPage'
import DiagramPage from '../localTools/DiagramPage'
import AppsPage from '../localTools/AppsPage'
import LocalFilesPage, { type 本机位置 } from '../localTools/LocalFilesPage'
import { 读取搜索文字, 搜索片段 } from '../search/contentSearch'
import CloudFilesPage from '../cloud/CloudFilesPage'
import KnowledgePage from '../cloud/KnowledgePage'
import PresentationMarketPage from '../cloud/PresentationMarketPage'
import {useCloud} from '../cloud/CloudProvider'

/** 区块标题随导航筛选变化 */
const 标题映射: Record<string, string> = {
  home: '最近',
  recent: '最近',
  star: '星标文档',
  shared: '共享文档',
  pdf: 'PDF 工具',
}

interface HomePageProps {
  模板库打开?: boolean
  关闭模板库?: () => void
}

const HomePage = ({ 模板库打开 = false, 关闭模板库 }: HomePageProps) => {
  const { message, modal } = AntdApp.useApp()
  const cloud = useCloud()
  const [类型筛选, 设类型筛选] = useState<'all' | DocType>('all')
  const [正文匹配, set正文匹配] = useState<Record<string, string>>({})
  const [搜索中, set搜索中] = useState(false)
  const {
    navKey,
    setNavKey,
    refreshRecents,
    最近读取错误,
    清除最近读取错误,
    viewMode,
    setViewMode,
    sortKey,
    setSortKey,
    visibleDocs,
    搜索词,
    docs,
    activeDocId,
    setActiveDocId,
    toggleStar,
    openDoc,
    createDoc,
    renameDoc,
    removeDoc,
    removeDocs,
  } = useAppStore()

  useEffect(() => {
    const 关键词 = 搜索词.trim()
    if (!关键词) { set正文匹配({}); set搜索中(false); return }
    let 已取消 = false
    set正文匹配({})
    set搜索中(true)
    const 定时 = window.setTimeout(() => {
      void (async () => {
        const 候选 = docs.filter((文档) => 文档.路径 && !文档.name.toLocaleLowerCase().includes(关键词.toLocaleLowerCase()))
        for (let 起点 = 0; 起点 < 候选.length && !已取消; 起点 += 3) {
          const 结果 = await Promise.allSettled(候选.slice(起点, 起点 + 3).map(async (文档) => ({ id: 文档.id, 片段: 搜索片段(await 读取搜索文字(文档), 关键词) })))
          if (已取消) break
          set正文匹配((当前) => {
            const 下次 = { ...当前 }
            for (const 项 of 结果) if (项.status === 'fulfilled' && 项.value.片段) 下次[项.value.id] = 项.value.片段
            return 下次
          })
        }
        if (!已取消) set搜索中(false)
      })()
    }, 250)
    return () => { 已取消 = true; window.clearTimeout(定时) }
  }, [docs, 搜索词])

  useEffect(() => {
    if (最近读取错误 === null) return
    modal.error({ title: '读取最近文档失败', content: 最近读取错误 })
    清除最近读取错误()
  }, [最近读取错误])

  /** 「全部类型」下拉筛选：全部/文字/表格/演示 */
  const 搜索结果 = 搜索词.trim() ? sortDocs(filterDocs(docs.filter((文档) => 文档.name.toLocaleLowerCase().includes(搜索词.trim().toLocaleLowerCase()) || Boolean(正文匹配[文档.id])), navKey), sortKey) : visibleDocs
  const 筛选后文档 = 类型筛选 === 'all' ? 搜索结果 : 搜索结果.filter((文档) => 文档.type === 类型筛选)
  const 类型菜单 = {
    items: [
      { key: 'all', label: '全部类型' },
      { key: 'word', label: '文字' },
      { key: 'table', label: '表格' },
      { key: 'ppt', label: '演示' },
      { key: 'pdf', label: 'PDF' },
    ],
    onClick: ({ key }: { key: string }) => 设类型筛选(key as 'all' | DocType),
  }

  const 处理模板选择 = (模板: 模板项) => {
    try {
      const 扩展名 = { word: 'docx', table: 'xlsx', ppt: 'pptx' }[模板.分类]
      const 初始内容 = 模板.分类 === 'ppt' ? 生成演示模板文稿(模板) : 模板.内容
      createDoc(模板.分类 as DocType, 初始内容, { 名称: `${模板.名称}.${扩展名}` })
      关闭模板库?.()
    } catch (错误) {
      modal.error({ title: '使用模板失败', content: 错误 instanceof Error ? 错误.message : '无法创建模板文档' })
    }
  }

  const 处理打开 = (标识: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      modal.error({ title: '打开文件失败', content: '未找到该文档，可能已被移除' })
      return
    }
    void openDoc(目标).catch((错误: unknown) => {
      modal.error({ title: '打开文件失败', content: 错误 instanceof Error ? 错误.message : '未知错误' })
    })
  }

  const 处理打开文件 = () => {
    void 通过对话框打开文件(message, modal, (类型, 内容, 路径, 警告, 页面设置, 文件指纹) => createDoc(类型, 内容, { 路径, 警告, 页面设置, 文件指纹 }))
      .then((成功) => { if (成功) refreshRecents() })
  }

  const 处理重命名 = async (标识: string, 名称: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      throw new Error('未找到该文档，可能已被移除')
    }
    await renameDoc(标识, 名称)
    message.success('文件已重命名')
  }

  const 处理删除 = (标识: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      modal.error({ title: '移除最近文档失败', content: '未找到该文档，可能已被移除' })
      return
    }
    void removeDoc(标识).then(() => {
      message.success(`已从最近列表移除「${目标.name}」`)
    }).catch((错误: unknown) => {
      modal.error({ title: '移除最近文档失败', content: 错误 instanceof Error ? 错误.message : '未知错误' })
    })
  }

  /** 批量移除最近记录：确认后逐条持久化，返回 true 表示可以退出批量管理 */
  const 处理批量删除 = (标识列表: string[]): Promise<boolean> => new Promise((完成) => {
    const 目标列表 = docs.filter((文档) => 标识列表.includes(文档.id))
    if (目标列表.length === 0) { 完成(false); return }
    modal.confirm({
      title: `移除 ${目标列表.length} 条最近记录`,
      content: `共 ${目标列表.length} 条记录将从最近列表移除（勾选内容不会恢复）。磁盘中的文件不会被删除。`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const { 已移除, 失败 } = await removeDocs(目标列表.map((文档) => 文档.id))
          if (已移除.length > 0) message.success(`已从最近列表移除 ${已移除.length} 条记录`)
          if (失败.length > 0) {
            modal.error({
              title: '部分记录未能移除',
              content: `以下记录仍保留在最近列表：${失败.map((项) => `${项.名称}（${项.错误}）`).join('；')}`,
            })
            完成(false)
            return
          }
          完成(true)
        } catch (错误) {
          modal.error({ title: '移除最近文档失败', content: 错误 instanceof Error ? 错误.message : '未知错误' })
          完成(false)
        }
      },
      onCancel: () => 完成(false),
    })
  })

  const 本地工具页面 = navKey === 'my-cloud' ? React.createElement(CloudFilesPage)
    : navKey === 'trash' ? React.createElement(CloudFilesPage, {trash:true})
    : navKey === 'knowledge' ? React.createElement(KnowledgePage)
    : navKey === 'market' ? React.createElement(PresentationMarketPage)
    : navKey === 'calendar' ? React.createElement(CalendarPage)
    : navKey === 'mindmap' ? React.createElement(DiagramPage, { 类型: '脑图' })
      : navKey === 'flow' ? React.createElement(DiagramPage, { 类型: '流程图' })
        : navKey === 'apps' ? React.createElement(AppsPage)
          : ['desktop', 'document', 'download'].includes(navKey)
            ? React.createElement(LocalFilesPage, { 位置: navKey as 本机位置 }) : null

  if (本地工具页面 !== null) {
    return React.createElement(
      React.Fragment,
      null,
      本地工具页面,
      React.createElement(TemplateLibrary, {
        打开: 模板库打开,
        关闭: 关闭模板库,
        onSelect: 处理模板选择,
      })
    )
  }

  return React.createElement(
    'div',
    { className: 'wps-home' },
    // 最近头部：标题 + 刷新；右侧云同步占位
    React.createElement(
      'div',
      { className: 'wps-home__header' },
      React.createElement(
        'div',
        { className: 'wps-home__title-row' },
        React.createElement('h1', { className: 'wps-home__title' }, 标题映射[navKey] ?? '最近'),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'wps-home__refresh',
            title: '刷新最近列表',
            'aria-label': '刷新最近列表',
            onClick: refreshRecents,
          },
          React.createElement(Icon, { name: 'retry', size: 14 })
        )
      ),
      React.createElement(
        'span',
        {
          className: 'wps-home__cloud-sync',
          role: 'status',
          'aria-label': cloud.state.account?.autosave ? '云文档自动保存已开启' : '云文档自动保存未开启',
        },
        React.createElement(Icon, { name: 'cloud-off', size: 14 }),
        React.createElement('span', null, cloud.state.account?.autosave ? '云文档自动保存已开启' : '云文档自动保存未开启')
      )
    ),
    // 工具行：类型筛选（左）
    React.createElement(
      'div',
      { className: 'wps-home__toolbar' },
      React.createElement(
        Dropdown,
        { menu: 类型菜单, trigger: ['click'] },
        React.createElement(
          'button',
          { type: 'button', className: 'wps-home__type-filter' },
          类型筛选 === 'all' ? '全部类型' : (类型筛选 === 'word' ? '文字' : 类型筛选 === 'table' ? '表格' : 类型筛选 === 'ppt' ? '演示' : 'PDF')
        )
      )
    ),
    // 最近文档区块（现有）
    搜索词.trim() && React.createElement('div', { className: 'wps-home__search-results', role: 'status' }, 搜索中 ? '正在搜索最近文档内容…' : `找到 ${筛选后文档.length} 个匹配文件`, ...筛选后文档.filter((文档) => 正文匹配[文档.id]).map((文档) => React.createElement('button', { key: 文档.id, type: 'button', onClick: () => 处理打开(文档.id) }, React.createElement('strong', null, 文档.name), React.createElement('span', null, 正文匹配[文档.id])))),
    React.createElement(RecentDocs, {
      docs: 筛选后文档,
      title: ' ',
      viewMode,
      sortKey,
      activeDocId,
      onSelect: setActiveDocId,
      onOpen: 处理打开,
      onToggleStar: toggleStar,
      onRename: 处理重命名,
      onRemove: 处理删除,
      onRemoveMany: 处理批量删除,
      onViewModeChange: setViewMode,
      onSortChange: setSortKey,
      onViewAll: () => setNavKey('recent'),
      onEmptyAction: 处理打开文件,
    }),
    // 模板库弹窗
    React.createElement(TemplateLibrary, {
      打开: 模板库打开,
      关闭: 关闭模板库,
      onSelect: 处理模板选择,
    })
  )
}

export default HomePage
