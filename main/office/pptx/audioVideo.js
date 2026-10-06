const { 检查媒体字节, 生成封面占位图 } = require('./mediaTypes')

/**
 * 音视频、动作超链接与永久笔迹的原生 XML 构建与解析。
 * 本模块只做字符串与结构处理，部件、关系和压缩包访问由 media.js 负责。
 */
const 链接前缀 = 'seal-link:'
const 媒体前缀 = 'seal-media:'
const 墨迹前缀 = 'seal-ink:'
const 链接协议 = ['http:', 'https:', 'mailto:']
const 视频扩展 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video'
const 音频扩展 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio'
const 图片扩展 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
const 超链接扩展 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
const 幻灯片扩展 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
const 编码 = 值 => Buffer.from(JSON.stringify(值), 'utf8').toString('base64url')
const 解码 = 文本 => JSON.parse(Buffer.from(文本, 'base64url').toString('utf8'))
const 转EMU = 值 => Math.round(值 * 12700)
const 属性 = (标签, 键) => 标签?.match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]

/** 链接目标必须落在允许协议内；页跳转必须指向当前文稿中真实存在的页面标识。 */
function 校验链接(链接, 已知页面 = []) {
  if (!链接 || typeof 链接 !== 'object' || Array.isArray(链接)) throw new Error('链接设置无效')
  const 键 = Object.keys(链接)
  if (键.some(名称 => !['类型', '目标'].includes(名称))) throw new Error('链接设置含未知属性')
  const 目标 = typeof 链接.目标 === 'string' ? 链接.目标 : ''
  if (链接.类型 === '网页') {
    if (!目标 || 目标.length > 2048) throw new Error('链接地址为空或过长')
    let 地址
    try { 地址 = new URL(目标) } catch { throw new Error('链接地址格式无效') }
    if (!链接协议.includes(地址.protocol)) throw new Error(`链接协议不受支持：${地址.protocol}`)
    return { 类型: '网页', 目标: 地址.toString() }
  }
  if (链接.类型 === '页') {
    if (!目标) throw new Error('页面跳转目标为空')
    if (已知页面.length && !已知页面.includes(目标)) throw new Error(`页面跳转目标不存在：${目标}`)
    return { 类型: '页', 目标 }
  }
  if (链接.类型 === '结束') {
    if (目标) throw new Error('结束放映动作不接受目标')
    return { 类型: '结束', 目标: '' }
  }
  throw new Error('链接类型不受支持')
}

/** 生成 p:cNvPr 内的链接子元素与所需关系；页跳转关系由调用方解析目标路径。 */
function 构建链接(链接, 编号, 解析页面路径) {
  const 规范化 = 校验链接(链接)
  if (规范化.类型 === '网页') {
    const 关系标识 = `sealLink${编号}`
    return { 子元素: `<a:hlinkClick r:id="${关系标识}"/>`, 关系: [{ 标识: 关系标识, 类型: 超链接扩展, 目标: 规范化.目标, 外部: true }] }
  }
  if (规范化.类型 === '页') {
    const 关系标识 = `sealLink${编号}`
    const 目标路径 = 解析页面路径(规范化.目标)
    if (!目标路径) throw new Error(`页面跳转目标不存在：${规范化.目标}`)
    return { 子元素: `<a:hlinkClick r:id="${关系标识}" action="ppaction://hlinksldjump"/>`, 关系: [{ 标识: 关系标识, 类型: 幻灯片扩展, 目标: 目标路径, 外部: false }] }
  }
  return { 子元素: '<a:hlinkClick action="ppaction://hlinkshowjump?jump=end"/>', 关系: [] }
}

