// docx 读取模块：直接解析 OOXML（document.xml）生成带内联样式的 HTML。
// 相比 mammoth 的语义化输出，直接解析保留颜色、字号、字体、加粗、斜体、
// 下划线、删除线、对齐、标题与列表，使「保存后再次打开」的格式不丢失。
const JSZip = require('jszip')
const path = require('path')
const { 缩进字段, 间距字段, 扩展字段, 属性有效 } = require('./paragraphProperties')
const { 读取正文图片 } = require('./docxImages')
const { 解码Xml实体 } = require('./xmlEntities')
const { 规范Office命名空间 } = require('./ooxmlNamespaces')
const { 修订范围, 修订Html } = require('./docxRevisions')
const { 创建源包上下文, xmlNodes, lockedBlock } = require('./docxSource')

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

function 解码Xml(文本) {
  return 解码Xml实体(文本, '文字文档')
}

/** 提取某段 XML 里第一个 <标签 ... 属性="值"> 的属性值 */
function 取属性(片段, 标签, 属性) {
  const 匹配 = 片段.match(new RegExp(`<${标签}(?=[\\s/>])[^>]*\\s${属性}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))
  return 匹配 === null ? null : 解码Xml(匹配[2])
}

function 关系部件路径(部件) {
  const 片段 = 部件.split('/')
  return [...片段.slice(0, -1), '_rels', `${片段.at(-1)}.rels`].join('/')
}

/** 每个 OOXML 部件拥有独立关系表，正文、页眉和页脚不能混用关系编号。 */
async function 读取关系映射(压缩包, 部件) {
  const 文件 = 压缩包.file(关系部件路径(部件))
  const xml = 文件 ? await 文件.async('string') : ''
  return new Map([...xml.matchAll(/<(?:[\w]+:)?Relationship(?=[\s/>])[^>]*>/gi)].map((项) => {
    const 标签 = 项[0].match(/^<([\w:]+)/)?.[1] ?? 'Relationship'
    return [取属性(项[0], 标签, 'Id'), {
      路径: 取属性(项[0], 标签, 'Target'),
      类型: 取属性(项[0], 标签, 'Type'),
      外部: /^external$/i.test(取属性(项[0], 标签, 'TargetMode') ?? ''),
    }]
  }).filter(([编号]) => 编号 !== null))
}

function 校验链接目标(目标) {
  if (typeof 目标 !== 'string') return null
  const 结果 = 目标.trim()
  if (结果.length === 0 || 结果.length > 32768 || /[\u0000-\u001f\u007f]/.test(结果)) return null
  const 协议 = 结果.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (协议 && ['javascript', 'vbscript', 'data'].includes(协议)) return null
  return 结果
}

function 校验书签名称(名称) {
  if (typeof 名称 !== 'string' || 名称.length === 0 || 名称.length > 32768 || /[\u0000-\u001f\u007f]/.test(名称)) return null
  return 名称
}

/** 解析段落中超链接所在范围，run 命中该范围时把对应 HTML 包回 a 标签。 */
function 解析超链接范围(段落Xml, 样式定义) {
  const 范围 = []
  for (const 匹配 of 段落Xml.matchAll(/<w:hyperlink(?=[\s>])[^>]*>[\s\S]*?<\/w:hyperlink>/gi)) {
    const 开始标签 = 匹配[0].slice(0, 匹配[0].indexOf('>') + 1)
    const 关系编号 = 取属性(开始标签, 'w:hyperlink', 'r:id')
    const 书签 = 取属性(开始标签, 'w:hyperlink', 'w:anchor')
    const 位置 = 取属性(开始标签, 'w:hyperlink', 'w:docLocation')
    let 目标 = null
    if (关系编号) {
      const 关系 = 样式定义?.关系?.get(关系编号)
      if (关系?.路径 && 关系.类型?.endsWith('/hyperlink') && 关系.外部) {
        目标 = 关系.路径 + ((书签 ?? 位置) ? `#${书签 ?? 位置}` : '')
      }
    } else if (书签) {
      目标 = `#${书签}`
    }
    目标 = 校验链接目标(目标)
    if (目标 === null) {
     样式定义?.警告?.push('超链接目标未导入')
      continue
    }
    范围.push({ 开始: 匹配.index, 结束: 匹配.index + 匹配[0].length, 目标 })
  }
  return 范围
}

/** 判断某个子标签是否出现（带 w: 命名空间前缀） */
const 存在 = (片段, 标签) => new RegExp(`<w:${标签}[\\s/>]`, 'i').test(片段)

