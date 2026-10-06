// 文档模型：把编辑区 HTML 转换为与具体文件格式无关的中间结构。
//
// 转换放在渲染进程而非主进程，原因是渲染进程有完整 DOM，
// 可以直接用浏览器解析 HTML，无需额外引入解析库，结果也更贴近用户所见。
// 主进程只负责把模型写成 docx 等二进制格式。
import { 读取段落排版, type 段落排版 } from './paragraphFormat'
import { 读取文档图片, type 文档图片 } from './docImages'

/** 段落对齐方式 */
export type 对齐方式 = '左' | '中' | '右' | '两端'

/** 列表类型 */
export type 列表类型 = '无' | '项目符号' | '编号'

/** 一段格式相同的连续文字 */
export interface 文字片段 {
  文本: string
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
  基线?: '上标' | '下标' | '正常'
  换行?: boolean
  图片?: 文档图片
}

/** 文本段落，含标题与列表项 */
export interface 文本段落 extends 段落排版 {
  类型: '段落'
  /** 0 表示正文，1 至 6 表示对应级别的标题 */
  级别: number
  对齐: 对齐方式
  列表: 列表类型
  文字: 文字片段[]
}

/** 表格单元格 */
export interface 表格单元 {
  表头: boolean
  文字: 文字片段[]
  段落?: 文本段落[]
}

/** 表格段落 */
export interface 表格段落 {
  类型: '表格'
  行: 表格单元[][]
}

export interface 分页符段落 { 类型: '分页符' }
export interface 水平线段落 { 类型: '水平线' }

export type 段落模型 = 文本段落 | 表格段落 | 分页符段落 | 水平线段落

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
  const 纸张相同 = 左.原始纸张 === 右.原始纸张 || !!左.原始纸张 && !!右.原始纸张 &&
    左.原始纸张.宽 === 右.原始纸张.宽 && 左.原始纸张.高 === 右.原始纸张.高
  const 边距相同 = 左.原始页边距 === 右.原始页边距 || !!左.原始页边距 && !!右.原始页边距 &&
    (['上', '右', '下', '左'] as const).every((字段名) => 左.原始页边距![字段名] === 右.原始页边距![字段名])
  return 纸张相同 && 边距相同 && 左.页眉Html === 右.页眉Html && 左.页脚Html === 右.页脚Html
}

/** 文档模型 */
export interface 文档模型 {
  段落: 段落模型[]
  页面设置?: 文字页面设置
  页眉?: 段落模型[]
  页脚?: 段落模型[]
  /** 本次转换未能覆盖的内容种类，用于如实告知用户而非静默丢弃 */
  未覆盖: string[]
}

/** 继承自祖先元素的格式状态 */
interface 格式状态 {
  加粗: boolean
  倾斜: boolean
  下划线: boolean
  删除线: boolean
  颜色?: string
  底纹?: string
  字号?: number
  字体?: string
  基线?: '上标' | '下标' | '正常'
}

const 初始格式: 格式状态 = {
  加粗: false,
  倾斜: false,
  下划线: false,
  删除线: false,
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
  'xx-small': 9,
  'x-small': 10,
  small: 13,
  medium: 16,
  large: 18,
  'x-large': 24,
  'xx-large': 36,
  'xxx-large': 48,
}

/** 旧式 <font size> 档位（1-7）到磅值的映射，与浏览器默认渲染一致 */
const 字号档位磅值: Record<string, number> = {
  '1': 8,
  '2': 10,
  '3': 12,
  '4': 14,
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
      return Math.round(数值 * 10) / 10
    case 'em':
    case 'rem':
      // 以 16px 为基准字号折算
      return Math.round(数值 * 16 * 0.75 * 10) / 10
    case 'px':
    default:
      return Math.round(数值 * 0.75 * 10) / 10
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
      显式字重 ?? (父格式.加粗 || 标签 === 'B' || 标签 === 'STRONG'),
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
      长度转磅(样式.fontSize) ??
      (标签 === 'FONT' ? 字号档位磅值[元素.getAttribute('size') ?? ''] : undefined) ??
      父格式.字号,
    字体: 规整字体(样式.fontFamily) ?? 规整字体(元素.getAttribute('face') ?? undefined) ?? 父格式.字体,
    基线: 样式.verticalAlign === 'baseline' ? '正常'
      : 样式.verticalAlign === 'super' || 标签 === 'SUP' ? '上标'
        : 样式.verticalAlign === 'sub' || 标签 === 'SUB' ? '下标' : 父格式.基线,
  }
  return 新格式
}

