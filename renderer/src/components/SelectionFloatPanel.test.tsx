import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SelectionFloatPanel, { 计算浮窗位置, type 浮窗按钮 } from './SelectionFloatPanel'

afterEach(() => { vi.restoreAllMocks() })

describe('选区浮窗视口与实际尺寸', () => {
  it('按实际多行面板高度选择下方，按实际宽度留出右侧边距', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return { left: 0, top: 0, right: 560, bottom: 180, width: 560, height: 180, x: 0, y: 0, toJSON: () => ({}) }
    })
    const anchor = { left: 860, top: 100, right: 980, bottom: 120, width: 120, height: 20 }
    const buttons: 浮窗按钮[] = Array.from({ length: 24 }, (_, i) => ({ id: String(i), 标签: `操作 ${i}`, 执行: vi.fn() }))
    const position = 计算浮窗位置(anchor, { 宽: window.innerWidth, 高: window.innerHeight })
    render(<SelectionFloatPanel 打开 位置={position} 按钮={buttons} on关闭={vi.fn()} 名称="选区操作" />)
    const panel = screen.getByRole('toolbar', { name: '选区操作' })
    expect(Number.parseFloat(panel.style.left) + 560).toBeLessThanOrEqual(window.innerWidth - 12)
    expect(Number.parseFloat(panel.style.top)).toBe(128)
    expect(panel.parentElement).toBe(document.body)
  })

  it('视口底部的多行面板显示在选区上方且不超出顶部', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 360, bottom: 180, width: 360, height: 180, x: 0, y: 0, toJSON: () => ({}) })
    const position = 计算浮窗位置({ left: 20, right: 160, top: window.innerHeight - 50, bottom: window.innerHeight - 30, width: 140, height: 20 }, { 宽: window.innerWidth, 高: window.innerHeight })
    render(<SelectionFloatPanel 打开 位置={position} 按钮={[{ id: 'bold', 标签: '加粗', 图标: 'bold', 执行: vi.fn() }]} on关闭={vi.fn()} 名称="选区操作" />)
    const panel = screen.getByRole('toolbar', { name: '选区操作' })
    expect(Number.parseFloat(panel.style.top) + 180).toBeLessThan(window.innerHeight - 50)
    expect(panel.querySelector('svg')).not.toBeNull()
  })

  it('按钮执行时保持选区，关闭按钮仍可触达', () => {
    const execute = vi.fn(), close = vi.fn()
    render(<SelectionFloatPanel 打开 位置={{ x: 12, y: 100, 在上方: true }} 按钮={[{ id: 'copy', 标签: '复制', 执行: execute }]} on关闭={close} 名称="选区操作" />)
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: '复制' }))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(execute).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '关闭选区操作' }))
    expect(close).toHaveBeenCalledOnce()
  })
})
