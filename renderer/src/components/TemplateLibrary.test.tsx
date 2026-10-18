import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import TemplateLibrary from './TemplateLibrary'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('模板库弹窗', () => {
  it('名称用途搜索、推荐和空结果重置保留真正可应用的六套新内容', async () => {
    render(<TemplateLibrary 打开 onSelect={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '精选推荐' }))
    expect(document.querySelectorAll('.template-library__card')).toHaveLength(6)
    await user.type(screen.getByRole('searchbox', { name: '搜索模板' }), '渠道 实验')
    expect(screen.getByRole('button', { name: '预览市场营销' })).toBeInTheDocument()
    expect(document.querySelectorAll('.template-library__card')).toHaveLength(1)
    await user.clear(screen.getByRole('searchbox', { name: '搜索模板' }))
    await user.click(screen.getByRole('button', { name: '学术答辩' }))
    expect(screen.getByRole('button', { name: '预览学术答辩' })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: '搜索模板' }), '不存在的模板')
    expect(screen.getByText('没有匹配的模板')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重置筛选' }))
    expect(screen.getByRole('button', { name: '预览个人简历' })).toBeInTheDocument()
  })
  it('模板预览可通过按钮打开，并可从预览使用模板', async () => {
    const 选中 = vi.fn()
    render(<TemplateLibrary 打开 onSelect={选中} />)
    const 用户 = userEvent.setup()
    await 用户.click(screen.getByRole('button', { name: '预览个人简历' }))
    expect(await screen.findByRole('dialog', { name: '模板预览' })).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: '使用此模板' }))
    expect(选中).toHaveBeenCalledWith(expect.objectContaining({ 名称: '个人简历', 分类: 'word' }))
  })

  it('演示详情展示全部九页真实模型与摄影，选用前恢复离线图片字节', async () => {
    const calls: string[] = []
    const restore = vi.fn(async entries => {
      calls.push('restore')
      expect(entries).toHaveLength(2)
      expect(entries.every((entry: { 数据: string }) => entry.数据.startsWith('iVBORw0KGgo'))).toBe(true)
      return { 成功: true }
    })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationResources: { restore } } })
    const selected = vi.fn(() => { calls.push('selected') })
    render(<AntdApp><TemplateLibrary 打开 onSelect={selected} /></AntdApp>)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^演\s*示$/ }))
    await user.click(screen.getByRole('button', { name: '预览商务演示' }))
    const dialog = await screen.findByRole('dialog', { name: '模板预览' })
    expect(within(dialog).getAllByRole('img', { name: /商务演示第 \d 页/ })).toHaveLength(9)
    const detail = document.querySelector('.template-presentation-pages')!
    expect(detail.querySelectorAll('img').length).toBeGreaterThan(3)
    expect(detail.querySelector('svg')).toBeInTheDocument()
    expect(detail.querySelector('table')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '使用此模板' }))
    await waitFor(() => expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 'ppt-business-001' })))
    expect(calls).toEqual(['restore', 'selected'])
  })

  it('图片恢复失败时保留预览与明确错误，不创建带丢图的文稿', async () => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { presentationResources: { restore: vi.fn(async () => ({ 成功: false, 错误: '图片资源库暂不可用' })) } } })
    const selected = vi.fn()
    render(<AntdApp><TemplateLibrary 打开 onSelect={selected} /></AntdApp>)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '预览产品介绍' }))
    await user.click(screen.getByRole('button', { name: '使用此模板' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('图片资源库暂不可用')
    expect(screen.getByRole('dialog', { name: '模板预览' })).toBeInTheDocument()
    expect(selected).not.toHaveBeenCalled()
  })
})
