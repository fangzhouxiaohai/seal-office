// 首页：新建入口与最近文档区块的组合页。
import React, { useState } from 'react'
import { App as AntdApp, Button } from 'antd'
import { useAppStore } from '../store'
import type { DocType } from '../mock/recentDocs'
import NewDocGrid from '../components/NewDocGrid'
import RecentDocs from '../components/RecentDocs'
import TemplateLibrary from '../components/TemplateLibrary'
import { 桥接 } from '../ipc/bridge'

/** 区块标题随导航筛选变化 */
const 标题映射: Record<string, string> = {
  home: '最近文档',
  recent: '最近',
  star: '星标文档',
  shared: '共享文档',
  pdf: 'PDF 工具',
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
    createDoc(类型)
  }

  const 处理模板选择 = (模板: import('../data/templates').模板项) => {
    createDoc(模板.分类 as DocType, 模板.内容)
    设显示模板库(false)
  }

  const 处理打开 = (标识: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      message.error('未找到该文档，可能已被移除')
      return
    }
    openDoc(目标)
  }

  const 处理打开文件 = () => {
    if (!桥接.可用) {
      message.info('当前环境不支持打开文件功能，请使用打包后的版本')
      return
    }
    桥接.showOpenDialog().then((文件路径) => {
      if (文件路径) {
        桥接.readFile(文件路径).then((结果) => {
          if (结果.成功 && 结果.内容) {
            // 归一化扩展名：去除开头的点
            const 归一化扩展名 = (结果.扩展名 ?? '').replace(/^\./, '').toLowerCase()
            if (结果.二进制 && 归一化扩展名) {
              // 二进制文件（docx/xlsx/pptx）：通过 Office API 读取
              if (归一化扩展名 === 'docx') {
                桥接.office.readDocx(结果.内容).then((数据: any) => {
                  if (数据 && 数据.成功 && 数据.html) {
                    createDoc('word', 数据.html)
                    message.success('文档已打开')
                  } else {
                    message.info('文件内容无法识别，可能不是有效的文档格式')
                  }
                }).catch(() => {
                  message.info('文件内容无法识别，可能不是有效的文档格式')
                })
              } else if (归一化扩展名 === 'xlsx') {
                桥接.office.readXlsx(结果.内容).then((数据: any) => {
                  if (数据 && 数据.成功 && 数据.html) {
                    createDoc('table', 数据.html)
                    message.success('表格已打开')
                  } else {
                    message.info('文件内容无法识别，可能不是有效的表格格式')
                  }
                }).catch(() => {
                  message.info('文件内容无法识别，可能不是有效的表格格式')
                })
              } else if (归一化扩展名 === 'pptx') {
                桥接.office.readPptx(结果.内容).then((数据: any) => {
                  if (数据 && 数据.成功 && 数据.演示文稿) {
                    createDoc('ppt', 数据.演示文稿)
                    message.success('演示文稿已打开')
                  } else {
                    message.info('文件内容无法识别，可能不是有效的演示文稿格式')
                  }
                }).catch(() => {
                  message.info('文件内容无法识别，可能不是有效的演示文稿格式')
                })
              } else {
                message.info('暂不支持此文件格式')
              }
              return
            }
            const 扩展名 = 归一化扩展名
            if (扩展名 === 'html' || 扩展名 === 'htm') {
              createDoc('word', 结果.内容)
            } else if (扩展名 === 'txt' || 扩展名 === 'md' || 扩展名 === 'csv') {
              createDoc('word', 结果.内容)
            } else if (扩展名 === 'json') {
              try {
                const 数据 = JSON.parse(结果.内容)
                if (数据.幻灯片列表) {
                  setNavKey('home')
                  message.info('请在演示文稿模块中打开此文件')
                } else {
                  createDoc('word', 结果.内容)
                }
              } catch {
                message.error('文件格式不正确')
              }
            } else {
              message.info('暂不支持此文件格式')
            }
          } else {
            message.error(`打开文件失败：${结果.错误}`)
          }
        }).catch((error: unknown) => {
          message.error(`打开文件失败：${(error as Error).message || '未知错误'}`)
        })
      }
    }).catch((error: unknown) => {
      message.error(`打开文件失败：${(error as Error).message || '未知错误'}`)
    })
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
          Button,
          {
            size: 'large',
            onClick: () => 处理打开文件(),
            style: { fontSize: '16px', padding: '16px 32px', height: 'auto' },
          },
          '打开文件'
        ),
        React.createElement(
          Button,
          {
            size: 'large',
            onClick: () => 设显示模板库(true),
            style: { fontSize: '16px', padding: '16px 32px', height: 'auto' },
          },
          '模板库'
        ),
        React.createElement(
          Button,
          {
            size: 'large',
            onClick: () => createDoc('pdf'),
            style: { fontSize: '16px', padding: '16px 32px', height: 'auto' },
          },
          'PDF 工具'
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
      onSelect: 处理模板选择,
    })
  )
}

export default HomePage
