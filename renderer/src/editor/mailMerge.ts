/** 邮件合并数据源与模板处理。数据只写入文本节点，不参与网页标记解析。 */
export interface 邮件合并数据 {
  字段: string[]
  记录: Record<string, string>[]
}

/** 优先按通用文本编码读取，兼容本机常见的简体中文逗号分隔文件。 */
export function 解码邮件合并字节(字节: Uint8Array): string {
  if (字节[0] === 0xFF && 字节[1] === 0xFE) return new TextDecoder('utf-16le', { fatal: true }).decode(字节)
  if (字节[0] === 0xFE && 字节[1] === 0xFF) return new TextDecoder('utf-16be', { fatal: true }).decode(字节)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(字节)
  } catch {
    try {
      return new TextDecoder('gb18030', { fatal: true }).decode(字节)
    } catch {
      throw new Error('无法识别数据文件编码，请将文件另存为通用文本编码后重试')
    }
  }
}

type 字段状态 = '开始' | '普通' | '引号内' | '引号后'

/** 解析逗号分隔文本，支持双引号包裹的逗号、换行和转义双引号。 */
export function 解析邮件合并CSV(输入: string): 邮件合并数据 {
  const 文本 = 输入.replace(/^\uFEFF/, '')
  if (文本.trim().length === 0) throw new Error('数据源为空，请粘贴或选择包含表头和记录的文件')
  const 行列表: string[][] = []
  let 当前行: string[] = []
  let 当前字段 = ''
  let 状态: 字段状态 = '开始'
  let 行号 = 1
  let 行尾结束 = false

  const 完成字段 = () => {
    当前行.push(当前字段)
    当前字段 = ''
    状态 = '开始'
  }
  const 完成行 = () => {
    完成字段()
    if (!(当前行.length === 1 && 当前行[0] === '')) 行列表.push(当前行)
    当前行 = []
    行尾结束 = true
  }

  for (let 序号 = 0; 序号 < 文本.length; 序号 += 1) {
    const 字符 = 文本[序号]
    if (状态 === '引号内') {
      if (字符 === '"') {
        if (文本[序号 + 1] === '"') {
          当前字段 += '"'
          序号 += 1
        } else {
          状态 = '引号后'
        }
      } else {
        当前字段 += 字符
        if (字符 === '\n' || 字符 === '\r') 行号 += 1
      }
      行尾结束 = false
      continue
    }
    if (字符 === ',') {
      完成字段()
      行尾结束 = false
      continue
    }
    if (字符 === '\r' || 字符 === '\n') {
      完成行()
      if (字符 === '\r' && 文本[序号 + 1] === '\n') 序号 += 1
      行号 += 1
      continue
    }
    if (字符 === '"') {
      if (状态 !== '开始') throw new Error(`第 ${行号} 行双引号位置无效`)
      状态 = '引号内'
    } else if (状态 === '引号后') {
      throw new Error(`第 ${行号} 行双引号位置无效`)
    } else {
      当前字段 += 字符
      状态 = '普通'
    }
    行尾结束 = false
  }
  if (状态 === '引号内') throw new Error(`第 ${行号} 行双引号未闭合`)
  if (!行尾结束) 完成行()

  const 表头 = 行列表.shift()
  if (!表头) throw new Error('数据源为空，请粘贴或选择包含表头和记录的文件')
  const 字段 = 表头.map((项) => 项.trim())
  if (字段.some((项) => 项.length === 0)) throw new Error('字段名不能为空，请检查第一行表头')
  if (new Set(字段).size !== 字段.length) throw new Error('字段名重复，请检查第一行表头')
  if (行列表.length === 0) throw new Error('数据源至少包含一条记录')
  const 记录 = 行列表.map((行, 序号) => {
    if (行.length !== 字段.length) throw new Error(`第 ${序号 + 2} 行字段数量不一致，应为 ${字段.length} 项`)
    return Object.fromEntries(字段.map((名称, 索引) => [名称, 行[索引]]))
  })
  return { 字段, 记录 }
}

interface 文本位置 {
  节点: Text
  起点: number
  终点: number
  段落: Element
}

interface 占位符 {
  名称: string
  起点: number
  终点: number
}

const 块元素 = 'p,div,li,td,th,h1,h2,h3,h4,h5,h6,blockquote,pre'

