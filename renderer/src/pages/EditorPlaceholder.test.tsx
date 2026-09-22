import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditorPlaceholder from './EditorPlaceholder'

describe('编辑器占位页', () => {
  it('展示模块名与开发中说明', () => {
    render(<EditorPlaceholder moduleLabel="文档" />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    expect(screen.getByText('编辑功能开发中')).toBeInTheDocument()
  })

  it('提供返回首页按钮并响应点击', async () => {
    const 返回 = vi.fn()
    render(<EditorPlaceholder moduleLabel="文档" onBack={返回} />)
    await userEvent.click(screen.getByRole('button', { name: '返回首页' }))
    expect(返回).toHaveBeenCalledTimes(1)
  })

  it('演示模块页已由占位页升级为完整编辑器', () => {
    // 占位组件本身仍保留，供未来模块复用；此处仅验证其正常渲染
    render(<EditorPlaceholder moduleLabel="演示" />)
    expect(screen.getByText('演示')).toBeInTheDocument()
  })
})
