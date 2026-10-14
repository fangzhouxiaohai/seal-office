import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomeSidebar from './HomeSidebar'

describe('首页新建弹窗', () => {
  it('从居中弹窗新建文档或进入模板库', async () => {
    const onNewDoc = vi.fn()
    const onNewAccess = vi.fn()
    const onOpenTemplate = vi.fn()
    render(<HomeSidebar navKey="recent" onNavigate={vi.fn()} onNewDoc={onNewDoc} onNewAccess={onNewAccess} onOpenTemplate={onOpenTemplate} onOpenFile={vi.fn()} onNotify={vi.fn()} onOpenPdf={vi.fn()} onOpenHelp={vi.fn()} />)
    const 用户 = userEvent.setup()
    await 用户.click(screen.getByRole('button', { name: '新建' }))
    const 弹窗 = await screen.findByRole('dialog', { name: '新建文档' })
    expect(within(弹窗).getByRole('button', { name: /文字文档/ })).toBeInTheDocument()
    expect(within(弹窗).getByRole('button', { name: /PDF/ })).toBeInTheDocument()
    expect(within(弹窗).getByRole('button', { name: /Access 数据库/ })).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: /电子表格/ }))
    expect(onNewDoc).toHaveBeenCalledWith('table')
    await 用户.click(screen.getByRole('button', { name: '新建' }))
    await 用户.click(within(await screen.findByRole('dialog', { name: '新建文档' })).getByRole('button', { name: /PDF/ }))
    expect(onNewDoc).toHaveBeenCalledWith('pdf')
    await 用户.click(screen.getByRole('button', { name: '新建' }))
    await 用户.click(screen.getByRole('button', { name: /Access 数据库/ }))
    expect(onNewAccess).toHaveBeenCalledOnce()
    await 用户.click(screen.getByRole('button', { name: '新建' }))
    await 用户.click(screen.getByRole('button', { name: /模板库/ }))
    expect(onOpenTemplate).toHaveBeenCalledOnce()
  })
})
