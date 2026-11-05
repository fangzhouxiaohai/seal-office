import { describe, expect, it, vi } from 'vitest'
import { 构建表格数据菜单组, 构建表格浮窗按钮 } from './sheetFloatActions'

describe('表格 AI 选区动作', () => {
  it('空白选区不显示点击后无反应的 AI 入口', () => {
    const 菜单 = 构建表格数据菜单组(false)
    expect(JSON.stringify(菜单)).not.toContain('__ai__:')
    const 浮窗 = 构建表格浮窗按钮({ 执行命令: vi.fn(), 取选区文本: () => '', 选区有内容: false })
    expect(浮窗.some(项 => 项.id.startsWith('ai.'))).toBe(false)
  })
})
