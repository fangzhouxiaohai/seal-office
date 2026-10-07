// docx 读取模块：直接解析 OOXML（document.xml）生成带内联样式的 HTML。
// 相比 mammoth 的语义化输出，直接解析保留颜色、字号、字体、加粗、斜体、
// 下划线、删除线、对齐、标题与列表，使「保存后再次打开」的格式不丢失。
const JSZip = require('jszip')
const path = require('path')
const { 缩进字段, 间距字段, 扩展字段, 属性有效 } = require('./paragraphProperties')
const { 读取正文图片 } = require('./docxImages')

const 纸张尺寸 = { A4: [11906, 16838], A5: [8391, 11906], B5: [9979, 14173], Letter: [12240, 15840] }
const 预设边距 = { 常规: [1440, 1350], 窄: [540, 540], 适中: [1440, 1080], 宽: [1440, 2160] }

/** 十六进制颜色补齐 6 位并转为 #RRGGBB 形式 */
function 规整颜色(值) {
  if (typeof 值 !== 'string') return null
  const 文本 = 值.trim().toUpperCase().replace(/^#/, '')
  if (/^[0-9A-F]{6}$/.test(文本)) return `#${文本}`
  if (/^[0-9A-F]{3}$/.test(文本)) return `#${文本[0]}${文本[0]}${文本[1]}${文本[1]}${文本[2]}${文本[2]}`
  return null
}

/** 转义 HTML 特殊字符，防止文档内容破坏页面结构 */
function 转义(文本) {
  return 文本.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[字符]))
}

/** 提取某段 XML 里第一个 <标签 ... 属性="值"> 的属性值 */
function 取属性(片段, 标签, 属性) {
  const 匹配 = 片段.match(new RegExp(`<${标签}(?=[\\s/>])[^>]*\\s${属性}="([^"]*)"`, 'i'))
  return 匹配 === null ? null : 匹配[1]
}

/** 判断某个子标签是否出现（带 w: 命名空间前缀） */
const 存在 = (片段, 标签) => new RegExp(`<w:${标签}[\\s/>]`, 'i').test(片段)

/** 只恢复编辑器有对应显示和保存能力的页面预设；其余格式明确警告。 */
function 解析页面设置(documentXml, 警告) {
  const 节 = documentXml.match(/<w:sectPr(?:\s[^>]*)?>([\s\S]*?)<\/w:sectPr>/i)?.[1]
  if (节 === undefined) return undefined
  // OOXML 允许省略页面尺寸和页边距，省略表示使用 Word 默认值。
  const 尺寸标签 = 节.match(/<w:pgSz(?=[\s/>])[^>]*>/i)?.[0] ?? '<w:pgSz w:w="12240" w:h="15840"/>'
  const 边距标签 = 节.match(/<w:pgMar(?=[\s/>])[^>]*>/i)?.[0] ?? '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
  const 方向 = 取属性(尺寸标签, 'w:pgSz', 'w:orient') === 'landscape' ? '横向' : '纵向'
  const 宽 = Number(取属性(尺寸标签, 'w:pgSz', 'w:w'))
  const 高 = Number(取属性(尺寸标签, 'w:pgSz', 'w:h'))
  const 纸张 = Object.entries(纸张尺寸).find(([, [预设宽, 预设高]]) =>
    Math.abs(宽 - (方向 === '横向' ? 预设高 : 预设宽)) <= 12 &&
    Math.abs(高 - (方向 === '横向' ? 预设宽 : 预设高)) <= 12)?.[0]
  const 上 = Number(取属性(边距标签, 'w:pgMar', 'w:top'))
  const 下 = Number(取属性(边距标签, 'w:pgMar', 'w:bottom'))
  const 左 = Number(取属性(边距标签, 'w:pgMar', 'w:left'))
  const 右 = Number(取属性(边距标签, 'w:pgMar', 'w:right'))
  const 页边距 = Object.entries(预设边距).find(([, [纵, 横]]) =>
    [上, 下].every((值) => Math.abs(值 - 纵) <= 12) &&
    [左, 右].every((值) => Math.abs(值 - 横) <= 12))?.[0]
  if (![宽, 高].every((值) => Number.isInteger(值) && 值 > 0 && 值 <= 50000) ||
      ![上, 右, 下, 左].every((值) => Number.isInteger(值) && 值 >= 0 && 值 <= 20000)) {
    警告.push('自定义页面设置未完整导入')
    return undefined
  }
  const 分栏标签 = 节.match(/<w:cols(?=[\s/>])[^>]*>/i)?.[0] ?? ''
  const 栏数 = Number(取属性(分栏标签, 'w:cols', 'w:num') ?? '1')
  const 不等宽 = 取属性(分栏标签, 'w:cols', 'w:equalWidth') === '0'
  const 栏宽 = [...节.matchAll(/<w:col(?=[\s/>])[^>]*>/gi)].map((项) => Number(取属性(项[0], 'w:col', 'w:w')))
  const 分栏 = 不等宽 && 栏宽.length === 2 && 栏宽.every(Number.isFinite)
    ? 栏宽[0] < 栏宽[1] ? '偏左' : '偏右'
    : 栏数 === 1 ? '一栏' : 栏数 === 2 ? '两栏' : 栏数 === 3 ? '三栏' : null
  const 边框标签 = 节.match(/<w:(?:top|left|right|bottom)(?=[\s/>])[^>]*>/i)?.[0] ?? ''
  const 边框样式 = 边框标签 ? 取属性(边框标签, (边框标签.match(/^<([^\s/>]+)/)?.[1] ?? ''), 'w:val') : null
  const 页面边框 = !存在(节, 'pgBorders') ? '无'
    : 边框样式 === 'single' ? '方框'
      : 边框样式 === 'outset' ? '阴影'
        : 边框样式 === 'threeDEmboss' ? '三维' : null
  const 方向值 = 取属性(节, 'w:textDirection', 'w:val')
  const 文字方向 = 方向值 === 'tbRl' ? '竖排' : '横排'
  const 背景值 = 取属性(documentXml, 'w:background', 'w:color')
  const 页面颜色 = 背景值 ? 规整颜色(背景值) : '无'
  if (!分栏 || !页面边框 || !页面颜色 || (方向值 && !['lrTb', 'tbRl'].includes(方向值))) {
    警告.push('自定义页面设置未完整导入')
    return undefined
  }
  if ((documentXml.match(/<w:sectPr(?=[\s>])/gi) ?? []).length > 1) 警告.push('多分节页面设置未完整导入')
  return {
    纸张: 纸张 ?? '自定义', 纸张方向: 方向,
    页边距: 页边距 ?? '自定义', 分栏, 页面边框, 页面颜色, 文字方向, 水印: '无',
    ...(纸张 ? {} : { 原始纸张: { 宽, 高 } }),
    ...(页边距 ? {} : { 原始页边距: { 上, 右, 下, 左 } }),
  }
}

