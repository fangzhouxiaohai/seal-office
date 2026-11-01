import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { 菜单图标 } from './menuIcons'
import ContextMenu from './ContextMenu'
import SelectionFloatPanel from './SelectionFloatPanel'

describe('右键菜单图标解析', () => {
  it('颜色命令显示对应颜色的实心色块', () => {
    expect(菜单图标({ commandId: '__color__:#E34D59', label: '红色' })).toEqual({ 类型: '色块', 颜色: '#E34D59' })
    expect(菜单图标({ commandId: '__highlight__:#FFF2A8', label: '黄色' })).toEqual({ 类型: '色块', 颜色: '#FFF2A8' })
    expect(菜单图标({ commandId: 'cell.fill', commandParam: '#2E9E5B', label: '绿色' })).toEqual({ 类型: '色块', 颜色: '#2E9E5B' })
  })

  it('所有 AI 功能统一为多彩星星', () => {
    expect(菜单图标({ commandId: '__ai__:ai.polish', label: 'AI 润色' })).toEqual({ 类型: 'AI' })
    expect(菜单图标({ commandId: '__ai__:ai.translate', label: 'AI 翻译' })).toEqual({ 类型: 'AI' })
    expect(菜单图标({ commandId: 'assistant.ask', label: 'AI 问答' })).toEqual({ 类型: 'AI' })
  })

  it('常用命令按功能配彩色图标', () => {
    expect(菜单图标({ commandId: 'clipboard.copy', label: '复制' })).toMatchObject({ 类型: '图标', 名称: 'copy' })
    expect(菜单图标({ commandId: 'clipboard.paste', label: '粘贴' })).toMatchObject({ 类型: '图标', 名称: 'paste' })
    expect(菜单图标({ commandId: 'font.bold', label: '加粗' })).toMatchObject({ 类型: '图标', 名称: 'bold' })
    expect(菜单图标({ commandId: 'delete', label: '删除' })).toMatchObject({ 类型: '图标', 名称: 'trash' })
    expect((菜单图标({ commandId: 'delete', label: '删除' }) as any).颜色).toMatch(/^#/)
  })

  it('未知命令不强加图标', () => {
    expect(菜单图标({ commandId: 'custom.unknown', label: '其他' })).toBeNull()
  })
})

describe('菜单渲染', () => {
  it('右键菜单中颜色项带色块、AI 项带多彩星星', () => {
    render(<ContextMenu open x={10} y={10} onCommand={() => {}} items={[
      { type: 'group', 标题: '字体颜色', 子项: [{ type: 'item', commandId: '__color__:#E34D59', label: '红色' }] },
      { type: 'item', commandId: '__ai__:ai.polish', label: 'AI 润色' },
    ]} />)
    const 红色 = screen.getByRole('menuitem', { name: '红色' })
    expect((红色.querySelector('.wps-context-menu__swatch') as HTMLElement).style.background).toMatch(/rgb\(227, 77, 89\)|#E34D59/i)
    expect(within(screen.getByRole('menuitem', { name: 'AI 润色' })).getByTestId('ai-star')).toBeTruthy()
  })

  it('横版浮动菜单的 AI 按钮使用多彩星星', () => {
    render(<SelectionFloatPanel 名称="选中内容操作" 打开 位置={{ x: 10, y: 10, 在上方: true }} on关闭={() => {}} 按钮={[{ id: 'ai.translate', 标签: '翻译', 图标: 'globe', 分组: 92, 执行: () => {} }, { id: 'ai.rewrite', 标签: '重写', 分组: 91, 执行: () => {} }]} />)
    expect(screen.getAllByTestId('ai-star')).toHaveLength(2)
  })
})

describe('通用 AI 图标', () => {
  it('未指定颜色时 ai 图标统一渲染为多彩星星', async () => {
    const { default: Icon } = await import('./Icon')
    render(<Icon name="ai" size={18} />)
    expect(screen.getByTestId('ai-star').getAttribute('width')).toBe('18')
  })
})
