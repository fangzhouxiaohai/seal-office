import { 校验图表, 图表配色 } from '../../../../main/office/pptx/chartData.js'
export { 图表配色 }
import type { 演示对象, 幻灯片 } from '../deck'
import { 要求对象可编辑 } from './objectPermissions'
import { 校验媒体数据, 校验墨迹数据, 校验链接数据 } from './mediaObjects'
export type 图形种类 = '矩形'|'圆角矩形'|'椭圆'|'菱形'|'三角形'|'箭头'|'星形'|'爱心'|'艺术字'|'连接线'
export interface 形状数据 { 种类: 图形种类; 文本: string; 填充: string; 线条: string; 线宽: number; 颜色: string; 字号: number; 加粗: boolean }
export interface 单元格 { 文本: string; 背景: string; 颜色: string; 字号: number; 加粗: boolean; 对齐: 'left'|'center'|'right' }
export interface 合并范围 { 行: number; 列: number; 行数: number; 列数: number }
export interface 表格数据 { 单元格: 单元格[][]; 行高: number[]; 列宽: number[]; 合并: 合并范围[] }
export type 连接边 = '左'|'右'|'上'|'下'
export interface 连接数据 { 起点: { 对象: string; 边: 连接边 }; 终点: { 对象: string; 边: 连接边 }; 起点位置: { x: number; y: number }; 终点位置: { x: number; y: number } }
const 标识 = () => `element-${crypto.randomUUID()}`
const 新单元 = (): 单元格 => ({ 文本: '', 背景: '#FFFFFF', 颜色: '#1A1D24', 字号: 18, 加粗: false, 对齐: 'left' })
export function 创建图形(种类: 图形种类, 文本 = ''): 演示对象 {
  return { id: 标识(), 类型: '图形', x: 120, y: 100, width: 180, height: 100, 形状: { 种类, 文本, 填充: '#FFFFFF', 线条: '#2B6CF6', 线宽: 2, 颜色: '#1A1D24', 字号: 种类 === '艺术字' ? 36 : 24, 加粗: 种类 === '艺术字' } }
}
export function 创建表格(行: number, 列: number): 演示对象 {
  if (![行,列].every(值 => Number.isInteger(值) && 值 > 0 && 值 <= 30)) throw new Error('表格行列数须为 1 至 30')
  return { id: 标识(), 类型: '表格', x: 120, y: 100, width: 600, height: 行 * 48, 表格: { 单元格: Array.from({ length: 行 }, () => Array.from({ length: 列 }, 新单元)), 行高: Array(行).fill(48), 列宽: Array(列).fill(600 / 列), 合并: [] } }
}
function 取表(对象: 演示对象): 表格数据 {
  if (对象.类型 !== '表格' || !对象.表格) throw new Error('请选择有效表格')
  return 对象.表格
}
export function 修改单元格(对象: 演示对象, 行: number, 列: number, 修改: Partial<单元格>): 演示对象 {
  const 表 = 取表(对象)
  if (!表.单元格[行]?.[列]) throw new Error('单元格位置越界')
  if (修改.字号 !== undefined && (!Number.isFinite(修改.字号) || 修改.字号 <= 0)) throw new Error('单元格字号无效')
  return { ...对象, 表格: { ...表, 单元格: 表.单元格.map((单行,r) => 单行.map((格,c) => r === 行 && c === 列 ? { ...格, ...修改 } : 格)) } }
}
export function 合并单元格(对象: 演示对象, 行: number, 列: number, 行数: number, 列数: number): 演示对象 {
  const 表 = 取表(对象)
  if (![行,列,行数,列数].every(Number.isInteger) || 行 < 0 || 列 < 0 || 行数 < 1 || 列数 < 1 || 行 + 行数 > 表.行高.length || 列 + 列数 > 表.列宽.length || 行数 * 列数 < 2) throw new Error('合并范围无效')
  if (表.合并.some(项 => 行 < 项.行 + 项.行数 && 行 + 行数 > 项.行 && 列 < 项.列 + 项.列数 && 列 + 列数 > 项.列)) throw new Error('合并范围重叠，请先取消合并')
  return { ...对象, 表格: { ...表, 合并: [...表.合并, { 行, 列, 行数, 列数 }] } }
}
export function 取消单元格合并(对象: 演示对象, 行: number, 列: number): 演示对象 {
  const 表 = 取表(对象)
  return { ...对象, 表格: { ...表, 合并: 表.合并.filter(项 => !(行 >= 项.行 && 行 < 项.行 + 项.行数 && 列 >= 项.列 && 列 < 项.列 + 项.列数)) } }
}
export function 调整表格结构(对象: 演示对象, 方向: '行'|'列', 位置: number, 操作: '插入'|'删除'): 演示对象 {
  const 表 = 取表(对象), 尺寸 = 方向 === '行' ? 表.行高 : 表.列宽
  if (!Number.isInteger(位置) || 位置 < 0 || 位置 > 尺寸.length - (操作 === '删除' ? 1 : 0)) throw new Error('行列位置越界')
  if (操作 === '删除' && 尺寸.length === 1) throw new Error('表格至少保留一行一列')
  if (操作 === '插入' && 尺寸.length >= 30) throw new Error('表格最多支持三十行三十列')
  if (表.合并.length) throw new Error('请先取消合并，再调整行列结构')
  const 单元格 = 表.单元格.map(行 => [...行]), 新尺寸 = [...尺寸]
  if (操作 === '插入') 新尺寸.splice(位置, 0, 尺寸[Math.min(位置, 尺寸.length - 1)])
  else 新尺寸.splice(位置, 1)
  if (方向 === '行') {
    if (操作 === '插入') 单元格.splice(位置, 0, Array.from({ length: 表.列宽.length }, 新单元)); else 单元格.splice(位置, 1)
  } else for (const 行 of 单元格) { if (操作 === '插入') 行.splice(位置, 0, 新单元()); else 行.splice(位置, 1) }
  return { ...对象, 表格: { ...表, 单元格, [方向 === '行' ? '行高' : '列宽']: 新尺寸 } }
}
export function 计算连接点(对象: 演示对象, 边: 连接边) {
  const dx = 边 === '左' ? -对象.width / 2 : 边 === '右' ? 对象.width / 2 : 0, dy = 边 === '上' ? -对象.height / 2 : 边 === '下' ? 对象.height / 2 : 0
  const 角 = (对象.旋转 ?? 0) * Math.PI / 180
  return { x: 对象.x + 对象.width / 2 + dx * Math.cos(角) - dy * Math.sin(角), y: 对象.y + 对象.height / 2 + dx * Math.sin(角) + dy * Math.cos(角) }
}
export function 同步连接点(页: 幻灯片): 幻灯片 {
  const 列表 = 页.对象列表 ?? []
  return { ...页, 对象列表: 列表.map(项 => {
    if (!项.连接) return 项
    const 起 = 列表.find(子 => 子.id === 项.连接!.起点.对象), 终 = 列表.find(子 => 子.id === 项.连接!.终点.对象)
    if (!起 || !终) throw new Error('连接线引用的节点不存在')
    const 起点位置 = 计算连接点(起, 项.连接.起点.边), 终点位置 = 计算连接点(终, 项.连接.终点.边)
    return { ...项, x: Math.min(起点位置.x, 终点位置.x), y: Math.min(起点位置.y, 终点位置.y), width: Math.max(1, Math.abs(终点位置.x - 起点位置.x)), height: Math.max(1, Math.abs(终点位置.y - 起点位置.y)), 连接: { ...项.连接, 起点位置, 终点位置 } }
  }) }
}
export function 创建语义图(类型: '流程'|'层级'|'循环'|'脑图'): 演示对象[] {
  const 位置 = 类型 === '流程' ? [[120,220],[380,220],[640,220]] : 类型 === '层级' ? [[380,100],[180,320],[580,320]] : 类型 === '循环' ? [[380,80],[600,330],[160,330]] : [[340,220],[620,100],[620,340]]
  const 节点 = 位置.map(([x,y],i) => ({ ...创建图形(i === 1 && 类型 === '流程' ? '菱形' : '圆角矩形', ['开始','处理','完成'][i]), x, y, width: 160, height: 80 }))
  const 边 = 类型 === '层级' || 类型 === '脑图' ? [[0,1],[0,2]] : 类型 === '循环' ? [[0,1],[1,2],[2,0]] : [[0,1],[1,2]]
  const 连线 = 边.map(([起,终]) => ({ ...创建图形('连接线'), 连接: { 起点: { 对象: 节点[起].id, 边: (类型 === '层级' ? '下' : '右') as 连接边 }, 终点: { 对象: 节点[终].id, 边: (类型 === '层级' ? '上' : '左') as 连接边 }, 起点位置: { x: 0, y: 0 }, 终点位置: { x: 0, y: 0 } } }))
  const 对象列表 = [...连线, ...节点]
  const 页 = 同步连接点({ id: '', title: '', 版式: '空白', 背景色: '#FFFFFF', 文本框列表: [], 对象列表 })
  return [...页.对象列表!, { id: 标识(), 类型: '组合', x: 100, y: 60, width: 720, height: 400, 子对象标识: 对象列表.map(项 => 项.id), 语义类型: 类型 }]
}