/** OOXML 开关属性可以是空标签或 1/0、true/false、on/off。 */
function 读取开关(片段, 标签) {
  const 匹配 = 片段.match(new RegExp(`<w:${标签}(?=[\\s/>])([^>]*)>`, 'i'))
  if (匹配 === null) return undefined
  const 值 = 取属性(匹配[0], `w:${标签}`, 'w:val')
  if (值 === null) return true
  if (/^(1|true|on)$/i.test(值)) return true
  if (/^(0|false|off)$/i.test(值)) return false
  throw new Error(`文字文档字符格式 ${标签} 的取值无效`)
}

/** 解析可叠加的字符属性，保留显式关闭值以覆盖样式继承。 */
function 提取字符配置(rPr) {
  if (!rPr) return {}
  const 配置 = {}
  const 加粗 = 读取开关(rPr, 'b')
  const 倾斜 = 读取开关(rPr, 'i')
  const 删除线 = 读取开关(rPr, 'strike')
  const 下划线标签 = rPr.match(/<w:u(?=[\s/>])([^>]*)>/i)
  if (加粗 !== undefined) 配置.加粗 = 加粗
  if (倾斜 !== undefined) 配置.倾斜 = 倾斜
  if (删除线 !== undefined) 配置.删除线 = 删除线
  if (下划线标签 !== null) {
    配置.下划线 = !/^(none|0|false|off)$/i.test(取属性(下划线标签[0], 'w:u', 'w:val') ?? 'single')
  }
  const 颜色 = 规整颜色(取属性(rPr, 'w:color', 'w:val'))
  if (颜色 !== null) 配置.颜色 = 颜色
  const 底纹 = 规整颜色(取属性(rPr, 'w:shd', 'w:fill'))
  if (底纹 !== null) 配置.底纹 = 底纹
  const 半磅 = 取属性(rPr, 'w:sz', 'w:val')
  if (半磅 !== null && /^\d+$/.test(半磅)) 配置.字号 = Number(半磅) / 2
  const 字体 = 取属性(rPr, 'w:rFonts', 'w:eastAsia') ?? 取属性(rPr, 'w:rFonts', 'w:ascii')
  if (字体) 配置.字体 = 字体
  const 基线 = 取属性(rPr, 'w:vertAlign', 'w:val')
  if (基线 === 'superscript' || 基线 === 'subscript' || 基线 === 'baseline') 配置.基线 = 基线
  // w:spacing 出现在字符属性里表示字间距（单位二十分之一磅），与段落间距同名不同义
  const 字间距 = 取属性(rPr, 'w:spacing', 'w:val')
  if (字间距 !== null && /^-?\d+$/.test(字间距) && Number(字间距) !== 0) 配置.字间距 = Number(字间距) / 20
  return 配置
}

/** 把叠加后的字符属性转为内联样式。 */
function 生成字符样式(配置) {
  let 样式 = ''
  if (配置.加粗 !== undefined) 样式 += `font-weight:${配置.加粗 ? '600' : 'normal'};`
  if (配置.倾斜 !== undefined) 样式 += `font-style:${配置.倾斜 ? 'italic' : 'normal'};`
  if (配置.下划线 !== undefined || 配置.删除线 !== undefined) {
    const 装饰 = [配置.下划线 ? 'underline' : '', 配置.删除线 ? 'line-through' : ''].filter(Boolean).join(' ')
    样式 += `text-decoration:${装饰 || 'none'};`
  }
  if (配置.颜色) 样式 += `color:${配置.颜色};`
  if (配置.底纹) 样式 += `background-color:${配置.底纹};`
  if (配置.字号) 样式 += `font-size:${配置.字号}pt;`
  if (配置.字体) 样式 += `font-family:'${配置.字体}';`
  if (配置.字间距) 样式 += `letter-spacing:${配置.字间距}pt;`
  if (配置.基线) 样式 += `vertical-align:${配置.基线 === 'superscript' ? 'super' : 配置.基线 === 'subscript' ? 'sub' : 'baseline'};`
  return 样式
}

/** 把 run 属性（w:rPr）及继承的段落/字符样式解析为字符级样式。 */
function 解析字符属性(rPr, 继承配置 = {}) {
  const 配置 = { ...继承配置, ...提取字符配置(rPr) }
  return { 样式: 生成字符样式(配置), 加粗: 配置.加粗 === true }
}

