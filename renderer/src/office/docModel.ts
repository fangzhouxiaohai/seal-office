// 文档模型：把编辑区 HTML 转换为与具体文件格式无关的中间结构。
//
// 转换放在渲染进程而非主进程，原因是渲染进程有完整 DOM，
// 可以直接用浏览器解析 HTML，无需额外引入解析库，结果也更贴近用户所见。
// 主进程只负责把模型写成 docx 等二进制格式。
import { 读取段落排版, type 段落排版 } from './paragraphFormat'
import { 读取文档图片, type 文档图片 } from './docImages'
import { 固定文档显示格式 } from './docRenderFormat'

/** 段落对齐方式 */
export type 对齐方式 = '左' | '中' | '右' | '两端'

/** 列表类型 */
export type 列表类型 = '无' | '项目符号' | '编号'
export interface 原生修订记录 { 类型: 'ins' | 'del' | 'moveFrom' | 'moveTo'; 标识: string; 作者: string; 时间?: string }

/** 一段格式相同的连续文字 */
export interface 文字片段 {
  格式修订?: { 标识: string; 作者: string; 时间?: string; 原来格式: Partial<文字片段> }
  文本: string
  修订?: 原生修订记录[]
  注释引用?: { 类型: 'footnote' | 'endnote'; 标识: number }
  加粗: boolean
  倾斜: boolean
  下划线: boolean
  删除线: boolean
  /** 六位十六进制前景色，不含井号 */
  颜色?: string
  /** 六位十六进制底纹色，不含井号 */
  底纹?: string
  /** 字号，单位磅 */
  字号?: number
  字体?: string
  /** 字间距，单位磅，可为负数 */
  字间距?: number
  基线?: '上标' | '下标' | '正常'
  换行?: boolean
  图片?: 文档图片
  /** 页码类域：保存时写回域代码，而不是固定文字 */
  域?: 'PAGE' | 'NUMPAGES'
  /** 外部链接使用原始目标；文档内链接以 #书签名 表示。 */
  链接?: string
  /** 文档内跳转目标；使用零宽标记保留 DOCX 书签的位置与原名。 */
  书签?: string
}

/** 文本段落，含标题与列表项 */
export interface 文本段落 extends 段落排版 {
  段落修订?: 原生修订记录
  类型: '段落'
  /** 0 表示正文，1 至 6 表示对应级别的标题 */
  级别: number
  对齐: 对齐方式
  列表: 列表类型
  列表样式?: 'decimal' | 'cjk-ideographic' | 'lower-alpha' | 'disc' | 'square' | 'circle'
  文字: 文字片段[]
  /** Paragraph-mark formatting also controls empty lines and relative indentation. */
  标记?: 文字片段
}

/** 表格单元格 */
export interface 表格单元 {
  表头: boolean
  /** 横向合并的列数，大于 1 时由左侧单元格向右跨列 */
  跨列?: number
  /** 纵向合并的行数，大于 1 时由上方单元格向下跨行 */
  跨行?: number
  文字: 文字片段[]
  段落?: 文本段落[]
  宽度?: number
  内边距?: { 上: number; 右: number; 下: number; 左: number }
  边框?: Record<string, { 样式: string; 宽: number; 颜色?: string }>
  底纹?: string
  垂直对齐?: string
}

/** 表格段落 */
export interface 表格段落 {
  类型: '表格'
  行: 表格单元[][]
  宽度?: number
  宽度百分比?: number
  边框合并?: boolean
  单元间距?: number
}

export interface 分页符段落 { 类型: '分页符' }
export interface 水平线段落 { 类型: '水平线' }

export type 段落模型 = (文本段落 | 表格段落 | 分页符段落 | 水平线段落) & { 原始块?: { 标识: string; 未修改: boolean } }

/** 整篇文字文档可由当前编辑器完整显示并写回的页面设置。 */
export interface 文字页面设置 {
  纸张: string
  纸张方向: '纵向' | '横向'
  页边距: string
  分栏: string
  水印: string
  页面边框: string
  页面颜色: string
  文字方向: '横排' | '竖排'
  行号?: boolean
  /** 来源文档的原始 OOXML 尺寸，单位为缇，预设之外用于精确往返。 */
  原始纸张?: { 宽: number; 高: number }
  原始页边距?: { 上: number; 右: number; 下: number; 左: number }
  页眉Html?: string
  页脚Html?: string
}

/** 页面设置按实际取值比较，来源文件中的属性排列不表示编辑。 */
export function 页面设置相同(左?: 文字页面设置, 右?: 文字页面设置): boolean {
  if (左 === 右) return true
  if (!左 || !右) return false
  const 字段 = ['纸张', '纸张方向', '页边距', '分栏', '水印', '页面边框', '页面颜色', '文字方向'] as const
  if (!字段.every((字段名) => 左[字段名] === 右[字段名])) return false
  if (!!左.行号 !== !!右.行号) return false
  const 纸张相同 = 左.原始纸张 === 右.原始纸张 || !!左.原始纸张 && !!右.原始纸张 &&
    左.原始纸张.宽 === 右.原始纸张.宽 && 左.原始纸张.高 === 右.原始纸张.高
  const 边距相同 = 左.原始页边距 === 右.原始页边距 || !!左.原始页边距 && !!右.原始页边距 &&
    (['上', '右', '下', '左'] as const).every((字段名) => 左.原始页边距![字段名] === 右.原始页边距![字段名])
  return 纸张相同 && 边距相同 && 左.页眉Html === 右.页眉Html && 左.页脚Html === 右.页脚Html
}

