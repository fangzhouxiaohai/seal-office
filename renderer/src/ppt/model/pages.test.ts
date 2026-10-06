import { describe, expect, it } from 'vitest'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import { 合并演示文稿, 拆分演示文稿, 校验合并 } from './pages'

const 造稿 = (前缀: string, 数量: number) => {
  const 文稿 = 创建演示文稿(`${前缀}.pptx`)
  文稿.幻灯片列表 = Array.from({ length: 数量 }, (_, i) => ({ ...创建幻灯片('标题和内容', `${前缀}${i + 1}`), id: `${前缀}-${i + 1}` }))
  return 文稿
}

describe('页面合并与拆分', () => {
  it('合并把来源页面追加到目标末尾，标识与批注都重新映射', () => {
    const 目标 = 造稿('目标', 2)
    目标.批注列表 = [{ id: '批', 页标识: '目标-1', 作者: '甲', 内容: '备注', 已解决: false, 时间: '2026-10-06T10:00:00.000Z' }]
    const 来源 = 造稿('来源', 2)
    来源.批注列表 = [{ id: '批2', 页标识: '来源-1', 作者: '乙', 内容: '来源批注', 已解决: false, 时间: '2026-10-06T11:00:00.000Z' }]
    const 合并 = 合并演示文稿(目标, 来源)
    expect(合并.幻灯片列表.map(页 => 页.title)).toEqual(['目标1', '目标2', '来源1', '来源2'])
    const 标识 = new Set(合并.幻灯片列表.map(页 => 页.id))
    expect(标识.size).toBe(4)
    expect(合并.批注列表?.map(批 => 批.页标识).every(页标识 => 标识.has(页标识))).toBe(true)
    expect(合并.批注列表).toHaveLength(2)
    expect(目标.幻灯片列表).toHaveLength(2)
  })

  it('拆分把选定页输出为新文稿，原稿保持不变', () => {
    const 原稿 = 造稿('原', 3)
    const 新稿 = 拆分演示文稿(原稿, ['原-1', '原-3'], '拆出.pptx')
    expect(新稿.name).toBe('拆出.pptx')
    expect(新稿.幻灯片列表.map(页 =>页.title)).toEqual(['原1', '原3'])
    expect(新稿.当前索引).toBe(0)
    expect(原稿.幻灯片列表).toHaveLength(3)
  })

  it('拆分拒绝空选择、未知页面与全选，并给出真实原因', () => {
    const 原稿 = 造稿('原', 2)
    expect(() => 拆分演示文稿(原稿, [], '空.pptx')).toThrow('至少选择一页')
    expect(() => 拆分演示文稿(原稿, ['不存在'], '无效.pptx')).toThrow('页面不存在')
    expect(() => 拆分演示文稿(原稿, ['原-1', '原-2'], '全选.pptx')).toThrow('全部页面')
  })

  it('合并前校验来源与目标的页面数量上限', () => {
    const 目标 = 造稿('目标', 100)
    const 来源 = 造稿('来源', 1)
    expect(() => 校验合并(目标, 来源)).toThrow('上限')
    expect(() => 合并演示文稿(目标, 来源)).toThrow('上限')
    expect(() => 校验合并(目标, null as never)).toThrow('来源')
  })
})