function 取语义组(页: 幻灯片, 组标识: string) {
  要求对象可编辑(页,[组标识])
  const 组 = 页.对象列表?.find(项 => 项.id === 组标识)
  if (!组 || 组.类型 !== '组合' || !组.语义类型 || !组.子对象标识 || 组.锁定) throw new Error('请选择未锁定的语义图组合')
  return 组
}
export function 添加语义节点(页: 幻灯片, 组标识: string): 幻灯片 {
  const 组 = 取语义组(页,组标识), 节点 = { ...创建图形('圆角矩形','新节点'), x: 组.x + 40, y: 组.y + 40, width: 160, height: 80 }
  return { ...页, 对象列表: [...页.对象列表!.map(项 => 项.id === 组标识 ? { ...组, 子对象标识: [...组.子对象标识!,节点.id] } : 项),节点] }
}
export function 添加语义连线(页: 幻灯片, 组标识: string, 起点: string, 终点: string): 幻灯片 {
  const 组 = 取语义组(页,组标识), 列表 = 页.对象列表!
  if (起点 === 终点 || ![起点,终点].every(id => 组.子对象标识!.includes(id) && 列表.some(项 => 项.id === id && 项.形状 && !项.连接))) throw new Error('请选择两个不同的组内节点')
  if (列表.some(项 => 项.连接?.起点.对象 === 起点 && 项.连接?.终点.对象 === 终点)) throw new Error('这两个节点已有连线')
  const 线: 演示对象 = { ...创建图形('连接线'), 连接: { 起点: { 对象: 起点, 边: '右' }, 终点: { 对象: 终点, 边: '左' }, 起点位置: { x: 0, y: 0 }, 终点位置: { x: 0, y: 0 } } }
  return 同步连接点({ ...页, 对象列表: [线,...列表.map(项 => 项.id === 组标识 ? { ...组, 子对象标识: [线.id,...组.子对象标识!] } : 项)] })
}