const 历史属性修订 = /<w:(rPrChange|pPrChange|sectPrChange|tblPrChange|tblPrExChange|trPrChange|tcPrChange)(?=[\s>])[^>]*>[\s\S]*?<\/w:\1>/gi
function 收集修订警告(xml) {
  const 警告 = []
  if (/<w:(?:moveFrom|moveTo)(?=[\s/>])/i.test(xml)) 警告.push('移动修订未完整导入其关联范围，已保留来源和目的标记；请保留原文件')
  if (/<w:(?:rPrChange|pPrChange|sectPrChange|tblPrChange|tblPrExChange|trPrChange|tcPrChange)(?=[\s/>])/i.test(xml)) 警告.push('格式修订未完整导入，已采用当前格式；请保留原文件')
  return 警告
}

/** Historical properties are distinct from current formatting. */
function 采用当前修订内容(xml) {
  return xml.replace(历史属性修订, '')
}

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
    ...(存在(节, 'lnNumType') ? { 行号: true } : {}),
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
  rPr = 采用当前修订内容(rPr)
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
  else if (半磅 !== null) {
    const 尺寸 = 半磅.match(/^(\d+(?:\.\d+)?)(pt|pc|pi|in|cm|mm)$/)
    if (尺寸) 配置.字号 = Number(尺寸[1]) * ({ pt: 1, pc: 12, pi: 12, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 }[尺寸[2]])
  }
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
  if (配置.加粗 !== undefined) 样式 += `font-weight:${配置.加粗 ? '700' : 'normal'};`
  if (配置.倾斜 !== undefined) 样式 += `font-style:${配置.倾斜 ? 'italic' : 'normal'};`
  if (配置.下划线 !== undefined || 配置.删除线 !== undefined) {
    const 装饰 = [配置.下划线 ? 'underline' : '', 配置.删除线 ? 'line-through' : ''].filter(Boolean).join(' ')
    样式 += `text-decoration:${装饰 || 'none'};`
  }
  if (配置.颜色) 样式 += `color:${配置.颜色};`
  if (配置.底纹) 样式 += `background-color:${配置.底纹};`
  if (配置.字号) 样式 += `font-size:${配置.字号}pt;`
  if (配置.字体) 样式 += `font-family:'${配置.字体.replace(/[\\'"<>&]/g, 字符 => '\\' + 字符.codePointAt(0).toString(16) + ' ')}','Noto Sans SC','SealNotoSans','PingFang SC','Microsoft YaHei',sans-serif;`
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
  stylesXml = 采用当前修订内容(stylesXml)
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
      名称: 取属性(匹配[2], 'w:name', 'w:val'),
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
    if (规则 === undefined || 规则 === 'auto') 样式 += `line-height:${Math.max(1, 行距 / 240)};`
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
    const 格式 = 编号映射[序号]
    有编号 = ['decimal', 'lowerLetter', 'chineseCounting'].includes(格式)
    const 列表样式 = { decimal: 'decimal', lowerLetter: 'lower-alpha', chineseCounting: 'cjk-ideographic', square: 'square', circle: 'circle' }[格式]
    if (列表样式) 样式 += `list-style-type:${列表样式};`
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
      (整体, 属性, 内容) => 展开(转义(取属性(`<w:fldSimple${属性}>`, 'w:fldSimple', 'w:instr') ?? ''), 内容))
    // 没有缓存结果的空域写成自闭合标签，同样要保留成可写回的域
    .replace(/<w:fldSimple(?=[\s>])([^>]*)\/>/gi,
      (整体, 属性) => 展开(转义(取属性(`<w:fldSimple${属性}>`, 'w:fldSimple', 'w:instr') ?? ''), ''))
}

/** 判断这段 XML 里是否存在当前无法保留的域代码或制表符 */
function 存在未保留的域或制表符(内容, 检查制表符 = true) {
  if (检查制表符 && /<w:tab(?=[\s/>])/i.test(内容)) return true
  const 栈 = []
  for (const 匹配 of 展开简单域(内容).matchAll(/<w:fldChar(?=[\s/>])[^>]*>|<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi)) {
    if (匹配[1] !== undefined) {
      if (!栈.length) return true
      栈.at(-1).指令 += 解码Xml(匹配[1])
      continue
    }
    const 类型 = 取属性(匹配[0], 'w:fldChar', 'w:fldCharType')
    if (类型 === 'begin') 栈.push({ 指令: '' })
    else if (类型 === 'end') {
      const 域 = 栈.pop()
      if (!域 || !支持的域.has(域名称(域.指令))) return true
    } else if (类型 !== 'separate' || !栈.length) return true
  }
  return 栈.length > 0
}

