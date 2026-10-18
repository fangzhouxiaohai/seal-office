import { describe, expect, it } from 'vitest'
import { 解析图数据, 生成图形文件, 解析图文件, 自动布局, type 图数据 } from './diagramData'

describe('本机图形数据', () => {
  const 图: 图数据 = { 节点: [{ id: 'a', 文本: '开始', x: 80, y: 80 }, { id: 'b', 文本: '结束', x: 300, y: 80 }], 连线: [{ id: 'e', 起点: 'a', 终点: 'b' }] }

  it('拒绝指向不存在节点的连线', () => {
    expect(() => 解析图数据(JSON.stringify({ 节点: [{ id: 'a', 文本: '开始', x: 0, y: 0 }], 连线: [{ id: 'e', 起点: 'a', 终点: 'b' }] }))).toThrow('连线')
  })

  it('导出图形时转义节点文本并保留连线', () => {
    const 内容 = 生成图形文件({ ...图, 节点: [{ ...图.节点[0], 文本: '<开始>' }, 图.节点[1]] }, '流程图')
    expect(内容).toContain('&lt;开始&gt;')
    expect(内容).toContain('<line')
    expect(内容).toContain('<svg')
  })
})

it('可编辑JSON保留节点形状配色备注、线标签；SVG转义内容并保留可读元数据', () => {
  const original = { 节点: [{ id: 'a', 文本: '判断 <甲>', x: 80, y: 80, 形状: '菱形', 填充: '#FFF2CC', 线条: '#995500', 文字颜色: '#332211', 备注: '保留备注 & 细节' }, { id: 'b', 文本: '结束', x: 400, y: 80, 形状: '椭圆' }], 连线: [{ id: 'e', 起点: 'a', 终点: 'b', 标签: '通过 <是>', 颜色: '#336699' }] }
  expect(解析图数据(JSON.stringify(original))).toEqual(original)
  const svg = 生成图形文件(original as any, '流程图'); const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'); expect(doc.querySelector('parsererror')).toBeNull(); expect(doc.querySelector('polygon')).toBeTruthy(); expect(doc.querySelector('ellipse')).toBeTruthy(); expect(doc.documentElement.textContent).toContain('保留备注 & 细节'); expect(svg).toContain('通过 &lt;是&gt;')
})
it.each(['脑图','流程图'] as const)('自动%s布局处理循环和断开的图，坐标有效且节点不重叠、数据不变', 类型 => {
  const original: 图数据 = { 节点: Array.from({ length: 100 }, (_, i) => ({ id: 'n'+i, 文本: '主题'+i, x: 80, y: 80, 备注: '保留'+i })), 连线: Array.from({ length: 98 }, (_, i) => ({ id: 'e'+i, 起点: 'n'+i, 终点:'n'+(i+1), 标签:'标签'+i })) }; original.连线.push({ id:'cycle',起点:'n98',终点:'n0' }); const next = 自动布局(original, 类型); expect(解析图数据(JSON.stringify(next))).toEqual(next); expect(next.连线).toEqual(original.连线); expect(next.节点.map(n=>n.备注)).toEqual(original.节点.map(n=>n.备注)); expect(new Set(next.节点.map(n=>n.x+','+n.y)).size).toBe(100)
})
it.each([{形状:'非法'}, {填充:'url(javascript:bad)'}, {备注:'x'.repeat(2001)}])('拒绝非法新属性而非静默丢弃', extra => { expect(()=>解析图数据(JSON.stringify({节点:[{id:'a',文本:'甲',x:0,y:0,...extra}],连线:[]}))).toThrow() })
it('自行导出的SVG以安全元数据重开可编辑；外部SVG不能假装完成导入',()=>{
  const graph:图数据={节点:[{id:'甲',文本:'完整<内容>',x:80,y:80,形状:'菱形',备注:'中文备注'}],连线:[]};expect(解析图文件(生成图形文件(graph,'流程图'))).toEqual(graph);expect(()=>解析图文件('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="30"/></svg>')).toThrow('可编辑图形');expect(()=>解析图文件(生成图形文件(graph,'流程图').replace('</svg>','<script>alert(1)</script></svg>'))).toThrow('活动内容')
})