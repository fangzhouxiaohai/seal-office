import { describe, it, expect } from 'vitest'
import { 拼接页面文本, 查找单页, 查找文档, 下一个命中下标, type 搜索文字项 } from './pdfSearch'

const 尺寸 = { 宽: 600, 高: 800 }
const 项 = (文本: string, x: number, y: number, 宽 = 100, 高 = 20): 搜索文字项 => ({ 文本, x, y, 宽, 高 })

describe('页面文本拼接', () => {
  it('保留每个文字项的偏移映射', () => {
    const { 文本, 映射 } = 拼接页面文本([项('办公', 0, 0, 40), 项('自动化', 40, 0, 60)])
    expect(文本).toBe('办公自动化')
    expect(映射).toHaveLength(2)
    expect(映射[0]).toMatchObject({ 起始: 0, 结束: 2 })
    expect(映射[1]).toMatchObject({ 起始: 2, 结束: 5 })
  })

  it('跳过空文本项，不让空串打断偏移', () => {
    const { 文本, 映射 } = 拼接页面文本([项('甲', 0, 0), 项('', 0, 0), 项('乙', 10, 0)])
    expect(文本).toBe('甲乙')
    expect(映射).toHaveLength(2)
  })
})

describe('单页查找', () => {
  const 页 = [项('办公自动化', 100, 200, 120, 20), 项('系统设计', 100, 240, 100, 20)]

  it('命中单个关键词并给出百分比矩形', () => {
    const 命中 = 查找单页(1, 页, '自动化', 尺寸)
    expect(命中).toHaveLength(1)
    expect(命中[0].片段).toBe('自动化')
    expect(命中[0].左).toBeCloseTo(100 / 600 * 100, 3)
    expect(命中[0].上).toBeCloseTo(200 / 800 * 100, 3)
    expect(命中[0].宽).toBeGreaterThan(0)
  })

  it('大小写不敏感但保留原文片段', () => {
    const 命中 = 查找单页(1, [项('SealOffice', 0, 0, 100)], 'sealoffice', 尺寸)
    expect(命中).toHaveLength(1)
    expect(命中[0].片段).toBe('SealOffice')
  })

  it('多个词按顺序匹配', () => {
    const 命中 = 查找单页(1, 页, '办公 系统', 尺寸)
    expect(命中).toHaveLength(1)
    expect(命中[0].片段).toContain('办公')
  })

  it('词序不对时不命中', () => {
    expect(查找单页(1, 页, '系统 办公', 尺寸)).toHaveLength(0)
  })

  it('跨文字项的命中合并成一个矩形', () => {
    const 命中 = 查找单页(1, [项('办公', 100, 200, 40, 20), 项('自动化', 140, 200, 60, 20)], '办公自动化', 尺寸)
    expect(命中).toHaveLength(1)
    // 应从 100 一直覆盖到 200
    expect(命中[0].左).toBeCloseTo(100 / 600 * 100, 3)
    expect(命中[0].宽).toBeCloseTo(100 / 600 * 100, 3)
  })

  it('同一关键词多次出现分别计数', () => {
    const 命中 = 查找单页(1, [项('测试', 0, 0, 40), 项('间隔', 40, 0, 40), 项('测试', 80, 0, 40)], '测试', 尺寸)
    expect(命中).toHaveLength(2)
    expect(命中[0].偏移).toBe(0)
    expect(命中[1].偏移).toBeGreaterThan(0)
  })

  it('空关键词与空页面不产生命中', () => {
    expect(查找单页(1, 页, '', 尺寸)).toHaveLength(0)
    expect(查找单页(1, 页, '   ', 尺寸)).toHaveLength(0)
    expect(查找单页(1, [], '办公', 尺寸)).toHaveLength(0)
  })

  it('缺页面尺寸时不猜坐标', () => {
    expect(查找单页(1, 页, '办公', undefined)).toHaveLength(0)
  })
})

describe('整文档查找', () => {
  it('按页码与偏移排序', () => {
    const 命中 = 查找文档([
      { 页码: 3, 项列表: [项('目标', 0, 0, 40)], 尺寸 },
      { 页码: 1, 项列表: [项('目标', 0, 0, 40), 项('目标', 50, 0, 40)], 尺寸 },
    ], '目标')
    expect(命中.map((项) => 项.页码)).toEqual([1, 1, 3])
  })

  it('某一页尺寸缺失时只跳过该页', () => {
    const 命中 = 查找文档([
      { 页码: 1, 项列表: [项('目标', 0, 0, 40)] },
      { 页码: 2, 项列表: [项('目标', 0, 0, 40)], 尺寸 },
    ], '目标')
    expect(命中).toHaveLength(1)
    expect(命中[0].页码).toBe(2)
  })
})

describe('命中跳转', () => {
  it('下一个循环到开头', () => {
    expect(下一个命中下标(2, 3, '下一个')).toBe(0)
  })

  it('上一个循环到结尾', () => {
    expect(下一个命中下标(0, 3, '上一个')).toBe(2)
  })

  it('无命中返回 -1', () => {
    expect(下一个命中下标(0, 0, '下一个')).toBe(-1)
  })
})