/** 解析一个 <w:p> 段落为 HTML；列表项返回 li 内容由外层聚合 */
function 解析段落(段落Xml, 编号映射, 样式定义) {
  段落Xml = 采用当前修订内容(段落Xml)
  段落Xml = 展开简单域(段落Xml)
  const 历史范围 = /<w:(?:ins|del|moveFrom|moveTo)(?=[\s>])/.test(段落Xml) ? 修订范围(段落Xml) : []
  let 当前Run开始 = 0, 当前Run结束 = 0
  const 超链接范围 = 解析超链接范围(段落Xml, 样式定义)
  const pPr匹配 = 段落Xml.match(/<w:pPr(?:\s[^>]*)?>([\s\S]*?)<\/w:pPr>/i)
  const 段落样式 = pPr匹配 === null ? null : 取属性(pPr匹配[1], 'w:pStyle', 'w:val')
  const 实际段落属性 = 样式定义 === undefined ? pPr匹配?.[1] || '' : 合并段落排版([
    样式定义.默认段落属性, ...解析继承段落(样式定义, 段落样式 ?? 样式定义.默认段落样式), pPr匹配?.[1] || '',
  ])
  if (样式定义?.警告) 样式定义.警告.push(...收集段落格式警告(实际段落属性))
  const 段属性 = 解析段落属性(实际段落属性, 编号映射)
  // Word/WPS 经常用数字 styleId 标记标题，须解析样式名或继承的大纲级别。
  const 样式标题 = 标题标签(样式定义?.定义.get(段落样式)?.名称)
  const 大纲级别 = [...[实际段落属性, ...(样式定义 ? 解析继承段落(样式定义, 段落样式) : []).reverse()]]
    .map(项 => 取属性(项, 'w:outlineLvl', 'w:val')).find(项 => 项 !== null)
  if (段属性.标签 === 'p') {
    if (大纲级别 !== undefined && /^[0-5]$/.test(大纲级别)) 段属性.标签 = `h${Number(大纲级别) + 1}`
    else if (大纲级别 === undefined && 样式标题) 段属性.标签 = 样式标题
  }
  const 继承配置 = 样式定义 === undefined ? {} : {
    ...样式定义.默认字符,
    ...解析继承字符(样式定义, 段落样式 ?? 样式定义.默认段落样式),
  }
  const 标记属性 = pPr匹配?.[1].match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/i)?.[1]
  const 标记配置 = { ...继承配置, ...提取字符配置(标记属性 || '') }
  段属性.样式 += 生成字符样式(标记配置)
  const 片段列表 = []
  // 页码域按 Word 的域结构解析：begin → instrText 指令 → separate → 缓存结果 → end。
  // 能写回的域输出为带标记的占位，保存时重新写成域代码，页码不会被写死。
  const 域栈 = []
  let 当前链接 = null
  const 输出片段 = (html, 文本 = html) => {
    let 带链接Html = 当前链接 === null ? html
      : `<a href="${转义(当前链接)}" data-seal-link="${转义(当前链接)}" rel="noopener noreferrer">${html}</a>`
    带链接Html = 修订Html(带链接Html, 当前Run开始, 当前Run结束, 历史范围)
    const 域 = 域栈.at(-1)
    if (!域) 片段列表.push(带链接Html)
    else if (域.阶段 === '结果') { 域.缓存.push(文本); 域.缓存片段.push(带链接Html) }
  }
  const 结束域 = () => {
    const 域 = 域栈.pop()
    if (!域) return
    const 名称 = 域名称(域.指令)
    输出片段(支持的域.has(名称)
      ? `<span data-seal-field="${名称}"${域.样式 === '' ? '' : ` style="${域.样式}"`}>${域.缓存.join('')}</span>`
      : 域.缓存片段.join(''), 域.缓存.join(''))
  }
  // 按原始顺序解析书签起点与 run。书签用零宽 HTML 标记保留，内部超链接重存后仍有真实落点。
  const run正则 = /<w:bookmarkStart(?=[\s/>])[^>]*\/?\s*>|<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/gi
  let run匹配
  while ((run匹配 = run正则.exec(段落Xml)) !== null) {
    当前Run开始 = run匹配.index; 当前Run结束 = run匹配.index + run匹配[0].length
    当前链接 = 超链接范围.find((项) => run匹配.index >= 项.开始 && run匹配.index + run匹配[0].length <= 项.结束)?.目标 ?? null
    if (/^<w:bookmarkStart/i.test(run匹配[0])) {
      const 原名称 = 取属性(run匹配[0], 'w:bookmarkStart', 'w:name')
      const 名称 = 校验书签名称(原名称)
      if (名称 !== null) 片段列表.push(`<span data-seal-bookmark="${转义(名称)}" contenteditable="false"></span>`)
      else if (原名称 !== null) 样式定义?.警告?.push('书签目标未导入')
      continue
    }
    const runXml = run匹配[1]
    const rPr匹配 = runXml.match(/<w:rPr(?:\s[^>]*)?>([\s\S]*?)<\/w:rPr>/i)
    const rPr = rPr匹配 === null ? null : rPr匹配[1]
    const 字符样式 = rPr === null || 样式定义 === undefined ? {} : 解析继承字符(样式定义, 取属性(rPr, 'w:rStyle', 'w:val'))
    const { 样式 } = 解析字符属性(rPr, { ...继承配置, ...字符样式 })
    const 文本正则 = /<w:(?:drawing|pict)(?=[\s>])[^>]*>[\s\S]*?<\/w:(?:drawing|pict)>|<w:(?:footnoteReference|endnoteReference)(?=[\s/>])[^>]*>|<w:fldChar(?=[\s/>])[^>]*>|<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>|<w:(?:t|delText)(?:\s[^>]*)?>([\s\S]*?)<\/w:(?:t|delText)>|<w:(?:br|cr|tab)(?=[\s/>])[^>]*>/gi
    let 文本匹配
    while ((文本匹配 = 文本正则.exec(runXml)) !== null) {
      const 片段Xml = 文本匹配[0]
      const 域 = 域栈.at(-1)
      if (/^<w:(?:footnoteReference|endnoteReference)/i.test(片段Xml)) {
        const kind = 片段Xml.includes('footnoteReference') ? 'footnote' : 'endnote'
        const id = Number(取属性(片段Xml, `w:${kind}Reference`, 'w:id'))
        if (Number.isSafeInteger(id) && id > 0 && id <= 10000) 输出片段(`<sup data-seal-note-kind="${kind}" data-seal-note-ref="${id}" contenteditable="false">${id}</sup>`)
        else 样式定义?.警告?.push('注释引用未完整导入')
      } else if (/^<w:fldChar/i.test(片段Xml)) {
        const 类型 = 取属性(片段Xml, 'w:fldChar', 'w:fldCharType')
        if (类型 === 'begin') 域栈.push({ 指令: '', 阶段: '指令', 缓存: [], 缓存片段: [], 样式 })
        else if (类型 === 'separate' && 域) 域.阶段 = '结果'
        else if (类型 === 'end') 结束域()
      } else if (/^<w:instrText/i.test(片段Xml)) {
        if (域 && 域.阶段 === '指令' && 文本匹配[1] !== undefined) 域.指令 += 解码Xml(文本匹配[1])
      } else if (/^<w:(?:drawing|pict)/i.test(片段Xml)) {
        输出片段(样式定义?.图片?.get(片段Xml) || '')
      } else if (/^<w:(?:br|cr)/i.test(片段Xml)) {
        输出片段('<br>')
      } else if (/^<w:tab/i.test(片段Xml)) {
        输出片段('<span style="white-space:pre">\t</span>', '\t')
      } else if (文本匹配[2] !== undefined) {
        const 文本 = 转义(解码Xml(文本匹配[2]))
        // 保存库可能将制表符写入 w:t；与独立 w:tab 使用相同显示方式。
        const 内容 = 文本.replace(/\t/g, '<span style="white-space:pre">\t</span>')
        输出片段(样式 === '' ? 内容 : `<span style="${样式}">${内容}</span>`, 文本)
        if (域) 域.样式 = 样式
      }
    }
  }
  // TOC 外层域可以跨越多个段落；本段的缓存结果仍须立即呈现。
  while (域栈.length) 结束域()
  return { 段属性, 内容: 片段列表.join('') }
}

