import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomeSidebar from './HomeSidebar'

describe('首页新建弹窗', () => {
  it('从居中弹窗新建文档或进入模板库', async () => {
    const onNewDoc = vi.fn()
    const onOpenTemplate = vi.fn()
    render(<HomeSidebar navKey="recent" onNavigate={vi.fn()} onNewDoc={onNewDoc} onOpenTemplate={onOpenTemplate} onOpenFile={vi.fn()} onNotify={vi.fn()} onOpenPdf={vi.fn()} onOpenHelp={vi.fn()} />)
    const 用户 = userEvent.setup()
    await 用户.click(screen.getByRole('button', { name: '新建' }))
    expect(await screen.findByRole('dialog', { name: '新建文档' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /文字文档/ })).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: /电子表格/ }))
    expect(onNewDoc).toHaveBeenCalledWith('table')
    await 用户.click(screen.getByRole('button', { name: '新建' }))
    await 用户.click(screen.getByRole('button', { name: /模板库/ }))
    expect(onOpenTemplate).toHaveBeenCalledOnce()
  })
})