/** 读取 styles.xml 的文档默认值、段落样式和字符样式。 */
function 解析样式定义(stylesXml) {
  if (typeof stylesXml !== 'string') return { 默认字符: {}, 默认段落属性: '', 默认段落样式: null, 定义: new Map() }
  const 默认片段 = stylesXml.match(/<w:rPrDefault(?:\s[^>]*)?>([\s\S]*?)<\/w:rPrDefault>/i)?.[1] ?? ''
  const 默认字符 = 提取字符配置(默认片段.match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/i)?.[1] ?? '')
  const 默认段落片段 = stylesXml.match(/<w:pPrDefault(?:\s[^>]*)?>([\s\S]*?)<\/w:pPrDefault>/i)?.[1] ?? ''
  const 默认段落属性 = 默认段落片段.match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/i)?.[1] ?? ''
  const 定义 = new Map()
  let 默认段落样式 = null
  const 样式正则 = /<w:style(?=[\s>])([^>]*)>([\s\S]*?)<\/w:style>/gi
  let 匹配
  while ((匹配 = 样式正则.exec(stylesXml)) !== null) {
    const 标识 = 取属性(匹配[0], 'w:style', 'w:styleId')
    if (!标识) continue
    const 类型 = 取属性(匹配[0], 'w:style', 'w:type')
    if (类型 === 'paragraph' && 取属性(匹配[0], 'w:style', 'w:default') === '1') 默认段落样式 = 标识
    const 字符片段 = 匹配[2].match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/i)?.[1] ?? ''
    定义.set(标识, {
      基于: 取属性(匹配[2], 'w:basedOn', 'w:val'),
      字符: 提取字符配置(字符片段),
      段落属性: 匹配[2].match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/i)?.[1] ?? '',
    })
  }
  return { 默认字符, 默认段落属性, 默认段落样式, 定义 }
}

function 解析继承段落(样式定义, 标识, 已访问 = new Set()) {
  if (!标识) return []
  if (已访问.has(标识)) throw new Error('文字文档段落样式循环引用，无法读取')
  const 样式 = 样式定义.定义.get(标识)
  if (!样式) return []
  已访问.add(标识)
  const 继承 = 解析继承段落(样式定义, 样式.基于, 已访问)
  已访问.delete(标识)
  return [...继承, 样式.段落属性]
}

/**
 * 同一组段落属性逐字段继承，避免只设左缩进时丢失继承的右缩进。
 * 段落标记自身的 w:rPr 里会出现同名的 w:spacing（字间距），
 * 它属于字符格式，不参与段落排版合并，也不会被当作段落标签清除。
 */
function 合并段落排版(片段列表) {
  const 字符属性正则 = /(<w:rPr(?=[\s>])[^>]*>[\s\S]*?<\/w:rPr>)/gi
  const 段落标签正则 = /<w:(?:ind|spacing|jc)(?=[\s/>])[^>]*>\s*(?:<\/w:(?:ind|spacing|jc)>)?/gi
  const 定义 = new Map()
  for (const 片段 of 片段列表) {
    // split 带捕获组时会同时返回被捕获的 w:rPr 块，只取偶数下标即段落级片段
    for (const 段落级 of (片段 || '').split(字符属性正则).filter((项, 序号) => 序号 % 2 === 0)) {
      for (const 匹配 of 段落级.matchAll(/<w:(ind|spacing|jc)(?=[\s/>])[^>]*>/gi)) {
        const 标签 = 匹配[1]
        const 属性 = 定义.get(标签) || {}
        const 新属性 = Object.fromEntries([...匹配[0].matchAll(/\s(w:[\w]+)="([^"]*)"/g)].map((项) => [项[1], 项[2]]))
        if ('w:firstLine' in 新属性 || 'w:firstLineChars' in 新属性) {
          delete 属性['w:hanging']
          delete 属性['w:hangingChars']
        }
        if ('w:hanging' in 新属性 || 'w:hangingChars' in 新属性) {
          delete 属性['w:firstLine']
          delete 属性['w:firstLineChars']
        }
        Object.assign(属性, 新属性)
        定义.set(标签, 属性)
      }
    }
  }
  const 合并 = [...定义].map(([标签, 属性]) => `<w:${标签}${Object.entries(属性).map(([键, 值]) => ` ${键}="${值}"`).join('')}/>`).join('')
  const 正文属性 = (片段列表.at(-1) || '')
    .split(字符属性正则)
    .map((块, 序号) => (序号 % 2 === 1 ? 块 : 块.replace(段落标签正则, '')))
    .join('')
  return 合并 + 正文属性
}

function 收集段落格式警告(内容) {
  const 警告 = new Set()
  // 段落标记自身的 w:rPr 里也会出现 w:spacing（字间距），
  // 先剔除字符属性，避免把字间距误判为段落间距丢失。
  const 段落级 = 内容.replace(/<w:rPr(?=[\s>])[^>]*>[\s\S]*?<\/w:rPr>/gi, '')
  for (const 匹配 of 段落级.matchAll(/<w:(ind|spacing)(?=[\s/>])[^>]*>/gi)) {
    const 缩进 = 匹配[1] === 'ind'
    const 字段列表 = 缩进 ? 缩进字段 : 间距字段
    const 别名 = { start: 'left', end: 'right', startChars: 'leftChars', endChars: 'rightChars' }
    for (const 属性 of 匹配[0].matchAll(/\s(w:([\w]+))="([^"]*)"/g)) {
      const 字段 = 别名[属性[2]] || 属性[2]
      const 定义 = 字段列表.find((项) => 项[1] === 字段)
      const 值 = 解析排版值(字段, 属性[3])
      const 有效 = 定义 && 属性有效(字段, 值, 定义[2])
      if (!有效) 警告.add(缩进 ? '段落缩进未完整导入' : '段落间距未完整导入')
    }
  }
  return [...警告]
}

function 解析排版值(字段, 值) {
  if (值 === null) return undefined
  if (字段 === 'lineRule') return 值
  if (字段.endsWith('Autospacing')) {
    if (['1', 'true', 'on'].includes(值)) return true
    if (['0', 'false', 'off'].includes(值)) return false
    return undefined
  }
  return /^-?\d+$/.test(值) ? Number(值) : undefined
}

