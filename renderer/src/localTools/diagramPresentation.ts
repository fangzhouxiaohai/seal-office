import { 创建演示文稿, type 演示对象 } from '../ppt/deck'
import { 创建图形, 同步连接点 } from '../ppt/model/elements'
import { 解析图数据, 图连线端点, 节点宽, 节点高, type 图数据, type 图类型 } from './diagramData'
export function 图转演示(图: 图数据, 类型: 图类型) {
  const 有效 = 解析图数据(JSON.stringify(图))
  if (!有效.节点.length) throw new Error('请先添加至少一个节点')
  const 左 = Math.min(...有效.节点.map(项 => 项.x)), 上 = Math.min(...有效.节点.map(项 => 项.y)), 宽 = Math.max(...有效.节点.map(项 => 项.x+节点宽))-左, 高 = Math.max(...有效.节点.map(项 => 项.y+节点高))-上
  const 比例 = Math.min(1,880/宽,460/高), 映射 = new Map<string,string>()
  const 节点 = 有效.节点.map(项 => { const 对象 = 创建图形(项.形状 ?? '圆角矩形',项.文本); 映射.set(项.id,对象.id); return { ...对象, x: 40+(项.x-左)*比例, y: 40+(项.y-上)*比例, width: 节点宽*比例, height: 节点高*比例, 形状: { ...对象.形状!, 填充: 项.填充 ?? '#FFFFFF', 线条: 项.线条 ?? '#2B6CF6', 颜色: 项.文字颜色 ?? '#1A1D24', 字号: 18*比例 } } })
  const 标签: 演示对象[] = []
  const 连线: 演示对象[] = 有效.连线.map(项 => {
    const p = 图连线端点(有效.节点.find(n => n.id === 项.起点)!, 有效.节点.find(n => n.id === 项.终点)!), 对象 = 创建图形('连接线')
    if (项.标签) { const label = 创建图形('矩形', 项.标签), labelWidth = Math.max(40, Math.min(160, Array.from(项.标签).length * 14 + 12)); 标签.push({ ...label, x: 40+((p.起.x+p.终.x)/2-左-labelWidth/2)*比例, y: 40+((p.起.y+p.终.y)/2-上-28)*比例, width:labelWidth*比例,height:28*比例,形状:{...label.形状!,填充:'#FFFFFF',线条:'#FFFFFF',线宽:0,颜色:项.颜色 ?? '#5C6472',字号:14*比例} }) }
    return { ...对象, 形状: {...对象.形状!,线条:项.颜色 ?? '#5C6472'}, 连接: { 起点: { 对象: 映射.get(项.起点)!, 边: p.起边 }, 终点: { 对象: 映射.get(项.终点)!, 边: p.终边 }, 起点位置: {x:0,y:0}, 终点位置: {x:0,y:0} } }
  })
  const 对象列表: 演示对象[] = [...连线,...节点,...标签], 文稿 = 创建演示文稿(`${类型}.pptx`)
  对象列表.push({id:`group-${crypto.randomUUID()}`,类型:'组合',x:40,y:40,width:宽*比例,height:高*比例,子对象标识:对象列表.map(项=>项.id),语义类型:类型 === '流程图' ? '流程' : '脑图'})
  文稿.幻灯片列表[0] = 同步连接点({...文稿.幻灯片列表[0],版式:'空白',文本框列表:[],对象列表,备注:有效.节点.filter(n => n.备注).map((n,i) => `${i+1}. ${n.文本}\n${n.备注}`).join('\n\n')})
  return 文稿
}
