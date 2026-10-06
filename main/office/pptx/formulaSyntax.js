// 公式线性语法：渲染端与主进程共用的纯函数模块。
// 本文件不得依赖 Node 或浏览器环境（不使用 Buffer、sax、DOM），只做字符串与节点树处理。

/** 常用希腊字母与数学符号：写入原生文本，读取时以该 Unicode 字符为准（规范形式）。 */
const 宏表 = {
  '\\pi': 'π', '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω', '\\Delta': 'Δ',
  '\\Omega': 'Ω', '\\times': '×', '\\div': '÷', '\\pm': '±', '\\le': '≤', '\\ge': '≥',
  '\\ne': '≠', '\\approx': '≈', '\\infty': '∞', '\\cdot': '·', '\\sum': '∑', '\\in': '∈',
}
const 支持的宏 = Object.keys(宏表).sort((甲, 乙) => 乙.length - 甲.length)
const 单字符参数 = (文本) => 文本.length === 1 && /[0-9A-Za-z\u4e00-\u9fa5π]/.test(文本)

// 外部办公软件把数学变量写成「数学字母数字符号」区段（如 𝑎=U+1D44E、𝜋=U+1D70B）。
// 读取时规范回基础字符，保证恢复出的表达式可继续编辑，并让本机再次写入后保持稳定。
const 数学字母区段 = [
  [0x1D400, '大写'], [0x1D41A, '小写'], [0x1D434, '大写'], [0x1D44E, '小写'],
  [0x1D468, '大写'], [0x1D482, '小写'], [0x1D5A0, '大写'], [0x1D5BA, '小写'],
  [0x1D5D4, '大写'], [0x1D5EE, '小写'], [0x1D670, '大写'], [0x1D68A, '小写'],
  [0x1D7CE, '数字'], [0x1D7D8, '数字'], [0x1D7E2, '数字'], [0x1D7EC, '数字'], [0x1D7F6, '数字'],
]
const 数学字符表 = new Map()
for (const [起始, 类别] of 数学字母区段) {
  const 基数 = 类别 === '大写' ? 0x41 : 类别 === '小写' ? 0x61 : 0x30
  const 数量 = 类别 === '数字' ? 10 : 26
  for (let i = 0; i < 数量; i++) 数学字符表.set(起始 + i, String.fromCharCode(基数 + i))
}
for (let i = 0; i < 25; i++) 数学字符表.set(0x1D6FC + i, String.fromCodePoint(0x3B1 + i))

/** 把数学字母数字符号规范为基础字符；未收录的区段保持原样。 */
function 规范数学字符(文本) {
  if (typeof 文本 !== 'string' || !文本) return 文本
  let 结果 = ''
  for (const 字符 of 文本) 结果 += 数学字符表.get(字符.codePointAt(0)) ?? 字符
  return 结果
}

/** 宏名必须是完整命令：`\int` 不能被当成 `\in` 加字母 t。 */
function 匹配宏(文本, 位置) {
  return 支持的宏.find((项) => 文本.startsWith(项, 位置) && !/[A-Za-z]/.test(文本[位置 + 项.length] ?? '')) ?? null
}

