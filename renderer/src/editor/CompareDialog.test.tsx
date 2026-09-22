import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import CompareDialog from './CompareDialog'

const 渲染面板 = (覆盖: Partial<Parameters<typeof CompareDialog>[0]> = {}) => {
  const 回调 = { onClose: vi.fn(), onCompare: vi.fn(), onMerge: vi.fn() }
  const 结果 = render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <CompareDialog open {...回调} {...覆盖} />
    </ConfigProvider>
  )
  return { ...结果, 回调 }
}

describe('文档比较面板', () => {
  it('未打开时不渲染内容', () => {
    const { container } = render(
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <CompareDialog open={false} onClose={() => {}} onCompare={() => {}} onMerge={() => {}} />
      </ConfigProvider>
    )
    expect(container.querySelector('.wps-compare__input')).toBeNull()
  })

  it('展示输入区域与中文说明', () => {
    渲染面板()
    expect(screen.getByPlaceholderText('在此粘贴另一版本的正文')).toBeInTheDocument()
    expect(screen.getByText(/每行一段/)).toBeInTheDocument()
  })

  it('点击仅比较差异回传输入内容', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此粘贴另一版本的正文'), '另一版本内容')
    await userEvent.click(screen.getByRole('button', { name: '仅比较差异' }))
    expect(回调.onCompare).toHaveBeenCalledWith('另一版本内容')
  })

  it('点击合并为修订回传输入内容', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此粘贴另一版本的正文'), '待合并内容')
    await userEvent.click(screen.getByRole('button', { name: '合并为修订' }))
    expect(回调.onMerge).toHaveBeenCalledWith('待合并内容')
  })

  it('点击取消回传关闭事件', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(回调.onClose).toHaveBeenCalledTimes(1)
  })
})
