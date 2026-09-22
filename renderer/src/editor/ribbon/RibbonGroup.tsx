// Ribbon 功能组：一组相关按钮，组名居中置于组下方。
import React from 'react'

interface Props {
  name: string
  children?: React.ReactNode
}

const RibbonGroup = ({ name, children }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-ribbon-group' },
    React.createElement('div', { className: 'wps-ribbon-group__body' }, children),
    React.createElement('div', { className: 'wps-ribbon-group__name' }, name)
  )

export default RibbonGroup
