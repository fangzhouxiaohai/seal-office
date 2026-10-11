import { describe, expect, it } from 'vitest'
import { 计算边缘位置, type 边界矩形, type 浮层边缘 } from './overlayPlacement'

const rect = (left: number, top: number, width: number, height: number): 边界矩形 => ({ left, top, width, height, right: left + width, bottom: top + height })
describe('选区外围避让', () => {
  it.each<[浮层边缘, 边界矩形]>([
    ['top', rect(220, 400, 200, 100)], ['bottom', rect(220, 20, 200, 100)],
    ['right', rect(20, 20, 200, 720)], ['left', rect(800, 20, 200, 720)],
  ])('选择有足够空间的 %s 边缘', (边缘, r) => {
    const p = 计算边缘位置(r, { 宽: 180, 高: 180 }, { 宽: 1024, 高: 768 })!
    expect(p.边缘).toBe(边缘)
    expect(p.x >= r.right + 8 || p.x + 180 <= r.left - 8 || p.y >= r.bottom + 8 || p.y + 180 <= r.top - 8).toBe(true)
  })
  it('手机大选图没有完整面板空间时限制高度，而不挤入图片', () => {
    const r = rect(12, 100, 336, 440)
    const p = 计算边缘位置(r, { 宽: 336, 高: 180 }, { 宽: 360, 高: 640 })!
    expect(['top', 'bottom']).toContain(p.边缘)
    expect(p.y >= r.bottom + 8 || p.y + p.maxHeight <= r.top - 8).toBe(true)
    expect(p.maxHeight).toBe(80)
  })
  it('子菜单右侧遇到图片时选择其它边缘，同时避让主工具条', () => {
    const 按钮 = rect(650, 320, 144, 28), 工具条 = rect(650, 100, 144, 260), 图片 = rect(810, 100, 200, 500)
    const p = 计算边缘位置(按钮, { 宽: 162, 高: 170 }, { 宽: 1024, 高: 768 }, ['right', 'left', 'bottom', 'top'], [图片, 工具条])!
    expect(p.边缘).toBe('left')
    expect(p.x + 162).toBeLessThanOrEqual(工具条.left - 8)
  })
  it('选区占满可视区时不产生遮挡位置', () => {
    expect(计算边缘位置(rect(0, 0, 360, 640), { 宽: 336, 高: 180 }, { 宽: 360, 高: 640 })).toBeNull()
  })
  it('多种视口与长选区的所有有效结果都在屏内且不遮住选区', () => {
    for (const [宽, 高] of [[360, 640], [768, 500], [1280, 900]]) {
      for (let i = 0; i < 120; i++) {
        const r = rect((i * 137) % (宽 - 30), (i * 79) % (高 - 20), Math.min(宽 / 2, 30 + i * 3), Math.min(高 / 2, 20 + i * 7))
        const p = 计算边缘位置(r, { 宽: 560, 高: 180 }, { 宽, 高 })
        if (!p) continue
        const w = Math.min(560, p.maxWidth), h = Math.min(180, p.maxHeight)
        expect(p.x).toBeGreaterThanOrEqual(12); expect(p.y).toBeGreaterThanOrEqual(12)
        expect(p.x + w).toBeLessThanOrEqual(宽 - 12); expect(p.y + h).toBeLessThanOrEqual(高 - 12)
        expect(p.x >= r.right + 8 || p.x + w <= r.left - 8 || p.y >= r.bottom + 8 || p.y + h <= r.top - 8).toBe(true)
      }
    }
  })
})