/**
 * 解析表格：<w:tbl> → <table>，逐行逐格，单元格内部递归段落。
 * 横向合并（w:gridSpan）写成 colspan；纵向合并（w:vMerge）写成起始单元格的
 * rowspan，被覆盖的续格不再输出，与 HTML 表格表达合并的方式一致。
 */
function 解析表格(表Xml, 编号映射, 样式定义) {
  const revisionAttributes = node => node ? ` class="${node.name === 'w:del' ? 'wps-delete' : 'wps-insert'}" data-seal-revision-type="${node.name.slice(2)}" data-seal-revision-id="${转义(node.attrs['w:id'] ?? '')}" data-seal-revision-author="${转义(node.attrs['w:author'] ?? '')}"${node.attrs['w:date'] ? ` data-seal-revision-date="${转义(node.attrs['w:date'])}"` : ''}${node.name === 'w:del' ? ' contenteditable="false"' : ''}` : ''
  const 表属性 = 表Xml.match(/<w:tblPr(?:\s[^>]*)?>([\s\S]*?)<\/w:tblPr>/i)?.[1] || ''
  const 数值 = (xml, tag, attr = 'w:w') => { const v = Number(取属性(xml, tag, attr)); return Number.isFinite(v) ? v : 0 }
  const 表宽类型 = 取属性(表属性, 'w:tblW', 'w:type')
  const 原始表宽 = 取属性(表属性, 'w:tblW', 'w:w') || ''
  const 百分比宽 = /^\d+(?:\.\d+)?%$/.test(原始表宽) ? Number.parseFloat(原始表宽) : 数值(表属性, 'w:tblW') / 50
  const 表宽 = 表宽类型 === 'pct' ? `${百分比宽}%` : 表宽类型 === 'dxa' ? `${数值(表属性, 'w:tblW') / 15}px` : 'auto'
  const 间距 = 数值(表属性, 'w:tblCellSpacing') / 15
  const 网格Xml = 表Xml.match(/<w:tblGrid(?:\s[^>]*)?>([\s\S]*?)<\/w:tblGrid>/i)?.[1] || ''
  const 网格列 = [...网格Xml.matchAll(/<w:gridCol(?=[\s/>])[^>]*\bw:w\s*=\s*["'](\d+)["'][^>]*>/gi)]
    .map((项) => Number(项[1]) / 15)
    .filter((值) => Number.isFinite(值) && 值 > 0)
  const 固定布局 = /<w:tblLayout(?=[\s/>])[^>]*\bw:type\s*=\s*["']fixed["']/i.test(表属性) || 网格列.length > 0
  const 默认边距 = 表属性.match(/<w:tblCellMar[^>]*>([\s\S]*?)<\/w:tblCellMar>/i)?.[1] || ''
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
      const 边距 = 单元属性.match(/<w:tcMar[^>]*>([\s\S]*?)<\/w:tcMar>/i)?.[1] || 默认边距
      const 边框 = 单元属性.match(/<w:tcBorders[^>]*>([\s\S]*?)<\/w:tcBorders>/i)?.[1] || 表属性.match(/<w:tblBorders[^>]*>([\s\S]*?)<\/w:tblBorders>/i)?.[1] || ''
      const 样式 = ['top', 'right', 'bottom', 'left'].map(side => {
        const tag = `w:${side}`, kind = 取属性(边框, tag, 'w:val')
        const css = ({ single: 'solid', double: 'double', dashed: 'dashed', dotted: 'dotted' })[kind] || 'none'
        const color = 取属性(边框, tag, 'w:color')
        return `padding-${side}:${数值(边距, tag) / 15}px;border-${side}:${数值(边框, tag, 'w:sz') / 6}px ${css} #${/^[0-9a-f]{6}$/i.test(color || '') ? color : '000000'}`
      })
      if (取属性(单元属性, 'w:tcW', 'w:type') === 'dxa') 样式.push(`width:${数值(单元属性, 'w:tcW') / 15}px`)
      const 填充 = 取属性(单元属性, 'w:shd', 'w:fill')
      if (/^[0-9a-f]{6}$/i.test(填充 || '')) 样式.push(`background-color:#${填充}`)
      const 垂直 = 取属性(单元属性, 'w:vAlign', 'w:val')
      const 文字方向 = 取属性(单元属性, 'w:textDirection', 'w:val')
      const 竖排 = /^(?:tbRl|btLr)/i.test(文字方向 || '')
      样式.push(`vertical-align:${竖排 ? 'top' : (({ center: 'middle', top: 'top', bottom: 'bottom' })[垂直] || 'middle')}`)
      const 跨列原值 = 取属性(单元属性, 'w:gridSpan', 'w:val')
      const 跨列 = 跨列原值 !== null && /^\d+$/.test(跨列原值) ? Number(跨列原值) : 1
      const 有效跨列 = Number.isSafeInteger(跨列) && 跨列 > 1 && 跨列 <= 256 ? 跨列 : 1
      const 纵向合并 = !存在(单元属性, 'vMerge') ? null
        : 取属性(单元属性, 'w:vMerge', 'w:val') === 'restart' ? 'restart' : 'continue'
      let 内容 = 段落列表.join('') || '<br>'
      if (竖排) {
        // Word/WPS 把竖排文字的段落缩进解释为沿排方向的偏移，直接映射成
        // margin-left 会把文字推出窄单元格；这里只保留文字本身。
        内容 = 内容.replace(/margin-(?:left|right):[^;]+;?/g, '')
        内容 = `<div style="writing-mode:vertical-rl;text-orientation:upright;white-space:nowrap">${内容}</div>`
      }
      单元列表.push({
        修订属性: revisionAttributes(xmlNodes(单元匹配[0]).find(node => ['w:ins', 'w:del'].includes(node.name) && node.parent?.name === 'w:tcPr')),
        列: 列起点,
        跨列: 有效跨列,
        纵向合并,
        内容,
        样式: 样式.join(';'),
      })
      列起点 += 有效跨列
    }
    单元列表.修订属性 = revisionAttributes(xmlNodes(行匹配[0]).find(node => ['w:ins', 'w:del'].includes(node.name) && node.parent?.name === 'w:trPr'))
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
      片段.push(`<td${合并属性}${单元.修订属性} style="${单元.样式};word-break:break-word;overflow-wrap:anywhere">${单元.内容}</td>`)
    }
    return `<tr${单元列表.修订属性 || ''}>${片段.join('')}</tr>`
  })
  const 列组 = 网格列.length > 0
    ? `<colgroup>${网格列.map((宽) => `<col style="width:${宽}px">`).join('')}</colgroup>`
    : ''
  return `<table style="border-collapse:${间距 > 0 ? 'separate' : 'collapse'};border-spacing:${间距}px;width:${表宽};${固定布局 ? 'table-layout:fixed;' : ''}">${列组}${行列表.join('')}</table>`
}

