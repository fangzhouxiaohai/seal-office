// 渲染异常兜底：捕获子树渲染错误并展示中文说明，避免出现静默空白窗口。
import React from 'react'
import { Button, Modal } from 'antd'
import Icon from './Icon'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
  弹窗可见: boolean
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, 弹窗可见: false }

  static getDerivedStateFromError(error: Error): State {
    return { error, 弹窗可见: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 保留原始错误堆栈与组件栈；HarmonyOS 的 ArkWeb 控制台只稳定展示第一个参数，
    // 因此合并成一条字符串，避免组件栈在日志里丢失。
    console.error(`界面渲染异常：${error.message}\n错误堆栈：${error.stack ?? ''}\n组件栈：${info.componentStack ?? ''}`)
  }

  private 重试 = () => {
    this.setState({ error: null, 弹窗可见: false })
  }

  render() {
    const { error, 弹窗可见 } = this.state
    if (error === null) {
      return this.props.children
    }

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Modal, {
        title: '页面加载失败',
        open: 弹窗可见,
        onCancel: () => this.setState({ 弹窗可见: false }),
        footer: React.createElement(Button, { onClick: () => this.setState({ 弹窗可见: false }) }, '关闭提示'),
      }, '当前页面出现异常。关闭提示后可查看错误详情并重试。'),
      React.createElement(
        'div',
        { className: 'wps-error' },
        React.createElement(Icon, { name: 'retry', size: 32 }),
        React.createElement('h3', { className: 'wps-error__title' }, '界面渲染出现异常'),
        React.createElement('p', { className: 'wps-error__message' }, error.message),
        React.createElement(
          Button,
          { type: 'primary', onClick: this.重试, className: 'wps-error__action' },
          '重试'
        )
      )
    )
  }
}

export default ErrorBoundary
