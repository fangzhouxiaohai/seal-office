import type { 演示命令 } from '../pptCommands'
import { 读取当前幻灯片, 更新幻灯片 } from '../deck'
import { 创建图表, 创建图形, 创建表格, 创建语义图, type 图形种类 } from '../model/elements'
export const 原生插入命令: 演示命令[] = [
  ['insert.chart','图表'], ['insert.shape','图形'], ['insert.icon','矢量图标'], ['insert.wordart','艺术字'], ['insert.table','表格'], ['insert.diagram','语义图'],
].map(([id,label]) => ({ id,label,run: (上下文,参数) => {
  try {
    const 页 = 读取当前幻灯片(上下文.文稿)
    if (!页) throw new Error('请先创建幻灯片')
    let 对象
    if (id === 'insert.chart') 对象 = [创建图表('柱状图')]
    else if (id === 'insert.table') 对象 = [创建表格(3,3)]
    else if (id === 'insert.diagram') {
      if (!['流程','层级','循环','脑图'].includes(参数 ?? '')) throw new Error('请选择语义图类型')
      对象 = 创建语义图(参数 as '流程'|'层级'|'循环'|'脑图')
    } else {
      const 种类 = id === 'insert.wordart' ? '艺术字' : 参数
      if (!['矩形','圆角矩形','椭圆','菱形','三角形','箭头','星形','爱心','艺术字'].includes(种类 ?? '')) throw new Error('请选择图形类型')
      对象 = [创建图形(种类 as 图形种类,id === 'insert.wordart' ? '艺术字' : '')]
    }
    上下文.更新文稿(更新幻灯片(上下文.文稿,页.id,{ 对象列表: [...页.对象列表 ?? [],...对象] }))
  } catch (错) { 上下文.提示功能限制?.('插入失败',错 instanceof Error ? 错.message : '对象数据无效') }
} }))
