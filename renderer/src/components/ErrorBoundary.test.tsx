import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

const 抛错组件 = () => {
  throw new Error('模拟渲染异常')
}

describe('渲染异常兜底', () => {
  let 原始错误: typeof console.error

  beforeEach(() => {
    原始错误 = console.error
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = 原始错误
  })

  it('子组件正常时渲染子内容', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('正常内容')).toBeInTheDocument()
  })

  it('子组件抛错时展示中文说明而非空白', () => {
    render(
      <ErrorBoundary>
        <抛错组件 />
      </ErrorBoundary>
    )
    expect(screen.getByText('界面渲染出现异常')).toBeInTheDocument()
    expect(screen.getByText('模拟渲染异常')).toBeInTheDocument()
    // Ant Design 默认会在两个汉字的按钮文案中插入空格，此处以角色查询匹配
    expect(screen.getByRole('button', { name: /重\s*试/ })).toBeInTheDocument()
  })
})
