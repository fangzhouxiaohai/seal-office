const { 校验字段, 非视觉, 转EMU } = require('./shapes')
const { 解析公式表达式, 校验公式, 生成数学Xml, 宏表, 规范数学字符 } = require('./formulaSyntax')

// 公式：受限线性语法（formulaSyntax.js，渲染端与主进程共用）与原生 Office 数学部件（OMML）互转。
// 只支持能够一一映射回原表达式的结构：文本、上下标、分数、根号。
// 其他结构（矩阵、求和、极限、积分等）在写入前明确拒绝，读取时返回空以提示未完整导入，
// 不使用图片或纯文本冒充可编辑公式。

const 单字符参数 = (文本) => 文本.length === 1 && /[0-9A-Za-z\u4e00-\u9fa5π]/.test(文本)
const 带花括号 = (文本) => (单字符参数(文本) ? 文本 : `{${文本}}`)
const 取子 = (节点, 名称) => 节点.子.find((项) => 项.名称 === 名称)
const 取文本 = (节点) => (节点 ? 规范数学字符(节点.子.filter((项) => 项.名称 === 'm:t').map((项) => 项.文本).join('')) : '')
const 转像素 = (值) => Number(值) / 12700
const 属性 = (标签, 键) => 标签?.match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]

function 解析Xml树(xml) {
  const sax = require('sax')
  const 根 = { 名称: '#root', 属性: {}, 子: [], 文本: '' }
  const 栈 = [根]
  const 解析器 = sax.parser(true)
  解析器.onerror = () => { throw new Error('公式数学部件结构损坏') }
  解析器.ondoctype = () => { throw new Error('公式数学部件结构损坏') }
  解析器.onopentag = (标签) => {
    const 节点 = { 名称: 标签.name, 属性: 标签.attributes, 子: [], 文本: '' }
    栈[栈.length - 1].子.push(节点)
    栈.push(节点)
  }
  解析器.onclosetag = () => { 栈.pop() }
  解析器.ontext = (文本) => { 栈[栈.length - 1].文本 += 文本 }
  解析器.oncdata = (文本) => { 栈[栈.length - 1].文本 += 文本 }
  解析器.write(xml).close()
  if (栈.length !== 1) throw new Error('公式数学部件结构损坏')
  return 根
}

function 查找数学根(节点) {
  for (const 子 of 节点.子) {
    if (子.名称 === 'm:oMath' || 子.名称 === 'm:oMathPara') return 子
    const 深层 = 查找数学根(子)
    if (深层) return 深层
  }
  return null
}

/** 读取受限线性表达式；遇到本机不支持的原生数学结构返回 null。 */
function 读取数学表达式(xml) {
  if (typeof xml !== 'string' || !/<m:/.test(xml)) return null
  let 根
  try { 根 = 解析Xml树(xml) } catch { return null }
  const 序列求值 = (节点) => {
    if (!节点) throw new Error('unsupported')
    return 节点.子.map(求值).join('')
  }
  const 求值 = (节点) => {
    const 名称 = 节点.名称
    if (名称 === 'm:r') return 取文本(节点)
    if (名称 === 'm:oMath' || 名称 === 'm:oMathPara') return 序列求值(节点)
    if (名称 === 'm:sSup') return 序列求值(取子(节点, 'm:e')) + '^' + 带花括号(序列求值(取子(节点, 'm:sup')))
    if (名称 === 'm:sSub') return 序列求值(取子(节点, 'm:e')) + '_' + 带花括号(序列求值(取子(节点, 'm:sub')))
    if (名称 === 'm:sSubSup') return 序列求值(取子(节点, 'm:e')) + '_{' + 序列求值(取子(节点, 'm:sub')) + '}^' + '{' + 序列求值(取子(节点, 'm:sup')) + '}'
    if (名称 === 'm:f') return `\\frac{${序列求值(取子(节点, 'm:num'))}}{${序列求值(取子(节点, 'm:den'))}}`
    if (名称 === 'm:rad') {
      const 次数 = 取子(节点, 'm:deg')
      if (次数 && 序列求值(次数)) throw new Error('unsupported')
      return `\\sqrt{${序列求值(取子(节点, 'm:e'))}}`
    }
    throw new Error('unsupported')
  }
  try {
    const 数学根 = 查找数学根(根)
    if (!数学根) return null
    const 结果 = 数学根.名称 === 'm:oMathPara' ? 序列求值(取子(数学根, 'm:oMath')) : 序列求值(数学根)
    return 结果.length ? 结果 : null
  } catch { return null }
}

