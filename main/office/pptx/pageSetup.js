// 页面尺寸（p:sldSz）、幻灯片背景填充与页脚/日期/页码形状的原生读写。
const path = require('path')
const crypto = require('crypto')

const EMU每像素 = 12700
const 规整颜色 = (值) => String(值).replace(/^#/, '').toUpperCase()
const 颜色有效 = (值) => typeof 值 === 'string' && /^#[0-9a-f]{6}$/i.test(值)
const 属性 = (标签, 键) => (标签 ?? '').match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]
const 转EMU = (像素) => Math.round(Number(像素) * EMU每像素)
const 转像素 = (emu) => Math.round((Number(emu) / EMU每像素) * 100) / 100

const 字段前缀 = 'seal-field:'

function 校验尺寸(尺寸) {
  if (!尺寸 || !Number.isInteger(尺寸.宽) || !Number.isInteger(尺寸.高) ||
      尺寸.宽 < 120 || 尺寸.宽 > 10000 || 尺寸.高 < 120 || 尺寸.高 > 10000) {
    throw new Error('页面尺寸无效：宽高必须是 120 到 10000 之间的整数')
  }
}

function 读取页面尺寸(清单Xml) {
  const 标签 = String(清单Xml ?? '').match(/<p:sldSz\b[^>]*\/?>/i)?.[0]
  if (!标签) return null
  const 宽 = Number(属性(标签, 'cx'))
  const 高 = Number(属性(标签, 'cy'))
  if (!(宽 > 0) || !(高 > 0)) return null
  return { 宽: Math.round(宽 / EMU每像素), 高: Math.round(高 / EMU每像素) }
}

/** 写入页面尺寸：只改 p:sldSz，其余清单内容原样保留。 */
async function 写入页面尺寸(压缩包, 尺寸) {
  校验尺寸(尺寸)
  const 文件 = 压缩包.file('ppt/presentation.xml')
  if (!文件 || typeof 文件.async !== 'function') throw new Error('写入页面尺寸失败：缺少演示清单')
  const 原文 = await 文件.async('string')
  if (!/<p:sldSz\b[^>]*\/?>/i.test(原文)) throw new Error('写入页面尺寸失败：演示清单缺少页面尺寸节点')
  压缩包.file('ppt/presentation.xml', 原文.replace(/<p:sldSz\b[^>]*\/?>/i, `<p:sldSz cx="${转EMU(尺寸.宽)}" cy="${转EMU(尺寸.高)}"/>`))
}

/** 页脚位置随页面尺寸变化，与界面渲染使用同一比例。 */
function 页脚区域(尺寸) {
  const 高 = Math.max(40, Math.round(尺寸.高 * 0.06))
  const 底 = 尺寸.高 - 高 - 8
  const 宽 = Math.min(240, Math.round(尺寸.宽 * 0.25))
  return {
    页码: { x: 尺寸.宽 - 宽 - 24, y: 底, width: 宽, height: 高 },
    日期: { x: 24, y: 底, width: 宽, height: 高 },
    页脚: { x: 宽 + 40, y: 底, width: Math.max(40, 尺寸.宽 - 2 * (宽 + 40)), height: 高 },
  }
}

function 字段形状Xml(名称, 区域, 段落Xml, 对齐) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="0" name="${字段前缀}${名称}" descr="${字段前缀}${名称}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${转EMU(区域.x)}" y="${转EMU(区域.y)}"/><a:ext cx="${转EMU(区域.width)}" cy="${转EMU(区域.height)}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln></a:ln></p:spPr>'
    + `<p:txBody><a:bodyPr wrap="square" rtlCol="0"/><a:lstStyle/><a:p><a:pPr algn="${对齐}"/>${段落Xml}<a:endParaRPr lang="zh-CN" sz="1200"/></a:p></p:txBody></p:sp>`
}

const 文字运行 = (文本, 颜色) => `<a:r><a:rPr lang="zh-CN" sz="1200"><a:solidFill><a:srgbClr val="${规整颜色(颜色)}"/></a:solidFill>`
  + '<a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:rPr>'
  + `<a:t>${转义(文本)}</a:t></a:r>`

const 转义 = (文本) => String(文本).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const 反转义 = (文本) => String(文本).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** 生成页脚、日期与页码的形状 XML；页码使用原生 slidenum 字段。 */
function 页脚形状Xml(设置, 页码, 尺寸) {
  const 区域 = 页脚区域(尺寸)
  const 结果 = {}
  if (设置.显示页码) {
    const 字段 = `<a:fld id="{${crypto.randomUUID().toUpperCase()}}" type="slidenum"><a:rPr lang="zh-CN" sz="1200">`
      + '<a:solidFill><a:srgbClr val="5A6472"/></a:solidFill><a:latin typeface="微软雅黑"/><a:ea typeface="微软雅黑"/></a:rPr>'
      + `<a:t>${页码}</a:t></a:fld>`
    结果.页码 = 字段形状Xml('页码', 区域.页码, 字段, 'r')
  }
  if (设置.显示日期) {
    const 日期文本 = typeof 设置.日期文本 === 'string' && 设置.日期文本 ? 设置.日期文本 : 当前日期文本()
    结果.日期 = 字段形状Xml('日期', 区域.日期, 文字运行(日期文本, '#5A6472'), 'l')
  }
  if (typeof 设置.页脚文本 === 'string' && 设置.页脚文本.length > 0) {
    结果.页脚 = 字段形状Xml('页脚', 区域.页脚, 文字运行(设置.页脚文本, '#5A6472'), 'ctr')
  }
  return 结果
}

