// 渲染异常兜底：捕获子树渲染错误并展示中文说明，避免出现静默空白窗口。
import React from 'react'
import { Button } from 'antd'
import Icon from './Icon'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 保留原始错误堆栈，便于定位问题，不使用默认数据掩盖
    console.error('界面渲染异常：', error, info.componentStack)
  }

  private 重试 = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error === null) {
      return this.props.children
    }

    return React.createElement(
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
  }
}

export default ErrorBoundary
