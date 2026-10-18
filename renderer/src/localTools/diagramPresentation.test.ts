import { 自动布局 } from './diagramData'
import { createRequire } from 'node:module'
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

it('真实PPTX两轮保存重开保留可编辑形状、配色、连接拓扑、线标签与节点备注', async () => {
  const load = createRequire(import.meta.url), { 写入pptx, 读取pptx } = load('../../../main/office/pptxCodec'), JSZip = load('jszip')
  const graph = { 节点: [{ id:'a',文本:'判断',x:80,y:80,形状:'菱形' as const,填充:'#FFF2CC',线条:'#995500',文字颜色:'#332211',备注:'必须保留的中文备注' }, {id:'b',文本:'结束',x:420,y:260,形状:'椭圆' as const}],连线:[{id:'e',起点:'a',终点:'b',标签:'通过',颜色:'#336699'}] }
  let model = 图转演示(graph,'流程图')
  for (let i=0;i<2;i++) { const bytes = await 写入pptx(model), zip = await JSZip.loadAsync(bytes), xml = await zip.file('ppt/slides/slide1.xml').async('string'); expect(xml).toContain('<p:cxnSp>'); expect(xml).toContain('prst="diamond"'); expect(xml).toContain('prst="ellipse"'); const read = await 读取pptx(bytes); expect(read.警告).toEqual([]); const page = read.演示文稿.幻灯片列表[0], shapes = page.对象列表.filter((n:any)=>n.形状 && !n.连接); expect(shapes.map((n:any)=>n.形状.文本)).toEqual(['判断','结束','通过']); expect(shapes[0].形状).toMatchObject({种类:'菱形',填充:'#FFF2CC',线条:'#995500',颜色:'#332211'}); const edge = page.对象列表.find((n:any)=>n.连接); expect(page.对象列表.some((n:any)=>n.id===edge.连接.起点.对象)).toBe(true); expect(page.备注).toBe('1. 判断\n必须保留的中文备注'); expect(page.备注).not.toContain('图形数据 v2'); model = read.演示文稿 }
})
it('自动布局转PPT的普通线标签留在节点间隙，不以白底盖住节点',()=>{
  const graph=自动布局({节点:[{id:'a',文本:'主题',x:80,y:80},{id:'b',文本:'判断',x:400,y:80}],连线:[{id:'e',起点:'a',终点:'b',标签:'审核通过'}]},'脑图'),list=图转演示(graph,'脑图').幻灯片列表[0].对象列表!,a=list.find(n=>n.形状?.文本==='主题')!,b=list.find(n=>n.形状?.文本==='判断')!,label=list.find(n=>n.形状?.文本==='审核通过')!
  expect(label.x).toBeGreaterThan(a.x+a.width);expect(label.x+label.width).toBeLessThan(b.x)
})