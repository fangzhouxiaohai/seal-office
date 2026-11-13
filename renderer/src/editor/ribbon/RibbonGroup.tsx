// Ribbon 功能组：一组相关按钮，组名居中置于组下方。
import React from 'react'
import { use显示偏好 } from '../../store/settingsStore'

interface Props {
  name: string
  children?: React.ReactNode
}

const RibbonGroup = ({ name, children }: Props) => {
  const 简洁模式 = use显示偏好()?.简洁模式
  return React.createElement(
    'div',
    { className: 'wps-ribbon-group', role: 'group', 'aria-label': name },
    React.createElement('div', { className: 'wps-ribbon-group__body' }, children),
    !简洁模式 && React.createElement('div', { className: 'wps-ribbon-group__name' }, name)
  )
}

export default RibbonGroup
