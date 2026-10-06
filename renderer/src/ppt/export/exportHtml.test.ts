import { describe, expect, it } from 'vitest'
import { 创建演示文稿, 添加幻灯片 } from '../deck'
import { 默认导出选项 } from '../model/exportPlan'
import { 导出为Html文档, 生成导出Html } from './exportHtml'

function 造文稿() {
  let 文稿 = 创建演示文稿('季度汇报.pptx')
  文稿 = 添加幻灯片(文稿)
  文稿.幻灯片列表[0].对象列表 = [{ id: '图', 类型: '图片', x: 10, y: 20, width: 200, height: 100, 资源标识: '资源' }]
  文稿.幻灯片列表[1].备注 = '第二页演讲备注'
  return 文稿
}

const 图片地址 = { 资源: 'data:image/png;base64,AQID' }

describe('导出 HTML 文档', () => {
  it('按文稿实际页面尺寸渲染每个区块', () => {
    const html = 生成导出Html(造文稿(), 默认导出选项, 图片地址, { 宽: 720, 高: 540 })
    expect(html).toContain('width:720px;height:540px')
    expect(html).toContain('@page { size: 720px 540px; margin: 0; }')
  })

  it('跳过隐藏页并保留真实页码', () => {
    const 文稿 = 造文稿()
    文稿.幻灯片列表[0].隐藏 = true
    const html = 生成导出Html(文稿, 默认导出选项, 图片地址, { 宽: 960, 高: 540 })
    expect((html.match(/class="seal-export-page"/g) ?? []).length).toBe(1)
    expect(html).toContain('data-页序号="1"')
  })

  it('缺少真实图片资源时拒绝导出', () => {
    expect(() => 生成导出Html(造文稿(), 默认导出选项, {}, { 宽: 960, 高: 540 })).toThrow('缺少图片资源')
  })

  it('备注输出在每张幻灯片下方写入真实备注文本', () => {
    const html = 生成导出Html(造文稿(), { ...默认导出选项, 格式: 'PDF', 输出备注: true }, 图片地址, { 宽: 960, 高: 540 })
    expect(html).toContain('第二页演讲备注')
    expect(html).toContain('class="seal-export-notes"')
  })

  it('讲义按张数把多张幻灯片排进同一页', () => {
    const 文稿 = 造文稿()
    const html = 生成导出Html(文稿, { ...默认导出选项, 格式: 'PDF', 讲义每页张数: 6 }, 图片地址, { 宽: 960, 高: 540 })
    expect(html).toContain('data-讲义张数="6"')
    expect((html.match(/data-页序号=/g) ?? []).length).toBe(2)
    expect((html.match(/class="seal-export-page"/g) ?? []).length).toBe(1)
  })

  it('扫描件使用灰度与噪点样式且不改变页面尺寸', () => {
    const html = 生成导出Html(造文稿(), { ...默认导出选项, 格式: '扫描件PDF' }, 图片地址, { 宽: 960, 高: 540 })
    expect(html).toContain('grayscale(1)')
    expect(html).toContain('width:960px;height:540px')
  })

  it('HTML 导出包含文本框、图片、图形、表格与图表对象', () => {
    const 文稿 = 造文稿()
    const 格 = (文本: string) => ({ 文本, 背景: '#FFFFFF', 颜色: '#1A1D24', 字号: 18, 加粗: false, 对齐: 'left' as const })
    文稿.幻灯片列表[0].对象列表 = [
      { id: '图', 类型: '图片', x: 10, y: 20, width: 200, height: 100, 资源标识: '资源' },
      { id: '形', 类型: '图形', x: 10, y: 200, width: 100, height: 80, 形状: { 种类: '矩形', 文本: '标题', 填充: '#FF0000', 线条: '#000000', 线宽: 1, 颜色: '#FFFFFF', 字号: 18, 加粗: false } },
      { id: '表', 类型: '表格', x: 300, y: 200, width: 300, height: 96, 表格: { 单元格: [[格('甲'), 格('乙')], [格('丙'), 格('丁')]], 行高: [48, 48], 列宽: [150, 150], 合并: [] } },
      { id: '表图', 类型: '图表', x: 300, y: 20, width: 300, height: 150, 图表: { 种类: '柱状图', 标题: '销量', 分类: ['一月'], 系列: [{ 名称: '华东', 数值: [3] }], 图例: '下', 横轴标题: '', 纵轴标题: '', 显示横轴: true, 显示纵轴: true, 数值格式: '0' } },
    ] as never
    const html = 生成导出Html(文稿, 默认导出选项, 图片地址, { 宽: 960, 高: 540 })
    expect(html).toContain('src="data:image/png;base64,AQID"')
    expect(html).toContain('data-chart-type')
    expect(html).toContain('甲')
    expect(html).toContain('data-对象标识="形"')
  })

  it('保持不变量的导出为 Html 文档入口', () => {
    const html = 导出为Html文档(造文稿(), 默认导出选项, 图片地址, { 宽: 960, 高: 540 })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('lang="zh-CN"')
  })
})
