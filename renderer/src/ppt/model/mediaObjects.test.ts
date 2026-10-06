import { describe, expect, it } from 'vitest'
import { 创建墨迹对象, 创建媒体对象, 校验媒体数据, 校验墨迹数据, 校验链接数据, 校验音效数据, 计算笔画范围, 读取播放范围 } from './mediaObjects'

describe('媒体对象模型', () => {
  it('创建媒体对象带默认播放参数与居中尺寸', () => {
    const 对象 = 创建媒体对象('a'.repeat(64), '视频')
    expect(对象.类型).toBe('媒体')
    expect(对象.资源标识).toBe('a'.repeat(64))
    expect(对象.媒体).toEqual({ 种类: '视频', 音量: 100, 循环: false, 自动播放: true })
    expect(对象.width).toBeGreaterThan(0)
    expect(对象.x).toBeGreaterThanOrEqual(0)
    expect(对象.width + 对象.x).toBeLessThanOrEqual(960)
  })

  it('音频默认封面尺寸更小，视频按画布比例', () => {
    const 音频 = 创建媒体对象('b'.repeat(64), '音频'), 视频 = 创建媒体对象('c'.repeat(64), '视频')
    expect(音频.width).toBeLessThan(视频.width)
    expect(视频.width / 视频.height).toBeCloseTo(16 / 9, 2)
  })

  it('校验播放参数并拒绝越界数值', () => {
    expect(() => 校验媒体数据({ 种类: '视频', 音量: 101, 循环: false, 自动播放: true })).toThrow()
    expect(() => 校验媒体数据({ 种类: '视频', 音量: -1, 循环: false, 自动播放: true })).toThrow()
    expect(() => 校验媒体数据({ 种类: '视频', 开始毫秒: 3000, 结束毫秒: 1000, 音量: 50, 循环: false, 自动播放: false })).toThrow()
    expect(() => 校验媒体数据({ 种类: '视频', 音量: 50, 循环: 'yes' as unknown as boolean, 自动播放: false })).toThrow()
    expect(() => 校验媒体数据({ 种类: '视频', 音量: 50, 循环: false, 自动播放: false, 未知: 1 } as never)).toThrow()
    expect(() => 校验媒体数据({ 种类: '动画', 音量: 50, 循环: false, 自动播放: false } as never)).toThrow()
    expect(校验媒体数据({ 种类: '视频', 开始毫秒: 500, 结束毫秒: 5000, 音量: 50, 循环: true, 自动播放: false })).toEqual({ 种类: '视频', 开始毫秒: 500, 结束毫秒: 5000, 音量: 50, 循环: true, 自动播放: false })
  })

  it('播放范围按真实时长裁剪并处理缺失时长', () => {
    expect(读取播放范围({ 种类: '视频', 音量: 100, 循环: false, 自动播放: false, 开始毫秒: 1000, 结束毫秒: 4000 }, 10000)).toEqual({ 开始秒: 1, 结束秒: 4 })
    expect(读取播放范围({ 种类: '视频', 音量: 100, 循环: false, 自动播放: false }, Number.NaN)).toEqual({ 开始秒: 0, 结束秒: null })
    expect(读取播放范围({ 种类: '视频', 音量: 100, 循环: false, 自动播放: false, 开始毫秒: 2000 }, 1000)).toEqual({ 开始秒: 0, 结束秒: null })
  })
})

describe('动作与超链接模型', () => {
  it('只放行 http、https、mailto 与真实页面', () => {
    expect(校验链接数据({ 类型: '网页', 目标: 'https://example.com/a' }, ['页一'])).toEqual({ 类型: '网页', 目标: 'https://example.com/a' })
    expect(校验链接数据({ 类型: '网页', 目标: 'mailto:a@b.com' }, [])).toEqual({ 类型: '网页', 目标: 'mailto:a@b.com' })
    expect(() => 校验链接数据({ 类型: '网页', 目标: 'javascript:alert(1)' }, [])).toThrow()
    expect(() => 校验链接数据({ 类型: '网页', 目标: 'file:///C:/Windows/System32/calc.exe' }, [])).toThrow()
    expect(() => 校验链接数据({ 类型: '网页', 目标: '不是地址' }, [])).toThrow()
    expect(校验链接数据({ 类型: '页', 目标: '页二' }, ['页一', '页二'])).toEqual({ 类型: '页', 目标: '页二' })
    expect(() => 校验链接数据({ 类型: '页', 目标: '页三' }, ['页一', '页二'])).toThrow()
    expect(校验链接数据({ 类型: '结束', 目标: '' }, [])).toEqual({ 类型: '结束', 目标: '' })
    expect(() => 校验链接数据({ 类型: '结束', 目标: 'x' }, [])).toThrow()
    expect(() => 校验链接数据({ 类型: '宏', 目标: 'x' } as never, [])).toThrow()
  })
})

describe('永久笔迹模型', () => {
  it('按笔画计算包围盒并保留坐标原点', () => {
    const 范围 = 计算笔画范围([[{ x: 100, y: 120 }, { x: 260, y: 180 }]])
    expect(范围).toEqual({ x: 100, y: 120, width: 160, height: 60 })
    expect(() => 计算笔画范围([])).toThrow()
  })

  it('创建笔迹对象并校验颜色、笔宽与点数', () => {
    const 对象 = 创建墨迹对象([[{ x: 10, y: 10 }, { x: 20, y: 30 }]], '#E34D59', 4)
    expect(对象.类型).toBe('墨迹')
    expect(对象.墨迹).toEqual({ 颜色: '#E34D59', 笔宽: 4, 笔画: [[{ x: 10, y: 10 }, { x: 20, y: 30 }]] })
    expect(() => 创建墨迹对象([], '#E34D59', 4)).toThrow()
    expect(() => 创建墨迹对象([[{ x: 10, y: 10 }]], '#E34D59', 4)).toThrow()
    expect(() => 校验墨迹数据({ 颜色: 'red', 笔宽: 4, 笔画: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] })).toThrow()
    expect(() => 校验墨迹数据({ 颜色: '#E34D59', 笔宽: 0, 笔画: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]] })).toThrow()
    expect(() => 校验墨迹数据({ 颜色: '#E34D59', 笔宽: 4, 笔画: [[{ x: -5, y: 1 }, { x: 2, y: 2 }]] })).toThrow()
  })
})

describe('切换音效模型', () => {
  it('校验音效资源与音量', () => {
    expect(校验音效数据({ 资源标识: 'a'.repeat(64), 音量: 80, 循环: false })).toEqual({ 资源标识: 'a'.repeat(64), 音量: 80, 循环: false })
    expect(() => 校验音效数据({ 资源标识: '', 音量: 80, 循环: false })).toThrow()
    expect(() => 校验音效数据({ 资源标识: 'a'.repeat(64), 音量: 120, 循环: false })).toThrow()
    expect(() => 校验音效数据({ 资源标识: 'a'.repeat(64), 音量: 80, 循环: false, 未知: true } as never)).toThrow()
  })
})
