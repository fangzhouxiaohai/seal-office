// 母版（ppt/slideMasters）与版式（ppt/slideLayouts）的原生读写。
// 版式部件由 pptxgenjs 按母版顺序生成，写入后统一改写名称并还原母版归属。
const path = require('path')
const { 读取关系 } = require('./relations')
const { 读取部件 } = require('./parts')
const { 读取背景填充, 应用背景填充 } = require('./pageSetup')

const 像素转英寸 = (像素) => Math.round((像素 / 72) * 10000) / 10000
const EMU转像素 = (emu) => Math.round((Number(emu) / 12700) * 100) / 100

const 占位符类型映射 = { title: '标题', body: '正文', sldNum: '页码', dt: '日期', ftr: '页脚' }
const 占位符方案类型 = { 标题: 'title', 正文: 'body', 页码: 'sldNum', 日期: 'dt', 页脚: 'ftr' }
const 占位符标识表 = { 标题: '占位-标题', 正文: '占位-正文', 页码: '占位-页码', 日期: '占位-日期', 页脚: '占位-页脚' }

const 属性 = (标签, 键) => (标签 ?? '').match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]

function 生成母版标识(名称) {
  if (typeof 名称 !== 'string' || !名称.trim()) throw new Error('母版标识无效：缺少母版名称')
  return 名称.trim()
}

function 生成版式标识(母版标识, 版式名称) {
  if (typeof 母版标识 !== 'string' || !母版标识.trim()) throw new Error('版式标识无效：缺少母版标识')
  if (typeof 版式名称 !== 'string' || !版式名称.trim()) throw new Error('版式标识无效：缺少版式名称')
  return `${母版标识.trim()}::${版式名称.trim()}`
}