/** 保存前完整校验结构，未知字段或损坏单元格不能以默认数据替代。 */
export function 校验原生元素(对象: 演示对象): void {
  if (对象.类型 === '图表') 校验图表数据(对象)
  const 颜色 = (值: unknown) => typeof 值 === 'string' && /^#[0-9a-f]{6}$/i.test(值)
  const 字段 = (值: unknown, 允许: string[]) => { if (!值 || typeof 值 !== 'object' || Object.keys(值).some(键 => !允许.includes(键))) throw new Error('原生对象含未知属性，已阻止有损保存') }
  if (对象.类型 === '媒体') {
    字段(对象, ['id','类型','x','y','width','height','旋转','锁定','资源标识','媒体','链接'])
    if (对象.旋转) throw new Error('媒体暂不支持旋转')
    if (对象.子对象标识 !== undefined) throw new Error('媒体不能携带组合成员')
    if (typeof 对象.资源标识 !== 'string' || !对象.资源标识) throw new Error('媒体缺少资源引用')
    校验媒体数据(对象.媒体)
    if (对象.链接) 校验链接数据(对象.链接)
  }
  if (对象.类型 === '墨迹') {
    字段(对象, ['id','类型','x','y','width','height','旋转','锁定','墨迹'])
    if (对象.旋转) throw new Error('笔迹暂不支持旋转')
    if (对象.子对象标识 !== undefined) throw new Error('笔迹不能携带组合成员')
    if (对象.链接) throw new Error('笔迹不支持超链接动作')
    const 数据 = 校验墨迹数据(对象.墨迹)
    if (对象.width <= 0 || 对象.height <= 0) throw new Error('笔迹尺寸无效')
    if (数据.笔画.some(笔画 => 笔画.some(点 => 点.x < 对象.x - 1 || 点.y < 对象.y - 1 || 点.x > 对象.x + 对象.width + 1 || 点.y > 对象.y + 对象.height + 1))) throw new Error('笔迹坐标超出对象范围')
  }
  if (对象.类型 === '图形') {
    字段(对象,['id','类型','x','y','width','height','旋转','锁定','形状','连接','子对象标识'])
    if (对象.子对象标识 !== undefined) throw new Error('图形不能携带组合成员')
    const 形 = 对象.形状
    字段(形,['种类','文本','填充','线条','线宽','颜色','字号','加粗'])
    if (!形 || !['矩形','圆角矩形','椭圆','菱形','三角形','箭头','星形','爱心','艺术字','连接线'].includes(形.种类) || typeof 形.文本 !== 'string' || typeof 形.加粗 !== 'boolean' || !Number.isFinite(形.字号) || 形.字号 <= 0 || !Number.isFinite(形.线宽) || 形.线宽 < 0 || ![形.填充,形.线条,形.颜色].every(颜色)) throw new Error('图形数据无效，已阻止有损保存')
    if (形.种类 === '连接线' && !对象.连接) throw new Error('连接线缺少端点')
    if (对象.连接 && 形.种类 !== '连接线') throw new Error('非连接线对象不能携带端点')
    if (对象.连接) {
      字段(对象.连接,['起点','终点','起点位置','终点位置'])
      for (const 端 of [对象.连接.起点,对象.连接.终点]) {
        字段(端,['对象','边'])
        if (!端 || typeof 端.对象 !== 'string' || !['左','右','上','下'].includes(端.边)) throw new Error('连接点数据无效')
      }
      for (const 点 of [对象.连接.起点位置,对象.连接.终点位置]) { 字段(点,['x','y']); if (!点 || !Number.isFinite(点.x) || !Number.isFinite(点.y)) throw new Error('连接点坐标无效') }
    }
  }
  if (对象.类型 === '表格') {
    字段(对象,['id','类型','x','y','width','height','旋转','锁定','表格','子对象标识'])
    if (对象.旋转) throw new Error('原生表格暂不支持旋转')
    if (对象.子对象标识 !== undefined) throw new Error('表格不能携带组合成员')
    const 表 = 对象.表格
    字段(表,['单元格','行高','列宽','合并'])
    if (!表 || !Array.isArray(表.单元格) || !Array.isArray(表.行高) || !Array.isArray(表.列宽) || !Array.isArray(表.合并) || !表.行高.length || !表.列宽.length || 表.行高.length > 30 || 表.列宽.length > 30 || 表.单元格.length !== 表.行高.length || [...表.行高,...表.列宽].some(值 => !Number.isFinite(值) || 值 <= 0)) throw new Error('表格行列数据无效')
    for (const 行 of 表.单元格) {
      if (!Array.isArray(行) || 行.length !== 表.列宽.length) throw new Error('表格单元格不完整')
      for (const 格 of 行) {
        字段(格,['文本','背景','颜色','字号','加粗','对齐'])
        if (typeof 格.文本 !== 'string' || typeof 格.加粗 !== 'boolean' || !Number.isFinite(格.字号) || 格.字号 <= 0 || !颜色(格.背景) || !颜色(格.颜色) || !['left','center','right'].includes(格.对齐)) throw new Error('表格单元格格式无效')
      }
    }
    let 当前 = { ...对象, 表格: { ...表, 合并: [] } } as 演示对象
    for (const 并 of 表.合并) { 字段(并,['行','列','行数','列数']); 当前 = 合并单元格(当前,并.行,并.列,并.行数,并.列数) }
  }
}

