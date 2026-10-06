// 主题部件（ppt/theme/themeN.xml）的原生读写。
// 配色写入 clrScheme，字体写入 fontScheme，格式方案沿用包内既有定义。
// 方案引用名（幻灯片的 schemeClr）与 clrScheme 元素名（配色定义）并不相同，分别维护。
const 槽到引用色表 = {
  文本1: 'tx1', 背景1: 'bg1', 文本2: 'tx2', 背景2: 'bg2',
  强调1: 'accent1', 强调2: 'accent2', 强调3: 'accent3', 强调4: 'accent4', 强调5: 'accent5', 强调6: 'accent6',
  超链接: 'hlink',
}
const 槽到配色元素表 = {
  文本1: 'dk1', 背景1: 'lt1', 文本2: 'dk2', 背景2: 'lt2',
  强调1: 'accent1', 强调2: 'accent2', 强调3: 'accent3', 强调4: 'accent4', 强调5: 'accent5', 强调6: 'accent6',
  超链接: 'hlink',
}
const 方案色到槽表 = Object.fromEntries([
  ...Object.entries(槽到引用色表),
  ...Object.entries(槽到配色元素表).filter(([, 方案色]) => !Object.values(槽到引用色表).includes(方案色)),
].map(([槽, 方案色]) => [方案色, 槽]))
const 主题色槽列表 = Object.keys(槽到引用色表)

const 颜色有效 = (值) => typeof 值 === 'string' && /^#[0-9a-f]{6}$/i.test(值)
const 规整颜色 = (值) => String(值).replace(/^#/, '').toUpperCase()

/** 默认格式方案：仅在包内缺少 theme 部件时使用，保证 Office 打开不降级。 */
const 默认格式方案 = '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  + '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs>'
  + '<a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs>'
  + '<a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>'
  + '</a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>'
  + '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>'
  + '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>'
  + '<a:solidFill><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme>'

function 校验主题(主题) {
  if (!主题 || typeof 主题 !== 'object') throw new Error('主题数据无效：不是对象')
  if (typeof 主题.名称 !== 'string' || !主题.名称.trim()) throw new Error('主题数据无效：缺少名称')
  if (!主题.配色 || typeof 主题.配色 !== 'object') throw new Error('主题数据无效：缺少配色')
  for (const 槽 of 主题色槽列表) {
    if (!颜色有效(主题.配色[槽])) throw new Error(`主题数据无效：配色缺少 ${槽}`)
  }
  if (!主题.字体 || typeof 主题.字体.标题 !== 'string' || typeof 主题.字体.正文 !== 'string' ||
      !主题.字体.标题.trim() || !主题.字体.正文.trim()) {
    throw new Error('主题数据无效：缺少标题或正文字体')
  }
}

function 配色方案Xml(配色) {
  return `<a:clrScheme name="${配色.名称}">`
    + 主题色槽列表.map((槽) => {
      const 方案色 = 槽到配色元素表[槽]
      return `<a:${方案色}><a:srgbClr val="${规整颜色(配色.配色[槽])}"/></a:${方案色}>`
    }).join('')
    + '</a:clrScheme>'
}

function 字体方案Xml(字体, 名称) {
  const 字体项 = (字体名) => `<a:latin typeface="${字体名}" panose="020B0502020204020204"/><a:ea typeface="${字体名}"/><a:cs typeface=""/>`
  return `<a:fontScheme name="${名称}"><a:majorFont>${字体项(字体.标题)}</a:majorFont><a:minorFont>${字体项(字体.正文)}</a:minorFont></a:fontScheme>`
}

/** 生成完整 theme 部件；提供基底时只替换配色、字体与名称，保留格式方案。 */
function 主题Xml(主题, 基底Xml) {
  校验主题(主题)
  const 全名 = { ...主题, 名称: 主题.名称 }
  if (typeof 基底Xml === 'string' && /<a:themeElements\b/.test(基底Xml) && /<a:fmtScheme\b/.test(基底Xml)) {
    return 基底Xml
      .replace(/<a:theme\b[^>]*>/, `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${全名.名称}">`)
      .replace(/<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/, 配色方案Xml(全名))
      .replace(/<a:fontScheme\b[\s\S]*?<\/a:fontScheme>/, 字体方案Xml(全名.字体, 全名.名称))
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${全名.名称}"><a:themeElements>`
    + 配色方案Xml(全名) + 字体方案Xml(全名.字体, 全名.名称) + 默认格式方案
    + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
}

const 属性 = (标签, 键) => (标签 ?? '').match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]

/** 读取 theme 部件的配色与字体；结构损坏时返回 null，由调用方决定是否警告。 */
function 读取主题(xml) {
  if (typeof xml !== 'string' || !/<a:theme\b/i.test(xml)) return null
  const 配色段 = xml.match(/<a:clrScheme\b[^>]*>[\s\S]*?<\/a:clrScheme>/i)?.[0]
  if (!配色段) return null
  const 配色 = {}
  for (const 槽 of 主题色槽列表) {
    const 方案色 = 槽到配色元素表[槽]
    const 节点 = 配色段.match(new RegExp(`<a:${方案色}\\b[^>]*>[\\s\\S]*?</a:${方案色}>`, 'i'))?.[0]
    const 颜色 = 节点?.match(/<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/i)?.[1]
      ?? 节点?.match(/<a:sysClr\b[^>]*lastClr="([0-9A-Fa-f]{6})"/i)?.[1]
    if (!颜色) return null
    配色[槽] = `#${颜色.toUpperCase()}`
  }
  const 标题字体 = xml.match(/<a:majorFont\b[^>]*>[\s\S]*?<a:latin\b[^>]*typeface="([^"]*)"/i)?.[1]
  const 正文字体 = xml.match(/<a:minorFont\b[^>]*>[\s\S]*?<a:latin\b[^>]*typeface="([^"]*)"/i)?.[1]
  const 名称 = 属性((xml.match(/<a:theme\b[^>]*>/i) ?? [])[0], 'name') || '导入主题'
  return {
    标识: `导入主题-${名称}`,
    名称,
    配色,
    字体: { 标题: 标题字体 || '微软雅黑', 正文: 正文字体 || '微软雅黑' },
    来源: '自定义',
  }
}