/** 文档模型 */
export interface 文档模型 {
  段落: 段落模型[]
  源包?: string
  源包基准?: { 页面设置?: 文字页面设置 }
  修订动作?: Array<{ 标识: string; 操作: 'accept' | 'reject'; 部件?: string }>
  注释?: Array<{ 类型: 'footnote' | 'endnote'; 标识: number; 段落: 段落模型[]; 未修改?: boolean }>
  页面设置?: 文字页面设置
  页眉?: 段落模型[]
  页脚?: 段落模型[]
  /** 本次转换未能覆盖的内容种类，用于如实告知用户而非静默丢弃 */
  未覆盖: string[]
}

/** 继承自祖先元素的格式状态 */
interface 格式状态 {
  格式修订?: 文字片段['格式修订']
  加粗: boolean
  倾斜: boolean
  下划线: boolean
  删除线: boolean
  颜色?: string
  底纹?: string
  字号?: number
  字体?: string
  /** 字间距，单位磅，可为负数 */
  字间距?: number
  基线?: '上标' | '下标' | '正常'
  链接?: string
  修订?: 原生修订记录[]
}

const 初始格式: 格式状态 = {
  加粗: false,
  倾斜: false,
  下划线: false,
  删除线: false,
}

/**
 * 保留链接在 OOXML 关系里的原始写法，不采用 DOM 的绝对地址规范化结果。
 * 明确拒绝能执行脚本或内嵌主动内容的协议；其余标准/自定义协议都可往返。
 */
function 读取链接目标(元素: HTMLElement): string | undefined {
  const 原值 = 元素.getAttribute('data-seal-link') ?? 元素.getAttribute('href')
  if (原值 === null) return undefined
  const 目标 = 原值.trim()
  if (目标.length === 0 || 目标.length > 32768 || /[\u0000-\u001f\u007f]/.test(目标)) return undefined
  const 协议 = 目标.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (协议 && ['javascript', 'vbscript', 'data'].includes(协议)) return undefined
  return 目标
}

function 读取书签名称(元素: HTMLElement, 未覆盖: Set<string>): string | undefined {
  const 原值 = 元素.getAttribute('data-seal-bookmark')
  if (原值 === null) return undefined
  if (原值.length === 0 || 原值.length > 32768 || /[\u0000-\u001f\u007f]/.test(原值)) {
    未覆盖.add('书签目标')
    return undefined
  }
  return 原值
}

/** 标题标签到级别的映射 */
const 标题级别: Record<string, number> = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }

/** 视为独立段落的块级标签 */
const 块级标签 = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE'])

const 非具体颜色 = new Set(['', 'transparent', 'inherit', 'initial', 'currentcolor', 'unset', 'revert', 'revert-layer'])
const 命名颜色缓存 = new Map<string, string>()

/**
 * 把 CSS 颜色统一转为六位大写十六进制。
 * 完全透明与无法识别的取值返回 undefined，避免误写成黑色。
 */