export type 图表种类 = '柱状图'|'折线图'|'饼图'
export interface 图表系列 { id: string; 名称: string; 数值: number[]; 颜色: string }
export type 图表动态步进 = '按系列'|'按分类'|'按系列与数据点'
/** 动态图表播放参数：与图表数据分开保存，不写入数据工作簿，不覆盖可编辑数值。 */
export interface 图表动态 { 步进: 图表动态步进; 每步毫秒: number }
/** 分步播放时的显示范围：点数[i] 表示第 i 个系列当前显示的数值个数。 */
export interface 图表显示 { 点数: number[] }
export interface 图表数据 { 种类: 图表种类; 标题: string; 分类: string[]; 系列: 图表系列[]; 图例: '下'|'右'|'无'; 横轴标题: string; 纵轴标题: string; 显示横轴: boolean; 显示纵轴: boolean; 数值格式: '0'|'0.00'|'0%'|'0.00%'|'#,##0'; 动态?: 图表动态 }
export function 创建图表(种类: 图表种类): 演示对象 {
  const 对象: 演示对象 = { id: 标识(), 类型: '图表', x: 120, y: 80, width: 600, height: 360, 图表: { 种类, 标题: '季度收入', 分类: ['第一季度','第二季度','第三季度'], 系列: [{id:'series-0',名称:'收入',数值:[12,24,18],颜色:图表配色[0]}], 图例:'下', 横轴标题:'',纵轴标题:'',显示横轴:true,显示纵轴:true,数值格式:'0' } }
  校验图表数据(对象)
  return 对象
}
export function 校验图表数据(对象: 演示对象): void { 校验图表(对象) }
export function 修改图表(对象: 演示对象, 图表: 图表数据): 演示对象 {
  if (对象.类型 !== '图表') throw new Error('请选择图表')
  const 新对象 = { ...对象, 图表 }; 校验图表数据(新对象); return 新对象
}
/** 设置或关闭图表动态播放；关闭时只移除动态参数，图表数据保持不变。 */
export function 设置图表动态(对象: 演示对象, 动态?: 图表动态): 演示对象 {
  if (对象.类型 !== '图表' || !对象.图表) throw new Error('请选择图表')
  if (动态 === undefined) {
    const { 动态: _省略, ...其余 } = 对象.图表
    return 修改图表(对象, 其余 as 图表数据)
  }
  if (!['按系列', '按分类', '按系列与数据点'].includes(动态.步进)) throw new Error('图表动态步进无效')
  if (!Number.isInteger(动态.每步毫秒) || 动态.每步毫秒 < 100 || 动态.每步毫秒 > 60000) throw new Error('图表动态每步时长无效：须为 0.1 至 60 秒')
  return 修改图表(对象, { ...对象.图表, 动态 })
}
/** 动态播放总步数；未设置动态时为 0，表示始终显示最终状态。 */
export function 图表步数(图: 图表数据): number {
  if (!图.动态) return 0
  if (图.动态.步进 === '按系列') return 图.系列.length
  if (图.动态.步进 === '按分类') return 图.分类.length
  return 图.系列.length * 图.分类.length
}
/** 已完成步数对应的显示范围；未设置动态时返回 undefined（静态导出与编辑区使用最终状态）。 */
export function 读取图表显示(图: 图表数据, 已完成步数: number): 图表显示 | undefined {
  if (!图.动态) return undefined
  const 完成 = Math.max(0, Math.min(图表步数(图), Math.floor(已完成步数)))
  const 分类数 = 图.分类.length, 系列数 = 图.系列.length
  if (图.动态.步进 === '按系列') return { 点数: Array.from({ length: Math.min(完成, 系列数) }, () => 分类数) }
  if (图.动态.步进 === '按分类') return { 点数: Array.from({ length: 系列数 }, () => Math.min(完成, 分类数)) }
  const 完整 = Math.min(Math.floor(完成 / 分类数), 系列数), 余 = 完成 % 分类数
  return { 点数: [...Array.from({ length: 完整 }, () => 分类数), ...(完整 < 系列数 && 余 ? [余] : [])] }
}
export function 添加图表系列(对象: 演示对象): 演示对象 {
  const 图 = 对象.图表
  if (!图) throw new Error('请选择图表')
  const 编号 = Math.max(...图.系列.map(项=>Number(项.id.slice(7))))+1
  return 修改图表(对象,{...图,系列:[...图.系列,{id:`series-${编号}`,名称:`系列${编号+1}`,数值:图.分类.map(()=>0),颜色:图表配色[图.系列.length%图表配色.length]}]})
}
export function 删除图表系列(对象: 演示对象, id: string): 演示对象 {
  const 图 = 对象.图表
  if (!图 || !图.系列.some(项=>项.id===id)) throw new Error('图表系列不存在')
  if (图.系列.length===1) throw new Error('图表至少保留一个系列')
  return 修改图表(对象,{...图,系列:图.系列.filter(项=>项.id!==id)})
}
export function 格式化图表数值(值: number, 格式: 图表数据['数值格式']): string {
  const 百分比=格式.includes('%'),小数=格式.includes('.00')?2:0
  return (百分比?值*100:值).toLocaleString('zh-CN',{useGrouping:格式.includes(','),minimumFractionDigits:小数,maximumFractionDigits:小数})+(百分比?'%':'')
}
