// 文档模型：把编辑区 HTML 转换为与具体文件格式无关的中间结构。
//
// 转换放在渲染进程而非主进程，原因是渲染进程有完整 DOM，
// 可以直接用浏览器解析 HTML，无需额外引入解析库，结果也更贴近用户所见。
// 主进程只负责把模型写成 docx 等二进制格式。

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
}

/** 文本段落，含标题与列表项 */
export interface 文本段落 {
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
}

/** 表格段落 */
export interface 表格段落 {
  类型: '表格'
  行: 表格单元[][]
}

export type 段落模型 = 文本段落 | 表格段落

/** 文档模型 */
export interface 文档模型 {
  段落: 段落模型[]
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

/**
 * 把 CSS 颜色统一转为六位大写十六进制。
 * 完全透明与无法识别的取值返回 undefined，避免误写成黑色。
 */
export function 颜色转十六进制(颜色: string | undefined | null): string | undefined {
  if (!颜色) {
    return undefined
  }
  const 值 = 颜色.trim().toLowerCase()
  if (值 === '' || 值 === 'transparent' || 值 === 'inherit' || 值 === 'initial' || 值 === 'currentcolor') {
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
  return undefined
}

/** 把 CSS 长度转换为磅值，Office 字号以磅为单位 */
export function 长度转磅(长度: string | undefined | null): number | undefined {
  if (!长度) {
    return undefined
  }
  const 值 = 长度.trim().toLowerCase()
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

  const 新格式: 格式状态 = {
    加粗:
      父格式.加粗 ||
      标签 === 'B' ||
      标签 === 'STRONG' ||
      字重 === 'bold' ||
      字重 === 'bolder' ||
      (/^\d+$/.test(字重) && Number(字重) >= 600),
    倾斜: 父格式.倾斜 || 标签 === 'I' || 标签 === 'EM' || 样式.fontStyle === 'italic',
    下划线: 父格式.下划线 || 标签 === 'U' || 样式.textDecorationLine.includes('underline') || 样式.textDecoration.includes('underline'),
    删除线:
      父格式.删除线 ||
      标签 === 'S' ||
      标签 === 'STRIKE' ||
      标签 === 'DEL' ||
      样式.textDecorationLine.includes('line-through') ||
      样式.textDecoration.includes('line-through'),
    颜色: 颜色转十六进制(样式.color) ?? 父格式.颜色,
    底纹: 颜色转十六进制(样式.backgroundColor) ?? 父格式.底纹,
    字号: 长度转磅(样式.fontSize) ?? 父格式.字号,
    字体: 规整字体(样式.fontFamily) ?? 父格式.字体,
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
      未覆盖.add('图片')
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
        return {
          表头: 元素.tagName === 'TH',
          文字: 收集片段(元素, 叠加格式(元素, 初始格式), 未覆盖),
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

  if (标签 === 'BR') {
    // 换行等同于开启新段落，docx 中没有段内软回车的对等概念
    取当前段落(上下文, 0, '左', '无')
    结算段落(上下文)
    return
  }

  if (标签 === 'IMG') {
    上下文.未覆盖.add('图片')
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
  容器.childNodes.forEach((子) => 遍历节点(子, 初始格式, 上下文))

  // 空文档也要给出一个空段落，否则生成的文件结构非法
  if (上下文.段落.length === 0) {
    上下文.段落.push({ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [] })
  }

  return { 段落: 上下文.段落, 未覆盖: Array.from(上下文.未覆盖) }
}