/** 解析为节点列表；不支持的语法直接抛错，不静默降级。 */
function 解析节点列表(文本, 游标, 期望结束) {
  const 节点 = []
  const 追加文本 = (字符) => {
    const 末 = 节点[节点.length - 1]
    if (末 && 末.类型 === '文本') 末.文本 += 字符
    else 节点.push({ 类型: '文本', 文本: 字符 })
  }
  const 取参数 = () => {
    if (文本[游标.位置] === '{') {
      游标.位置 += 1
      const 结果 = 解析节点列表(文本, 游标, '}')
      if (文本[游标.位置] !== '}') throw new Error('公式括号不匹配')
      游标.位置 += 1
      return 结果
    }
    const 字符 = 文本[游标.位置]
    if (字符 === undefined) throw new Error('公式语法不完整：缺少参数')
    if (字符 === '}') throw new Error('公式括号不匹配')
    if (字符 === '\\') {
      const 宏 = 匹配宏(文本, 游标.位置)
      if (!宏) throw new Error(`公式语法不支持：${文本.slice(游标.位置).match(/^\\[A-Za-z]+/)?.[0] ?? 字符}`)
      游标.位置 += 宏.length
      return [{ 类型: '文本', 文本: 宏表[宏] }]
    }
    游标.位置 += 1
    return [{ 类型: '文本', 文本: 字符 }]
  }
  const 取底数 = () => {
    const 末 = 节点.pop()
    if (!末) throw new Error('公式语法不完整：缺少底数')
    if (末.类型 === '文本' && 末.文本.length > 1) {
      const 剩余 = 末.文本.slice(0, -1)
      if (剩余) 节点.push({ 类型: '文本', 文本: 剩余 })
      return [{ 类型: '文本', 文本: 末.文本.slice(-1) }]
    }
    return [末]
  }
  while (游标.位置 < 文本.length) {
    const 字符 = 文本[游标.位置]
    if (期望结束 && 字符 === 期望结束) break
    if (字符 === '}') throw new Error('公式括号不匹配')
    if (字符 === '{') throw new Error('公式语法不支持：未配对的左括号')
    if (字符 === '\\') {
      const 宏 = 匹配宏(文本, 游标.位置)
      if (宏) { 游标.位置 += 宏.length; 追加文本(宏表[宏]); continue }
      if (文本.startsWith('\\frac', 游标.位置)) {
        游标.位置 += 5
        const 分子 = 取参数()
        if (文本[游标.位置] !== '{') throw new Error('公式语法不完整：分数缺少分母')
        游标.位置 += 1
        const 分母 = 解析节点列表(文本, 游标, '}')
        if (文本[游标.位置] !== '}') throw new Error('公式括号不匹配')
        游标.位置 += 1
        节点.push({ 类型: '分数', 分子, 分母 })
        continue
      }
      if (文本.startsWith('\\sqrt', 游标.位置)) {
        游标.位置 += 5
        节点.push({ 类型: '根号', 内容: 取参数() })
        continue
      }
      const 名称 = 文本.slice(游标.位置).match(/^\\[A-Za-z]+/)?.[0] ?? 文本[游标.位置]
      throw new Error(`公式语法不支持：${名称}`)
    }
    if (字符 === '^' || 字符 === '_') {
      游标.位置 += 1
      const 成对 = 字符 === '^' ? '下标' : '上标'
      const 末 = 节点[节点.length - 1]
      if (末 && 末.类型 === 成对) {
        节点.pop()
        const 参数 = 取参数()
        节点.push({ 类型: '上下标', 底: 末.底, 下: 字符 === '_' ? 参数 : 末.下, 幂: 字符 === '^' ? 参数 : 末.幂 })
        continue
      }
      const 底 = 取底数()
      const 参数 = 取参数()
      节点.push({ 类型: 字符 === '^' ? '上标' : '下标', 底, ...(字符 === '^' ? { 幂: 参数 } : { 下: 参数 }) })
      continue
    }
    游标.位置 += 1
    追加文本(字符)
  }
  return 节点
}

function 校验公式(表达式) {
  if (typeof 表达式 !== 'string' || 表达式.trim().length === 0) throw new Error('公式表达式不能为空')
  if (表达式.length > 1000) throw new Error('公式表达式过长，请拆分后再插入')
  解析节点列表(表达式, { 位置: 0 }, null)
}

function 解析公式表达式(表达式) {
  校验公式(表达式)
  return 解析节点列表(表达式, { 位置: 0 }, null)
}

const 转义 = (文本) => String(文本).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const 列表Xml = (列表) => (列表 ?? []).map(节点Xml).join('')

function 节点Xml(节点) {
  if (节点.类型 === '文本') return `<m:r><m:t xml:space="preserve">${转义(节点.文本)}</m:t></m:r>`
  if (节点.类型 === '上标') return `<m:sSup><m:e>${列表Xml(节点.底)}</m:e><m:sup>${列表Xml(节点.幂)}</m:sup></m:sSup>`
  if (节点.类型 === '下标') return `<m:sSub><m:e>${列表Xml(节点.底)}</m:e><m:sub>${列表Xml(节点.下)}</m:sub></m:sSub>`
  if (节点.类型 === '上下标') return `<m:sSubSup><m:e>${列表Xml(节点.底)}</m:e><m:sub>${列表Xml(节点.下)}</m:sub><m:sup>${列表Xml(节点.幂)}</m:sup></m:sSubSup>`
  if (节点.类型 === '分数') return `<m:f><m:num>${列表Xml(节点.分子)}</m:num><m:den>${列表Xml(节点.分母)}</m:den></m:f>`
  if (节点.类型 === '根号') return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${列表Xml(节点.内容)}</m:e></m:rad>`
  throw new Error('公式节点无效')
}

const 数学命名空间 = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
const 扩展命名空间 = 'http://schemas.microsoft.com/office/drawing/2010/main'

/** 生成 DrawingML 数学包装，供 `p:txBody` 内的段落使用。 */
function 生成数学Xml(表达式) {
  const 节点 = 解析公式表达式(表达式)
  return `<a14:m xmlns:a14="${扩展命名空间}" xmlns:m="${数学命名空间}"><m:oMathPara><m:oMath>${列表Xml(节点)}</m:oMath></m:oMathPara></a14:m>`
}

module.exports = { 解析公式表达式, 校验公式, 生成数学Xml, 宏表, 单字符参数, 规范数学字符 }