function 当前日期文本() {
  const 现在 = new Date()
  const 补零 = (值) => String(值).padStart(2, '0')
  return `${现在.getFullYear()}-${补零(现在.getMonth() + 1)}-${补零(现在.getDate())}`
}

/** 写入页脚形状：首页不显示时保持原样，避免写入后再由读取链路误判。 */
function 写入页脚形状(幻灯片Xml, 设置, 页码, 尺寸) {
  if (!设置) return 幻灯片Xml
  if (设置.首页不显示 && 页码 === 1) return 幻灯片Xml
  const 形状列表 = Object.values(页脚形状Xml(设置, 页码, 尺寸))
  if (形状列表.length === 0) return 幻灯片Xml
  const 最大编号 = Math.max(1, ...Array.from(String(幻灯片Xml).matchAll(/<p:cNvPr\b[^>]*id="(\d+)"/g), (项) => Number(项[1])))
  let 编号 = 最大编号 + 1
  const 内容 = 形状列表.map((形状) => 形状.replace('<p:cNvPr id="0"', `<p:cNvPr id="${编号++}"`)).join('')
  if (!/<\/p:spTree>/.test(幻灯片Xml)) throw new Error('写入页脚失败：幻灯片形状树缺失')
  return 幻灯片Xml.replace('</p:spTree>', `${内容}</p:spTree>`)
}

/** 读取页脚、日期与页码形状；返回 null 表示本页没有页脚信息。 */
function 读取页脚形状(幻灯片Xml) {
  const 结果 = {}
  for (const 匹配 of String(幻灯片Xml ?? '').matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi)) {
    const 形状 = 匹配[0]
    const 名称 = 属性(形状.match(/<p:cNvPr\b[^>]*>/i)?.[0], 'name') ?? ''
    if (!名称.startsWith(字段前缀)) continue
    const 类型 = 名称.slice(字段前缀.length)
    if (类型 === '页码') {
      if (!/type="slidenum"/i.test(形状)) continue
      结果.显示页码 = true
      continue
    }
    const 文本 = Array.from(形状.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/gi), (项) => 反转义(项[1])).join('')
    if (类型 === '日期') {
      结果.显示日期 = true
      if (文本) 结果.日期文本 = 文本
    }
    if (类型 === '页脚' && 文本) 结果.页脚文本 = 文本
  }
  return Object.keys(结果).length > 0 ? 结果 : null
}

/** 移除页脚字段形状：正文解析与警告检查不把页脚当作文本框或图形。 */
function 移除字段形状(幻灯片Xml) {
  return String(幻灯片Xml ?? '').replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi, (形状) => {
    const 名称 = 属性(形状.match(/<p:cNvPr\b[^>]*>/i)?.[0], 'name') ?? ''
    return 名称.startsWith(字段前缀) ? '' : 形状
  })
}

