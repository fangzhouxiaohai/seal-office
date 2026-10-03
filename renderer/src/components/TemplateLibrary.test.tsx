import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TemplateLibrary from './TemplateLibrary'

describe('模板库弹窗', () => {
  it('模板预览可通过按钮打开，并可从预览使用模板', async () => {
    const 选中 = vi.fn()
    render(<TemplateLibrary 打开 onSelect={选中} />)
    const 用户 = userEvent.setup()
    await 用户.click(screen.getByRole('button', { name: '预览个人简历' }))
    expect(await screen.findByRole('dialog', { name: '模板预览' })).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: '使用此模板' }))
    expect(选中).toHaveBeenCalledWith(expect.objectContaining({ 名称: '个人简历', 分类: 'word' }))
  })
})