function 读取原生段落排版(pPr) {
  const 格式 = { 缩进: {}, 间距: {} }
  let 有扩展 = false
  const 别名 = { left: 'start', right: 'end', leftChars: 'startChars', rightChars: 'endChars' }
  for (const [组, 标签, 字段列表] of [['缩进', 'ind', 缩进字段], ['间距', 'spacing', 间距字段]]) {
    const 片段 = pPr.match(new RegExp(`<w:${标签}(?=[\\s/>])[^>]*>`, 'i'))?.[0] || ''
    for (const [名称, 属性, 允许负数] of 字段列表) {
      const 原值 = (别名[属性] ? 取属性(片段, `w:${标签}`, `w:${别名[属性]}`) : null) ?? 取属性(片段, `w:${标签}`, `w:${属性}`)
      const 值 = 解析排版值(属性, 原值)
      if (!属性有效(属性, 值, 允许负数)) continue
      格式[组][名称] = 值
      有扩展 ||= 扩展字段.has(属性)
    }
  }
  return { 格式, 有扩展 }
}

function 解析继承字符(样式定义, 样式标识, 已访问 = new Set()) {
  if (!样式标识) return {}
  if (已访问.has(样式标识)) throw new Error('文字文档样式循环引用，无法读取')
  const 样式 = 样式定义.定义.get(样式标识)
  if (!样式) return {}
  已访问.add(样式标识)
  const 继承 = 解析继承字符(样式定义, 样式.基于, 已访问)
  已访问.delete(样式标识)
  return { ...继承, ...样式.字符 }
}

/** 标题样式名到 HTML 标签的映射（Heading1..Heading6 / 内置中文样式名） */
function 标题标签(样式名) {
  if (typeof 样式名 !== 'string') return null
  const 匹配 = 样式名.match(/^heading\s*([1-6])$/i) ?? 样式名.match(/^标题\s*([1-6])$/)
  return 匹配 === null ? null : `h${匹配[1]}`
}

/**
 * 解析段落属性（w:pPr）中的对齐、标题与列表信息。
 * 列表是否有序由 numbering.xml 的 numFmt 决定（经 编号映射 传入：numId → 'bullet' | 'decimal'）；
 * 无映射信息时按无序列表呈现。
 */
function 解析段落属性(pPr, 编号映射) {
  if (!pPr) return { 标签: 'p', 样式: '', 列表: false, 有编号: false }
  const 对齐 = 取属性(pPr, 'w:jc', 'w:val')
  let 样式 = ''
  if (对齐 === 'center') 样式 += 'text-align:center;'
  else if (对齐 === 'right' || 对齐 === 'end') 样式 += 'text-align:right;'
  else if (对齐 === 'both' || 对齐 === 'justify') 样式 += 'text-align:justify;'
  const { 格式, 有扩展 } = 读取原生段落排版(pPr)
  const 缩进 = 格式.缩进
  const 间距 = 格式.间距
  const 添加缩进 = (名称, 样式名, 符号 = 1) => {
    if (缩进[名称 + '字符'] !== undefined) 样式 += `${样式名}:${缩进[名称 + '字符'] / 100 * 符号}em;`
    else if (缩进[名称] !== undefined) 样式 += `${样式名}:${缩进[名称] / 20 * 符号}pt;`
  }
  添加缩进('左', 'margin-left')
  添加缩进('右', 'margin-right')
  if (缩进.悬挂 !== undefined || 缩进.悬挂字符 !== undefined) 添加缩进('悬挂', 'text-indent', -1)
  else 添加缩进('首行', 'text-indent')
  const 添加段距 = (名称, 样式名) => {
    if (间距[名称 + '行'] !== undefined) {
      const 规则 = 间距.行距规则 || 'auto'
      const 倍数 = 间距[名称 + '行'] / 100
      样式 += 间距.行距 === undefined ? `${样式名}:${倍数}em;`
        : `${样式名}:${倍数 * 间距.行距 / (规则 === 'auto' ? 240 : 20)}${规则 === 'auto' ? 'em' : 'pt'};`
    } else if (间距[名称] !== undefined) 样式 += `${样式名}:${间距[名称] / 20}pt;`
  }
  添加段距('段前', 'margin-top')
  添加段距('段后', 'margin-bottom')
  const 行距 = 间距.行距
  let 行距规则 = null
  if (行距 !== undefined) {
    const 规则 = 间距.行距规则
    if (规则 === undefined || 规则 === 'auto') 样式 += `line-height:${行距 / 240};`
    else if (规则 === 'exact' || 规则 === 'atLeast') {
      样式 += `line-height:${行距 / 20}pt;`
      行距规则 = 规则
    }
  }
  const 样式名 = 取属性(pPr, 'w:pStyle', 'w:val')
  const 标题 = 标题标签(样式名)
  const 列表 = 存在(pPr, 'numPr')
  let 有编号 = false
  if (列表 && 编号映射 !== undefined) {
    const 序号 = 取属性(pPr, 'w:numId', 'w:val')
    有编号 = 编号映射[序号] === 'decimal'
  }
  return { 标签: 标题 ?? 'p', 样式, 列表, 有编号, 行距规则,
    来源排版: 有扩展 ? JSON.stringify({ ...格式, 样式 }) : null }
}

/** 当前版本能写回 DOCX 的域：页码与总页数。其余域代码仍按未导入如实提示。 */
const 支持的域 = new Set(['PAGE', 'NUMPAGES'])

/** 取域指令的关键字（PAGE、NUMPAGES、DATE 等），忽略 \* MERGEFORMAT 之类的开关 */
function 域名称(指令) {
  const 首个 = String(指令 ?? '').trim().split(/\s+/)[0]
  return 首个 === '' ? '' : 首个.toUpperCase()
}

/**
 * 把 <w:fldSimple> 展开成等价的 fldChar 序列，
 * 使正文与页眉页脚共用同一套域解析路径。
 */
