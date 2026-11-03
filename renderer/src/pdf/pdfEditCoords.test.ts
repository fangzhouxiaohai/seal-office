import { describe, it, expect } from 'vitest'
import { 换算PDF坐标, 换算PDF尺寸 } from './pdfEditCoords'

const 页 = { 页宽: 600, 页高: 800 }
const 显示 = { 显示宽: 300, 显示高: 400 }

describe('点选坐标换算', () => {
  // 编辑接口约定：左上角为原点、y 向下
  it('左上角对应 (0,0)', () => {
    expect(换算PDF坐标({ ...页, ...显示, 偏移X: 0, 偏移Y: 0 })).toEqual({ x: 0, y: 0 })
  })

  it('左下角对应 (0, 页高)', () => {
    expect(换算PDF坐标({ ...页, ...显示, 偏移X: 0, 偏移Y: 400 })).toEqual({ x: 0, y: 800 })
  })

  it('页面中心换算到中心', () => {
    expect(换算PDF坐标({ ...页, ...显示, 偏移X: 150, 偏移Y: 200 })).toEqual({ x: 300, y: 400 })
  })

  it('y 轴方向：往下点 y 变大（与接口一致）', () => {
    const 上 = 换算PDF坐标({ ...页, ...显示, 偏移X: 0, 偏移Y: 50 })
    const 下 = 换算PDF坐标({ ...页, ...显示, 偏移X: 0, 偏移Y: 350 })
    expect(下.y).toBeGreaterThan(上.y)
  })

  it('越界被夹到页内', () => {
    const 超出 = 换算PDF坐标({ ...页, ...显示, 偏移X: 9999, 偏移Y: 9999 })
    expect(超出.x).toBe(600)
    expect(超出.y).toBe(800)
  })

  it('负偏移夹到 0', () => {
    const 负 = 换算PDF坐标({ ...页, ...显示, 偏移X: -50, 偏移Y: -50 })
    expect(负.x).toBe(0)
    expect(负.y).toBe(0)
  })

  it('尺寸为 0 时不产生 NaN', () => {
    expect(换算PDF坐标({ ...页, 显示宽: 0, 显示高: 0, 偏移X: 10, 偏移Y: 10 })).toEqual({ x: 0, y: 0 })
  })

  it('保留一位小数，适配编辑器输入框', () => {
    const 结果 = 换算PDF坐标({ ...页, ...显示, 偏移X: 33.333, 偏移Y: 44.444 })
    expect(Number.isInteger(结果.x * 10)).toBe(true)
    expect(Number.isInteger(结果.y * 10)).toBe(true)
  })
})

describe('尺寸换算', () => {
  it('像素尺寸按比例换算成 PDF 尺寸', () => {
    expect(换算PDF尺寸({ ...页, ...显示, 像素宽: 60, 像素高: 40 })).toEqual({ 宽: 120, 高: 80 })
  })

  it('尺寸不小于 1', () => {
    const 结果 = 换算PDF尺寸({ ...页, ...显示, 像素宽: 0, 像素高: 0 })
    expect(结果.宽).toBe(1)
    expect(结果.高).toBe(1)
  })

  it('不超过页面尺寸', () => {
    const 结果 = 换算PDF尺寸({ ...页, ...显示, 像素宽: 99999, 像素高: 99999 })
    expect(结果.宽).toBe(600)
    expect(结果.高).toBe(800)
  })
})