export function 颜色转十六进制(颜色: string | undefined | null): string | undefined {
  if (!颜色) {
    return undefined
  }
  const 值 = 颜色.trim().toLowerCase()
  if (非具体颜色.has(值)) {
    return undefined
  }

  const rgb匹配 = 值.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/)
  if (rgb匹配 !== null) {
    // 完全透明时视为未设置颜色
    if (rgb匹配[4] !== undefined && Number(rgb匹配[4]) === 0) {
      return undefined
    }
    const 拼接 = [rgb匹配[1], rgb匹配[2], rgb匹配[3]]
      .map((项) => Math.max(0, Math.min(255, Math.round(Number(项)))).toString(16).padStart(2, '0'))
      .join('')
    return 拼接.toUpperCase()
  }

  const 十六进制 = 值.replace('#', '')
  if (/^[0-9a-f]{3}$/.test(十六进制)) {
    // 三位简写逐位翻倍展开
    return 十六进制
      .split('')
      .map((位) => 位 + 位)
      .join('')
      .toUpperCase()
  }
  if (/^[0-9a-f]{6}$/.test(十六进制)) {
    return 十六进制.toUpperCase()
  }

  // 由浏览器识别命名颜色，兼容内联样式和旧式字体颜色属性。
  if (/^[a-z]+$/.test(值)) {
    const 已解析 = 命名颜色缓存.get(值)
    if (已解析) return 已解析
    const 探针 = document.createElement('span')
    探针.style.color = 值
    if (!探针.style.color) return undefined
    探针.style.display = 'none'
    document.documentElement.appendChild(探针)
    try {
      const 规范颜色 = getComputedStyle(探针).color
      // 只转换浏览器给出的具体颜色，未解析的关键字不能变成默认黑色。
      const 结果 = /^(?:rgba?\(|#)/i.test(规范颜色) ? 颜色转十六进制(规范颜色) : undefined
      if (结果) 命名颜色缓存.set(值, 结果)
      return 结果
    } finally {
      探针.remove()
    }
  }
  return undefined
}

/** CSS 绝对尺寸关键字到磅值的映射（medium 以 16px 为基准） */
const 尺寸关键字磅值: Record<string, number> = {
  'xx-small': 6.75,
  'x-small': 7.5,
  small: 9.75,
  medium: 12,
  large: 13.5,
  'x-large': 18,
  'xx-large': 24,
  'xxx-large': 36,
}

/** 旧式 <font size> 档位（1-7）到磅值的映射，与浏览器默认渲染一致 */
const 字号档位磅值: Record<string, number> = {
  '1': 7.5,
  '2': 9.75,
  '3': 12,
  '4': 13.5,
  '5': 18,
  '6': 24,
  '7': 36,
}

/** 把 CSS 长度或尺寸关键字转换为磅值，Office 字号以磅为单位 */
export function 长度转磅(长度: string | undefined | null): number | undefined {
  if (!长度) {
    return undefined
  }
  const 值 = 长度.trim().toLowerCase()
  if (尺寸关键字磅值[值] !== undefined) {
    return 尺寸关键字磅值[值]
  }
  const 匹配 = 值.match(/^([\d.]+)\s*(px|pt|em|rem)?$/)
  if (匹配 === null) {
    return undefined
  }
  const 数值 = Number(匹配[1])
  if (!Number.isFinite(数值) || 数值 <= 0) {
    return undefined
  }
  switch (匹配[2]) {
    case 'pt':
      return Math.round(数值 * 10000) / 10000
    case 'em':
    case 'rem':
      // 以 16px 为基准字号折算
      return Math.round(数值 * 16 * 0.75 * 10000) / 10000
    case 'px':
    default:
      return Math.round(数值 * 0.75 * 10000) / 10000
  }
}

/** 取字体名的首选项，去掉引号与备选列表 */
function 规整字体(字体: string | undefined): string | undefined {
  if (!字体) {
    return undefined
  }
  const 首选 = 字体.split(',')[0].trim().replace(/^["']|["']$/g, '')
  return 首选.length > 0 ? 首选 : undefined
}

/** 字间距允许负数与零，与字号解析分开处理 */
export function 读取字间距(取值: string | undefined | null): number | undefined {
  if (!取值) {
    return undefined
  }
  const 值 = 取值.trim().toLowerCase()
  if (值 === 'normal') {
    return 0
  }
  const 匹配 = 值.match(/^(-?[\d.]+)\s*(px|pt|em|rem)?$/)
  if (匹配 === null) {
    return undefined
  }
  const 数值 = Number(匹配[1])
  if (!Number.isFinite(数值)) {
    return undefined
  }
  const 磅 = 匹配[2] === 'px' ? 数值 * 0.75 : 匹配[2] === 'em' || 匹配[2] === 'rem' ? 数值 * 12 : 数值
  // OOXML 字间距使用二十分之一磅；保留 0.25pt 等合法值，避免保存后文字宽度变化。
  return Math.round(磅 * 20) / 20
}

/** 依据元素自身的标签与内联样式，在父格式之上叠加新的格式 */
function 叠加格式(元素: HTMLElement, 父格式: 格式状态): 格式状态 {
  const 标签 = 元素.tagName
  const 样式 = 元素.style
  const 字重 = 样式.fontWeight
  const 显式字重 = 字重 === 'normal' || (/^\d+$/.test(字重) && Number(字重) < 600)
    ? false
    : 字重 === 'bold' || 字重 === 'bolder' || (/^\d+$/.test(字重) && Number(字重) >= 600)
      ? true
      : undefined
  const 显式字形 = 样式.fontStyle === 'normal'
    ? false
    : 样式.fontStyle === 'italic' || 样式.fontStyle === 'oblique'
      ? true
      : undefined
  const 装饰 = 样式.textDecorationLine || 样式.textDecoration
  const 明确无装饰 = 装饰 === 'none'

  const 新格式: 格式状态 = {
    加粗:
      显式字重 ?? (父格式.加粗 || 标签 === 'B' || 标签 === 'STRONG' || 标签 in 标题级别 || 标签 === 'TH'),
    倾斜: 显式字形 ?? (父格式.倾斜 || 标签 === 'I' || 标签 === 'EM'),
    下划线: 明确无装饰 ? false : 父格式.下划线 || 标签 === 'U' || 装饰.includes('underline'),
    删除线:
      明确无装饰 ? false : 父格式.删除线 || 标签 === 'S' || 标签 === 'STRIKE' || 标签 === 'DEL' || 装饰.includes('line-through'),
    颜色:
      颜色转十六进制(样式.color) ??
      // 旧式 <font color="..."> 标签把颜色放在属性上，同样要保真
      颜色转十六进制(元素.getAttribute('color') ?? undefined) ??
      父格式.颜色,
    底纹: 颜色转十六进制(样式.backgroundColor) ?? 父格式.底纹,
    字号:
      读取字体尺寸(样式.fontSize, 父格式.字号) ??
      (标签 === 'FONT' ? 字号档位磅值[元素.getAttribute('size') ?? ''] : undefined) ??
      (标签 in 标题级别 ? (父格式.字号 ?? 10.5) * [0, 2, 1.5, 1.17, 1, 0.83, 0.67][标题级别[标签]] : undefined) ??
      父格式.字号,
    字体: 规整字体(样式.fontFamily) ?? 规整字体(元素.getAttribute('face') ?? undefined) ?? 父格式.字体,
    字间距: 读取字间距(样式.letterSpacing) ?? 父格式.字间距,
    基线: 样式.verticalAlign === 'baseline' ? '正常'
      : 样式.verticalAlign === 'super' || 标签 === 'SUP' ? '上标'
        : 样式.verticalAlign === 'sub' || 标签 === 'SUB' ? '下标' : 父格式.基线,
    链接: 标签 === 'A' ? 读取链接目标(元素) : 父格式.链接,
    修订: 父格式.修订,
    格式修订: 父格式.格式修订,
  }
  if (元素.dataset.sealFormatChange) { try { const record = JSON.parse(decodeURIComponent(元素.dataset.sealFormatChange)); if (!/^\d{1,10}$/.test(record.标识) || typeof record.作者 !== 'string' || !record.原来格式 || typeof record.原来格式 !== 'object') throw new Error(); 新格式.格式修订 = { ...record, 原来格式: { ...record.原来格式, 颜色: 颜色转十六进制(record.原来格式.颜色), 底纹: 颜色转十六进制(record.原来格式.底纹) } } } catch { /* Parsed below as an unsupported revision, never silently flatten. */ } }
  const 历史 = 读取修订(元素)
  if (历史) 新格式.修订 = [...(父格式.修订 ?? []), 历史]
  return 新格式
}

function 读取修订(元素: HTMLElement): 原生修订记录 | undefined {
  const 类型 = 元素.dataset.sealRevisionType
  if (!['ins', 'del', 'moveFrom', 'moveTo'].includes(类型 ?? '')) return undefined
  const 标识 = 元素.dataset.sealRevisionId ?? '', 作者 = 元素.dataset.sealRevisionAuthor ?? '', 时间 = 元素.dataset.sealRevisionDate
  if (!/^\d{1,10}$/.test(标识) || Number(标识) > 2147483647 || 作者.length > 512 || 时间 !== undefined && !Number.isFinite(Date.parse(时间))) return undefined
  return { 类型: 类型 as 原生修订记录['类型'], 标识, 作者, ...(时间 ? { 时间 } : {}) }
}

function 读取字体尺寸(值: string, 父字号 = 10.5): number | undefined {
  const 相对 = 值.trim().match(/^(\d+(?:\.\d+)?)(em|%)$/)
  return 相对 ? Number(相对[1]) * 父字号 / (相对[2] === '%' ? 100 : 1) : 长度转磅(值)
}

/** 把格式状态与文本合成一个片段 */
function 建片段(文本: string, 格式: 格式状态): 文字片段 {
  return {
    文本,
    ...(格式.修订?.length ? { 修订: 格式.修订 } : {}),
    ...(格式.格式修订 ? { 格式修订: 格式.格式修订 } : {}),
    加粗: 格式.加粗,
    倾斜: 格式.倾斜,
    下划线: 格式.下划线,
    删除线: 格式.删除线,
    颜色: 格式.颜色,
    底纹: 格式.底纹,
    字号: 格式.字号,
    字体: 格式.字体,
    ...(格式.字间距 !== undefined ? { 字间距: 格式.字间距 } : {}),
    ...(格式.基线 ? { 基线: 格式.基线 } : {}),
    ...(格式.链接 ? { 链接: 格式.链接 } : {}),
  }
}

/** 页码类域在编辑区里的标记属性，与主进程读取端保持一致 */
const 域标记属性 = 'data-seal-field'
const 支持的域 = new Set(['PAGE', 'NUMPAGES'])

/**
 * 读取页码域占位元素；返回 null 表示该元素不是域标记。
 * 未知域无法写回，记入未覆盖清单以便保存前如实告知。
 */
function 读取域片段(元素: HTMLElement, 格式: 格式状态, 未覆盖: Set<string>): 文字片段 | null {
  const 域名称 = (元素.getAttribute(域标记属性) ?? '').toUpperCase()
  if (域名称 === '') {
    return null
  }
  if (!支持的域.has(域名称)) {
    未覆盖.add('域代码')
    return null
  }
  const 片段格式 = 叠加格式(元素, 格式)
  return { ...建片段(元素.textContent ?? '', 片段格式), 域: 域名称 as 'PAGE' | 'NUMPAGES' }
}

/** 解析过程中的可变上下文 */
interface 解析上下文 {
  段落: 段落模型[]
  未覆盖: Set<string>
  /** 当前正在收集片段的文本段落，遇到块级边界时结算 */
  当前: 文本段落 | null
}

/** 取得当前段落，没有则按给定属性新建一个 */
function 取当前段落(上下文: 解析上下文, 级别: number, 对齐: 对齐方式, 列表: 列表类型): 文本段落 {
  if (上下文.当前 === null) {
    上下文.当前 = { 类型: '段落', 级别, 对齐, 列表, 文字: [] }
    上下文.段落.push(上下文.当前)
  }
  return 上下文.当前
}

/** 结束当前段落的收集，下一段文字会开启新段落 */
function 结算段落(上下文: 解析上下文): void {
  上下文.当前 = null
}

/** 读取元素的对齐方式，兼容内联样式与旧式 align 属性 */
function 读对齐(元素: HTMLElement): 对齐方式 | null {
  const 取值 = (元素.style.textAlign || 元素.getAttribute('align') || '').toLowerCase()
  switch (取值) {
    case 'center':
      return '中'
    case 'right':
      return '右'
    case 'justify':
      return '两端'
    case 'left':
      return '左'
    default:
      return null
  }
}

/** 判断元素是否位于某种列表中，返回列表类型 */
function 读列表(元素: HTMLElement): 列表类型 {
  const 父 = 元素.parentElement
  if (父 === null) {
    return '无'
  }
  if (父.tagName === 'OL') {
    return '编号'
  }
  if (父.tagName === 'UL') {
    return '项目符号'
  }
  return '无'
}

/** 把节点内的全部文字收集为片段数组，忽略其中的块级结构 */
function 收集片段(节点: Node, 格式: 格式状态, 未覆盖: Set<string>): 文字片段[] {
  const 结果: 文字片段[] = []

  const 遍历 = (当前: Node, 当前格式: 格式状态): void => {
    if (当前.nodeType === Node.TEXT_NODE) {
      const 文本 = 当前.textContent ?? ''
      if (文本.length > 0) {
        结果.push(建片段(文本, 当前格式))
      }
      return
    }
    if (!(当前 instanceof HTMLElement)) {
      return
    }
    if (当前.tagName === 'IMG') {
      const 图片 = 读取文档图片(当前 as HTMLImageElement, 未覆盖)
      if (图片) 结果.push({ ...建片段('', 当前格式), 图片 })
      return
    }
    if (当前.tagName === 'BR') {
      结果.push({ ...建片段('', 当前格式), 换行: true })
      return
    }
    if (当前.hasAttribute('data-seal-bookmark')) {
      const 书签 = 读取书签名称(当前, 未覆盖)
      if (书签 !== undefined) 结果.push({ ...建片段('', 当前格式), 书签 })
      return
    }
    // 页码域占位：保留域类型与它上次显示的文字，保存时写回真正的域代码
    const 域片段 = 读取域片段(当前, 当前格式, 未覆盖)
    if (域片段 !== null) {
      结果.push(域片段)
      return
    }
    const 子格式 = 叠加格式(当前, 当前格式)
    当前.childNodes.forEach((子) => 遍历(子, 子格式))
  }

  节点.childNodes.forEach((子) => 遍历(子, 格式))
  return 结果
}

/** 读取合并跨度：只接受 1 至 256，越界或非法取值按未覆盖如实报告 */
function 读取合并跨度(取值: string | null, 未覆盖: Set<string>): number {
  if (取值 === null) return 1
  const 数字 = Number(取值)
  if (!/^\d+$/.test(取值) || !Number.isSafeInteger(数字) || 数字 < 1 || 数字 > 256) {
    未覆盖.add('合并单元格')
    return 1
  }
  return 数字
}

/** 解析一个表格元素，行列为空时返回 null */
function 解析表格(表: HTMLTableElement, 未覆盖: Set<string>): 表格段落 | null {
  const 行列表 = Array.from(表.querySelectorAll('tr'))
  const 行: 表格单元[][] = []

  行列表.forEach((行元素) => {
    const 单元列表 = Array.from(行元素.querySelectorAll('th, td'))
    if (单元列表.length === 0) {
      return
    }
    行.push(
      单元列表.map((单元) => {
        const 元素 = 单元 as HTMLElement
        // 被合并覆盖的单元格不会出现在后续行列里，跨度写入模型后由保存端还原
        const 跨列 = 读取合并跨度(元素.getAttribute('colspan'), 未覆盖)
        const 跨行 = 读取合并跨度(元素.getAttribute('rowspan'), 未覆盖)
        const 单元上下文: 解析上下文 = { 段落: [], 当前: null, 未覆盖 }
        const 单元格式 = 叠加格式(元素, 初始格式)
        元素.childNodes.forEach((子) => 遍历节点(子, 单元格式, 单元上下文))
        if (单元上下文.段落.some((段) => 段.类型 !== '段落')) 未覆盖.add('表格内嵌对象')
        return {
          表头: 元素.tagName === 'TH',
          ...(跨列 > 1 ? { 跨列 } : {}),
          ...(跨行 > 1 ? { 跨行 } : {}),
          文字: 收集片段(元素, 单元格式, 未覆盖),
          段落: 单元上下文.段落.filter((段): 段 is 文本段落 => 段.类型 === '段落'),
          宽度: 长度转磅(元素.style.width),
          内边距: { 上: 长度转磅(元素.style.paddingTop) ?? 0, 右: 长度转磅(元素.style.paddingRight) ?? 0,
            下: 长度转磅(元素.style.paddingBottom) ?? 0, 左: 长度转磅(元素.style.paddingLeft) ?? 0 },
          边框: Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [side, {
            样式: 元素.style.getPropertyValue(`border-${side}-style`) || 'none',
            宽: 长度转磅(元素.style.getPropertyValue(`border-${side}-width`)) ?? 0,
            颜色: 颜色转十六进制(元素.style.getPropertyValue(`border-${side}-color`)),
          }])),
          底纹: 颜色转十六进制(元素.style.backgroundColor),
          垂直对齐: 元素.style.verticalAlign || undefined,
        }
      })
    )
  })

  return 行.length > 0 ? { 类型: '表格', 行, 宽度: 长度转磅(表.style.width),
    ...(表.style.width.endsWith('%') ? { 宽度百分比: Number.parseFloat(表.style.width) } : {}),
    边框合并: 表.style.borderCollapse === 'collapse', 单元间距: 长度转磅(表.style.borderSpacing.split(' ')[0]) } : null
}

/** 显式包裹空格的行内标签：其中的空格是真实内容，不当作缩进空白丢弃 */
const 行内标签 = new Set(['SPAN', 'FONT', 'B', 'I', 'U', 'S', 'STRIKE', 'EM', 'STRONG', 'SUP', 'SUB', 'A', 'MARK', 'SMALL', 'BIG', 'CODE'])

/** 遍历 DOM 节点，把内容填入解析上下文 */
function 遍历节点(节点: Node, 格式: 格式状态, 上下文: 解析上下文): void {
  if (节点.nodeType === Node.TEXT_NODE) {
    const 文本 = 节点.textContent ?? ''
    if (文本.length === 0) {
      return
    }
    // 只有空格的文本节点若是被行内标签显式包裹（如 <span> </span>），就是正文里的真实空格；
    // 其余不带内容的空白来自 HTML 缩进，不构成内容
    if (文本.trim().length === 0 && !(节点.parentElement !== null && 行内标签.has(节点.parentElement.tagName) && !/\n/.test(文本))) {
      return
    }
    取当前段落(上下文, 0, '左', '无').文字.push(建片段(文本, 格式))
    return
  }

  if (!(节点 instanceof HTMLElement)) {
    return
  }

  const 标签 = 节点.tagName
  if (节点.hasAttribute('data-seal-docx-package')) return
  if (节点.hasAttribute('data-seal-ooxml-block')) {
    结算段落(上下文)
    const start = 上下文.段落.length
    节点.childNodes.forEach(child => 遍历节点(child, 叠加格式(节点, 格式), 上下文))
    if (节点.dataset.sealOoxmlEmpty === 'true' && 上下文.段落.length === start) 上下文.段落.push({ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [] })
    for (const block of 上下文.段落.slice(start)) block.原始块 = { 标识: 节点.dataset.sealOoxmlBlock!, 未修改: 节点.dataset.sealOoxmlUnchanged === 'true' }
    结算段落(上下文)
    return
  }

  if (节点.hasAttribute('data-seal-note-ref')) {
    const kind = 节点.dataset.sealNoteKind, id = Number(节点.dataset.sealNoteRef)
    if ((kind === 'footnote' || kind === 'endnote') && Number.isSafeInteger(id) && id > 0 && id <= 10000) {
      取当前段落(上下文, 0, '左', '无').文字.push({ ...建片段('', 格式), 注释引用: { 类型: kind, 标识: id } })
    } else 上下文.未覆盖.add('无效注释引用')
    return
  }

  if (标签 === 'HR') {
    结算段落(上下文)
    上下文.段落.push({ 类型: '水平线' })
    return
  }

  if (标签 === 'BR') {
    // 空段落的占位 br 不表示额外换行；其他 br 保留为段内软回车。
    const 是空行占位 = 节点.parentElement && 块级标签.has(节点.parentElement.tagName) &&
      Array.from(节点.parentElement.childNodes).every((子) => 子 === 节点 || 子.nodeType === Node.TEXT_NODE && !子.textContent?.trim())
    const 段 = 取当前段落(上下文, 0, '左', '无')
    if (!是空行占位) 段.文字.push({ ...建片段('', 格式), 换行: true })
    return
  }

  if (标签 === 'IMG') {
    const 图片 = 读取文档图片(节点 as HTMLImageElement, 上下文.未覆盖)
    if (图片) 取当前段落(上下文, 0, '左', '无').文字.push({ ...建片段('', 格式), 图片 })
    return
  }

  if (节点.hasAttribute('data-seal-bookmark')) {
    const 书签 = 读取书签名称(节点, 上下文.未覆盖)
    if (书签 !== undefined) 取当前段落(上下文, 0, '左', '无').文字.push({ ...建片段('', 格式), 书签 })
    return
  }

  // 页码域占位：正文与页脚里的页码都不会被固定成保存时看到的数字
  const 域片段 = 读取域片段(节点, 格式, 上下文.未覆盖)
  if (域片段 !== null) {
    取当前段落(上下文, 0, '左', '无').文字.push(域片段)
    return
  }

  if (节点.classList.contains('wps-page-break')) {
    结算段落(上下文)
    上下文.段落.push({ 类型: '分页符' })
    return
  }

  if (标签 === 'TABLE') {
    结算段落(上下文)
    const 表 = 解析表格(节点 as HTMLTableElement, 上下文.未覆盖)
    if (表 !== null) {
      上下文.段落.push(表)
    }
    return
  }

  // 浏览器缩进和粘贴产生的外层容器没有独立正文；将其布局应用到实际段落。
  const 是段落容器 = 块级标签.has(标签) || 标签 === 'UL' || 标签 === 'OL'
  const 子节点 = Array.from(节点.childNodes)
  const 只含块级内容 = 子节点.some((子) => 子 instanceof HTMLElement) && 子节点.every((子) =>
    子.nodeType === Node.TEXT_NODE ? !子.textContent?.trim() : 子 instanceof HTMLElement &&
      (块级标签.has(子.tagName) || ['UL', 'OL', 'TABLE'].includes(子.tagName)))
  if (是段落容器 && 只含块级内容) {
    结算段落(上下文)
    const 子格式 = 叠加格式(节点, 格式)
    const 排版 = 读取段落排版(节点, 子格式.字号, 上下文.未覆盖)
    const 起点 = 上下文.段落.length
    子节点.forEach((子) => 遍历节点(子, 子格式, 上下文))
    const 段落 = 上下文.段落.slice(起点).filter((段): 段 is 文本段落 => 段.类型 === '段落')
    if (排版.缩进 && 段落.length !== 上下文.段落.length - 起点) 上下文.未覆盖.add('表格外层容器排版')
    段落.forEach((段) => {
      if (排版.缩进) {
        段.缩进 ??= {}
        for (const 字段 of ['左', '右'] as const) {
          if (排版.缩进[字段] !== undefined) 段.缩进[字段] = (段.缩进[字段] ?? 0) + 排版.缩进[字段]!
        }
        if (段.缩进.首行 === undefined && 段.缩进.悬挂 === undefined) {
          if (排版.缩进.首行 !== undefined) 段.缩进.首行 = 排版.缩进.首行
          if (排版.缩进.悬挂 !== undefined) 段.缩进.悬挂 = 排版.缩进.悬挂
        }
      }
      if (排版.间距?.行距 !== undefined && 段.间距?.行距 === undefined) {
        段.间距 = { ...段.间距, 行距: 排版.间距.行距, 行距规则: 排版.间距.行距规则 }
      }
    })
    if (段落.length && 排版.间距) {
      for (const [段, 字段] of [[段落[0], '段前'], [段落[段落.length - 1], '段后']] as const) {
        if (排版.间距[字段] !== undefined) 段.间距 = { ...段.间距, [字段]: Math.max(段.间距?.[字段] ?? 0, 排版.间距[字段]!) }
      }
    }
    结算段落(上下文)
    return
  }

  if (标签 === 'UL' || 标签 === 'OL' || 标签 === 'TBODY' || 标签 === 'THEAD') {
    结算段落(上下文)
    节点.childNodes.forEach((子) => 遍历节点(子, 格式, 上下文))
    结算段落(上下文)
    return
  }

  if (块级标签.has(标签)) {
    结算段落(上下文)
    const 级别 = 标题级别[标签] ?? 0
    const 对齐 = 读对齐(节点) ?? '左'
    const 列表 = 标签 === 'LI' ? 读列表(节点) : '无'
    const 段 = 取当前段落(上下文, 级别, 对齐, 列表)
    if (列表 !== '无') {
      const style = 节点.style.listStyleType || (节点.closest('ol,ul') as HTMLElement | null)?.style.listStyleType
      if (style && ['decimal', 'cjk-ideographic', 'lower-alpha', 'disc', 'square', 'circle'].includes(style)) 段.列表样式 = style as 文本段落['列表样式']
    }
    const 子格式 = 叠加格式(节点, 格式)
    Object.assign(段, 读取段落排版(节点, 子格式.字号, 上下文.未覆盖))
    段.标记 = 建片段('', 子格式)
    if (节点.dataset.sealParagraphRevision) {
      try { const revision = JSON.parse(decodeURIComponent(节点.dataset.sealParagraphRevision)); const probe = document.createElement('span'); probe.dataset.sealRevisionType = revision.类型; probe.dataset.sealRevisionId = revision.标识; probe.dataset.sealRevisionAuthor = revision.作者; if (revision.时间) probe.dataset.sealRevisionDate = revision.时间; const valid = 读取修订(probe); if (!valid) throw new Error(); 段.段落修订 = valid } catch { 上下文.未覆盖.add('段落修订标记无效') }
    }

    节点.childNodes.forEach((子) => {
      // 块级元素内若再嵌套块级元素，由递归自行结算
      遍历节点(子, 子格式, 上下文)
    })

    // 段落内没有产生任何文字时仍保留，作为空行
    if (上下文.当前 === 段 || 段.文字.length === 0) {
      结算段落(上下文)
    } else {
      结算段落(上下文)
    }
    return
  }

  // 行内元素：格式向下继承，文字并入当前段落
  const 子格式 = 叠加格式(节点, 格式)
  节点.childNodes.forEach((子) => 遍历节点(子, 子格式, 上下文))
}

/**
 * 把编辑区 HTML 解析为文档模型。
 * @param 正文Html - 编辑区的 innerHTML
 */
export function 解析文档(正文Html: string, 部分: '正文' | '页眉' | '页脚' = '正文', 设置?: 文字页面设置): 文档模型 {
  const 容器 = document.createElement('div')
  容器.innerHTML = 正文Html
  const source = 容器.querySelector<HTMLElement>('[data-seal-docx-package]'), 源包 = source?.dataset.sealDocxPackage
  if (源包 && (源包.length > 28_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(源包))) throw new Error('DOCX原始包无效或过大')
  let 修订动作: 文档模型['修订动作']
  let 源包基准: 文档模型['源包基准']
  if (source?.dataset.sealDocxBaseline) { try { 源包基准 = JSON.parse(decodeURIComponent(source.dataset.sealDocxBaseline)) } catch { throw new Error('DOCX原始包基准损坏') } }
  if (source?.dataset.sealRevisionActions) { try { 修订动作 = JSON.parse(decodeURIComponent(source.dataset.sealRevisionActions)) } catch { throw new Error('修订操作记录损坏') } }
  source?.remove()
  const canonicalHtml = (html: string) => { const box = document.createElement('div'); box.innerHTML = html; for (const element of Array.from(box.querySelectorAll<HTMLElement>('*'))) { const attributes = Array.from(element.attributes).map(attribute => [attribute.name, attribute.value] as const); if (element.hasAttribute('style')) { const styles = Array.from(element.style).sort().map(key => `${key}:${element.style.getPropertyValue(key).trim()}${element.style.getPropertyPriority(key) ? '!important' : ''}`).join(';'); const style = attributes.findIndex(attribute => attribute[0] === 'style'); attributes[style] = ['style', styles] } attributes.sort((a, b) => a[0].localeCompare(b[0])); Array.from(element.attributes).forEach(attribute => element.removeAttribute(attribute.name)); attributes.forEach(([key, value]) => element.setAttribute(key, value)) } return box.innerHTML }
  const sourceIds = new Set<string>()
  for (const node of 容器.querySelectorAll<HTMLElement>('[data-seal-ooxml-block]')) {
    if (!/^b\d{1,5}$/.test(node.dataset.sealOoxmlBlock ?? '') || sourceIds.has(node.dataset.sealOoxmlBlock!)) throw new Error('DOCX原始块标识无效或重复')
    sourceIds.add(node.dataset.sealOoxmlBlock!)
    let baseline = ''
    try { baseline = decodeURIComponent(node.dataset.sealOoxmlBaseline ?? '') } catch { throw new Error('DOCX原始块基准损坏') }
    node.dataset.sealOoxmlUnchanged = String(canonicalHtml(node.innerHTML) === canonicalHtml(baseline))
  }
  const 注释: NonNullable<文档模型['注释']> = [], 注释警告 = new Set<string>()
  for (const section of [...容器.querySelectorAll<HTMLElement>('[data-seal-notes]')]) {
    const kind = section.dataset.sealNotes
    for (const definition of [...section.querySelectorAll<HTMLElement>('[data-seal-note-id]')]) {
      const id = Number(definition.dataset.sealNoteId)
      if (!['footnote', 'endnote'].includes(kind || '') || !Number.isSafeInteger(id) || id <= 0 || id > 10000 || 注释.some(note => note.类型 === kind && note.标识 === id) || 注释.length >= 1000) { 注释警告.add('无效注释定义'); continue }
      definition.querySelectorAll('[data-seal-note-label]').forEach(label => label.remove())
      const parsed = 解析文档(definition.innerHTML, 部分, 设置)
      parsed.未覆盖.forEach(warning => 注释警告.add(`注释：${warning}`))
      let baseline = ''
      try { baseline = decodeURIComponent(definition.dataset.sealNoteBaseline ?? '') } catch { throw new Error('注释原始基准损坏') }
      注释.push({ 类型: kind as 'footnote' | 'endnote', 标识: id, 段落: parsed.段落, 未修改: !!baseline && canonicalHtml(definition.innerHTML) === canonicalHtml(baseline) })
    }
    section.remove()
  }
  固定文档显示格式(容器, 部分, 设置)

  const 上下文: 解析上下文 = { 段落: [], 未覆盖: new Set<string>(), 当前: null }
  for (const node of 容器.querySelectorAll<HTMLElement>('[data-seal-format-change]')) { try { const record = JSON.parse(decodeURIComponent(node.dataset.sealFormatChange!)); if (!/^\d{1,10}$/.test(record.标识) || typeof record.作者 !== 'string' || !record.原来格式 || typeof record.原来格式 !== 'object') throw new Error() } catch { 上下文.未覆盖.add('格式修订标记无效') } }
  if (容器.querySelector('.wps-chart')) 上下文.未覆盖.add('图表')
  if (容器.querySelector('.wps-smartart')) 上下文.未覆盖.add('智能图形')
  if (容器.querySelector('.wps-toc')) 上下文.未覆盖.add('自动目录')
  if (容器.querySelector('.wps-drop-cap')) 上下文.未覆盖.add('首字下沉')
  let 新修订号 = Math.max(0, ...Array.from(容器.querySelectorAll<HTMLElement>('[data-seal-revision-id]')).map(node => Number(node.dataset.sealRevisionId) || 0)) + 1
  for (const node of 容器.querySelectorAll<HTMLElement>('.wps-insert,.wps-delete,ins,del,[data-seal-revision-type]')) {
    if (!node.dataset.sealRevisionType) { node.dataset.sealRevisionType = node.classList.contains('wps-delete') || node.tagName === 'DEL' ? 'del' : 'ins'; node.dataset.sealRevisionId = String(新修订号++); node.dataset.sealRevisionAuthor = '本机用户' }
    if (!读取修订(node)) 上下文.未覆盖.add('修订标记无效')
  }
  for (const 链接 of 容器.querySelectorAll<HTMLElement>('a')) {
    const 有目标 = 链接.hasAttribute('data-seal-link') || 链接.hasAttribute('href')
    if (有目标 && 读取链接目标(链接) === undefined) 上下文.未覆盖.add('超链接目标')
  }
  if (容器.querySelector('svg')) 上下文.未覆盖.add('矢量图形')
  if (容器.querySelector('video, audio, canvas, iframe, object, embed')) 上下文.未覆盖.add('媒体或嵌入对象')
  for (const 元素 of 容器.querySelectorAll<HTMLElement>('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, section, article')) {
    const 样式 = 元素.style
    const 有实际尺寸 = (值: string) => 值 !== '' && !/^(?:0(?:px|pt|em|rem|cm|mm|in|pc)?\s*)+$/.test(值)
    if (样式.border && 样式.border !== 'none' && (!样式.borderWidth || 有实际尺寸(样式.borderWidth)) || 有实际尺寸(样式.borderWidth) ||
        有实际尺寸(样式.padding) || 有实际尺寸(样式.paddingTop) || 有实际尺寸(样式.paddingBottom) ||
        样式.boxShadow && 样式.boxShadow !== 'none' || 样式.transform && 样式.transform !== 'none' ||
        样式.position && 样式.position !== 'static' || 样式.float && 样式.float !== 'none' ||
        (样式.width && 元素.tagName === 'DIV')) {
      上下文.未覆盖.add('图形或文本框布局')
    }
  }
  const 根格式 = 叠加格式(容器, 初始格式)
  容器.childNodes.forEach((子) => 遍历节点(子, 根格式, 上下文))

  // 空文档也要给出一个空段落，否则生成的文件结构非法
  if (上下文.段落.length === 0) {
    上下文.段落.push({ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [] })
  }

  return { 段落: 上下文.段落, ...(源包 ? { 源包, 源包基准 } : {}), ...(修订动作?.length ? { 修订动作 } : {}), ...(注释.length ? { 注释 } : {}), 未覆盖: [...上下文.未覆盖, ...注释警告] }
}
