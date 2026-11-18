import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CloudStatusPill from './CloudStatusPill'
import { 设置云端状态, 注册云端重试 } from './cloudStatus'

afterEach(() => { 设置云端状态(null); 注册云端重试(null) })

describe('云端状态徽标', () => {
  it('没有云端状态时不渲染，避免占用功能区标签行', () => {
    const { container } = render(<CloudStatusPill />)
    expect(container).toBeEmptyDOMElement()
  })

  it('显示简短状态文字，正常状态不可点击', () => {
    act(() => 设置云端状态({ 文档标识: 'word', 文本: '云端已保存', 级别: '正常', 可重试: false }))
    render(<CloudStatusPill />)
    const 徽标 = screen.getByLabelText('云端状态：云端已保存')
    expect(徽标).toHaveTextContent('云端已保存')
    expect(徽标).toHaveAttribute('tabindex', '-1')
  })

  it('出错时点击徽标触发重试，并把完整原因放在悬浮提示里', () => {
    const 重试 = vi.fn()
    注册云端重试(重试)
    act(() => 设置云端状态({ 文档标识: 'word', 文本: '同步失败', 级别: '错误', 可重试: true, 详情: '文件已被其他程序修改，本机内容未覆盖' }))
    render(<CloudStatusPill />)
    const 徽标 = screen.getByLabelText('云端状态：同步失败，点击重试同步')
    expect(徽标.getAttribute('title')).toContain('文件已被其他程序修改')
    徽标.click()
    expect(重试).toHaveBeenCalledOnce()
  })
})
