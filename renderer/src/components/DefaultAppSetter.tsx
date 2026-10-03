// 设为默认应用组件
import React, { useState } from 'react'
import { App as AntdApp, Button, Alert, Card } from 'antd'
import { 桥接 } from '../ipc/bridge'

const DefaultAppSetter = () => {
  const { message, modal } = AntdApp.useApp()
  const [设置中, set设置中] = useState(false)

  const 设置为默认 = async () => {
    set设置中(true)
    try {
      if (桥接.可用) {
        const 结果 = await 桥接.setDefaultApp()
        if (结果.成功) {
          message.info(结果.提示 || '已打开系统默认应用设置，请在系统中选择海豹办公')
        } else if ('错误' in 结果 && 结果.错误) {
          modal.error({ title: '设置默认应用失败', content: 结果.错误 })
        } else if ('需要管理员权限' in 结果 && 结果.需要管理员权限) {
          modal.warning({ title: '需要系统授权', content: 结果.提示 || '请在系统设置中手动选择默认应用' })
        } else {
          modal.info({ title: '需要手动设置', content: 结果.提示 || '请在系统设置中手动设置默认应用' })
        }
      } else {
        modal.warning({ title: '当前环境不可用', content: '请使用打包后的版本设置默认应用' })
      }
    } catch (error) {
      modal.error({ title: '设置默认应用失败', content: error instanceof Error ? error.message : '请在系统设置中手动设置默认应用' })
    } finally {
      set设置中(false)
    }
  }

  return React.createElement(Card, null,
    React.createElement('h3', { style: { marginTop: 0, marginBottom: '16px' } }, '设为默认办公软件'),
    
    React.createElement(Alert, {
      message: '功能说明',
      description: '在 Windows 默认应用设置中，可为 DOCX、XLSX、PPTX 和 PDF 文件选择海豹办公。',
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
        React.createElement('li', null, '.pdf - PDF 文件')
      )
    ),

    React.createElement(Button, {
      type: 'primary',
      onClick: 设置为默认,
      loading: 设置中,
      block: true
    }, '打开系统默认应用设置')
  )
}

export default DefaultAppSetter
