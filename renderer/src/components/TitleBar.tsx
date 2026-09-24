// 顶栏：品牌标识、搜索或当前文档名、设置与帮助入口。
// Electron 使用系统边框窗口，此处不自绘最小化与关闭按钮。
import React, { useState } from 'react'
import { Input, Tooltip } from 'antd'
import Icon from './Icon'
import SealLogo from './SealLogo'

interface Props {
  pageName: string
  /** 传入后顶栏中部展示文档名，替代搜索框，用于编辑器视图 */
  documentName?: string
  onSearch?: (关键词: string) => void
  onSetting?: () => void
  onHelp?: () => void
  /** 切换到设置页面 */
  onShowSettings?: () => void
  /** 切换到帮助页面 */
  onShowHelp?: () => void
}

const TitleBar = ({
  pageName,
  documentName,
  onSearch,
  onSetting,
  onHelp,
  onShowSettings,
  onShowHelp,
}: Props) => {
  const [关键词, set关键词] = useState('')

  const 处理输入 = (值: string) => {
    set关键词(值)
    if (onSearch !== undefined) {
      onSearch(值)
    }
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
      React.createElement('span', { className: 'wps-titlebar__name' }, 'Seal Office'),
      React.createElement('span', { className: 'wps-titlebar__divider' }),
      React.createElement('span', { className: 'wps-titlebar__page' }, pageName)
    ),
    React.createElement(
      'div',
      { className: 'wps-titlebar__center' },
      documentName !== undefined
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
    React.createElement(
      'div',
      { className: 'wps-titlebar__actions' },
      React.createElement(
        Tooltip,
        { title: '设置' },
        React.createElement(
          'button',
          { 
            type: 'button', 
            className: 'wps-icon-button', 
            onClick: () => {
              if (onShowSettings) {
                onShowSettings()
              } else if (onSetting) {
                onSetting()
              }
            }, 
            'aria-label': '设置' 
          },
          React.createElement(Icon, { name: 'settings', size: 18 })
        )
      ),
      React.createElement(
        Tooltip,
        { title: '帮助手册' },
        React.createElement(
          'button',
          { 
            type: 'button', 
            className: 'wps-icon-button', 
            onClick: () => {
              if (onShowHelp) {
                onShowHelp()
              } else if (onHelp) {
                onHelp()
              }
            }, 
            'aria-label': '帮助手册' 
          },
          React.createElement(Icon, { name: 'help', size: 18 })
        )
      ),
    )
  )
}

export default TitleBar
