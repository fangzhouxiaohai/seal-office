// 导出页面规划与命名：纯函数，供导出面板、主进程请求与回归测试共用。
import type { 演示文稿, 幻灯片 } from '../deck'
import { 校验备注设置, 校验讲义设置, type 备注设置, type 讲义设置 } from './handout'

export type 导出格式 = 'PNG' | 'JPEG' | 'PDF' | '扫描件PDF' | '图片型PPTX' | 'HTML'
export type 导出范围 = '全部' | '当前页' | '选定页'
export type 讲义张数 = 1 | 2 | 3 | 4 | 6 | 9

export interface 导出选项 {
  格式: 导出格式
  范围: 导出范围
  选定页: string[]
  含隐藏页: boolean
  分辨率倍数: number
  JPEG质量: number
  讲义每页张数: 讲义张数
  输出备注: boolean
  /** 讲义母版设置；提供时必须与「讲义每页张数」一致 */
  讲义设置?: 讲义设置
  /** 备注母版设置；仅在输出备注时生效 */
  备注设置?: 备注设置
}

export const 导出格式列表: 导出格式[] = ['PNG', 'JPEG', 'PDF', '扫描件PDF', '图片型PPTX', 'HTML']

export const 默认导出选项: 导出选项 = {
  格式: 'PNG',
  范围: '全部',
  选定页: [],
  含隐藏页: false,
  分辨率倍数: 1,
  JPEG质量: 0.92,
  讲义每页张数: 1,
  输出备注: false,
}

/** 选项校验：越界或与格式不匹配的组合给出真实原因，不静默套用默认值 */
export function 校验导出选项(选项: 导出选项): void {
  if (!导出格式列表.includes(选项.格式)) throw new Error('导出格式不受支持')
  if (!['全部', '当前页', '选定页'].includes(选项.范围)) throw new Error('导出范围不受支持')
  if (typeof 选项.分辨率倍数 !== 'number' || !Number.isFinite(选项.分辨率倍数) || 选项.分辨率倍数 < 1 || 选项.分辨率倍数 > 4) {
    throw new Error('分辨率倍数须在 1 到 4 之间')
  }
  if (typeof 选项.JPEG质量 !== 'number' || !Number.isFinite(选项.JPEG质量) || 选项.JPEG质量 <= 0 || 选项.JPEG质量 > 1) {
    throw new Error('图片画质须在 0 到 1 之间')
  }
  if (![1, 2, 3, 4, 6, 9].includes(选项.讲义每页张数)) throw new Error('讲义每页张数只支持 1、2、3、4、6、9')
  if (选项.讲义每页张数 !== 1 && 选项.格式 !== 'PDF') throw new Error('讲义排版只用于 PDF 导出')
  if (选项.输出备注 && 选项.格式 !== 'PDF') throw new Error('备注输出只用于 PDF 导出')
  if (选项.讲义设置 !== undefined) {
    校验讲义设置(选项.讲义设置)
    if (选项.讲义设置.每页张数 !== 选项.讲义每页张数) throw new Error('讲义设置与每页张数不一致，请统一后再导出')
  }
  if (选项.备注设置 !== undefined) 校验备注设置(选项.备注设置)
  if (!Array.isArray(选项.选定页)) throw new Error('选定页面列表无效')
}

export interface 导出页 {
  序号: number
  页: 幻灯片
}

/** 按范围与隐藏页选项规划实际导出的页面；结果为空时拒绝执行 */
export function 规划导出页(文稿: 演示文稿, 选项: 导出选项): 导出页[] {
  校验导出选项(选项)
  const 列表 = 文稿.幻灯片列表
  if (列表.length === 0) throw new Error('没有可导出的页面')
  const 全部 = 列表.map((页, 序号) => ({ 序号, 页 }))
  if (选项.范围 === '全部') {
    const 结果 = 选项.含隐藏页 ? 全部 : 全部.filter(项 => !项.页.隐藏)
    if (结果.length === 0) throw new Error('没有可导出的页面，请取消至少一页的隐藏状态或勾选包含隐藏页')
    return 结果
  }
  if (选项.范围 === '当前页') {
    if (文稿.当前索引 < 0 || 文稿.当前索引 >= 列表.length) throw new Error('当前页超出范围')
    const 当前 = 全部[文稿.当前索引]
    if (当前.页.隐藏 && !选项.含隐藏页) throw new Error('当前页已隐藏，请勾选包含隐藏页或切换页面')
    return [当前]
  }
  if (选项.选定页.length === 0) throw new Error('请选择要导出的页面')
  const 选定集合 = new Set(选项.选定页)
  const 结果 = 全部.filter(项 => 选定集合.has(项.页.id))
  if (结果.length !== 选定集合.size) throw new Error('选定页面不存在或已被删除')
  if (!选项.含隐藏页 && 结果.every(项 => 项.页.隐藏)) throw new Error('选定的页面均已隐藏，请勾选包含隐藏页')
  return 选项.含隐藏页 ? 结果 : 结果.filter(项 => !项.页.隐藏)
}

/** 导出文件基础名：去掉原扩展名，空名称回退「演示文稿」 */
function 基础名(文稿名: string): string {
  const 名称 = (文稿名 ?? '').trim().replace(/\.[^.]+$/, '').trim()
  return 名称.length > 0 ? 名称 : '演示文稿'
}

const 扩展名表: Record<导出格式, string> = {
  PNG: 'png',
  JPEG: 'jpg',
  PDF: 'pdf',
  扫描件PDF: 'pdf',
  图片型PPTX: 'pptx',
  HTML: 'html',
}

const 后缀表: Partial<Record<导出格式, string>> = {
  扫描件PDF: '-扫描件',
  图片型PPTX: '-图片版',
}

/** 单文件或多页目录下的文件名；多页图片按页码命名 */
export function 生成导出文件名(文稿名: string, 格式: 导出格式, 页码?: number): string {
  const 基准 = 基础名(文稿名)
  if (页码 !== undefined && (格式 === 'PNG' || 格式 === 'JPEG')) return `${基准}-第${页码}页.${扩展名表[格式]}`
  return `${基准}${后缀表[格式] ?? ''}.${扩展名表[格式]}`
}

/** 多页图片输出的独立目录名 */
export function 生成多页目录名(文稿名: string, _格式: 导出格式): string {
  return `${基础名(文稿名)}-图片`
}
