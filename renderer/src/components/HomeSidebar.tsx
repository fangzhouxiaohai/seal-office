// 首页左侧导航栏：新建/打开按钮、最近/星标/共享及本地工具。
import React from 'react'
import { Button, Dropdown } from 'antd'
import Icon from './Icon'

interface Props {
  /** 当前导航键（recent / star / shared） */
  navKey: string
  onNavigate: (键: string) => void
  onNewDoc: (类型: 'word' | 'table' | 'ppt' | 'pdf') => void
  onOpenTemplate: () => void
  onOpenFile: () => void
  /** 占位功能点击提示 */
  onNotify: (文本: string) => void
  /** 打开 PDF 工具 */
  onOpenPdf: () => void
  /** 打开帮助手册 */
  onOpenHelp: () => void
}

/** 云盘与本地导航项 */
const 云盘项 = [
  { key: 'my-cloud', label: '我的云文档', icon: 'folder' },
  { key: 'knowledge', label: '知识库', icon: 'knowledge' },
  { key: 'device', label: '我的设备', icon: 'device' },
  { key: 'tag', label: '标签', icon: 'tag' },
  { key: 'trash', label: '回收站', icon: 'trash' },
]

const 本地项 = [
  { key: 'desktop', label: '桌面', icon: 'desktop' },
  { key: 'document', label: '文档', icon: 'doc-word' },
  { key: 'download', label: '下载', icon: 'download-file' },
]

const HomeSidebar = ({ navKey, onNavigate, onNewDoc, onOpenTemplate, onOpenFile, onNotify, onOpenPdf, onOpenHelp }: Props) => {
  const 新建菜单 = {
    items: [
      { key: 'word', label: '新建文字' },
      { key: 'table', label: '新建表格' },
      { key: 'ppt', label: '新建演示' },
      { type: 'divider' as const },
      { key: 'template', label: '从模板新建' },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'template') {
        onOpenTemplate()
        return
      }
      onNewDoc(key as 'word' | 'table' | 'ppt')
    },
  }

  const 渲染导航项 = (项: { key: string; label: string; icon: string }, 占位: boolean) =>
    React.createElement(
      'button',
      {
        key: 项.key,
        type: 'button',
        className: `wps-homenav__item${navKey === 项.key ? ' wps-homenav__item--active' : ''}`,
        title: 占位 ? '暂未开放' : undefined,
        onClick: () => {
          if (占位) {
            onNotify(`「${项.label}」功能即将开放`)
            return
          }
          onNavigate(项.key)
        },
      },
      React.createElement(Icon, { name: 项.icon, size: 16 }),
      React.createElement('span', null, 项.label)
    )

  const 渲染组标题 = (标题: string) =>
    React.createElement('div', { className: 'wps-homenav__group' }, 标题)

  return React.createElement(
    'aside',
    { className: 'wps-homesidebar' },
    // 新建 / 打开
    React.createElement(
      'div',
      { className: 'wps-homesidebar__actions' },
      React.createElement(
        Dropdown,
        { menu: 新建菜单, trigger: ['click'] },
        React.createElement(
          Button,
          { type: 'primary', size: 'large', block: true, icon: React.createElement(Icon, { name: 'plus', size: 14 }) },
          '新建'
        )
      ),
      React.createElement(
        Button,
        {
          size: 'large',
          block: true,
          icon: React.createElement(Icon, { name: 'folder', size: 14 }),
          onClick: onOpenFile,
        },
        '打开'
      )
    ),
    // 最近 / 星标 / 共享
    React.createElement(
      'nav',
      { className: 'wps-homenav' },
      React.createElement(Icon, { name: 'clock', size: 0, className: 'wps-hidden' }),
      渲染导航项({ key: 'recent', label: '最近', icon: 'clock' }, false),
      渲染导航项({ key: 'star', label: '星标', icon: 'star' }, false),
      渲染导航项({ key: 'shared', label: '共享', icon: 'share' }, true)
    ),
    // 云盘（占位）
    React.createElement(
      'div',
      { className: 'wps-homenav' },
      渲染组标题('云盘'),
      云盘项.map((项) => 渲染导航项(项, true))
    ),
    // 本机文件夹
    React.createElement(
      'div',
      { className: 'wps-homenav' },
      渲染组标题('本地'),
      本地项.map((项) => 渲染导航项(项, false)),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-homenav__item',
          onClick: onOpenFile,
        },
        React.createElement(Icon, { name: 'globe', size: 16 }),
        React.createElement('span', null, '浏览')
      )
    ),
    // 工具（真实功能）
    React.createElement(
      'div',
      { className: 'wps-homenav' },
      渲染组标题('工具'),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-homenav__item',
          onClick: onOpenPdf,
        },
        React.createElement(Icon, { name: 'pdf', size: 16 }),
        React.createElement('span', null, 'PDF 工具')
      ),
      渲染导航项({ key: 'mindmap', label: '脑图', icon: 'mindmap' }, false),
      渲染导航项({ key: 'flow', label: '流程图', icon: 'flow' }, false),
      渲染导航项({ key: 'calendar', label: '日历', icon: 'calendar' }, false),
      渲染导航项({ key: 'apps', label: '应用', icon: 'apps' }, false),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-homenav__item',
          onClick: onOpenHelp,
        },
        React.createElement(Icon, { name: 'help', size: 16 }),
        React.createElement('span', null, '帮助手册')
      )
    ),
    // 明确本地存储状态，避免显示虚构的云空间额度。
    React.createElement(
      'div',
      { className: 'wps-homesidebar__local-note' },
      React.createElement('strong', null, '本地文档'),
      React.createElement('span', null, '当前文件保存在本机，请定期备份。')
    )
  )
}

export default HomeSidebar
