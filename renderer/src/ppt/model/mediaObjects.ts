import type { 媒体数据, 墨迹数据, 演示对象, 链接数据, 音效数据 } from '../deck'

/**
 * 音视频、动作与永久笔迹的模型规则。
 * 媒体播放参数（范围、音量、循环、自动播放）与链接协议在此集中校验，
 * 主进程写入器使用同一套规则，避免界面放行而保存失败。
 */
const 链接协议 = ['http:', 'https:', 'mailto:']
const 媒体大小 = { 视频: { 宽: 640, 高: 360 }, 音频: { 宽: 320, 高: 180 } } as const
const 音效键 = ['资源标识', '音量', '循环']
const 媒体键 = ['种类', '封面资源标识', '开始毫秒', '结束毫秒', '音量', '循环', '自动播放']

const 是记录 = (值: unknown): 值 is Record<string, unknown> => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 有限数 = (值: unknown): 值 is number => typeof 值 === 'number' && Number.isFinite(值)

function 校验字段(值: unknown, 允许: string[], 名称: string): void {
  if (!是记录(值)) throw new Error(`${名称}无效`)
  if (Object.keys(值).some(键 => !允许.includes(键))) throw new Error(`${名称}含未知属性，已阻止有损保存`)
}

export function 校验媒体数据(数据: 媒体数据 | undefined): 媒体数据 {
  校验字段(数据, 媒体键, '媒体播放参数')
  const 值 = 数据 as unknown as Record<string, unknown>
  if (!['音频', '视频'].includes(String(值.种类))) throw new Error('媒体种类无效')
  if (值.封面资源标识 !== undefined && (typeof 值.封面资源标识 !== 'string' || !值.封面资源标识)) throw new Error('媒体封面资源标识无效')
  if (值.开始毫秒 !== undefined && (!有限数(值.开始毫秒) || 值.开始毫秒 < 0 || 值.开始毫秒 > 86400000)) throw new Error('媒体播放起点须为 0 到 24 小时之间的毫秒数')
  if (值.结束毫秒 !== undefined && (!有限数(值.结束毫秒) || 值.结束毫秒 <= 0 || 值.结束毫秒 > 86400000)) throw new Error('媒体播放终点须为 0 到 24 小时之间的毫秒数')
  if (值.开始毫秒 !== undefined && 值.结束毫秒 !== undefined && (值.结束毫秒 as number) <= (值.开始毫秒 as number)) throw new Error('媒体播放终点必须晚于起点')
  if (!有限数(值.音量) || 值.音量 < 0 || 值.音量 > 100) throw new Error('媒体音量须为 0 到 100')
  if (typeof 值.循环 !== 'boolean') throw new Error('媒体循环设置无效')
  if (typeof 值.自动播放 !== 'boolean') throw new Error('媒体自动播放设置无效')
  return {
    种类: 值.种类 as '音频' | '视频',
    ...(值.封面资源标识 === undefined ? {} : { 封面资源标识: 值.封面资源标识 as string }),
    ...(值.开始毫秒 === undefined ? {} : { 开始毫秒: 值.开始毫秒 as number }),
    ...(值.结束毫秒 === undefined ? {} : { 结束毫秒: 值.结束毫秒 as number }),
    音量: 值.音量,
    循环: 值.循环,
    自动播放: 值.自动播放,
  }
}

export function 校验链接数据(链接: 链接数据 | undefined, 页面标识: string[] = []): 链接数据 {
  校验字段(链接, ['类型', '目标'], '链接设置')
  const 值 = 链接 as unknown as Record<string, unknown>
  const 目标 = typeof 值.目标 === 'string' ? 值.目标 : ''
  if (值.类型 === '网页') {
    if (!目标 || 目标.length > 2048) throw new Error('链接地址为空或过长')
    let 地址: URL
    try { 地址 = new URL(目标) } catch { throw new Error('链接地址格式无效，请填写完整网址') }
    if (!链接协议.includes(地址.protocol)) throw new Error(`链接协议不受支持：${地址.protocol}`)
    return { 类型: '网页', 目标: 地址.toString() }
  }
  if (值.类型 === '页') {
    if (!目标) throw new Error('页面跳转目标为空')
    if (页面标识.length && !页面标识.includes(目标)) throw new Error(`页面跳转目标不存在：${目标}`)
    return { 类型: '页', 目标 }
  }
  if (值.类型 === '结束') {
    if (目标) throw new Error('结束放映动作不接受目标')
    return { 类型: '结束', 目标: '' }
  }
  throw new Error('链接类型不受支持')
}