/** 渲染单个段落 XML；列表项由外层聚合为 ul/ol */
function 渲染段落Xml(段落Xml, 选项, 编号映射, 样式定义) {
  const { 段属性, 内容 } = 解析段落(段落Xml, 编号映射, 样式定义)
  let 属性 = (段属性.样式 ? ` style="${段属性.样式}"` : '') +
    (段属性.行距规则 ? ` data-seal-line-rule="${段属性.行距规则}"` : '') +
    (段属性.来源排版 ? ` data-seal-paragraph-format="${转义(段属性.来源排版)}"` : '')
  if (/<w:pPr(?=[\s>])[\s\S]*?<w:rPr(?=[\s>])/.test(段落Xml)) {
    const mark = xmlNodes(段落Xml).find(node => ['w:ins', 'w:del', 'w:moveFrom', 'w:moveTo'].includes(node.name) && node.parent?.name === 'w:rPr' && node.parent.parent?.name === 'w:pPr')
    if (mark) { const revision = { 类型: mark.name.slice(2), 标识: mark.attrs['w:id'] ?? '', 作者: mark.attrs['w:author'] ?? '', 时间: mark.attrs['w:date'] }; 属性 += ` data-seal-paragraph-revision="${转义(encodeURIComponent(JSON.stringify(revision)))}" data-seal-paragraph-revision-type="${revision.类型}"` }
  }
  if (段属性.列表 && (选项 === undefined || 选项.允许标题 !== false)) {
    const 列表标签 = 段属性.有编号 ? 'ol' : 'ul'
    return { 列表项: true, 列表标签, html: `<li${属性}>${内容 === '' ? '<br>' : 内容}</li>` }
  }
  return { 列表项: false, html: `<${段属性.标签}${属性}>${内容 === '' ? '<br>' : 内容}</${段属性.标签}>` }
}

