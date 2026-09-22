import { describe, it, expect } from 'vitest'
import { 公式模板列表, 生成公式Html, 生成图表Svg, 生成SmartArtHtml } from './graphics'

const 数据 = { 类别: ['一月', '二月', '三月'], 数值: [12, 30, 18] }

describe('图表', () => {
  it('柱形图为每个类别生成一个柱子', () => {
    const svg = 生成图表Svg('柱形图', 数据)
    expect(svg).toContain('<svg')
    expect((svg.match(/<rect/g) ?? []).length).toBe(3)
  })

  it('柱形图包含类别标签', () => {
    const svg = 生成图表Svg('柱形图', 数据)
    expect(svg).toContain('一月')
    expect(svg).toContain('三月')
  })

  it('折线图生成折线与数据点', () => {
    const svg = 生成图表Svg('折线图', 数据)
    expect(svg).toContain('<polyline')
    expect((svg.match(/<circle/g) ?? []).length).toBe(3)
  })

  it('饼图为每个类别生成一个扇形', () => {
    const svg = 生成图表Svg('饼图', 数据)
    expect((svg.match(/<path/g) ?? []).length).toBe(3)
  })

  it('数值与类别数量不一致时按较短者处理', () => {
    const svg = 生成图表Svg('柱形图', { 类别: ['一', '二', '三'], 数值: [1, 2] })
    expect((svg.match(/<rect/g) ?? []).length).toBe(2)
  })

  it('空数据返回空字符串', () => {
    expect(生成图表Svg('柱形图', { 类别: [], 数值: [] })).toBe('')
  })

  it('全零数值不产生非法坐标', () => {
    const svg = 生成图表Svg('柱形图', { 类别: ['一', '二'], 数值: [0, 0] })
    expect(svg).not.toContain('NaN')
  })
})

describe('公式', () => {
  it('提供多个公式模板且均有键与名称', () => {
    expect(公式模板列表.length).toBeGreaterThanOrEqual(5)
    公式模板列表.forEach((项) => {
      expect(项.键.length).toBeGreaterThan(0)
      expect(项.名称.length).toBeGreaterThan(0)
    })
  })

  it('生成分式结构', () => {
    const html = 生成公式Html('分数')
    expect(html).toContain('wps-formula')
    expect(html).toContain('wps-formula__分子')
    expect(html).toContain('wps-formula__分母')
  })

  it('生成求和符号结构', () => {
    const html = 生成公式Html('求和')
    expect(html).toContain('wps-formula')
    expect(html).toContain('∑')
  })

  it('未知模板键返回空字符串', () => {
    expect(生成公式Html('不存在的公式')).toBe('')
  })
})

describe('SmartArt', () => {
  it('流程为每个节点生成一个图形', () => {
    const html = 生成SmartArtHtml('流程', ['需求', '设计', '开发'])
    expect((html.match(/wps-smartart__node/g) ?? []).length).toBe(3)
  })

  it('流程包含节点文字', () => {
    const html = 生成SmartArtHtml('流程', ['需求', '设计'])
    expect(html).toContain('需求')
    expect(html).toContain('设计')
  })

  it('层级按顺序设置缩进', () => {
    const html = 生成SmartArtHtml('层级', ['总部', '分部', '小组'])
    expect(html).toContain('margin-left:0px')
    expect(html).toContain('margin-left:24px')
    expect(html).toContain('margin-left:48px')
  })

  it('循环与流程图都生成节点', () => {
    expect(生成SmartArtHtml('循环', ['甲', '乙'])).toContain('wps-smartart__node')
  })

  it('空节点返回空字符串', () => {
    expect(生成SmartArtHtml('流程', [])).toBe('')
    expect(生成SmartArtHtml('层级', [])).toBe('')
  })
})