function 展开简单域(段落Xml) {
  const 展开 = (指令, 内容) => '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve">${指令}</w:instrText></w:r>` +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    内容 +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
  return 段落Xml
    .replace(/<w:fldSimple(?=[\s>])([^>]*)>([\s\S]*?)<\/w:fldSimple>/gi,
      (整体, 属性, 内容) => 展开(属性.match(/\sw:instr="([^"]*)"/i)?.[1] ?? '', 内容))
    // 没有缓存结果的空域写成自闭合标签，同样要保留成可写回的域
    .replace(/<w:fldSimple(?=[\s>])([^>]*)\/>/gi,
      (整体, 属性) => 展开(属性.match(/\sw:instr="([^"]*)"/i)?.[1] ?? '', ''))
}

/** 判断这段 XML 里是否存在当前无法保留的域代码或制表符 */
function 存在未保留的域或制表符(内容) {
  if (/<w:tab(?=[\s/>])/i.test(内容)) return true
  for (const 匹配 of 内容.matchAll(/<w:fldSimple(?=[\s>])[^>]*\sw:instr="([^"]*)"/gi)) {
    if (!支持的域.has(域名称(匹配[1]))) return true
  }
  for (const 匹配 of 内容.matchAll(/<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi)) {
    if (!支持的域.has(域名称(匹配[1]))) return true
  }
  return false
}

/** 解析一个 <w:p> 段落为 HTML；列表项返回 li 内容由外层聚合 */
function 解析段落(段落Xml, 编号映射, 样式定义) {
  段落Xml = 展开简单域(段落Xml)
  const pPr匹配 = 段落Xml.match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/i)
  const 段落样式 = pPr匹配 === null ? null : 取属性(pPr匹配[1], 'w:pStyle', 'w:val')
  const 实际段落属性 = 样式定义 === undefined ? pPr匹配?.[1] || '' : 合并段落排版([
    样式定义.默认段落属性, ...解析继承段落(样式定义, 段落样式 ?? 样式定义.默认段落样式), pPr匹配?.[1] || '',
  ])
  if (样式定义?.警告) 样式定义.警告.push(...收集段落格式警告(实际段落属性))
  const 段属性 = 解析段落属性(实际段落属性, 编号映射)
  const 继承配置 = 样式定义 === undefined ? {} : {
    ...样式定义.默认字符,
    ...解析继承字符(样式定义, 段落样式 ?? 样式定义.默认段落样式),
  }
  const 片段列表 = []
  // 页码域按 Word 的域结构解析：begin → instrText 指令 → separate → 缓存结果 → end。
  // 能写回的域输出为带标记的占位，保存时重新写成域代码，页码不会被写死。
  let 域 = null
  // 逐个 run 解析：rPr 决定字符样式，w:t 与 w:br 决定内容
  const run正则 = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/gi
  let run匹配
  while ((run匹配 = run正则.exec(段落Xml)) !== null) {
    const runXml = run匹配[1]
    const rPr匹配 = runXml.match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/i)
    const rPr = rPr匹配 === null ? null : rPr匹配[1]
    const 字符样式 = rPr === null || 样式定义 === undefined ? {} : 解析继承字符(样式定义, 取属性(rPr, 'w:rStyle', 'w:val'))
    const { 样式 } = 解析字符属性(rPr, { ...继承配置, ...字符样式 })
    const 文本正则 = /<w:(?:drawing|pict)(?=[\s>])[^>]*>[\s\S]*?<\/w:(?:drawing|pict)>|<w:fldChar(?=[\s/>])[^>]*>|<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:br|cr)(?=[\s/>])[^>]*>/gi
    let 文本匹配
    while ((文本匹配 = 文本正则.exec(runXml)) !== null) {
      const 片段Xml = 文本匹配[0]
      if (/^<w:fldChar/i.test(片段Xml)) {
        const 类型 = 取属性(片段Xml, 'w:fldChar', 'w:fldCharType')
        if (类型 === 'begin') 域 = { 指令: '', 阶段: '指令', 缓存: [], 缓存片段: [], 样式 }
        else if (类型 === 'separate' && 域 !== null) 域.阶段 = '结果'
        else if (类型 === 'end' && 域 !== null) {
          const 名称 = 域名称(域.指令)
          if (支持的域.has(名称)) {
            片段列表.push(`<span data-seal-field="${名称}"${域.样式 === '' ? '' : ` style="${域.样式}"`}>${域.缓存.join('')}</span>`)
          } else if (域.缓存片段.length > 0) {
            // 无法写回的域至少保留它上次计算出的结果，同时如实提示
            片段列表.push(域.缓存片段.join(''))
          }
          域 = null
        }
      } else if (/^<w:instrText/i.test(片段Xml)) {
        if (域 !== null && 域.阶段 === '指令' && 文本匹配[1] !== undefined) 域.指令 += 文本匹配[1]
      } else if (/^<w:(?:drawing|pict)/i.test(片段Xml)) {
        片段列表.push(样式定义?.图片?.get(片段Xml) || '')
      } else if (/^<w:(?:br|cr)/i.test(片段Xml)) {
        片段列表.push('<br>')
      } else if (文本匹配[2] !== undefined) {
        if (域 !== null && 域.阶段 === '结果') {
          const 缓存文本 = 转义(文本匹配[2])
          域.缓存.push(缓存文本)
          域.缓存片段.push(样式 === '' ? 缓存文本 : `<span style="${样式}">${缓存文本}</span>`)
          域.样式 = 样式
        } else {
          const 内容 = 转义(文本匹配[2])
          片段列表.push(样式 === '' ? 内容 : `<span style="${样式}">${内容}</span>`)
        }
      }
    }
  }
  return { 段属性, 内容: 片段列表.join('') }
}

/**
 * 解析表格：<w:tbl> → <table>，逐行逐格，单元格内部递归段落。
 * 横向合并（w:gridSpan）写成 colspan；纵向合并（w:vMerge）写成起始单元格的
 * rowspan，被覆盖的续格不再输出，与 HTML 表格表达合并的方式一致。
 */
