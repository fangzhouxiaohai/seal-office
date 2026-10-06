const crypto = require('crypto')
const { 校验字段, 非视觉, 转EMU } = require('./shapes')
const { 读取关系 } = require('./relations')
const { 读取部件 } = require('./parts')

// 嵌入对象与附件：保存真实字节，支持提取与内容校验；本机不执行任何宏或脚本。
// 原生图示（SmartArt）：按部件与关系原样保留，本机可显示与移动，不冒充可编辑语义图。

const 附件媒体类型 = 'application/vnd.openxmlformats-officedocument.oleObject'
const 图示媒体类型 = 'application/vnd.seal.diagram+json'
const 图示关系类型 = {
  dm: { 关系: 'diagramData', 内容类型: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml' },
  lo: { 关系: 'diagramLayout', 内容类型: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml' },
  qs: { 关系: 'diagramQuickStyle', 内容类型: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml' },
  cs: { 关系: 'diagramColors', 内容类型: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml' },
}
const 宏扩展名 = new Set(['docm', 'dotm', 'xlsm', 'xltm', 'pptm', 'potm', 'ppam', 'xlam', 'doc', 'xls', 'ppt'])
const 转像素 = (值) => Number(值) / 12700
const 转义 = (值) => String(值).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const 属性 = (标签, 键) => 标签?.match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]

/** 附件字节校验：空内容、大小与宏风险都要有明确结论。 */
function 检查嵌入字节(数据, 文件名) {
  if (!Buffer.isBuffer(数据) || 数据.length === 0) throw new Error('附件内容为空或不是二进制数据')
  if (数据.length > 50 * 1024 * 1024) throw new Error('附件超过单个 50MB 限制')
  if (typeof 文件名 !== 'string' || !文件名.trim()) throw new Error('附件文件名无效')
  const 扩展名 = 文件名.includes('.') ? 文件名.split('.').pop().toLowerCase() : ''
  return { 类型: 附件媒体类型, 字节数: 数据.length, 宏风险: 宏扩展名.has(扩展名) }
}

function 校验附件对象(对象) {
  校验字段(对象, ['id', '类型', 'x', 'y', 'width', 'height', '旋转', '锁定', '附件', '子对象标识'])
  if (对象.子对象标识 !== undefined) throw new Error('附件不能携带组合成员')
  校验字段(对象.附件, ['文件名', '显示名称', '资源标识', '字节数'])
  const 附 = 对象.附件
  if (typeof 附.文件名 !== 'string' || !附.文件名.trim() || 附.文件名.length > 255) throw new Error('附件文件名无效')
  if (typeof 附.显示名称 !== 'string' || !附.显示名称.trim() || 附.显示名称.length > 255) throw new Error('附件显示名称无效')
  if (typeof 附.资源标识 !== 'string' || !/^[0-9a-f]{64}$/i.test(附.资源标识)) throw new Error('附件资源标识无效')
  if (!Number.isSafeInteger(附.字节数) || 附.字节数 <= 0) throw new Error('附件字节数无效')
  if (![对象.x, 对象.y, 对象.width, 对象.height].every(Number.isFinite) || 对象.width <= 0 || 对象.height <= 0) throw new Error('附件位置或尺寸无效')
  if (对象.旋转) throw new Error('嵌入对象暂不支持旋转')
}

async function 写入附件对象(对象, 编号, 环境) {
  校验附件对象(对象)
  const 资源 = 环境.资源表.get(对象.附件.资源标识)
  if (!资源 || !资源.数据) throw new Error(`附件资源字节缺失：${对象.附件.资源标识}`)
  if (资源.类型 !== 附件媒体类型) throw new Error(`附件资源类型无效：${资源.类型}`)
  const 数据 = Buffer.from(资源.数据, 'base64')
  if (数据.length !== 对象.附件.字节数) throw new Error(`附件字节数与资源不一致：${对象.附件.资源标识}`)
  if (crypto.createHash('sha256').update(数据).digest('hex') !== 对象.附件.资源标识) throw new Error('附件资源指纹不匹配')
  const 部件路径 = `ppt/embeddings/${对象.附件.资源标识}.bin`
  环境.包.file(部件路径, 数据)
  const 关系标识 = `sealOle${编号}`
  const 关系Xml = 环境.关系Xml.replace('</Relationships>', `<Relationship Id="${关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/${对象.附件.资源标识}.bin"/></Relationships>`)
  const 类型Xml = 环境.类型Xml.includes('Extension="bin"') ? 环境.类型Xml
    : 环境.类型Xml.replace('</Types>', `<Default Extension="bin" ContentType="${附件媒体类型}"/></Types>`)
  const 锁 = 对象.锁定 ? 1 : 0
  const xml = `<p:graphicFrame xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:nvGraphicFramePr>${非视觉(对象, 编号)}<p:cNvGraphicFramePr><a:graphicFrameLocks noMove="${锁}" noResize="${锁}"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole"><p:oleObj spid="${编号}" name="${转义(对象.附件.显示名称)}" r:id="${关系标识}" imgW="${转EMU(对象.width)}" imgH="${转EMU(对象.height)}" progId="Package"><p:embed/></p:oleObj></a:graphicData></a:graphic></p:graphicFrame>`
  return { xml, 关系Xml, 类型Xml }
}

/** 读取附件（oleObj）图形框；关系缺失或类型不符时明确报错，不静默丢弃。 */
async function 读取附件对象(包, 路径, xml) {
  const 关系 = await 读取关系(包, 路径)
  const 对象列表 = [], 资源条目 = [], 警告 = new Set()
  const 已识别 = new Set()
  for (const 匹配 of xml.matchAll(/<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>/g)) {
    const 片段 = 匹配[0]
    if (!/<p:oleObj\b/.test(片段)) continue
    已识别.add(片段)
    const 对象标签 = 片段.match(/<p:oleObj\b[^>]*>/)?.[0] ?? ''
    const 关系标识 = 属性(对象标签, 'r:id')
    const 关联 = 关系.get(关系标识)
    if (!关联 || 关联.外部 || !关联.类型.endsWith('/oleObject')) throw new Error(`演示文件无效：嵌入对象关系缺失或无效（${关系标识 ?? '无标识'}）`)
    const 数据 = await 读取部件(包, 关联.目标).async('nodebuffer')
    const 标识 = crypto.createHash('sha256').update(数据).digest('hex')
    const 变换 = 片段.match(/<p:xfrm\b[^>]*>([\s\S]*?)<\/p:xfrm>/)?.[1] ?? ''
    const 位置 = 变换.match(/<a:off\b[^>]*>/)?.[0], 尺寸 = 变换.match(/<a:ext\b[^>]*>/)?.[0]
    if (!位置 || !尺寸) throw new Error('演示文件无效：嵌入对象缺少位置或尺寸')
    const 非视觉标签 = 片段.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
    const 私有 = 读取私有元数据(属性(非视觉标签, 'descr'))
    const 宏风险 = 检查嵌入字节(数据, 私有?.附件?.文件名 ?? '嵌入对象.bin').宏风险 || /macro/i.test(属性(对象标签, 'progId') ?? '')
    if (宏风险) 警告.add('嵌入对象可能包含宏或脚本，本机不执行')
    if (/\/oleObject$/.test(关联.类型) && 数据.length === 0) throw new Error('演示文件无效：嵌入对象部件为空')
    资源条目.push({ 标识, 类型: 附件媒体类型, 数据: 数据.toString('base64') })
    const 文件名 = 私有?.附件?.文件名 ?? `嵌入对象-${标识.slice(0, 8)}.bin`
    const 显示名称 = 属性(对象标签, 'name') || 私有?.附件?.显示名称 || 文件名
    if (私有 && 私有.附件 && 私有.附件.资源标识 !== 标识) 警告.add('嵌入对象已被外部修改，附件信息未完整导入')
    对象列表.push({
      id: 私有?.id ?? `ole-${属性(非视觉标签, 'id') ?? 标识.slice(0, 8)}`,
      类型: '附件',
      x: 转像素(属性(位置, 'x')), y: 转像素(属性(位置, 'y')),
      width: 转像素(属性(尺寸, 'cx')), height: 转像素(属性(尺寸, 'cy')),
      ...(私有?.锁定 ? { 锁定: true } : {}),
      附件: { 文件名, 显示名称, 资源标识: 标识, 字节数: 数据.length },
    })
  }
  if (!对象列表.length) return { 对象列表, 资源条目, 警告: Array.from(警告), 剩余: xml }
  const 剩余 = Array.from(已识别).reduce((结果, 片段) => 结果.replace(片段, ''), xml)
  return { 对象列表, 资源条目, 警告: Array.from(警告), 剩余 }
}

function 读取私有元数据(descr) {
  if (typeof descr !== 'string' || !descr.startsWith('seal-element:')) return null
  try { return JSON.parse(Buffer.from(descr.slice('seal-element:'.length), 'base64url').toString('utf8')) } catch { return null }
}

function 校验图示对象(对象) {
  校验字段(对象, ['id', '类型', 'x', 'y', 'width', 'height', '旋转', '锁定', '图示', '子对象标识'])
  if (对象.子对象标识 !== undefined) throw new Error('图示不能携带组合成员')
  校验字段(对象.图示, ['显示文本', '资源标识', '关系'])
  if (对象.旋转) throw new Error('原生图示暂不支持旋转，请先解除或转换后再调整')
  if (typeof 对象.图示.显示文本 !== 'string') throw new Error('图示显示文本无效')
  if (typeof 对象.图示.资源标识 !== 'string' || !/^[0-9a-f]{64}$/i.test(对象.图示.资源标识)) throw new Error('图示资源标识无效')
  if (!Array.isArray(对象.图示.关系) || !对象.图示.关系.length) throw new Error('图示部件关系无效')
  for (const 项 of 对象.图示.关系) {
    校验字段(项, ['角色', '部件路径'])
    if (!Object.keys(图示关系类型).includes(项.角色) || typeof 项.部件路径 !== 'string' || !/^ppt\/diagrams\/[^/]+\.xml$/i.test(项.部件路径)) throw new Error('图示部件关系无效')
  }
  if (![对象.x, 对象.y, 对象.width, 对象.height].every(Number.isFinite) || 对象.width <= 0 || 对象.height <= 0) throw new Error('图示位置或尺寸无效')
}

function 解析图示包(数据) {
  let 包
  try { 包 = JSON.parse(数据.toString('utf8')) } catch { throw new Error('图示部件数据损坏') }
  if (!包 || !Array.isArray(包.部件) || !包.部件.length || 包.部件.length > 40) throw new Error('图示部件数据损坏')
  for (const 部件 of 包.部件) {
    if (!部件 || typeof 部件.路径 !== 'string' || !/^ppt\/diagrams\/[^/]+\.xml(?:\.rels)?$/i.test(部件.路径) ||
        typeof 部件.数据 !== 'string' || !部件.数据.length) throw new Error('图示部件数据损坏')
    if (部件.内容类型 !== undefined && (typeof 部件.内容类型 !== 'string' || !/^[a-z\d.+-]+\/[a-z\d.+-]+$/i.test(部件.内容类型))) throw new Error('图示部件内容类型无效')
  }
  return 包
}

async function 写入图示对象(对象, 编号, 环境) {
  校验图示对象(对象)
  const 资源 = 环境.资源表.get(对象.图示.资源标识)
  if (!资源 || !资源.数据) throw new Error(`图示资源缺失：${对象.图示.资源标识}`)
  if (资源.类型 !== 图示媒体类型) throw new Error(`图示资源类型无效：${资源.类型}`)
  const 数据 = Buffer.from(资源.数据, 'base64')
  if (crypto.createHash('sha256').update(数据).digest('hex') !== 对象.图示.资源标识) throw new Error('图示资源指纹不匹配')
  const 包数据 = 解析图示包(数据)
  const 部件表 = new Map(包数据.部件.map((项) => [项.路径, 项]))
  for (const 项 of 对象.图示.关系) if (!部件表.has(项.部件路径)) throw new Error(`图示资源缺少部件：${项.部件路径}`)
  let 关系Xml = 环境.关系Xml, 类型Xml = 环境.类型Xml
  const 关系标识表 = {}
  for (const 项 of 对象.图示.关系) {
    const 关系标识 = `sealDgm${编号}${项.角色}`
    关系标识表[项.角色] = 关系标识
    关系Xml = 关系Xml.replace('</Relationships>', `<Relationship Id="${关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${图示关系类型[项.角色].关系}" Target="../diagrams/${项.部件路径.split('/').pop()}"/></Relationships>`)
    const 内容类型 = 部件表.get(项.部件路径).内容类型 ?? 图示关系类型[项.角色].内容类型
    if (!类型Xml.includes(`PartName="/${项.部件路径}"`)) 类型Xml = 类型Xml.replace('</Types>', `<Override PartName="/${项.部件路径}" ContentType="${内容类型}"/></Types>`)
  }
  for (const 部件 of 包数据.部件) 环境.包.file(部件.路径, Buffer.from(部件.数据, 'base64'))
  const 角色属性 = Object.entries(关系标识表).map(([角色, 标识]) => ` r:${角色}="${标识}"`).join('')
  const 锁 = 对象.锁定 ? 1 : 0
  const xml = `<p:graphicFrame xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><p:nvGraphicFramePr>${非视觉(对象, 编号)}<p:cNvGraphicFramePr><a:graphicFrameLocks noMove="${锁}" noResize="${锁}"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds${角色属性}/></a:graphicData></a:graphic></p:graphicFrame>`
  return { xml, 关系Xml, 类型Xml }
}

async function 读取图示对象(包, 路径, xml) {
  const 关系 = await 读取关系(包, 路径)
  const 对象列表 = [], 资源条目 = [], 警告 = new Set()
  const 已识别 = new Set()
  for (const 匹配 of xml.matchAll(/<p:graphicFrame\b[^>]*>[\s\S]*?<\/p:graphicFrame>/g)) {
    const 片段 = 匹配[0]
    const 关系标签 = 片段.match(/<dgm:relIds\b[^>]*\/?>/)?.[0]
    if (!关系标签) continue
    已识别.add(片段)
    const 部件列表 = [], 对象关系 = []
    for (const 角色 of Object.keys(图示关系类型)) {
      const 关系标识 = 属性(关系标签, `r:${角色}`)
      if (!关系标识) continue
      const 关联 = 关系.get(关系标识)
      if (!关联 || 关联.外部 || !关联.类型.endsWith(`/${图示关系类型[角色].关系}`)) throw new Error(`演示文件无效：图示关系缺失或无效（${关系标识}）`)
      if (!/^ppt\/diagrams\/[^/]+\.xml$/i.test(关联.目标)) throw new Error('演示文件无效：图示部件路径无效')
      const 内容 = await 读取部件(包, 关联.目标).async('nodebuffer')
      部件列表.push({ 路径: 关联.目标, 内容类型: 图示关系类型[角色].内容类型, 数据: 内容.toString('base64') })
      对象关系.push({ 角色, 部件路径: 关联.目标 })
    }
    if (!对象关系.some((项) => 项.角色 === 'dm')) throw new Error('演示文件无效：图示缺少数据部件关系')
    // 图示部件自身的子关系（例如数据部件指向 drawing 部件）必须一并保留，否则外部软件无法重新绘制。
    for (const 部件 of [...部件列表]) {
      const 关系路径 = `ppt/diagrams/_rels/${部件.路径.split('/').pop()}.rels`
      if (!包.file(关系路径)) continue
      const 子关系Xml = await 读取部件(包, 关系路径).async('nodebuffer')
      部件列表.push({ 路径: 关系路径, 内容类型: undefined, 数据: 子关系Xml.toString('base64') })
      for (const 子 of 解析关系文本(子关系Xml.toString('utf8'))) {
        if (!包.file(子)) continue
        if (部件列表.some((项) => 项.路径 === 子)) continue
        const 子数据 = await 读取部件(包, 子).async('nodebuffer')
        部件列表.push({ 路径: 子, 内容类型: 图示绘制内容类型(子), 数据: 子数据.toString('base64') })
      }
    }
    const 数据部件路径 = 对象关系.find((项) => 项.角色 === 'dm').部件路径
    const 数据部件 = 部件列表.find((项) => 项.路径 === 数据部件路径)
    const 显示文本 = 读取图示文本(Buffer.from(数据部件.数据, 'base64').toString('utf8'))
    const 包数据 = Buffer.from(JSON.stringify({ 部件: 部件列表 }), 'utf8')
    const 标识 = crypto.createHash('sha256').update(包数据).digest('hex')
    资源条目.push({ 标识, 类型: 图示媒体类型, 数据: 包数据.toString('base64') })
    const 变换 = 片段.match(/<p:xfrm\b[^>]*>([\s\S]*?)<\/p:xfrm>/)?.[1] ?? ''
    const 位置 = 变换.match(/<a:off\b[^>]*>/)?.[0], 尺寸 = 变换.match(/<a:ext\b[^>]*>/)?.[0]
    const 非视觉标签 = 片段.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
    const 私有 = 读取私有元数据(属性(非视觉标签, 'descr'))
    if (私有 && 私有.图示 && 私有.图示.资源标识 !== 标识) 警告.add('原生图示已被外部修改，语义结构未完整导入')
    对象列表.push({
      id: 私有?.id ?? `diagram-${属性(非视觉标签, 'id') ?? 标识.slice(0, 8)}`,
      类型: '图示',
      x: 位置 ? 转像素(属性(位置, 'x')) : 120, y: 位置 ? 转像素(属性(位置, 'y')) : 100,
      width: 尺寸 ? 转像素(属性(尺寸, 'cx')) : 240, height: 尺寸 ? 转像素(属性(尺寸, 'cy')) : 150,
      ...(私有?.锁定 ? { 锁定: true } : {}),
      图示: { 显示文本, 资源标识: 标识, 关系: 对象关系 },
    })
  }
  if (!对象列表.length) return { 对象列表, 资源条目, 警告: Array.from(警告), 剩余: xml }
  const 剩余 = Array.from(已识别).reduce((结果, 片段) => 结果.replace(片段, ''), xml)
  return { 对象列表, 资源条目, 警告: Array.from(警告), 剩余 }
}

const 图示绘制内容类型 = (路径) => (/drawing/i.test(路径) ? 'application/vnd.ms-office.drawingml.diagramDrawing+xml' : 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml')

function 解析关系文本(xml) {
  const 目标 = []
  for (const 匹配 of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const 标签 = 匹配[0]
    if (属性(标签, 'TargetMode') === 'External') continue
    const 目标值 = 属性(标签, 'Target')
    if (typeof 目标值 !== 'string' || /[:?#\\]/.test(目标值)) continue
    const 名称 = 目标值.split('/').filter(Boolean).pop()
    if (名称 && /^[\w.-]+\.xml$/i.test(名称)) 目标.push(`ppt/diagrams/${名称}`)
  }
  return 目标
}

function 读取图示文本(xml) {
  const 片段 = Array.from(xml.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g), (项) => 项[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'))
  return 片段.join(' ').trim()
}

module.exports = { 附件媒体类型, 图示媒体类型, 检查嵌入字节, 校验附件对象, 写入附件对象, 读取附件对象, 校验图示对象, 写入图示对象, 读取图示对象, 读取私有元数据 }