/** 读取到的主题若与候选（内置或自定义）配色字体完全一致，沿用候选标识。 */
function 匹配主题标识(读取结果, 候选列表 = []) {
  if (!读取结果) return null
  const 命中 = 候选列表.find((项) => 项 && 项.配色 && 项.字体 &&
    主题色槽列表.every((槽) => 规整颜色(项.配色[槽]) === 规整颜色(读取结果.配色[槽])) &&
    项.字体.标题 === 读取结果.字体.标题 && 项.字体.正文 === 读取结果.字体.正文)
  return 命中 ? 命中.标识 : 读取结果.标识
}

function 槽到方案色(槽) {
  const 方案色 = 槽到引用色表[槽]
  if (!方案色) throw new Error(`主题色无效：不支持的主题色槽（${String(槽)}）`)
  return 方案色
}

function 方案色到槽(方案色) {
  return 方案色到槽表[方案色] ?? null
}

/** 写入主题：替换包内全部 theme 部件，保留各自既有格式方案。 */
async function 写入主题(压缩包, 主题) {
  校验主题(主题)
  const 路径列表 = Object.keys(压缩包.files).filter((路径) => /^ppt\/theme\/theme\d+\.xml$/i.test(路径))
  if (路径列表.length === 0) throw new Error('写入主题失败：包内缺少 theme 部件')
  for (const 路径 of 路径列表) {
    const 文件 = 压缩包.file(路径)
    const 基底 = 文件 ? await 文件.async('string') : undefined
    压缩包.file(路径, 主题Xml(主题, 基底))
  }
}

/**
 * 把指定文本框的显式颜色替换为主题色引用（schemeClr），使 PowerPoint 同样按主题着色。
 * 只改目标形状内与给定颜色一致的颜色，片段级显式颜色保持原样。
 */
function 写入主题色引用(xml, 引用列表, 编码标识) {
  if (!Array.isArray(引用列表) || 引用列表.length === 0) return xml
  const 目标表 = new Map(引用列表.map((项) => [编码标识(项.框标识), 项]))
  return xml.replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi, (形状) => {
    const 名称 = 属性((形状.match(/<p:cNvPr\b[^>]*>/i) ?? [])[0], 'name')
    const 引用 = 目标表.get(名称)
    if (!引用) return 形状
    const 方案色 = 槽到方案色(引用.槽)
    return 形状.replace(/<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"\s*\/>\s*<\/a:solidFill>/gi, (匹配, 颜色) => {
      if (引用.颜色 && 规整颜色(引用.颜色) !== String(颜色).toUpperCase()) return 匹配
      return `<a:solidFill><a:schemeClr val="${方案色}"/></a:solidFill>`
    })
  })
}

/** 读取形状内使用的主题色槽；无方案色时返回 null。 */
function 读取主题色引用(形状Xml) {
  const 匹配 = String(形状Xml ?? '').match(/<a:schemeClr\b[^>]*val="([^"]+)"/i)
  if (!匹配) return null
  return 方案色到槽(匹配[1])
}

module.exports = {
  主题Xml,
  读取主题,
  写入主题,
  匹配主题标识,
  槽到方案色,
  方案色到槽,
  写入主题色引用,
  读取主题色引用,
  主题色槽列表,
  颜色有效,
  规整颜色,
}
