// 编辑器占位内容：三个模块共用，明确标注功能开发中，不伪造编辑能力。
import React from 'react'
import { Button } from 'antd'
import Icon from '../components/Icon'

interface Props {
  moduleLabel: string
  onBack?: () => void
}

const EditorPlaceholder = ({ moduleLabel, onBack }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-editor' },
    React.createElement(
      'div',
      { className: 'wps-editor__stage' },
      React.createElement(Icon, { name: 'doc-empty', size: 56, className: 'wps-editor__icon' }),
      React.createElement('p', { className: 'wps-editor__title' }, moduleLabel),
      React.createElement('p', { className: 'wps-editor__desc' }, '编辑功能开发中'),
      React.createElement(Button, { onClick: onBack, className: 'wps-editor__back' }, '返回首页')
    )
  )

export default EditorPlaceholder