export function 校验墨迹数据(数据: 墨迹数据 | undefined): 墨迹数据 {
  校验字段(数据, ['颜色', '笔宽', '笔画'], '笔迹数据')
  const 值 = 数据 as unknown as Record<string, unknown>
  if (typeof 值.颜色 !== 'string' || !/^#[0-9a-f]{6}$/i.test(值.颜色)) throw new Error('笔迹颜色无效')
  if (!有限数(值.笔宽) || 值.笔宽 <= 0 || 值.笔宽 > 40) throw new Error('笔迹宽度须为 0 到 40 像素')
  if (!Array.isArray(值.笔画) || !值.笔画.length) throw new Error('笔迹缺少笔画数据')
  for (const 笔画 of 值.笔画) {
    if (!Array.isArray(笔画) || 笔画.length < 2 || 笔画.length > 2000) throw new Error('笔迹笔画点数须为 2 到 2000')
    for (const 点 of 笔画) {
      if (!是记录(点) || !有限数(点.x) || !有限数(点.y) || 点.x < 0 || 点.y < 0 || 点.x > 20000 || 点.y > 20000) throw new Error('笔迹坐标无效')
      if (Object.keys(点).some(键 => !['x', 'y'].includes(键))) throw new Error('笔迹坐标含未知属性')
    }
  }
  return { 颜色: 值.颜色, 笔宽: 值.笔宽, 笔画: (值.笔画 as Array<Array<{ x: number; y: number }>>).map(笔画 => 笔画.map(点 => ({ x: 点.x, y: 点.y }))) }
}

export function 校验音效数据(数据: 音效数据 | undefined): 音效数据 {
  校验字段(数据, 音效键, '切换音效设置')
  const 值 = 数据 as unknown as Record<string, unknown>
  if (typeof 值.资源标识 !== 'string' || !值.资源标识) throw new Error('切换音效资源标识无效')
  if (!有限数(值.音量) || 值.音量 < 0 || 值.音量 > 100) throw new Error('切换音效音量须为 0 到 100')
  if (typeof 值.循环 !== 'boolean') throw new Error('切换音效循环设置无效')
  return { 资源标识: 值.资源标识, 音量: 值.音量, 循环: 值.循环 }
}

export function 创建媒体对象(资源标识: string, 种类: '视频' | '音频'): 演示对象 {
  if (typeof 资源标识 !== 'string' || !资源标识) throw new Error('媒体资源标识无效')
  const 尺寸 = 媒体大小[种类]
  if (!尺寸) throw new Error('媒体种类无效')
  return {
    id: `media-${crypto.randomUUID()}`,
    类型: '媒体',
    x: (960 - 尺寸.宽) / 2,
    y: (540 - 尺寸.高) / 2,
    width: 尺寸.宽,
    height: 尺寸.高,
    资源标识,
    媒体: { 种类, 音量: 100, 循环: false, 自动播放: true },
  }
}

export function 计算笔画范围(笔画: Array<Array<{ x: number; y: number }>>): { x: number; y: number; width: number; height: number } {
  if (!Array.isArray(笔画) || !笔画.length || 笔画.some(项 => !Array.isArray(项) || !项.length)) throw new Error('笔迹缺少笔画数据')
  const 全部 = 笔画.flat()
  if (全部.some(点 => !有限数(点?.x) || !有限数(点?.y))) throw new Error('笔迹坐标无效')
  const 左 = Math.min(...全部.map(点 => 点.x)), 上 = Math.min(...全部.map(点 => 点.y))
  const 右 = Math.max(...全部.map(点 => 点.x)), 下 = Math.max(...全部.map(点 => 点.y))
  return { x: 左, y: 上, width: Math.max(1, 右 - 左), height: Math.max(1, 下 - 上) }
}

export function 创建墨迹对象(笔画: Array<Array<{ x: number; y: number }>>, 颜色 = '#E34D59', 笔宽 = 3): 演示对象 {
  const 数据 = 校验墨迹数据({ 颜色, 笔宽, 笔画 })
  const 范围 = 计算笔画范围(数据.笔画)
  return { id: `ink-${crypto.randomUUID()}`, 类型: '墨迹', ...范围, 墨迹: 数据 }
}

/** 播放范围按真实媒体时长换算，越界或未知时长回退为从头播放。 */
export function 读取播放范围(参数: 媒体数据, 时长毫秒: number): { 开始秒: number; 结束秒: number | null } {
  const 开始 = 参数.开始毫秒 ?? 0
  const 有效时长 = Number.isFinite(时长毫秒) && 时长毫秒 > 0 ? 时长毫秒 : Number.NaN
  if (Number.isFinite(有效时长) && 开始 >= 有效时长) return { 开始秒: 0, 结束秒: null }
  const 结束 = 参数.结束毫秒
  return {
    开始秒: 开始 / 1000,
    结束秒: Number.isFinite(有效时长) && 结束 !== undefined ? Math.min(结束, 有效时长) / 1000 : 结束 === undefined ? null : 结束 / 1000,
  }
}