/** 生成 p:bg 片段；图片背景需要调用方提供关系标识。 */
function 背景Xml(填充, 关系标识) {
  if (!填充) throw new Error('背景填充无效：缺少填充参数')
  if (填充.类型 === '纯色') {
    if (!颜色有效(填充.颜色)) throw new Error('背景填充无效：纯色需要有效颜色')
    return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${规整颜色(填充.颜色)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
  }
  if (填充.类型 === '渐变') {
    if (!颜色有效(填充.起始色) || !颜色有效(填充.结束色) || !Number.isFinite(填充.角度)) {
      throw new Error('背景填充无效：渐变需要起始色、结束色与角度')
    }
    return '<p:bg><p:bgPr><a:gradFill rotWithShape="1"><a:gsLst>'
      + `<a:gs pos="0"><a:srgbClr val="${规整颜色(填充.起始色)}"/></a:gs>`
      + `<a:gs pos="100000"><a:srgbClr val="${规整颜色(填充.结束色)}"/></a:gs>`
      + `</a:gsLst><a:lin ang="${Math.round(填充.角度 * 60000)}" scaled="0"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>`
  }
  if (填充.类型 === '图片') {
    if (!关系标识) throw new Error('背景填充无效：图片背景需要先建立图片关系')
    return `<p:bg><p:bgPr><a:blipFill><a:blip r:embed="${关系标识}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`
  }
  throw new Error('背景填充无效：类型不受支持')
}

/** 写入背景填充。两种调用方式：写入背景填充(幻灯片Xml, 填充) 或 写入背景填充(压缩包, 路径, 幻灯片Xml, 填充, 资源)。 */
/** 应用背景填充到幻灯片 XML（同步，供母版与页面共用；图片背景需要关系标识）。 */
function 应用背景填充(幻灯片Xml, 填充, 关系标识) {
  if (填充.类型 === '图片' && !关系标识) throw new Error('写入背景失败：图片背景必须通过压缩包与资源写入')
  return 替换背景(幻灯片Xml, 背景Xml(填充, 关系标识))
}

async function 写入背景填充(参数一, 参数二, 参数三, 参数四, 参数五) {
  if (typeof 参数一 === 'string') return 应用背景填充(参数一, 参数二, 参数三)
  const [压缩包, 路径, 幻灯片Xml, 填充, 资源] = [参数一, 参数二, 参数三, 参数四, 参数五]
  if (填充.类型 !== '图片') return 替换背景(幻灯片Xml, 背景Xml(填充))
  if (!资源 || !资源.数据) throw new Error(`背景图片缺少资源字节：${填充.资源标识}`)
  const 数据 = Buffer.from(资源.数据, 'base64')
  const 扩展 = 资源.类型 === 'image/jpeg' ? 'jpg' : 资源.类型 === 'image/png' ? 'png' : null
  if (!扩展) throw new Error(`背景图片格式不受支持：${资源.类型}`)
  const 媒体路径 = `ppt/media/${资源.标识}.${扩展}`
  压缩包.file(媒体路径, 数据)
  const 类型文件 = 压缩包.file('[Content_Types].xml')
  if (类型文件) {
    const 类型Xml = await 类型文件.async('string')
    if (!new RegExp(`Extension="${扩展}"`).test(类型Xml)) {
      压缩包.file('[Content_Types].xml', 类型Xml.replace('</Types>', `<Default Extension="${扩展}" ContentType="${资源.类型}"/></Types>`))
    }
  }
  const 关系部件路径 = path.posix.join(path.posix.dirname(路径), '_rels', `${path.posix.basename(路径)}.rels`)
  const 关系文件 = 压缩包.file(关系部件路径)
  const 关系内容 = 关系文件
    ? await 关系文件.async('string')
    : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  const 关系标识 = `sealBg${资源.标识.slice(0, 8)}`
  const 新关系 = 关系内容.includes(`Id="${关系标识}"`) ? 关系内容 : 关系内容.replace('</Relationships>',
    `<Relationship Id="${关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${资源.标识}.${扩展}"/></Relationships>`)
  压缩包.file(关系部件路径, 新关系)
  return 替换背景(幻灯片Xml, 背景Xml(填充, 关系标识))
}

function 替换背景(幻灯片Xml, 背景片段) {
  const 文本 = String(幻灯片Xml)
  if (/<p:bg\b[^>]*>[\s\S]*?<\/p:bg>/i.test(文本)) return 文本.replace(/<p:bg\b[^>]*>[\s\S]*?<\/p:bg>/i, 背景片段)
  if (!/<p:cSld\b[^>]*>/i.test(文本)) throw new Error('写入背景失败：幻灯片内容节点缺失')
  return 文本.replace(/(<p:cSld\b[^>]*>)/i, `$1${背景片段}`)
}

/** 读取幻灯片背景填充；图片背景返回关系标识，由调用方解析为资源指纹。 */
function 读取背景填充(幻灯片Xml) {
  const 背景段 = String(幻灯片Xml ?? '').match(/<p:bg\b[^>]*>[\s\S]*?<\/p:bg>/i)?.[0]
  if (!背景段) return null
  if (/<a:blipFill\b/i.test(背景段)) {
    const 关系标识 = 属性(背景段.match(/<a:blip\b[^>]*>/i)?.[0], 'r:embed')
    return 关系标识 ? { 类型: '图片', 关系标识 } : null
  }
  if (/<a:gradFill\b/i.test(背景段)) {
    const 颜色列表 = Array.from(背景段.matchAll(/<a:gs\b[^>]*pos="(\d+)"><a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"\/><\/a:gs>/gi))
      .sort((甲, 乙) => Number(甲[1]) - Number(乙[1]))
    if (颜色列表.length < 2) return null
    const 角度 = Number(属性(背景段.match(/<a:lin\b[^>]*>/i)?.[0], 'ang') ?? 0) / 60000
    return {
      类型: '渐变',
      起始色: `#${颜色列表[0][2].toUpperCase()}`,
      结束色: `#${颜色列表[颜色列表.length - 1][2].toUpperCase()}`,
      角度,
    }
  }
  if (/<a:solidFill\b/i.test(背景段)) {
    const 颜色 = 背景段.match(/<a:solidFill\b[^>]*>\s*<a:srgbClr\b[^>]*val="([0-9A-Fa-f]{6})"/i)?.[1]
    return 颜色 ? { 类型: '纯色', 颜色: `#${颜色.toUpperCase()}` } : null
  }
  // 主题背景引用（bgRef）由主题解析，不在页面背景中处理
  return null
}

module.exports = {
  读取页面尺寸,
  写入页面尺寸,
  页面尺寸EMU: EMU每像素,
  页脚区域,
  页脚形状Xml,
  写入页脚形状,
  读取页脚形状,
  移除字段形状,
  字段前缀,
  背景Xml,
  应用背景填充,
  写入背景填充,
  读取背景填充,
  转EMU,
  转像素,
}
