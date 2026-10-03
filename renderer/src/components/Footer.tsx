// 底部状态栏：展示当前文档库统计信息与版本号。
import React from 'react'

interface Props {
  total: number
  starred: number
  version?: string
}

const Footer = ({ total, starred, version = `v${__APP_VERSION__}` }: Props) =>
  React.createElement(
    'footer',
    { className: 'wps-footer' },
    React.createElement(
      'div',
      { className: 'wps-footer__left' },
      React.createElement('span', null, `共 ${total} 个文档`),
      React.createElement('span', { className: 'wps-footer__dot' }, '·'),
      React.createElement('span', null, `其中星标 ${starred} 个`)
    ),
    React.createElement('div', { className: 'wps-footer__right' }, `海豹办公 ${version}`)
  )

export default Footer
