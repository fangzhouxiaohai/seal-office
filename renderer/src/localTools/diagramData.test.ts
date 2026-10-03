import { describe, expect, it } from 'vitest'
import { 解析图数据, 生成图形文件, type 图数据 } from './diagramData'

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
