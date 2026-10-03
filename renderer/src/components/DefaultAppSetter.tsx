// 设为默认应用组件
import React, { useState } from 'react'
import { Button, Alert, message, Card, Modal } from 'antd'
import { 桥接 } from '../ipc/bridge'

const DefaultAppSetter = () => {
  const [设置中, set设置中] = useState(false)

  const 设置为默认 = async () => {
    set设置中(true)
    try {
      if (桥接.可用) {
        const 结果 = await 桥接.setDefaultApp()
        if (结果.成功) {
          message.success('已成功设为默认办公软件')
        } else if ('错误' in 结果 && 结果.错误) {
          Modal.error({ title: '设置默认应用失败', content: 结果.错误 })
        } else if ('需要管理员权限' in 结果 && 结果.需要管理员权限) {
          Modal.warning({ title: '需要系统授权', content: 结果.提示 || '请在系统设置中手动选择默认应用' })
        } else {
          Modal.info({ title: '需要手动设置', content: 结果.提示 || '请在系统设置中手动设置默认应用' })
        }
      } else {
        Modal.warning({ title: '当前环境不可用', content: '请使用打包后的版本设置默认应用' })
      }
    } catch (error) {
      Modal.error({ title: '设置默认应用失败', content: error instanceof Error ? error.message : '请在系统设置中手动设置默认应用' })
    } finally {
      set设置中(false)
    }
  }

  return React.createElement(Card, null,
    React.createElement('h3', { style: { marginTop: 0, marginBottom: '16px' } }, '设为默认办公软件'),
    
    React.createElement(Alert, {
      message: '功能说明',
      description: '设为默认软件后，.docx、.xlsx、.pptx等文件将默认使用海豹办公打开。部分系统可能需要手动设置。',
      type: 'info',
      showIcon: true,
      style: { marginBottom: '16px' }
    }),

    React.createElement('div', { style: { marginBottom: '16px' } },
      React.createElement('p', null, '支持的文件类型：'),
      React.createElement('ul', null,
        React.createElement('li', null, '.docx - Word 文档'),
        React.createElement('li', null, '.xlsx - Excel 表格'),
        React.createElement('li', null, '.pptx - PPT 演示'),
        React.createElement('li', null, '.html - 网页文件'),
        React.createElement('li', null, '.txt - 纯文本文件')
      )
    ),

    React.createElement(Button, {
      type: 'primary',
      onClick: 设置为默认,
      loading: 设置中,
      block: true
    }, '设为默认办公软件')
  )
}

export default DefaultAppSetter