/** 把 body XML 顶层的段落与表格按顺序渲染；相邻列表项聚合进同一列表 */
function 渲染Body(bodyXml, 编号映射 = {}, 样式定义) {
  bodyXml = 采用当前修订内容(bodyXml)
  const blockRevisions = /<w:(?:ins|del|moveFrom|moveTo)(?=[\s>])/.test(bodyXml) ? 修订范围(bodyXml) : []
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
    if (取属性(块Xml, 'w:pStyle', 'w:val') === 'SealOfficeTableSeparator' && !/<w:(?:t|drawing|pict)(?=[\s/>])/.test(块Xml)) continue
    if (/^<w:tbl/i.test(块Xml)) {
      结束列表()
      const 表格Html = 解析表格(块Xml, 编号映射, 样式定义)
      if (表格Html !== '') 输出.push(修订Html(表格Html, 块匹配.index, 块匹配.index + 块Xml.length, blockRevisions, 'div'))
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
      输出.push(修订Html(渲染.html, 块匹配.index, 块匹配.index + 块Xml.length, blockRevisions))
    } else {
      结束列表()
      输出.push(修订Html(渲染.html, 块匹配.index, 块匹配.index + 块Xml.length, blockRevisions, 'div'))
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
      let 格式 = 级匹配[1]
      if (格式 === 'bullet') {
        const 文字 = 取属性(抽象匹配[2], 'w:lvlText', 'w:val')
        if (文字 === '■') 格式 = 'square'
        else if (文字 === '○') 格式 = 'circle'
      }
      抽象格式[抽象匹配[1]] = 格式
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
  if (有标签('w:commentReference')) 警告.push('批注未导入')
  if (有标签('w:ins') || 有标签('w:del')) 警告.push('修订信息未导入')
  警告.push(...收集修订警告(bodyXml))
  if (存在未保留的域或制表符(采用当前修订内容(bodyXml), false)) 警告.push('域代码未完整导入，已保留可读取的缓存结果')
  警告.push(...收集段落格式警告(bodyXml))
  if (/<w:br(?=[\s/>])[^>]*w:(?:type="column"|clear=)/i.test(bodyXml) ||
      [...bodyXml.matchAll(/<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/gi)].some((项) => /<w:(?:t|drawing|pict)(?=[\s/>])/.test(项[0]) && /<w:br(?=[\s/>])[^>]*w:type="page"/.test(项[0]))) {
    警告.push('段内分页或分栏换行未完整导入')
  }
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
  const 设置文件 = 压缩包.file('word/settings.xml')
  const 设置Xml = 设置文件 === null || 设置文件 === undefined ? '' : await 设置文件.async('string')
  const 关系 = await 读取关系映射(压缩包, 'word/document.xml')
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
      const 局部样式 = { ...样式定义, 图片: 图片读取.图片, 关系: await 读取关系映射(压缩包, 部件) }
      // Word 常把水印放在页眉 VML 图层，而非 document.xml 的页面设置中。
      // 先抽出被标记为 WaterMark 的对象，避免它被当作普通页眉图片排在正文上方。
      let 页眉正文 = 图片读取.正文
      for (const 匹配 of 页眉正文.matchAll(/<w:pict(?=[\s>])[^>]*>[\s\S]*?<\/w:pict>/gi)) {
        const 对象 = 匹配[0]
        if (!/watermark/i.test(对象)) continue
        const 图片 = 图片读取.图片.get(对象)
        const 图片源 = 图片?.match(/\bsrc="(data:image\/(?:png|jpeg|gif|webp);base64,[^"]+)"/i)?.[1]
        const 文本标签 = 对象.match(/<v:textpath(?=[\s/>])[^>]*>/i)?.[0]
        const 文本 = 文本标签 ? 取属性(文本标签, 'v:textpath', 'string') : null
        if (图片源 && 图片源.length <= 8_000_000) 结果.水印 = `图片:${图片源}`
        else if (文本) 结果.水印 = 文本.slice(0, 100)
        else { 警告.push('页眉水印未完整导入'); continue }
        页眉正文 = 页眉正文.replace(对象, '')
        警告.push('水印可预览，但当前版本无法将其写回 DOCX；保存时请保留原文件')
      }
      let html = /<w:(?:t|drawing|pict|fldChar|instrText|fldSimple|tab|br|tbl)(?=[\s/>])/i.test(页眉正文)
        ? 渲染Body(页眉正文, 编号映射, 局部样式) : ''
      html = html.replace(/data-seal-revision-type=/g, `data-seal-revision-part="${转义(部件)}" data-seal-revision-type=`)
      if (lockedBlock(内容) && html) html = `<div data-seal-native-protected="true" contenteditable="false" title="此页眉页脚含原生高级结构；可通过修订历史审阅，正文编辑受保护">${html}</div>`
      if (存在未保留的域或制表符(内容)) 警告.push(`${名称}中的域或制表符未完整导入`)
      警告.push(...收集未导入警告(页眉正文, 图片读取.图片).map((项) => `${名称}：${项}`))
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
async function 读取注释(压缩包, bodyXml, 编号映射, 样式定义, 警告) {
  const sections = []
  for (const [kind, label] of [['footnote', '脚注'], ['endnote', '尾注']]) {
    const ids = new Set([...bodyXml.matchAll(new RegExp(`<w:${kind}Reference(?=[\\s/>])[^>]*>`, 'g'))].map(match => Number(取属性(match[0], `w:${kind}Reference`, 'w:id'))))
    if (!ids.size) continue
    if (ids.size > 1000) { 警告.push(`${label}数量超过导入上限`); continue }
    const relation = [...样式定义.关系.values()].find(item => item.类型?.endsWith('/' + kind + 's') && !item.外部)
    const part = relation?.路径 ? path.posix.normalize(relation.路径.startsWith('/') ? relation.路径.slice(1) : path.posix.join('word', relation.路径)) : `word/${kind}s.xml`
    if (!part.startsWith('word/')) { 警告.push(`${label}未导入`); continue }
    const file = 压缩包.file(part)
    if (!file) { 警告.push(`${label}未导入`); continue }
    const xml = await file.async('string'), definitions = new Map()
    for (const match of xml.matchAll(new RegExp(`<w:${kind}(?=[\\s>])[^>]*>([\\s\\S]*?)<\\/w:${kind}>`, 'g'))) {
      const id = Number(取属性(match[0], `w:${kind}`, 'w:id'))
      if (id > 0 && ids.has(id)) definitions.set(id, match[1])
    }
    const entries = []
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0 || id > 10000 || !definitions.has(id)) { 警告.push(`${label}未导入`); continue }
      const noteXml = definitions.get(id).replace(/<w:(?:footnoteRef|endnoteRef)(?=[\s/>])[^>]*>/g, '')
      const images = await 读取正文图片(压缩包, noteXml, 警告, part)
      const local = { ...样式定义, 图片: images.图片, 关系: await 读取关系映射(压缩包, part) }
      警告.push(...收集未导入警告(noteXml, images.图片).map(warning => `${label}：${warning}`))
      const noteHtml = 渲染Body(images.正文, 编号映射, local).replace(/data-seal-revision-type=/g, `data-seal-revision-part="${转义(part)}" data-seal-revision-type=`)
      entries.push(`<div id="seal-${kind}-${id}" data-seal-note-id="${id}" data-seal-note-baseline="${转义(encodeURIComponent(noteHtml))}"${lockedBlock(noteXml) ? ' contenteditable="false" data-seal-native-protected="true" title="此注释含原生高级结构，正文编辑受保护；可在修订历史中审阅"' : ''}><span data-seal-note-label="true" contenteditable="false">${id}. </span>${noteHtml}</div>`)
    }
    if (entries.length) sections.push(`<section data-seal-notes="${kind}"><h4 data-seal-note-label="true" contenteditable="false">${label}</h4>${entries.join('')}</section>`)
  }
  return sections.join('')
}

