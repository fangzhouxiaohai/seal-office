// 顶栏：品牌标识、搜索或当前文档名、设置与帮助入口。
// Electron 使用系统边框窗口，此处不自绘最小化与关闭按钮。
// 首页态（homeMode）：居中大搜索框 + 通知/客服/设置/会员/头像图标组，版式对齐 WPS 首页。
import React, { useState } from 'react'
import { Dropdown, Input, Tooltip } from 'antd'
import Icon from './Icon'
import SealLogo from './SealLogo'

interface Props {
  pageName: string
  /** 传入后顶栏中部展示文档名，替代搜索框，用于编辑器视图 */
  documentName?: string
  onSearch?: (关键词: string) => void
  onHelp?: () => void
  /** 切换到设置页面 */
  onShowSettings?: () => void
  /** 切换到帮助页面 */
  onShowHelp?: () => void
  /** 云文档入口点击（界面元素，功能占位提示） */
  onCloud?: () => void
  /** 登录入口点击（界面元素，功能占位提示） */
  onLogin?: () => void
  /** 首页态：居中大搜索框与 WPS 式右侧图标组 */
  homeMode?: boolean
  /** 首页搜索词（受控） */
  搜索词?: string
  on搜索变化?: (词: string) => void
  on通知?: () => void
  on客服?: () => void
  /** 关于我们弹窗 */
  on关于?: () => void
  /** 当前是否深色主题（太阳/月亮切换按钮） */
  主题深色?: boolean
  on切换主题?: () => void
}

const TitleBar = ({
  pageName,
  documentName,
  onSearch,
  onHelp,
  onShowSettings,
  onShowHelp,
  onCloud,
  onLogin,
  homeMode = false,
  搜索词: 外部搜索词,
  on搜索变化,
  on通知,
  on客服,
  on关于,
  主题深色 = false,
  on切换主题,
}: Props) => {
  const [关键词, set关键词] = useState('')
  const 搜索值 = homeMode && 外部搜索词 !== undefined ? 外部搜索词 : 关键词

  const 处理输入 = (值: string) => {
    set关键词(值)
    if (homeMode && on搜索变化 !== undefined) {
      on搜索变化(值)
      return
    }
    if (onSearch !== undefined) {
      onSearch(值)
    }
  }

  const 渲染图标按钮 = (标题: string, 图标: string, 标签: string, 点击?: () => void) =>
    React.createElement(
      Tooltip,
      { title: 标题 },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-icon-button',
          'aria-label': 标签,
          onClick: () => {
            if (点击 !== undefined) 点击()
          },
        },
        React.createElement(Icon, { name: 图标, size: 18 })
      )
    )

  /** 全局设置下拉：设置 / 关于我们（对齐 WPS 右上角全局设置入口） */
  const 渲染全局设置 = () =>
    React.createElement(
      Dropdown,
      {
        trigger: ['click'],
        menu: {
          items: [
            { key: 'settings', label: '设置' },
            { key: 'about', label: '关于我们' },
          ],
          onClick: ({ key }: { key: string }) => {
            if (key === 'settings' && onShowSettings !== undefined) onShowSettings()
            if (key === 'about' && on关于 !== undefined) on关于()
          },
        },
      },
      React.createElement(
        Tooltip,
        { title: '全局设置' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'wps-icon-button',
            'aria-label': '全局设置',
          },
          React.createElement(Icon, { name: 'sliders', size: 18 })
        )
      )
    )

  /** 深浅模式切换按钮：所有页面固定在顶栏最右侧，状态与全局主题同步 */
  const 渲染主题切换 = () =>
    React.createElement(
      Tooltip,
      { title: 主题深色 ? '切换为浅色模式' : '切换为深色模式' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-icon-button',
          'aria-label': '切换深浅模式',
          'aria-pressed': 主题深色,
          onClick: () => {
            if (on切换主题 !== undefined) on切换主题()
          },
        },
        React.createElement(Icon, { name: 主题深色 ? 'moon' : 'sun', size: 18 })
      )
    )

  const 渲染右侧 = () => {
    if (homeMode) {
      return React.createElement(
        React.Fragment,
        null,
        渲染图标按钮('通知', 'bell', '通知', on通知),
        渲染图标按钮('联系客服', 'headset', '联系客服', on客服),
        渲染全局设置(),
        React.createElement(
          Tooltip,
          { title: '登录（即将开放，当前版本免登录使用）' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'wps-titlebar__avatar',
              'aria-label': '未登录，点击登录',
              onClick: () => {
                if (onLogin !== undefined) onLogin()
              },
            },
            React.createElement(Icon, { name: 'users', size: 16 })
          )
        )
      )
    }
    return React.createElement(
      React.Fragment,
      null,
      渲染图标按钮('云文档（即将开放）', 'cloud', '云文档', onCloud),
      渲染全局设置(),
      渲染图标按钮(
        '帮助手册',
        'help',
        '帮助手册',
        () => {
          if (onShowHelp !== undefined) onShowHelp()
          else if (onHelp !== undefined) onHelp()
        }
      )
    )
  }

  return React.createElement(
    'header',
    { className: 'wps-titlebar' },
    React.createElement(
      'div',
      { className: 'wps-titlebar__brand' },
      React.createElement(
        'span',
        { className: 'wps-logo' },
        React.createElement(SealLogo, { size: 28 })
      ),
      React.createElement('span', { className: 'wps-titlebar__divider' }),
      React.createElement('span', { className: 'wps-titlebar__page' }, pageName)
    ),
    React.createElement(
      'div',
      { className: 'wps-titlebar__center' },
      homeMode
        ? React.createElement(Input, {
            className: 'wps-titlebar__search wps-titlebar__search--home',
            placeholder: '搜索最近文档名称',
            'aria-label': '搜索最近文档名称',
            allowClear: true,
            value: 搜索值,
            onChange: (事件: React.ChangeEvent<HTMLInputElement>) => 处理输入(事件.target.value),
            prefix: React.createElement(Icon, { name: 'search', size: 16 }),
          })
        : documentName !== undefined
          ? React.createElement('span', { className: 'wps-titlebar__doc' }, documentName)
          : React.createElement(Input, {
              className: 'wps-titlebar__search',
              placeholder: '搜索文件、模板',
              allowClear: true,
              value: 关键词,
              onChange: (事件: React.ChangeEvent<HTMLInputElement>) => 处理输入(事件.target.value),
              prefix: React.createElement(Icon, { name: 'search', size: 16 }),
            })
    ),
    React.createElement('div', { className: 'wps-titlebar__actions' }, 渲染右侧(), 渲染主题切换())
  )
}

export default TitleBar