function 收集文本(根: HTMLElement): { 位置: 文本位置[]; 全文: string } {
  const 位置: 文本位置[] = []
  let 全文 = ''
  const 遍历器 = document.createTreeWalker(根, NodeFilter.SHOW_TEXT)
  let 当前节点 = 遍历器.nextNode()
  while (当前节点) {
    const 节点 = 当前节点 as Text
    const 父级 = 节点.parentElement
    if (父级 && !父级.closest('script,style')) {
      const 内容 = 节点.textContent ?? ''
      位置.push({ 节点, 起点: 全文.length, 终点: 全文.length + 内容.length, 段落: 父级.closest(块元素) ?? 根 })
      全文 += 内容
    }
    当前节点 = 遍历器.nextNode()
  }
  return { 位置, 全文 }
}

function 找占位符(全文: string, 位置: 文本位置[], 字段: string[]): 占位符[] {
  const 正则 = /{{\s*([^{}]+?)\s*}}/g
  const 占位符列表: 占位符[] = []
  let 匹配: RegExpExecArray | null
  while ((匹配 = 正则.exec(全文)) !== null) {
    const 名称 = 匹配[1].trim()
    const 起点 = 匹配.index
    const 终点 = 起点 + 匹配[0].length
    const 首节点 = 位置.find((项) => 项.起点 <= 起点 && 起点 < 项.终点)
    const 尾节点 = 位置.find((项) => 项.起点 < 终点 && 终点 <= 项.终点)
    if (!首节点 || !尾节点 || 首节点.段落 !== 尾节点.段落) {
      throw new Error(`字段「${名称}」的占位符不能跨段落`)
    }
    if (!字段.includes(名称)) throw new Error(`模板字段「${名称}」不在数据源表头中`)
    占位符列表.push({ 名称, 起点, 终点 })
  }
  if (占位符列表.length === 0) throw new Error('模板中没有字段占位符，请使用 {{字段名}} 插入字段')
  let 剩余 = 全文
  for (const 项 of [...占位符列表].reverse()) 剩余 = 剩余.slice(0, 项.起点) + 剩余.slice(项.终点)
  if (剩余.includes('{{') || 剩余.includes('}}')) throw new Error('占位符格式无效，请使用 {{字段名}}')
  return 占位符列表
}

function 读取模板(模板Html: string, 字段: string[]) {
  const 根 = document.createElement('div')
  根.innerHTML = 模板Html
  const { 位置, 全文 } = 收集文本(根)
  return { 根, 位置, 占位符列表: 找占位符(全文, 位置, 字段) }
}

/** 校验模板字段并按首次出现顺序返回字段名。 */
export function 分析邮件合并模板(模板Html: string, 字段: string[]): string[] {
  const { 占位符列表 } = 读取模板(模板Html, 字段)
  return [...new Set(占位符列表.map((项) => 项.名称))]
}

/** 合并一条记录；原模板和记录对象都不修改。 */
export function 合并邮件记录(模板Html: string, 记录: Record<string, string>, 字段: string[]): string {
  const { 根, 位置, 占位符列表 } = 读取模板(模板Html, 字段)
  for (const 项 of [...占位符列表].reverse()) {
    if (!Object.prototype.hasOwnProperty.call(记录, 项.名称)) throw new Error(`当前记录缺少字段「${项.名称}」`)
    const 值 = 记录[项.名称]
    const 首索引 = 位置.findIndex((节点) => 节点.起点 <= 项.起点 && 项.起点 < 节点.终点)
    const 尾索引 = 位置.findIndex((节点) => 节点.起点 < 项.终点 && 项.终点 <= 节点.终点)
    const 首 = 位置[首索引]
    const 尾 = 位置[尾索引]
    const 前文 = (首.节点.textContent ?? '').slice(0, 项.起点 - 首.起点)
    const 后文 = (尾.节点.textContent ?? '').slice(项.终点 - 尾.起点)
    if (首索引 === 尾索引) {
      首.节点.textContent = 前文 + 值 + 后文
    } else {
      首.节点.textContent = 前文 + 值
      for (let 索引 = 首索引 + 1; 索引 < 尾索引; 索引 += 1) 位置[索引].节点.textContent = ''
      尾.节点.textContent = 后文
    }
  }
  return 根.innerHTML
}

/** 为每条记录生成一页，在独立的新文档中保留模板原文。 */
export function 生成邮件合并文档(模板Html: string, 数据: 邮件合并数据): string {
  分析邮件合并模板(模板Html, 数据.字段)
  if (数据.记录.length === 0) throw new Error('数据源至少包含一条记录')
  return 数据.记录.map((记录) => 合并邮件记录(模板Html, 记录, 数据.字段))
    .join('<div class="wps-page-break"></div>')
}