/** 公式对象：受限语法与原生数学部件同时保存。 */
function 校验公式对象(对象) {
  校验字段(对象, ['id', '类型', 'x', 'y', 'width', 'height', '旋转', '锁定', '公式', '子对象标识'])
  if (对象.子对象标识 !== undefined) throw new Error('公式不能携带组合成员')
  if (对象.旋转) throw new Error('原生公式暂不支持旋转')
  校验字段(对象.公式, ['表达式', '字号', '颜色'])
  if (!Number.isFinite(对象.公式.字号) || 对象.公式.字号 <= 0) throw new Error('公式字号无效')
  if (typeof 对象.公式.颜色 !== 'string' || !/^#[0-9a-f]{6}$/i.test(对象.公式.颜色)) throw new Error('公式颜色无效')
  if (![对象.x, 对象.y, 对象.width, 对象.height].every(Number.isFinite) || 对象.width <= 0 || 对象.height <= 0) throw new Error('公式位置或尺寸无效')
  校验公式(对象.公式.表达式)
}

function 写入公式对象(对象, 编号) {
  校验公式对象(对象)
  const 数学 = 生成数学Xml(对象.公式.表达式)
  const 锁 = 对象.锁定 ? 1 : 0
  return `<p:sp><p:nvSpPr>${非视觉(对象, 编号)}<p:cNvSpPr><a:spLocks noMove="${锁}" noResize="${锁}"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/>${数学}<a:endParaRPr lang="zh-CN" sz="${Math.round(对象.公式.字号 * 100)}"><a:solidFill><a:srgbClr val="${对象.公式.颜色.slice(1).toUpperCase()}"/></a:solidFill></a:endParaRPr></a:p></p:txBody></p:sp>`
}

/** 从形状片段取出本机公式表达式；外部改写过或含不支持结构时返回 null。 */
function 读取公式表达式(片段) {
  const 数学 = 片段.match(/<a14:m\b[\s\S]*?<\/a14:m>/)?.[0]
  if (!数学) return null
  return 读取数学表达式(数学)
}

/**
 * 外部软件改写过公式形状后，本机无法按原样重建，但仍可按原生数学部件恢复表达式。
 * 恢复时明确提示外观差异，不使用近似文本代替；数学结构不支持时保持未导入状态。
 */
function 读取剩余公式(xml) {
  const 对象列表 = [], 警告 = new Set()
  let 剩余 = xml
  for (const 匹配 of xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)) {
    const 片段 = 匹配[0]
    if (!/<a14:m\b/.test(片段)) continue
    const 表达式 = 读取公式表达式(片段)
    if (!表达式) { 警告.add('公式含本机不支持的结构，未完整导入'); continue }
    const 位置 = 片段.match(/<a:off\b[^>]*>/)?.[0] ?? ''
    const 尺寸 = 片段.match(/<a:ext\b[^>]*>/)?.[0] ?? ''
    const 名称标签 = 片段.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
    const 稳定标识 = 属性(名称标签, 'name')
    const id = (稳定标识?.startsWith('seal-id:') ? Buffer.from(稳定标识.slice('seal-id:'.length), 'base64url').toString('utf8') : null)
      ?? `formula-${属性(名称标签, 'id') ?? 对象列表.length}`
    const 字号 = Number(属性(片段.match(/<a:endParaRPr\b[^>]*>/)?.[0] ?? '', 'sz') ?? 2800) / 100
    const 颜色 = `#${(片段.match(/<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/)?.[1] ?? '1A1D24').toUpperCase()}`
    对象列表.push({
      id, 类型: '公式',
      x: 转像素(属性(位置, 'x') ?? 0), y: 转像素(属性(位置, 'y') ?? 0),
      width: 转像素(属性(尺寸, 'cx') ?? 0), height: 转像素(属性(尺寸, 'cy') ?? 0),
      公式: { 表达式, 字号: Math.min(Math.max(Math.round(字号), 8), 96), 颜色 },
    })
    剩余 = 剩余.replace(片段, '')
    警告.add('公式已被外部修改，已按原生数学部件重新导入，外观按本机样式显示')
  }
  return { 对象列表, 警告: Array.from(警告), 剩余 }
}

module.exports = { 解析公式表达式, 生成数学Xml, 读取数学表达式, 读取公式表达式, 读取剩余公式, 校验公式, 校验公式对象, 写入公式对象, 宏表 }
