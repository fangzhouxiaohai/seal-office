// 首页：新建入口与最近文档区块的组合页。
import React, { useEffect, useState } from 'react'
import { App as AntdApp, Dropdown } from 'antd'
import Icon from '../components/Icon'
import { useAppStore } from '../store'
import type { DocType } from '../mock/recentDocs'
import RecentDocs from '../components/RecentDocs'
import TemplateLibrary from '../components/TemplateLibrary'
import { 通过对话框打开文件 } from '../fileOpen'

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
  const [类型筛选, 设类型筛选] = useState<'all' | DocType>('all')
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
    docs,
    activeDocId,
    setActiveDocId,
    toggleStar,
    openDoc,
    createDoc,
    renameDoc,
    removeDoc,
  } = useAppStore()

  useEffect(() => {
    if (最近读取错误 === null) return
    modal.error({ title: '读取最近文档失败', content: 最近读取错误 })
    清除最近读取错误()
  }, [最近读取错误])

  /** 「全部类型」下拉筛选：全部/文字/表格/演示 */
  const 筛选后文档 = 类型筛选 === 'all' ? visibleDocs : visibleDocs.filter((文档) => 文档.type === 类型筛选)
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

  const 处理模板选择 = (模板: import('../data/templates').模板项) => {
    createDoc(模板.分类 as DocType, 模板.内容)
    关闭模板库?.()
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
    void 通过对话框打开文件(message, modal, (类型, 内容, 路径, 警告) => createDoc(类型, 内容, { 路径, 警告 }))
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
        'button',
        {
          type: 'button',
          className: 'wps-home__cloud-sync',
          onClick: () => message.info('文档云同步即将开放，当前文档均保存在本机'),
        },
        React.createElement(Icon, { name: 'cloud-off', size: 14 }),
        React.createElement('span', null, '未开启文档云同步')
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