function 解析表格(表Xml, 编号映射, 样式定义) {
  const 行网格 = []
  const 行正则 = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/gi
  let 行匹配
  while ((行匹配 = 行正则.exec(表Xml)) !== null) {
    const 单元列表 = []
    let 列起点 = 0
    const 单元正则 = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gi
    let 单元匹配
    while ((单元匹配 = 单元正则.exec(行匹配[1])) !== null) {
      const 单元Xml = 单元匹配[1]
      const 段落列表 = []
      const 段正则 = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/gi
      let 段匹配
      while ((段匹配 = 段正则.exec(单元Xml)) !== null) {
        段落列表.push(渲染段落Xml(段匹配[0], { 允许标题: false }, 编号映射, 样式定义).html)
      }
      const 单元属性 = 单元Xml.match(/<w:tcPr(?:\s[^>]*)?>([\s\S]*?)<\/w:tcPr>/i)?.[1] ?? ''
      const 跨列原值 = 取属性(单元属性, 'w:gridSpan', 'w:val')
      const 跨列 = 跨列原值 !== null && /^\d+$/.test(跨列原值) ? Number(跨列原值) : 1
      const 有效跨列 = Number.isSafeInteger(跨列) && 跨列 > 1 && 跨列 <= 256 ? 跨列 : 1
      const 纵向合并 = !存在(单元属性, 'vMerge') ? null
        : 取属性(单元属性, 'w:vMerge', 'w:val') === 'restart' ? 'restart' : 'continue'
      单元列表.push({
        列: 列起点,
        跨列: 有效跨列,
        纵向合并,
        内容: 段落列表.join('') || '<br>',
      })
      列起点 += 有效跨列
    }
    if (单元列表.length > 0) 行网格.push(单元列表)
  }
  if (行网格.length === 0) return ''
  // 续格由上方起始单元格的 rowspan 覆盖，先算清跨行数再输出
  const 被覆盖 = new Set()
  const 行列表 = 行网格.map((单元列表, 行号) => {
    const 片段 = []
    for (const 单元 of 单元列表) {
      if (被覆盖.has(`${行号}:${单元.列}`)) continue
      let 跨行 = 1
      if (单元.纵向合并 === 'restart') {
        while (行网格[行号 + 跨行]?.some((项) =>
          项.列 === 单元.列 && 项.跨列 === 单元.跨列 && 项.纵向合并 === 'continue')) {
          被覆盖.add(`${行号 + 跨行}:${单元.列}`)
          跨行 += 1
        }
      }
      const 合并属性 = (单元.跨列 > 1 ? ` colspan="${单元.跨列}"` : '') + (跨行 > 1 ? ` rowspan="${跨行}"` : '')
      片段.push(`<td${合并属性} style="border:1px solid #D5DBE3;padding:4px 8px">${单元.内容}</td>`)
    }
    return `<tr>${片段.join('')}</tr>`
  })
  return `<table style="border-collapse:collapse;width:100%">${行列表.join('')}</table>`
}

/** 渲染单个段落 XML；列表项由外层聚合为 ul/ol */
function 渲染段落Xml(段落Xml, 选项, 编号映射, 样式定义) {
  const { 段属性, 内容 } = 解析段落(段落Xml, 编号映射, 样式定义)
  const 属性 = (段属性.样式 ? ` style="${段属性.样式}"` : '') +
    (段属性.行距规则 ? ` data-seal-line-rule="${段属性.行距规则}"` : '') +
    (段属性.来源排版 ? ` data-seal-paragraph-format="${转义(段属性.来源排版)}"` : '')
  if (段属性.列表 && (选项 === undefined || 选项.允许标题 !== false)) {
    const 列表标签 = 段属性.有编号 ? 'ol' : 'ul'
    return { 列表项: true, 列表标签, html: `<li${属性}>${内容 === '' ? '<br>' : 内容}</li>` }
  }
  return { 列表项: false, html: `<${段属性.标签}${属性}>${内容 === '' ? '<br>' : 内容}</${段属性.标签}>` }
}

/** 把 body XML 顶层的段落与表格按顺序渲染；相邻列表项聚合进同一列表 */
function 渲染Body(bodyXml, 编号映射 = {}, 样式定义) {
  const 输出 = []
  const 块正则 = /<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/gi
  let 块匹配
  let 当前列表 = null
  const 结束列表 = () => {
    if (当前列表 !== null) {
      输出.push(`</${当前列表}>`)
      当前列表 = null
    }
  }
  while ((块匹配 = 块正则.exec(bodyXml)) !== null) {
    const 块Xml = 块匹配[0]
    if (/^<w:tbl/i.test(块Xml)) {
      结束列表()
      const 表格Html = 解析表格(块Xml, 编号映射, 样式定义)
      if (表格Html !== '') 输出.push(表格Html)
      continue
    }
    if (/<w:br(?=[\s/>])[^>]*w:type="page"/i.test(块Xml) && !/<w:(?:t|drawing|pict)(?=[\s/>])/i.test(块Xml)) {
      结束列表()
      输出.push('<div class="wps-page-break"></div>')
      continue
    }
    if (/<w:pageBreakBefore[\s/>]/i.test(块Xml)) {
      结束列表()
      输出.push('<div class="wps-page-break"></div>')
    }
    if (样式定义?.图片 && /<w:pict(?=[\s>])/.test(块Xml) &&
        [...块Xml.matchAll(/<w:pict(?=[\s>])[^>]*>[\s\S]*?<\/w:pict>/gi)].some((项) => 样式定义.图片.get(项[0]) === '<hr>') &&
        !/<w:t(?=[\s/>])/.test(块Xml)) {
      结束列表()
      输出.push('<hr>')
      continue
    }
    if (/<w:pBdr(?=[\s>])[\s\S]*?<w:bottom(?=[\s/>])/.test(块Xml) && !/<w:t(?=[\s/>])/.test(块Xml)) {
      结束列表()
      输出.push('<hr>')
      continue
    }
    const 渲染 = 渲染段落Xml(块Xml, undefined, 编号映射, 样式定义)
    if (渲染.列表项) {
      if (当前列表 !== 渲染.列表标签) {
        结束列表()
        当前列表 = 渲染.列表标签
        输出.push(`<${当前列表}>`)
      }
      输出.push(渲染.html)
    } else {
      结束列表()
      输出.push(渲染.html)
    }
  }
  结束列表()
  return 输出.join('')
}