/** 从原生属性还原链接；页跳转先给出路径，由读取方按幻灯片顺序换算成页面标识。 */
function 解析链接(属性标签, 关系) {
  const 片段 = 属性标签?.match(/<a:hlinkClick\b[^>]*>/)?.[0]
  if (!片段) return {}
  const 键 = Object.keys(Object.fromEntries([...片段.matchAll(/([\w:]+)\s*=\s*(["'])(.*?)\2/g)].map(项 => [项[1], 项[3]])))
  if (键.some(名称 => !['r:id', 'action', 'tooltip', 'invalidUrl'].includes(名称))) return { 警告: '链接属性未完整导入' }
  const action = 属性(片段, 'action')
  if (action === 'ppaction://hlinkshowjump?jump=end') {
    if (属性(片段, 'r:id')) return { 警告: '链接属性未完整导入' }
    return { 链接: { 类型: '结束', 目标: '' } }
  }
  const 关系标识 = 属性(片段, 'r:id')
  const 关联 = 关系?.get(关系标识)
  if (!关联) return { 警告: '链接关系缺失，链接未完整导入' }
  if (action === 'ppaction://hlinksldjump') {
    if (关联.外部 || !关联.类型.endsWith('/slide')) return { 警告: '页面跳转关系无效，链接未完整导入' }
    return { 链接: { 类型: '页', 目标路径: 关联.目标 } }
  }
  if (action) return { 警告: '链接动作未完整导入' }
  if (!关联.外部 || !关联.类型.endsWith('/hyperlink')) return { 警告: '链接关系无效，链接未完整导入' }
  try {
    return { 链接: { 类型: '网页', 目标: 校验链接({ 类型: '网页', 目标: 关联.目标 }).目标 } }
  } catch { return { 警告: '链接地址协议不受支持，链接未完整导入' } }
}

function 媒体参数(对象) {
  const 参数 = 对象.媒体 ?? {}
  const 数值 = 值 => Number.isFinite(值)
  if (!['音频', '视频'].includes(参数.种类)) throw new Error('媒体种类无效')
  if (参数.开始毫秒 !== undefined && (!数值(参数.开始毫秒) || 参数.开始毫秒 < 0 || 参数.开始毫秒 > 86400000)) throw new Error('媒体播放起点无效')
  if (参数.结束毫秒 !== undefined && (!数值(参数.结束毫秒) || 参数.结束毫秒 <= 0 || 参数.结束毫秒 > 86400000)) throw new Error('媒体播放终点无效')
  if (参数.结束毫秒 !== undefined && 参数.开始毫秒 !== undefined && 参数.结束毫秒 <= 参数.开始毫秒) throw new Error('媒体播放终点必须晚于起点')
  if (参数.音量 !== undefined && (!数值(参数.音量) || 参数.音量 < 0 || 参数.音量 > 100)) throw new Error('媒体音量无效')
  if (参数.循环 !== undefined && typeof 参数.循环 !== 'boolean') throw new Error('媒体循环设置无效')
  if (参数.自动播放 !== undefined && typeof 参数.自动播放 !== 'boolean') throw new Error('媒体自动播放设置无效')
  if (参数.封面资源标识 !== undefined && (typeof 参数.封面资源标识 !== 'string' || !参数.封面资源标识)) throw new Error('媒体封面资源标识无效')
  return {
    种类: 参数.种类,
    ...(参数.封面资源标识 === undefined ? {} : { 封面资源标识: 参数.封面资源标识 }),
    ...(参数.开始毫秒 === undefined ? {} : { 开始毫秒: 参数.开始毫秒 }),
    ...(参数.结束毫秒 === undefined ? {} : { 结束毫秒: 参数.结束毫秒 }),
    音量: 参数.音量 ?? 100,
    循环: 参数.循环 ?? false,
    自动播放: 参数.自动播放 ?? false,
  }
}

/** 构建 <p:pic> 媒体对象；poster 关系、媒体关系与部件由调用方准备。 */
function 构建媒体Xml({ 对象, 编号, 媒体关系标识, 封面关系标识, 媒体种类, 锁定 = false, 链接 = null }) {
  const 参数 = 媒体参数(对象)
  if (参数.种类 !== 媒体种类) throw new Error('媒体种类与资源字节不一致')
  const 私有 = { ...参数 }
  delete 私有.封面资源标识
  const 媒体节点 = 媒体种类 === '视频'
    ? `<a:videoFile r:link="${媒体关系标识}"/><p:extLst><p:ext uri="{DAA4B4D4-6D52-4FEC-AC4B-6A0B1B9C4C4A}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="${媒体关系标识}"/></p:ext></p:extLst>`
    : `<a:audioFile r:link="${媒体关系标识}"/>`
  const 非视觉 = `<p:cNvPr id="${编号}" name="seal-id:${Buffer.from(对象.id, 'utf8').toString('base64url')}" descr="${媒体前缀}${编码(私有)}"${链接 ? `>${链接}</p:cNvPr>` : '/>'}`
  return `<p:pic><p:nvPicPr>${非视觉}<p:cNvPicPr><a:picLocks noMove="${锁定 ? 1 : 0}" noResize="${锁定 ? 1 : 0}"/></p:cNvPicPr><p:nvPr>${媒体节点}</p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${封面关系标识}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
}

/** 解析媒体 p:pic 片段；返回参数与关系标识，部件字节由调用方读取。 */
function 解析媒体片段(内容) {
  const 属性标签 = 内容.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
  const 私有 = 属性(属性标签, 'descr')
  if (!私有?.startsWith(媒体前缀)) return null
  let 参数
  try { 参数 = 解码(私有.slice(媒体前缀.length)) } catch { return { 警告: '媒体播放参数损坏，未完整导入' } }
  const 允许键 = ['种类', '封面资源标识', '开始毫秒', '结束毫秒', '音量', '循环', '自动播放']
  if (!参数 || typeof 参数 !== 'object' || Array.isArray(参数) || Object.keys(参数).some(键 => !允许键.includes(键))) return { 警告: '媒体播放参数含未知属性，未完整导入' }
  const 视频节点 = 内容.match(/<a:videoFile\b[^>]*>/)?.[0] ?? ''
  const 音频节点 = 内容.match(/<a:audioFile\b[^>]*>/)?.[0] ?? ''
  const 嵌入节点 = 内容.match(/<p14:media\b[^>]*>/)?.[0] ?? ''
  const 媒体关系 = 属性(视频节点, 'r:link') ?? 属性(音频节点, 'r:link') ?? 属性(嵌入节点, 'r:embed')
  if (!媒体关系) return { 警告: '媒体关系缺失，媒体未完整导入' }
  const 种类 = 视频节点 ? '视频' : 音频节点 ? '音频' : null
  if (!种类) return { 警告: '媒体类型未完整导入' }
  if (参数.种类 !== 种类) return { 警告: '媒体种类与原生节点不一致，未完整导入' }
  if (视频节点 && !嵌入节点) return { 警告: '视频嵌入关系缺失，媒体未完整导入' }
  const 位置 = 内容.match(/<a:off\b[^>]*>/)?.[0] ?? '', 尺寸 = 内容.match(/<a:ext\b[^>]*>/)?.[0] ?? ''
  const 几何 = [属性(位置, 'x'), 属性(位置, 'y'), 属性(尺寸, 'cx'), 属性(尺寸, 'cy')].map(Number)
  if (!几何.every(Number.isFinite) || 几何[2] <= 0 || 几何[3] <= 0) return { 警告: '媒体几何数据损坏，未完整导入' }
  const 封面关系 = 属性(内容.match(/<a:blip\b[^>]*>/)?.[0] ?? '', 'r:embed')
  const 支持标签 = new Set(['p:pic','p:nvPicPr','p:cNvPr','p:cNvPicPr','p:nvPr','p:blipFill','p:spPr','a:picLocks','a:blip','a:stretch','a:fillRect','a:xfrm','a:off','a:ext','a:prstGeom','a:avLst','a:videoFile','a:audioFile','p:extLst','p:ext','p14:media','a:hlinkClick'])
  if (Array.from(内容.matchAll(/<([\w:]+)\b/g), 项 => 项[1]).some(标签 => !支持标签.has(标签))) return { 警告: '媒体对象含未支持内容，未完整导入' }
  if (/<a:srcRect\b/.test(内容)) return { 警告: '媒体封面裁剪未完整导入' }
  const 锁定 = ['1', 'true'].includes(属性(内容.match(/<a:picLocks\b[^>]*>/)?.[0] ?? '', 'noMove'))
  return { 参数, 种类, 媒体关系, 封面关系, 几何, 锁定, 支持标签 }
}

/** 永久笔迹：以原生自由曲线保存，点集写入私有属性以便精确重开。 */
function 构建墨迹Xml(对象, 编号) {
  const 墨迹 = 对象.墨迹
  if (!墨迹 || !Array.isArray(墨迹.笔画) || !墨迹.笔画.length) throw new Error('笔迹缺少笔画数据')
  if (typeof 墨迹.颜色 !== 'string' || !/^#[0-9a-f]{6}$/i.test(墨迹.颜色)) throw new Error('笔迹颜色无效')
  if (!Number.isFinite(墨迹.笔宽) || 墨迹.笔宽 <= 0 || 墨迹.笔宽 > 40) throw new Error('笔迹宽度无效')
  for (const 笔画 of 墨迹.笔画) {
    if (!Array.isArray(笔画) || 笔画.length < 2 || 笔画.length > 2000) throw new Error('笔迹笔画点数无效')
    for (const 点 of 笔画) if (!点 || !Number.isFinite(点.x) || !Number.isFinite(点.y) || 点.x < 0 || 点.y < 0 || 点.x > 20000 || 点.y > 20000) throw new Error('笔迹坐标无效')
  }
  const 宽 = 对象.width, 高 = 对象.height
  const 路径 = 墨迹.笔画.map(笔画 => {
    const 点 = 笔画.map(项 => `<a:pt x="${转EMU(项.x - 对象.x)}" y="${转EMU(项.y - 对象.y)}"/>`).join('')
    return `<a:path w="${转EMU(宽)}" h="${转EMU(高)}"><a:moveTo>${笔画.slice(0, 1).map(项 => `<a:pt x="${转EMU(项.x - 对象.x)}" y="${转EMU(项.y - 对象.y)}"/>`).join('')}</a:moveTo><a:lnTo>${点}</a:lnTo></a:path>`
  }).join('')
  return `<p:sp><p:nvSpPr><p:cNvPr id="${编号}" name="seal-id:${Buffer.from(对象.id, 'utf8').toString('base64url')}" descr="${墨迹前缀}${编码(墨迹)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(宽)}" cy="${转EMU(高)}"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${转EMU(宽)}" b="${转EMU(高)}"/><a:pathLst>${路径}</a:pathLst></a:custGeom><a:noFill/><a:ln w="${Math.round(墨迹.笔宽 * 12700)}" cap="rnd"><a:solidFill><a:srgbClr val="${墨迹.颜色.slice(1).toUpperCase()}"/></a:solidFill><a:round/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`
}

function 解析墨迹片段(片段) {
  const 属性标签 = 片段.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
  const 私有 = 属性(属性标签, 'descr')
  if (!私有?.startsWith(墨迹前缀)) return null
  let 墨迹
  try { 墨迹 = 解码(私有.slice(墨迹前缀.length)) } catch { return { 警告: '笔迹数据损坏，未完整导入' } }
  if (!墨迹 || typeof 墨迹 !== 'object' || Object.keys(墨迹).some(键 => !['颜色', '笔宽', '笔画'].includes(键))) return { 警告: '笔迹数据含未知属性，未完整导入' }
  const 位置 = 片段.match(/<a:off\b[^>]*>/)?.[0] ?? '', 尺寸 = 片段.match(/<a:ext\b[^>]*>/)?.[0] ?? ''
  const 几何 = [属性(位置, 'x'), 属性(位置, 'y'), 属性(尺寸, 'cx'), 属性(尺寸, 'cy')].map(Number)
  if (!几何.every(Number.isFinite) || 几何[2] <= 0 || 几何[3] <= 0 || !/<a:custGeom\b/.test(片段)) return { 警告: '笔迹几何数据损坏，未完整导入' }
  try { 构建墨迹Xml({ id: '校验', x: 几何[0] / 12700, y: 几何[1] / 12700, width: 几何[2] / 12700, height: 几何[3] / 12700, 墨迹 }, 1) }
  catch { return { 警告: '笔迹数据无效，未完整导入' } }
  return { 墨迹, 几何 }
}

module.exports = {
  校验链接, 构建链接, 解析链接, 媒体参数, 构建媒体Xml, 解析媒体片段, 构建墨迹Xml, 解析墨迹片段,
  生成封面占位图, 检查媒体字节, 视频扩展, 音频扩展, 图片扩展, 超链接扩展, 幻灯片扩展,
  链接前缀, 媒体前缀, 墨迹前缀, 链接协议,
}
