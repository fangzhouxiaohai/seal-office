import { describe, expect, it } from 'vitest'
import { 计算大小, 格式化大小, 卡片位置 } from './fileInfo'

const n = (id: string, parent: string | null, kind = 'file', bytes: number | null = null, deleted = 0, size?: number) => ({ id, parent, kind, bytes, deleted, meta: size === undefined ? {} : { size } })

describe('云文件信息', () => {
  it('文件夹递归汇总子项大小，不含回收站，meta.size 优先', () => {
    const 结果 = 计算大小([n('A', null, 'folder'), n('B', 'A', 'folder'), n('f1', 'A', 'file', 1000), n('f2', 'B', 'file', 2000, 0, 1500), n('f3', 'B', 'file', 9999, 1), n('E', null, 'folder')])
    expect(结果.get('f2')!.字节).toBe(1500)
    expect(结果.get('B')!.字节).toBe(1500)
    expect(结果.get('A')!.字节).toBe(2500)
    expect(结果.get('E')).toEqual({ 字节: 0, 不完整: false })
  })
  it('未知大小的文件显示 —，所在文件夹标记不完整；循环数据不死循环', () => {
    const 结果 = 计算大小([n('A', 'B', 'folder'), n('B', 'A', 'folder'), n('x', 'A', 'file', null)])
    expect(结果.get('x')!.字节).toBeNull()
    expect(结果.get('A')!.不完整).toBe(true)
  })
  it('按语言格式化单位并保留一位小数', () => {
    expect(格式化大小(0)).toBe('0 B')
    expect(格式化大小(1536)).toBe('1.5 KB')
    expect(格式化大小(5 * 1024 * 1024, 'en-US')).toBe('5.0 MB')
    expect(格式化大小(null)).toBe('—')
  })
  it('悬停卡靠近下边缘翻到上方，靠近右边缘向左夹取', () => {
    expect(卡片位置({ left: 100, top: 100, bottom: 200, width: 120 }, { width: 220, height: 120 }, { width: 1280, height: 720 })).toEqual({ left: 50, top: 208 })
    expect(卡片位置({ left: 1200, top: 600, bottom: 700, width: 120 }, { width: 220, height: 120 }, { width: 1280, height: 720 })).toEqual({ left: 1052, top: 472 })
  })
})