/** 提取 document.xml 中 <w:body> 的内容 */
function 取Body(documentXml) {
  if (!/<w:document(?:\s[^>]*)?>[\s\S]*<\/w:document>/i.test(documentXml)) {
    throw new Error('文字文档结构损坏，缺少完整的文档节点')
  }
  const 匹配 = documentXml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/i)
  if (匹配 !== null) return 匹配[1]
  if (/<w:body\s*\/>/i.test(documentXml)) return ''
  throw new Error('文字文档正文结构损坏')
}

/**
 * 解析 numbering.xml，得到 numId → 'bullet' | 'decimal' 的映射。
 * 缺失或解析失败时返回空映射，列表一律按无序列表呈现。
 */
function 解析编号映射(numberingXml) {
  const 映射 = {}
  if (typeof numberingXml !== 'string') return 映射
  // abstractNumId → 格式（取第一级 w:lvl 的 numFmt）
  const 抽象格式 = {}
  const 抽象正则 = /<w:abstractNum[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/gi
  let 抽象匹配
  while ((抽象匹配 = 抽象正则.exec(numberingXml)) !== null) {
    const 级匹配 = 抽象匹配[2].match(/<w:lvl[^>]*w:ilvl="0"[^>]*>[\s\S]*?<w:numFmt w:val="(\w+)"/i)
    if (级匹配 !== null) {
      抽象格式[抽象匹配[1]] = 级匹配[1]
    }
  }
  // numId → abstractNumId → 格式
  const 序号正则 = /<w:num[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"[^>]*\/>[\s\S]*?<\/w:num>/gi
  let 序号匹配
  while ((序号匹配 = 序号正则.exec(numberingXml)) !== null) {
    const 格式 = 抽象格式[序号匹配[2]]
    if (格式 !== undefined) {
      映射[序号匹配[1]] = 格式
    }
  }
  return 映射
}

/** 只依据正文里真实存在的、当前解析器未保留的对象生成警告。 */
function 收集未导入警告(bodyXml, 图片) {
  const 警告 = []
  const 有标签 = (标签) => new RegExp(`<${标签}[\\s/>]`, 'i').test(bodyXml)
  const 绘图块 = Array.from(bodyXml.matchAll(/<w:(drawing|pict)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>/gi), (匹配) => 匹配[0])
  const 孤立引用 = bodyXml.replace(/<w:(drawing|pict)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>/gi, '')
  if (/<(?:a:blip|v:imagedata)[\s/>]/i.test(孤立引用) || 绘图块.some((片段) => /<(?:a:blip|v:imagedata)[\s/>]/i.test(片段) && !图片?.has(片段))) 警告.push('图片未导入')
  if (绘图块.some((片段) => !/<(?:a:blip|v:imagedata|a:videoFile|a:audioFile)[\s/>]/i.test(片段)) || 有标签('w:object')) {
    警告.push('图形未导入')
  }
  if (有标签('a:videoFile') || 有标签('a:audioFile') || 有标签('w:movie')) 警告.push('媒体未导入')
  if (有标签('w:footnoteReference')) 警告.push('脚注未导入')
  if (有标签('w:endnoteReference')) 警告.push('尾注未导入')
  if (有标签('w:commentReference')) 警告.push('批注未导入')
  if (有标签('w:ins') || 有标签('w:del')) 警告.push('修订信息未导入')
  警告.push(...收集段落格式警告(bodyXml))
  if (/<w:br(?=[\s/>])[^>]*w:(?:type="column"|clear=)/i.test(bodyXml) ||
      [...bodyXml.matchAll(/<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/gi)].some((项) => /<w:(?:t|drawing|pict)(?=[\s/>])/.test(项[0]) && /<w:br(?=[\s/>])[^>]*w:type="page"/.test(项[0]))) {
    警告.push('段内分页或分栏换行未完整导入')
  }
  if (有标签('w:hyperlink')) 警告.push('超链接目标未导入')
  // 合并单元格已按 colspan / rowspan 导入，只有越界或无法解析的跨度才无法保留
  const 格子跨度异常 = [...bodyXml.matchAll(/<w:gridSpan(?=[\s/>])[^>]*>/gi)].some((项) => {
    const 值 = 取属性(项[0], 'w:gridSpan', 'w:val')
    return 值 === null || !/^\d+$/.test(值) || Number(值) < 1 || Number(值) > 256
  })
  const 纵向合并异常 = [...bodyXml.matchAll(/<w:vMerge(?=[\s/>])[^>]*>/gi)].some((项) => {
    const 值 = 取属性(项[0], 'w:vMerge', 'w:val')
    return 值 !== null && 值 !== 'restart' && 值 !== 'continue'
  })
  if (格子跨度异常 || 纵向合并异常) 警告.push('表格合并单元格未导入')
  return 警告
}

/** 解析当前分节引用的页眉页脚；空部件是 Word 的正常占位，不应报丢失。 */
async function 读取页眉页脚(压缩包, documentXml, 编号映射, 样式定义, 警告) {
  const 节 = [...documentXml.matchAll(/<w:sectPr(?=[\s>])[^>]*>([\s\S]*?)<\/w:sectPr>/gi)].at(-1)?.[1] ?? ''
  if (!节) return {}
  const 关系Xml = await 压缩包.file('word/_rels/document.xml.rels')?.async('string') ?? ''
  const 设置文件 = 压缩包.file('word/settings.xml')
  const 设置Xml = 设置文件 === null || 设置文件 === undefined ? '' : await 设置文件.async('string')
  const 关系 = new Map([...关系Xml.matchAll(/<(?:[\w]+:)?Relationship(?=[\s/>])[^>]*>/gi)].map((项) => {
    const 标签 = 项[0].match(/^<([\w:]+)/)[1]
    return [取属性(项[0], 标签, 'Id'), {
      路径: 取属性(项[0], 标签, 'Target'),
      类型: 取属性(项[0], 标签, 'Type'),
      外部: 取属性(项[0], 标签, 'TargetMode') === 'External',
    }]
  }))
  const 结果 = {}
  for (const [种类, 键] of [['header', '页眉Html'], ['footer', '页脚Html']]) {
    const 引用 = [...节.matchAll(new RegExp(`<w:${种类}Reference(?=[\\s/>])[^>]*>`, 'gi'))]
    const 候选 = []
    for (const 项 of 引用) {
      const 编号 = 取属性(项[0], `w:${种类}Reference`, 'r:id')
      const 关系项 = 关系.get(编号)
      const 名称 = 种类 === 'header' ? '页眉' : '页脚'
      if (!关系项?.路径 || !关系项.类型?.endsWith(`/${种类}`) || 关系项.外部) {
        警告.push(`${名称}未导入：引用关系缺失或无效`)
        continue
      }
      const 部件 = path.posix.normalize(关系项.路径.startsWith('/') ? 关系项.路径.slice(1) : `word/${关系项.路径}`)
      if (!部件.startsWith('word/') || !压缩包.file(部件)) {
        警告.push(`${名称}未导入：部件缺失`)
        continue
      }
      const xml = await 压缩包.file(部件).async('string')
      const 内容 = xml.match(new RegExp(`<w:${种类 === 'header' ? 'hdr' : 'ftr'}(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/w:${种类 === 'header' ? 'hdr' : 'ftr'}>`, 'i'))?.[1] ?? ''
      if (!/<w:(?:t|drawing|pict|fldChar|instrText|fldSimple|tab|br|tbl)(?=[\s/>])/i.test(内容)) continue
      const 图片读取 = await 读取正文图片(压缩包, 内容, 警告, 部件)
      const 局部样式 = { ...样式定义, 图片: 图片读取.图片 }
      const html = 渲染Body(图片读取.正文, 编号映射, 局部样式)
      if (存在未保留的域或制表符(内容)) 警告.push(`${名称}中的域或制表符未完整导入`)
      警告.push(...收集未导入警告(图片读取.正文, 图片读取.图片).map((项) => `${名称}：${项}`))
      候选.push({ 类型: 取属性(项[0], `w:${种类}Reference`, 'w:type') ?? 'default', html })
    }
    // 首页页脚要有 w:titlePg、奇偶页页脚要有 settings.xml 的 w:evenAndOddHeaders 才会生效；
    // 未生效的版本 Word 同样不显示，保留默认版本即为完整保真，不必报告丢失。
    const 生效类型 = new Set(['default'])
    if (/<w:titlePg(?=[\s/>])/i.test(节)) 生效类型.add('first')
    if (/<w:evenAndOddHeaders(?=[\s/>])/i.test(设置Xml)) 生效类型.add('even')
    const 生效候选 = 候选.filter((项) => 生效类型.has(项.类型))
    const 首选 = 生效候选.find((项) => 项.类型 === 'default') ?? 生效候选[0] ?? 候选[0]
    if (首选?.html) 结果[键] = 首选.html
    if (生效候选.some((项) => 项 !== 首选 && 项.html !== 首选?.html)) 警告.push(`${种类 === 'header' ? '页眉' : '页脚'}的首页或奇偶页版本未完整导入`)
  }
  return 结果
}

/**
 * 读取 docx 为带内联样式的 HTML。
 * @param 数据 - docx 文件的 Buffer
 * @returns { html, 警告 }；文件损坏时抛出错误，由上层报告读取失败
 */
async function 读取docx(数据) {
  const 警告 = []
  let 压缩包
  try {
    压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  } catch {
    throw new Error('文字文档压缩包损坏，无法读取')
  }
  const 文档文件 = 压缩包.file('word/document.xml')
  if (文档文件 === null) throw new Error('文字文档缺少 word/document.xml')
  let documentXml
  try {
    documentXml = await 文档文件.async('string')
  } catch {
    throw new Error('文字文档正文损坏，无法读取')
  }
  const 编号文件 = 压缩包.file('word/numbering.xml')
  const 编号映射 = 编号文件 !== null && 编号文件 !== undefined ? 解析编号映射(await 编号文件.async('string')) : {}
  const 样式文件 = 压缩包.file('word/styles.xml')
  const 样式定义 = 解析样式定义(样式文件 !== null && 样式文件 !== undefined ? await 样式文件.async('string') : null)
  样式定义.警告 = 警告
  const 图片读取 = await 读取正文图片(压缩包, 取Body(documentXml), 警告)
  const bodyXml = 图片读取.正文
  样式定义.图片 = 图片读取.图片
  const 页面设置 = 解析页面设置(documentXml, 警告)
  const 页眉页脚 = await 读取页眉页脚(压缩包, documentXml, 编号映射, 样式定义, 警告)
  if (页面设置) Object.assign(页面设置, 页眉页脚)
  警告.push(...收集未导入警告(bodyXml, 样式定义.图片))
  const html = 渲染Body(bodyXml, 编号映射, 样式定义)
  if (html.trim() === '') {
    if (/<w:(?:p|tbl)[\s/>]/i.test(bodyXml)) throw new Error('文字文档正文结构损坏，无法读取')
    警告.push('文档内容为空')
    return { html: '<p><br></p>', 警告, 页面设置 }
  }
  return { html, 警告: [...new Set(警告)], 页面设置 }
}

module.exports = { 读取docx, 渲染Body, 取Body, 解析字符属性, 解析段落属性, 解析表格, 解析编号映射, 解析样式定义 }