/** 把格式状态与文本合成一个片段 */
function 建片段(文本: string, 格式: 格式状态): 文字片段 {
  return {
    文本,
    加粗: 格式.加粗,
    倾斜: 格式.倾斜,
    下划线: 格式.下划线,
    删除线: 格式.删除线,
    颜色: 格式.颜色,
    底纹: 格式.底纹,
    字号: 格式.字号,
    字体: 格式.字体,
    ...(格式.基线 ? { 基线: 格式.基线 } : {}),
  }
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
    const 子格式 = 叠加格式(当前, 当前格式)
    当前.childNodes.forEach((子) => 遍历(子, 子格式))
  }

  节点.childNodes.forEach((子) => 遍历(子, 格式))
  return 结果
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
        // 单元格可能因合并而跨行跨列，当前生成端按规则网格输出
        if (元素.getAttribute('colspan') !== null || 元素.getAttribute('rowspan') !== null) {
          未覆盖.add('合并单元格')
        }
        const 单元上下文: 解析上下文 = { 段落: [], 当前: null, 未覆盖 }
        const 单元格式 = 叠加格式(元素, 初始格式)
        元素.childNodes.forEach((子) => 遍历节点(子, 单元格式, 单元上下文))
        if (单元上下文.段落.some((段) => 段.类型 !== '段落')) 未覆盖.add('表格内嵌对象')
        return {
          表头: 元素.tagName === 'TH',
          文字: 收集片段(元素, 单元格式, 未覆盖),
          段落: 单元上下文.段落.filter((段): 段 is 文本段落 => 段.类型 === '段落'),
        }
      })
    )
  })

  return 行.length > 0 ? { 类型: '表格', 行 } : null
}

/** 遍历 DOM 节点，把内容填入解析上下文 */
function 遍历节点(节点: Node, 格式: 格式状态, 上下文: 解析上下文): void {
  if (节点.nodeType === Node.TEXT_NODE) {
    const 文本 = 节点.textContent ?? ''
    // 纯空白的文本节点来自 HTML 缩进，不构成内容
    if (文本.trim().length === 0) {
      return
    }
    取当前段落(上下文, 0, '左', '无').文字.push(建片段(文本, 格式))
    return
  }

  if (!(节点 instanceof HTMLElement)) {
    return
  }

  const 标签 = 节点.tagName

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
    const 子格式 = 叠加格式(节点, 格式)
    Object.assign(段, 读取段落排版(节点, 子格式.字号, 上下文.未覆盖))

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
export function 解析文档(正文Html: string): 文档模型 {
  const 容器 = document.createElement('div')
  容器.innerHTML = 正文Html

  const 上下文: 解析上下文 = { 段落: [], 未覆盖: new Set<string>(), 当前: null }
  if (容器.querySelector('.wps-chart')) 上下文.未覆盖.add('图表')
  if (容器.querySelector('.wps-smartart')) 上下文.未覆盖.add('智能图形')
  if (容器.querySelector('.wps-toc')) 上下文.未覆盖.add('自动目录')
  if (容器.querySelector('.wps-drop-cap')) 上下文.未覆盖.add('首字下沉')
  if (容器.querySelector('.wps-insert, .wps-delete')) 上下文.未覆盖.add('修订标记')
  if (容器.querySelector('a[href]')) 上下文.未覆盖.add('超链接目标')
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
  容器.childNodes.forEach((子) => 遍历节点(子, 初始格式, 上下文))

  // 空文档也要给出一个空段落，否则生成的文件结构非法
  if (上下文.段落.length === 0) {
    上下文.段落.push({ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [] })
  }

  return { 段落: 上下文.段落, 未覆盖: Array.from(上下文.未覆盖) }
}
