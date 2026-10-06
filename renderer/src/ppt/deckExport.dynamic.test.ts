import { expect, it } from 'vitest'
import { 创建幻灯片, 创建演示文稿 } from './deck'
import { 导出为Html预览 } from './deckExport'
import { 创建图表, 设置图表动态 } from './model/elements'

it('静态导出始终使用动态图表的最终状态', () => {
  const 图表 = 设置图表动态(创建图表('柱状图'), { 步进: '按系列', 每步毫秒: 500 })
  图表.图表!.分类 = ['一', '二']
  图表.图表!.系列 = [
    { id: 'series-0', 名称: '甲', 数值: [1, 2], 颜色: '#2B6CF6' },
    { id: 'series-1', 名称: '乙', 数值: [3, 4], 颜色: '#718096' },
  ]
  const 页 = 创建幻灯片()
  页.对象列表 = [图表]
  const html = 导出为Html预览({ ...创建演示文稿(), 幻灯片列表: [页] }, '动态图表')
  expect(html).toContain('data-series-id="series-0"')
  expect(html).toContain('data-series-id="series-1"')
  expect((html.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(4)
})