/** 母版与版式背景当前只支持纯色，其余类型必须由页面级背景承担，避免静默失真。 */
function 背景参数(填充, 主题) {
  if (!填充) return { color: (主题?.配色?.背景1 ?? '#FFFFFF').replace(/^#/, '') }
  if (填充.类型 !== '纯色') throw new Error('母版与版式背景当前只支持纯色，请改用页面背景设置渐变或图片')
  return { color: String(填充.颜色).replace(/^#/, '') }
}

/** 生成 pptxgenjs 的 defineSlideMaster 参数：版式占位符使用原生 ph 类型。 */
function 版式转母版参数(母版, 版式, 主题) {
  if (!母版 || !版式) throw new Error('生成母版参数失败：母版或版式缺失')
  const 字体 = 主题?.字体 ?? { 标题: '微软雅黑', 正文: '微软雅黑' }
  return {
    title: 生成版式标识(生成母版标识(母版.名称), 版式.名称),
    background: 背景参数(版式.背景填充 ?? 母版.背景填充, 主题),
    objects: 版式.占位符列表.map((占位符) => ({
      placeholder: {
        options: {
          name: 占位符.标识,
          type: 占位符方案类型[占位符.类型] ?? 'body',
          x: 像素转英寸(占位符.x), y: 像素转英寸(占位符.y),
          w: 像素转英寸(占位符.width), h: 像素转英寸(占位符.height),
          fontSize: 占位符.字号,
          align: 占位符.对齐,
          bold: 占位符.加粗 === true,
          fontFace: 占位符.类型 === '标题' ? 字体.标题 : 字体.正文,
          color: (主题?.配色?.[占位符.颜色引用 ?? '文本1'] ?? '#1A1D24').replace(/^#/, ''),
        },
      },
      text: '',
    })),
    // 页脚、日期与页码由页面级形状写入，母版只提供版式结构
    ...(版式.占位符列表.some((项) => 项.类型 === '页码')
      ? { slideNumber: { x: 9.5, y: 6.9, color: '5A6472', fontSize: 12 } }
      : {}),
  }
}

/** 读取版式部件中的占位符：类型、位置、字号与对齐。 */
function 读取版式占位符(版式Xml) {
  const 结果 = []
  for (const 匹配 of String(版式Xml ?? '').matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi)) {
    const 形状 = 匹配[0]
    const 占位符标签 = 形状.match(/<p:ph\b[^>]*\/?>/i)?.[0]
    if (!占位符标签) continue
    const 类型 = 占位符类型映射[属性(占位符标签, 'type') ?? 'body']
    if (!类型) continue
    const 变换 = 形状.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/i)?.[0]
    const 位置 = 变换?.match(/<a:off\b[^>]*>/i)?.[0]
    const 尺寸 = 变换?.match(/<a:ext\b[^>]*>/i)?.[0]
    if (!位置 || !尺寸) continue
    const 样式 = 形状.match(/<a:(?:defRPr|rPr)\b[^>]*>/i)?.[0]
    const 字号值 = Number(属性(样式, 'sz') ?? 0) / 100
    const 对齐值 = 属性(形状.match(/<a:(?:lvl1pPr|pPr)\b[^>]*>/i)?.[0], 'algn')
    const 对齐 = 对齐值 === 'ctr' ? 'center' : 对齐值 === 'r' || 对齐值 === 'end' ? 'right' : 'left'
    结果.push({
      标识: 占位符标识表[类型],
      类型,
      x: EMU转像素(属性(位置, 'x')),
      y: EMU转像素(属性(位置, 'y')),
      width: EMU转像素(属性(尺寸, 'cx')),
      height: EMU转像素(属性(尺寸, 'cy')),
      字号: Number.isFinite(字号值) && 字号值 > 0 ? Math.round(字号值) : 24,
      对齐,
      ...(属性(样式, 'b') === '1' ? { 加粗: true } : {}),
      颜色引用: '文本1',
    })
  }
  return 结果
}

/** 每个母版对应的版式在包内的固定顺序：pptxgenjs 先写一个 DEFAULT 版式，之后按定义顺序排列。 */
function 版式部件路径(序号) {
  return `ppt/slideLayouts/slideLayout${序号 + 2}.xml`
}

/** 读取包的母版与版式结构，并记录每张幻灯片实际归属的版式。 */
async function 读取母版结构(压缩包) {
  const 清单Xml = await 读取部件(压缩包, 'ppt/presentation.xml').async('string')
  const 清单关系 = await 读取关系(压缩包, 'ppt/presentation.xml')
  const 母版路径列表 = []
  for (const 匹配 of 清单Xml.matchAll(/<p:sldMasterId\b[^>]*\/?>/gi)) {
    const 项 = 清单关系.get(属性(匹配[0], 'r:id'))
    if (项 && !项.外部 && 项.类型.endsWith('/slideMaster') && !母版路径列表.includes(项.目标)) 母版路径列表.push(项.目标)
  }
  if (母版路径列表.length === 0) {
    for (const 项 of 清单关系.values()) {
      if (!项.外部 && 项.类型.endsWith('/slideMaster')) 母版路径列表.push(项.目标)
    }
  }
  const 母版列表 = []
  const 版式索引 = new Map()
  for (const [序号, 母版路径] of 母版路径列表.entries()) {
    const 母版Xml = await 读取部件(压缩包, 母版路径).async('string')
    const 母版关系 = await 读取关系(压缩包, 母版路径)
    const 名称 = 属性(母版Xml.match(/<p:cSld\b[^>]*>/i)?.[0], 'name') || `母版 ${序号 + 1}`
    const 版式列表 = []
    for (const 匹配 of 母版Xml.matchAll(/<p:sldLayoutId\b[^>]*\/?>/gi)) {
      const 项 = 母版关系.get(属性(匹配[0], 'r:id'))
      if (!项 || 项.外部 || !项.类型.endsWith('/slideLayout')) continue
      const 版式Xml = await 读取部件(压缩包, 项.目标).async('string')
      const 版式名称 = 属性(版式Xml.match(/<p:cSld\b[^>]*>/i)?.[0], 'name') || path.posix.basename(项.目标, '.xml')
      // pptxgenjs 自动生成的 DEFAULT 空版式不属于用户版式
      if (版式名称 === 'DEFAULT') continue
      const 版式标识 = 生成版式标识(名称, 版式名称)
      const 背景填充 = 读取背景填充(版式Xml)
      版式列表.push({
        标识: 版式标识,
        名称: 版式名称,
        母版标识: 名称,
        占位符列表: 读取版式占位符(版式Xml),
        ...(背景填充 ? { 背景填充 } : {}),
      })
      版式索引.set(项.目标, { 母版标识: 名称, 版式标识 })
    }
    const 母版背景 = 读取背景填充(母版Xml)
    母版列表.push({
      标识: 名称,
      名称,
      版式列表,
      ...(母版背景 ? { 背景填充: 母版背景 } : {}),
    })
  }
  const 幻灯片位置 = {}
  const 幻灯片路径列表 = []
  for (const 匹配 of 清单Xml.matchAll(/<p:sldId\b[^>]*\/?>/gi)) {
    const 项 = 清单关系.get(属性(匹配[0], 'r:id'))
    if (项 && !项.外部 && 项.类型.endsWith('/slide')) 幻灯片路径列表.push(项.目标)
  }
  for (const 幻灯片路径 of 幻灯片路径列表) {
    const 幻灯片关系 = await 读取关系(压缩包, 幻灯片路径)
    for (const 项 of 幻灯片关系.values()) {
      if (项.外部 || !项.类型.endsWith('/slideLayout')) continue
      const 归属 = 版式索引.get(项.目标)
      if (归属) 幻灯片位置[幻灯片路径] = 归属
    }
  }
  return { 母版列表, 幻灯片位置, 母版路径列表 }
}

/** 写入母版与版式：改写名称、固化背景，并在需要时创建真实的多母版部件。 */
async function 写入多母版(压缩包, 母版列表) {
  if (!Array.isArray(母版列表) || 母版列表.length === 0) throw new Error('写入母版失败：母版列表为空')
  const 母版路径列表 = Object.keys(压缩包.files)
    .filter((路径) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(路径))
    .sort((甲, 乙) => Number(甲.match(/(\d+)\.xml$/)[1]) - Number(乙.match(/(\d+)\.xml$/)[1]))
  if (母版路径列表.length === 0) throw new Error('写入母版失败：包内缺少母版部件')
  const 首母版路径 = 母版路径列表[0]
  const 全部版式 = 母版列表.flatMap((母版) => 母版.版式列表.map((版式) => ({ 母版, 版式 })))
  for (const [序号, 项] of 全部版式.entries()) {
    const 路径 = 版式部件路径(序号)
    const 文件 = 压缩包.file(路径)
    if (!文件) throw new Error(`写入母版失败：缺少版式部件（${路径}）`)
    const 原Xml = await 文件.async('string')
    let 更新 = 改写名称(原Xml, 项.版式.名称)
    if (项.版式.背景填充 || 项.母版.背景填充) {
      更新 = 应用背景填充(更新, 项.版式.背景填充 ?? 项.母版.背景填充)
    }
    压缩包.file(路径, 更新)
  }
  let 首母版Xml = 改写名称(await 压缩包.file(首母版路径).async('string'), 母版列表[0].标识)
  首母版Xml = 应用背景填充(首母版Xml, 母版列表[0].背景填充 ?? { 类型: '纯色', 颜色: '#FFFFFF' })
  const 全部路径 = new Set(全部版式.map((项, 序号) => 版式部件路径(序号)))
  const 首母版自有 = new Set(母版列表[0].版式列表.map((版式) =>
    版式部件路径(全部版式.findIndex((项) => 项.版式.标识 === 版式.标识))))
  const 全局关系 = await 读取关系(压缩包, 'ppt/presentation.xml')
  const 清单Xml原文 = await 读取部件(压缩包, 'ppt/presentation.xml').async('string')
  const 被引用路径 = new Set()
  for (const 匹配 of 清单Xml原文.matchAll(/<p:sldId\b[^>]*\/?>/gi)) {
    const 项 = 全局关系.get(属性(匹配[0], 'r:id'))
    if (!项 || 项.外部) continue
    for (const 幻灯片关系 of (await 读取关系(压缩包, 项.目标)).values()) {
      if (!幻灯片关系.外部 && 幻灯片关系.类型.endsWith('/slideLayout')) 被引用路径.add(幻灯片关系.目标)
    }
  }
  const 首母版关系 = await 读取关系(压缩包, 首母版路径)
  const 保留布局 = []
  const 首母版关系项 = []
  const 删除版式 = new Set()
  for (const 匹配 of 首母版Xml.matchAll(/<p:sldLayoutId\b[^>]*\/?>/gi)) {
    const 项 = 首母版关系.get(属性(匹配[0], 'r:id'))
    if (!项) continue
    // 属于其他母版的版式移交；写入器自动生成且无幻灯片引用的空白版式一并删除
    if (!首母版自有.has(项.目标) && 全部路径.has(项.目标)) continue
    if (!首母版自有.has(项.目标) && !全部路径.has(项.目标) && !被引用路径.has(项.目标)) {
      删除版式.add(项.目标)
      continue
    }
    保留布局.push(匹配[0])
  }
  for (const 项 of 首母版关系.values()) {
    if (!项.外部 && 项.类型.endsWith('/slideLayout') && !首母版自有.has(项.目标) && 全部路径.has(项.目标)) continue
    if (!项.外部 && 项.类型.endsWith('/slideLayout') && 删除版式.has(项.目标)) continue
    const 目标 = 项.外部 ? 项.目标 : path.posix.relative(path.posix.dirname(首母版路径), 项.目标)
    首母版关系项.push(`<Relationship Id="${项.标识}" Type="${项.类型}"${项.外部 ? ' TargetMode="External"' : ''} Target="${目标}"/>`)
  }
  首母版Xml = 首母版Xml.replace(/<p:sldLayoutIdLst\b[^>]*>[\s\S]*?<\/p:sldLayoutIdLst>/, `<p:sldLayoutIdLst>${保留布局.join('')}</p:sldLayoutIdLst>`)
  压缩包.file(首母版路径, 首母版Xml)
  压缩包.file(关系路径(首母版路径), 关系Xml(首母版关系项))
  const 类型文件0 = 压缩包.file('[Content_Types].xml')
  let 类型Xml0 = await 类型文件0.async('string')
  for (const 路径 of 删除版式) {
    压缩包.remove(路径)
    压缩包.remove(关系路径(路径))
    类型Xml0 = 类型Xml0.replace(`<Override PartName="/${路径}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`, '')
  }
  压缩包.file('[Content_Types].xml', 类型Xml0)
  if (母版列表.length === 1) return

  const 类型文件 = 压缩包.file('[Content_Types].xml')
  let 类型Xml = await 类型文件.async('string')
  const 清单文件 = 压缩包.file('ppt/presentation.xml')
  let 清单Xml = await 清单文件.async('string')
  const 清单关系文件 = 压缩包.file('ppt/_rels/presentation.xml.rels')
  let 清单关系Xml = await 清单关系文件.async('string')
  let 起始布局序号 = 全部版式.length
  for (const [母版序号, 母版] of 母版列表.entries()) {
    if (母版序号 === 0) continue
    const 母版路径 = `ppt/slideMasters/slideMaster${母版序号 + 1}.xml`
    const 版式子集 = 母版.版式列表.map((版式) => 版式部件路径(全部版式.findIndex((项) => 项.版式.标识 === 版式.标识)))
    const 关系项 = []
    const 布局Id列表 = 版式子集.map((版式路径, 序号) => {
      const 关系标识 = `rId${序号 + 1}`
      关系项.push(`<Relationship Id="${关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/${path.posix.basename(版式路径)}"/>`)
      return `<p:sldLayoutId id="${2147483650 + 起始布局序号 + 序号}" r:id="${关系标识}"/>`
    })
    起始布局序号 += 版式子集.length
    关系项.push(`<Relationship Id="rId${版式子集.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>`)
    let 母版Xml = 改写名称(首母版Xml, 母版.标识)
      .replace(/<p:sldLayoutIdLst\b[^>]*>[\s\S]*?<\/p:sldLayoutIdLst>/, `<p:sldLayoutIdLst>${布局Id列表.join('')}</p:sldLayoutIdLst>`)
    母版Xml = 应用背景填充(母版Xml.replace(/<p:bg\b[^>]*>[\s\S]*?<\/p:bg>/, ''), 母版.背景填充 ?? { 类型: '纯色', 颜色: '#FFFFFF' })
    压缩包.file(母版路径, 母版Xml)
    压缩包.file(关系路径(母版路径), 关系Xml(关系项))
    for (const 版式路径 of 版式子集) {
      const 已有关系 = 压缩包.file(关系路径(版式路径))
      const 保留 = 已有关系
        ? Array.from((await 已有关系.async('string')).matchAll(/<Relationship\b[^>]*\/?>/gi), (项) => 项[0])
          .filter((标签) => !属性(标签, 'Type').endsWith('/slideMaster'))
        : []
      压缩包.file(关系路径(版式路径), 关系Xml([...保留,
        `<Relationship Id="rId${保留.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/${path.posix.basename(母版路径)}"/>`]))
    }
    const 清单关系标识 = `rId${Array.from(清单关系Xml.matchAll(/<Relationship\b/g)).length + 1}`
    清单关系Xml = 清单关系Xml.replace('</Relationships>',
      `<Relationship Id="${清单关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/${path.posix.basename(母版路径)}"/></Relationships>`)
    清单Xml = 清单Xml.replace(/<p:sldMasterIdLst\b[^>]*>([\s\S]*?)<\/p:sldMasterIdLst>/, (匹配, 内容) =>
      `<p:sldMasterIdLst>${内容}<p:sldMasterId id="${2147483648 + 母版序号}" r:id="${清单关系标识}"/></p:sldMasterIdLst>`)
    if (!类型Xml.includes(`/${母版路径}"`)) {
      类型Xml = 类型Xml.replace('</Types>', `<Override PartName="/${母版路径}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/></Types>`)
    }
  }
  压缩包.file('[Content_Types].xml', 类型Xml)
  压缩包.file('ppt/presentation.xml', 清单Xml)
  压缩包.file('ppt/_rels/presentation.xml.rels', 清单关系Xml)
}

function 关系路径(部件路径) {
  return path.posix.join(path.posix.dirname(部件路径), '_rels', `${path.posix.basename(部件路径)}.rels`)
}

function 关系Xml(关系项) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${关系项.join('')}</Relationships>`
}

/** 改写 p:cSld 的 name 属性（不存在时补写），用于记录母版标识与版式名称。 */
function 改写名称(xml, 名称) {
  return String(xml).replace(/<p:cSld\b[^>]*>/, (标签) => (/\bname="[^"]*"/.test(标签)
    ? 标签.replace(/\bname="[^"]*"/, `name="${名称}"`)
    : 标签.replace(/>$/, ` name="${名称}">`)))
}

/**
 * 移除 pptxgenjs 复制到幻灯片上的空占位符提示形状（hasCustomPrompt）。
 * 这些形状与海豹办公写入的占位符文本框重复，会让外部软件同时显示提示与正文。
 */
function 移除占位符提示形状(幻灯片Xml) {
  return String(幻灯片Xml).replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi, (形状) => {
    if (!/hasCustomPrompt="1"/i.test(形状)) return 形状
    if (/<a:t[\s/>]/i.test(形状)) return 形状
    return ''
  })
}

module.exports = {
  版式转母版参数,
  读取版式占位符,
  读取母版结构,
  写入多母版,
  生成母版标识,
  生成版式标识,
  版式部件路径,
  改写名称,
  移除占位符提示形状,
  占位符标识表,
  占位符类型映射,
  背景参数,
}
