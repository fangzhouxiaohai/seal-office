import { describe, expect, it } from 'vitest'
import { 图转演示 } from './diagramPresentation'
describe('本机图形转原生演示', () => {
  it('保留全部节点文字与拓扑，并按比例适配画布', () => {
    const 文稿 = 图转演示({节点:[{id:'甲',文本:'主题',x:100,y:100},{id:'乙',文本:'分支',x:2800,y:2000}],连线:[{id:'线',起点:'甲',终点:'乙'}]},'脑图')
    const 列表 = 文稿.幻灯片列表[0].对象列表!
    expect(列表.filter(项 => 项.形状 && !项.连接).map(项 => 项.形状!.文本)).toEqual(['主题','分支'])
    const 线 = 列表.find(项 => 项.连接)!
    expect(列表.some(项 => 项.id === 线.连接!.起点.对象)).toBe(true)
    expect(列表.every(项 => 项.x+项.width <= 960 && 项.y+项.height <= 540)).toBe(true)
  })
})
