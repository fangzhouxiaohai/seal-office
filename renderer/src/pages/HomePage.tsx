// 首页：新建入口与最近文档区块的组合页。
import React, { useState } from 'react'
import { App as AntdApp } from 'antd'
import { useAppStore } from '../store'
import type { DocType } from '../mock/recentDocs'
import NewDocGrid from '../components/NewDocGrid'
import RecentDocs from '../components/RecentDocs'
import TemplateLibrary from '../components/TemplateLibrary'

/** 区块标题随导航筛选变化 */
const 标题映射: Record<string, string> = {
  home: '最近文档',
  recent: '最近',
  star: '星标文档',
  shared: '共享文档',
}

const HomePage = () => {
  const { message } = AntdApp.useApp()
  const [显示模板库, 设显示模板库] = useState(false)
  const {
    navKey,
    setNavKey,
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

  const 处理新建 = (类型: DocType) => {
    if (类型 === 'pdf') {
      message.info('PDF 编辑功能开发中')
      return
    }
    createDoc(类型)
  }

  const 处理打开 = (标识: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      message.error('未找到该文档，可能已被移除')
      return
    }
    if (目标.type === 'pdf') {
      message.info('PDF 编辑功能开发中')
      return
    }
    openDoc(目标)
  }

  const 处理重命名 = (标识: string, 名称: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      message.error('未找到该文档，可能已被移除')
      return
    }
    renameDoc(标识, 名称)
    message.success(`已重命名为「${名称}」`)
  }

  const 处理删除 = (标识: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      message.error('未找到该文档，可能已被移除')
      return
    }
    removeDoc(标识)
    message.success(`已删除「${目标.name}」`)
  }

  return React.createElement(
    'div',
    { className: 'wps-home' },
    // 新建区块（现有）
    React.createElement(
      'section',
      { className: 'wps-section' },
      React.createElement('h2', { className: 'wps-section__title' }, '新建'),
      React.createElement(NewDocGrid, { onSelect: 处理新建 })
    ),
    // 工具区块（新增）
    React.createElement(
      'section',
      { className: 'wps-section' },
      React.createElement('h2', { className: 'wps-section__title' }, '工具'),
      React.createElement(
        'div',
        { className: 'wps-tools-grid' },
        React.createElement(
          'button',
          {
            className: 'wps-tool-btn',
            onClick: () => 设显示模板库(true),
          },
          React.createElement('span', { className: 'wps-tool-btn__label' }, '模板库')
        ),
        React.createElement(
          'button',
          {
            className: 'wps-tool-btn',
            onClick: () => message.info('PDF 工具功能开发中'),
          },
          React.createElement('span', { className: 'wps-tool-btn__label' }, 'PDF 工具')
        )
      )
    ),
    // 最近文档区块（现有）
    React.createElement(RecentDocs, {
      docs: visibleDocs,
      title: 标题映射[navKey] ?? '最近文档',
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
      onEmptyAction: () => createDoc('word'),
    }),
    // 模板库弹窗
    React.createElement(TemplateLibrary, {
      打开: 显示模板库,
      关闭: () => 设显示模板库(false),
    })
  )
}

export default HomePage
