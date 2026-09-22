// 首页：新建入口与最近文档区块的组合页。
import React from 'react'
import { message } from 'antd'
import { useAppStore } from '../store'
import { DOC_TYPE_TO_MODULE } from '../routes'
import type { DocType } from '../mock/recentDocs'
import NewDocGrid from '../components/NewDocGrid'
import RecentDocs from '../components/RecentDocs'

/** 区块标题随导航筛选变化 */
const 标题映射: Record<string, string> = {
  home: '最近文档',
  recent: '最近',
  star: '星标文档',
  shared: '共享文档',
}

const HomePage = () => {
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
    setModule,
  } = useAppStore()

  const 处理新建 = (类型: DocType) => {
    if (类型 === 'pdf') {
      message.info('PDF 编辑功能开发中')
      return
    }
    setModule(DOC_TYPE_TO_MODULE[类型])
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

  return React.createElement(
    'div',
    { className: 'wps-home' },
    React.createElement(
      'section',
      { className: 'wps-section' },
      React.createElement('h2', { className: 'wps-section__title' }, '新建'),
      React.createElement(NewDocGrid, { onSelect: 处理新建 })
    ),
    React.createElement(RecentDocs, {
      docs: visibleDocs,
      title: 标题映射[navKey] ?? '最近文档',
      viewMode,
      sortKey,
      activeDocId,
      onSelect: setActiveDocId,
      onOpen: 处理打开,
      onToggleStar: toggleStar,
      onViewModeChange: setViewMode,
      onSortChange: setSortKey,
      onViewAll: () => setNavKey('recent'),
      onEmptyAction: () => setModule('word'),
    })
  )
}

export default HomePage
