import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import FontPicker from './FontPicker'

const 选择字体 = vi.fn(async () => [])
vi.mock('./useFontCatalog', () => ({
  来源标签: (来源: string) => ({ custom: '我的', system: '系统', builtin: '内置', embedded: '文档', compat: '通用' } as Record<string, string>)[来源] ?? 来源,
  useFontCatalog: () => ({
    字体族: [
      { 名称: '宋体', 来源: 'system', 中文: true, 记录: [{ 标识: 's1', 名称: '宋体', 家族: '宋体', 别名: [], 来源: 'system', 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: 1, 中文字形: true, 拉丁字形: true, 可嵌入: true }] },
      { 名称: '仿宋_GB2312', 来源: 'custom', 中文: true, 记录: [{ 标识: 'c1', 名称: '仿宋_GB2312', 家族: '仿宋_GB2312', 别名: [], 来源: 'custom', 样式: 'Regular', 字重: 400, 斜体: false, 格式: 'ttf', 大小: 1, 中文字形: true, 拉丁字形: true, 可嵌入: true }] },
    ],
    全部字体: [], 加载中: false, 刷新中: false, 状态: '完成', 错误: '', 刷新: vi.fn(), 导入: vi.fn(), 移除: vi.fn(), 打开目录: vi.fn(), 选择字体,
  }),
}))
vi.mock('./fallback', () => ({ 字体回退Css: (名称: string) => `"${名称}"` }))

describe('字体选择器', () => {
  it('打开后按来源分组，搜索并选择自定义公文字体', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<AntdApp><FontPicker currentValue="宋体" onSelect={onSelect} /></AntdApp>)
    expect(screen.getByRole('button', { name: '字体' })).toHaveTextContent('宋体')
    await user.click(screen.getByRole('button', { name: '字体' }))
    expect(await screen.findByRole('dialog', { name: '选择字体' })).toBeInTheDocument()
    expect(screen.getByText('我的字体')).toBeInTheDocument()
    expect(screen.getByText('系统字体')).toBeInTheDocument()
    const input = screen.getByRole('textbox', { name: '搜索字体' })
    await user.type(input, '仿宋')
    await user.click(screen.getByRole('button', { name: /仿宋_GB2312/ }))
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('仿宋_GB2312'))
    expect(选择字体).toHaveBeenCalledWith('仿宋_GB2312')
  })
})