async function 读取docx(数据) {
  const 警告 = []
  let 压缩包
  try {
    压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  } catch {
    throw new Error('文字文档压缩包损坏，无法读取')
  }
  const entries = Object.values(压缩包.files)
  if (entries.length > 2000) throw new Error('文字文档部件超过2000项，已停止展开')
  let expanded = 0
  for (const entry of entries) { const size = entry._data?.uncompressedSize ?? 0; expanded += size; if (size > 20 * 1024 * 1024 || expanded > 100 * 1024 * 1024) throw new Error('文字文档展开体积超过安全上限，已停止读取') }
  await 规范Office命名空间(压缩包, 'word')
  const 文档文件 = 压缩包.file('word/document.xml')
  if (文档文件 === null) throw new Error('文字文档缺少 word/document.xml')
  let documentXml
  try {
    documentXml = await 文档文件.async('string')
  } catch {
    throw new Error('文字文档正文损坏，无法读取')
  }
  警告.push(...收集修订警告(documentXml))
  documentXml = 采用当前修订内容(documentXml)
  const 编号文件 = 压缩包.file('word/numbering.xml')
  const 编号映射 = 编号文件 !== null && 编号文件 !== undefined ? 解析编号映射(await 编号文件.async('string')) : {}
  const 样式文件 = 压缩包.file('word/styles.xml')
  const 样式Xml = 样式文件 !== null && 样式文件 !== undefined ? await 样式文件.async('string') : null
  if (样式Xml) 警告.push(...收集修订警告(样式Xml))
  const 样式定义 = 解析样式定义(样式Xml)
  样式定义.警告 = 警告
  样式定义.关系 = await 读取关系映射(压缩包, 'word/document.xml')
  const 图片读取 = await 读取正文图片(压缩包, 取Body(documentXml), 警告)
  const bodyXml = 图片读取.正文
  样式定义.图片 = 图片读取.图片
  const 页面设置 = 解析页面设置(documentXml, 警告)
  const 页眉页脚 = await 读取页眉页脚(压缩包, documentXml, 编号映射, 样式定义, 警告)
  if (页面设置) Object.assign(页面设置, 页眉页脚)
  警告.push(...收集未导入警告(bodyXml, 样式定义.图片))
  let 源包
  try { 源包 = await 创建源包上下文(压缩包, xml => 渲染Body(xml, 编号映射, 样式定义), { 页面设置 }, async part => {
    const file = 压缩包.file(part); if (!file) return ''
    const images = await 读取正文图片(压缩包, await file.async('string'), 警告, part)
    return 渲染Body(images.正文, 编号映射, { ...样式定义, 图片: images.图片, 关系: await 读取关系映射(压缩包, part) })
  }) }
  catch (error) { 警告.push(`高级源结构无法安全保留：${error.message}；请保留原文件`) }
  if (源包) for (let index = 警告.length - 1; index >= 0; index--) if (警告[index] === '修订信息未导入' || /^(?:移动修订未完整导入|格式修订未完整导入)/.test(警告[index])) 警告.splice(index, 1)
  const html = (源包?.html ?? 渲染Body(bodyXml, 编号映射, 样式定义)) + await 读取注释(压缩包, bodyXml, 编号映射, 样式定义, 警告)
  if (html.trim() === '') {
    if (/<w:(?:p|tbl)[\s/>]/i.test(bodyXml)) throw new Error('文字文档正文结构损坏，无法读取')
    警告.push('文档内容为空')
    return { html: '<p><br></p>', 警告, 页面设置 }
  }
  return { html, 警告: [...new Set(警告)], 页面设置 }
}

module.exports = { 读取docx, 渲染Body, 取Body, 解析字符属性, 解析段落属性, 解析表格, 解析编号映射, 解析样式定义 }
