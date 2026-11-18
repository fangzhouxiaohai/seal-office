// Ribbon 功能组：一组相关按钮。分组名称行已彻底删除（桌面端与移动端均不渲染）。
import React from 'react'

interface Props {
  name: string
  children?: React.ReactNode
}

const RibbonGroup = ({ name, children }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-ribbon-group', role: 'group', 'aria-label': name },
    React.createElement('div', { className: 'wps-ribbon-group__body' }, children)
  )

export default RibbonGroup
