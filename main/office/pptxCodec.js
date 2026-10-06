const { 写入切换, 读取切换 } = require('./pptx/transitions')
const { 写入动画, 读取动画, 写入播放扩展, 读取播放扩展, 收集图表构建 } = require('./pptx/animations')
const { 读取原生对象 } = require('./pptx/elements')
const JSZip = require('jszip')
const pptxgen = require('pptxgenjs')
const { 读取部件 } = require('./pptx/parts')
const { 解析关系, 关联目标 } = require('./pptx/relations')
const sax = require('sax')
const { 读取图片对象, 写入图片对象, 检查图片字节, 写入音效, 读取音效 } = require('./pptx/media')
const { 检查媒体字节 } = require('./pptx/mediaTypes')
const { 写入自定义放映, 写入放映设置, 读取放映设置, 读取自定义放映 } = require('./pptx/show')
const { 写入批注, 读取批注 } = require('./pptx/comments')
const { 写入定稿, 读取定稿, 校验定稿 } = require('./pptx/finalize')
const { 写入讲义母版, 读取讲义母版, 写入备注母版页眉页脚, 读取备注母版页眉页脚 } = require('./pptx/handoutMasters')
const { 读取附件对象, 读取图示对象 } = require('./pptx/embeddedObjects')
const { 读取剩余公式 } = require('./pptx/formulas')
const { 主题Xml, 读取主题, 写入主题, 写入主题色引用, 读取主题色引用, 槽到方案色, 方案色到槽, 匹配主题标识 } = require('./pptx/theme')
const { 版式转母版参数, 读取母版结构, 写入多母版, 移除占位符提示形状 } = require('./pptx/masters')
const {
  读取页面尺寸, 写入页面尺寸, 写入背景填充, 读取背景填充,
  写入页脚形状, 读取页脚形状, 移除字段形状, 字段前缀, 页脚区域,
} = require('./pptx/pageSetup')

const 默认页面尺寸 = { 宽: 960, 高: 540 }

// 画布 960×540 像素按 72dpi 折算为 13.33×7.5 英寸（LAYOUT_WIDE）
const 像素转英寸 = (像素) => Math.round((像素 / 72) * 10000) / 10000
// OOXML 的 EMU（每英寸 914400）按同一 72dpi 基准折算回画布像素
const EMU转像素 = (emu) => Math.round((Number(emu) / 12700) * 100) / 100

const 标识前缀 = 'seal-id:'
const 编码标识 = (标识) => `${标识前缀}${Buffer.from(标识, 'utf8').toString('base64url')}`
function 写入标签名称(标签, 标识) {
  const 名称 = `name="${编码标识(标识)}"`
  return /\bname="[^"]*"/.test(标签) ? 标签.replace(/\bname="[^"]*"/, 名称) : 标签.replace(/\/?>(?=$)/, (结束) => ` ${名称}${结束}`)
}
function 写入稳定标识(xml, 页面数据, 序号) {
  let 更新 = xml
  if (typeof 页面数据.id === 'string' && 页面数据.id.length > 0) {
    let 已写入 = false
    更新 = 更新.replace(/<p:cSld\b[^>]*>/i, (标签) => {
      已写入 = true
      return 写入标签名称(标签, 页面数据.id)
    })
    if (!已写入) throw new Error(`生成幻灯片失败：第 ${序号 + 1} 页缺少内容节点`)
  }
  if (Array.isArray(页面数据.文本框) && 页面数据.文本框.some((框) => typeof 框.id === 'string')) {
    let 框序号 = 0
    更新 = 更新.replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi, (形状) => {
      const 框 = 页面数据.文本框[框序号++]
      if (!框 || typeof 框.id !== 'string' || 框.id.length === 0) return 形状
      let 已写入 = false
      const 结果 = 形状.replace(/<p:cNvPr\b[^>]*>/i, (标签) => {
        已写入 = true
        return 写入标签名称(标签, 框.id)
      })
      if (!已写入) throw new Error(`生成幻灯片失败：第 ${序号 + 1} 页文本框缺少标识节点`)
      return 结果
    })
    if (框序号 < 页面数据.文本框.length) throw new Error(`生成幻灯片失败：第 ${序号 + 1} 页文本框数量不符`)
  }
  return 更新
}
function 解码标识(名称) {
  if (typeof 名称 !== 'string' || !名称.startsWith(标识前缀)) return null
  try {
    const 原文 = Buffer.from(名称.slice(标识前缀.length), 'base64url').toString('utf8')
    return 原文.length > 0 && 原文.length <= 256 ? 原文 : null
  } catch { return null }
}

/** 去掉颜色值里的 #，pptxgenjs 只接受无井号的十六进制 */
const 规整颜色 = (颜色, 默认) => {
  if (typeof 颜色 !== 'string') return 默认
  const 文本 = 颜色.replace(/^#/, '').toUpperCase()
  return /^[0-9A-F]{6}$/.test(文本) ? 文本 : 默认
}

/** 从幻灯片实际内容判断当前文本框解析器会跳过的对象。 */
function 收集幻灯片警告(xml, 警告) {
  const 有标签 = (标签) => new RegExp(`<${标签}[\\s/>]`, 'i').test(xml)
  const 无文字图形 = Array.from(xml.matchAll(/<p:sp(?:\s[^>]*)?>([\s\S]*?)<\/p:sp>/gi))
    .some((匹配) => !/<a:t[\s/>]/i.test(匹配[1]) && /<(?:p:spPr|a:prstGeom|a:xfrm)[\s/>]/i.test(匹配[1]))
  if (无文字图形 || 有标签('p:cxnSp')) 警告.add('图形未导入')
  if (有标签('p:graphicFrame')) 警告.add('图表或表格未导入')
  if (有标签('p:video') || 有标签('p:audio') || 有标签('a:videoFile') || 有标签('a:audioFile')) 警告.add('媒体未导入')
  if (有标签('p:timing')) 警告.add('动画未导入')
  const 过渡 = 解析过渡效果(xml)
  if (过渡.存在 && 过渡.风险) 警告.add('幻灯片切换效果未完整导入')
  for (const 匹配 of xml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi)) {
    const 形状 = 匹配[1]
    if (存在混合文字样式(形状)) 警告.add('混合文字样式未完整导入')
    if (!/<a:t\b/i.test(形状)) continue
    const 外观 = 形状.match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/i)?.[1] ?? ''
    if (/<a:(?:solidFill|gradFill|blipFill|effectLst|effectDag)\b/i.test(外观) ||
        /<a:prstGeom\b[^>]*prst="(?!rect")[^"]+"/i.test(外观) ||
        /<a:ln\b[^>]*(?:\bw\s*=|>\s*<(?!\/a:ln>))/i.test(外观)) {
      警告.add('文本框外观未完整导入')
    }
    if (/<a:(?:buChar|buAutoNum|buBlip|lnSpc|spcBef|spcAft|tabLst)\b/i.test(形状) ||
        /<a:pPr\b[^>]*(?:\blvl\s*=|\bmarL\s*=\s*"(?!0")|\bindent\s*=\s*"(?!0"))/i.test(形状)) {
      警告.add('段落格式未完整导入')
    }
    const 段落对齐 = Array.from(形状.matchAll(/<a:pPr\b[^>]*\balgn="([^"]+)"/gi), (项) => 项[1])
    if (new Set(段落对齐).size > 1) 警告.add('段落格式未完整导入')
    if (/<a:(?:ea|latin)\b[^>]*typeface="\+/i.test(形状)) 警告.add('主题字体未完整导入')
  }
  const 背景 = xml.match(/<p:bg\b[^>]*>([\s\S]*?)<\/p:bg>/i)?.[1] ?? ''
  if (/<a:(?:pattFill|bgRef)\b/i.test(背景) || (/<a:schemeClr\b/i.test(背景) && !/<a:(?:solidFill|gradFill|blipFill)\b/i.test(背景))) {
    警告.add('背景样式未完整导入')
  }
}

function 解析过渡效果(xml) { return 读取切换(xml) }

/** 同一文本框仅能保存一套字符样式，片段之间的差异需要显式报告。 */
function 存在混合文字样式(形状Xml) {
  const 样式列表 = []
  for (const 匹配 of 形状Xml.matchAll(/<a:r\b[^>]*>([\s\S]*?)<\/a:r>/gi)) {
    const 片段Xml = 匹配[1]
    if (!/<a:t\b[^>]*>/i.test(片段Xml)) continue
    const 属性 = 片段Xml.match(/<a:rPr\b([^>]*)(?:\/>|>([\s\S]*?)<\/a:rPr>)/i)
    const 属性文本 = 属性?.[1] ?? ''
    const 颜色Xml = 属性?.[2] ?? ''
    const 取属性 = (名称) => 属性文本.match(new RegExp(`\\b${名称}="([^"]*)"`, 'i'))?.[1] ?? null
    样式列表.push(JSON.stringify({
      字号: 取属性('sz'),
      加粗: 取属性('b') === '1',
      斜体: 取属性('i') === '1',
      下划线: 取属性('u') ?? 'none',
      颜色: 颜色Xml.match(/<a:(?:srgbClr|schemeClr)\b[^>]*val="([^"]+)"/i)?.[1] ?? null,
      字体: 颜色Xml.match(/<a:latin\b[^>]*typeface="([^"]+)"/i)?.[1] ?? null,
    }))
  }
  return new Set(样式列表).size > 1
}

async function 收集母版警告(压缩包, 幻灯片文件名, 警告) {
  for (const 幻灯片路径 of 幻灯片文件名) {
    for (const 版式路径 of await 关联目标(压缩包, 幻灯片路径, 'slideLayout')) {
      for (const 母版路径 of await 关联目标(压缩包, 版式路径, 'slideMaster')) {
        const 母版文件 = 压缩包.file(母版路径)
        if (母版文件 === null) continue
        const xml = await 母版文件.async('string')
        if (/<p:(?:pic|graphicFrame|cxnSp)[\s/>]/i.test(xml) || /<p:sp(?:\s[^>]*)?>[\s\S]*?<a:prstGeom[\s/>]/i.test(xml)) {
          警告.add('母版图形未导入')
          return
        }
      }
    }
  }
}

/** 从该页实际关联的备注部件读取演讲备注，不把页码等占位符当作备注。 */
async function 读取幻灯片备注(压缩包, 幻灯片路径, 警告) {
  const 备注路径列表 = await 关联目标(压缩包, 幻灯片路径, 'notesSlide')
  if (备注路径列表.length === 0) return null
  if (备注路径列表.length !== 1) throw new Error('演示文件无效：幻灯片备注关系重复')
  const 文件 = 压缩包.file(备注路径列表[0])
  if (!文件) throw new Error('演示文件无效：幻灯片备注部件缺失')
  const xml = await 文件.async('string')
  if (!/<p:notes\b[^>]*>[\s\S]*<\/p:notes>\s*$/i.test(xml)) {
    throw new Error('演示文件无效：幻灯片备注内容损坏')
  }
  const 备注形状 = Array.from(xml.matchAll(/<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi), (匹配) => 匹配[1])
    .find((形状) => /<p:ph\b[^>]*\btype\s*=\s*(["'])body\1/i.test(形状))
  if (!备注形状) return null
  if (/<p:(?:pic|graphicFrame|cxnSp)\b/i.test(xml) ||
      /<a:rPr\b[^>]*\b(?:sz|b|i|u)\s*=/i.test(备注形状) ||
      /<a:(?:srgbClr|schemeClr|latin)\b/i.test(备注形状)) {
    警告.add('备注样式未完整导入')
  }
  const 段落 = Array.from(备注形状.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi), (匹配) =>
    Array.from(匹配[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?\s*>/gi), (片段) =>
      片段[1] === undefined ? '\n' : 解码(片段[1])).join(''))
  return 段落.join('\n').replace(/\r\n?/g, '\n')
}

function 读取Xml属性表(标签) {
  return Object.fromEntries([...标签.matchAll(/\s([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(匹配 => [匹配[1], 解码(匹配[3])]))
}
function 读取Xml属性(标签, 名称) {
  return 读取Xml属性表(标签)[名称] ?? null
}

/** 严格检查完整清单，零页演示也必须拥有唯一、配对的根节点。 */
function 验证清单Xml(xml, 根名称) {
  const 解析器 = sax.parser(true)
  let 深度 = 0, 根数量 = 0
  const 拒绝 = () => { throw new Error('演示文件无效：演示清单结构损坏') }
  解析器.onerror = 拒绝
  解析器.ondoctype = 拒绝
  解析器.onopentag = 标签 => {
    if (深度 === 0 && (++根数量 !== 1 || 标签.name !== 根名称)) 拒绝()
    深度++
  }
  解析器.onclosetag = () => { 深度-- }
  解析器.ontext = 文本 => { if (深度 === 0 && 文本.trim()) 拒绝() }
  解析器.oncdata = () => { if (深度 === 0) 拒绝() }
  解析器.write(xml).close()
  if (根数量 !== 1 || 深度 !== 0) 拒绝()
}

/** 依据演示清单和关系文件确认实际幻灯片，不能从包内孤立文件推断。 */
async function 读取幻灯片路径(压缩包) {
  const 类型文件 = 压缩包.file('[Content_Types].xml')
  const 清单文件 = 压缩包.file('ppt/presentation.xml')
  const 关系文件 = 压缩包.file('ppt/_rels/presentation.xml.rels')
  if (!类型文件 || !清单文件 || !关系文件) throw new Error('演示文件无效：缺少演示清单或关系文件')
  const [类型Xml, 清单Xml, 关系Xml] = await Promise.all([
    类型文件.async('string'), 清单文件.async('string'), 关系文件.async('string'),
  ])
  验证清单Xml(类型Xml, 'Types')
  验证清单Xml(清单Xml, 'p:presentation')
  验证清单Xml(关系Xml, 'Relationships')
  if (!/<Types\b/i.test(类型Xml) || !/presentationml\.presentation\.main\+xml/i.test(类型Xml) ||
      !/<p:presentation\b[^>]*(?:\/>|>[\s\S]*<\/p:presentation>\s*$)/i.test(清单Xml) || !/<Relationships\b/i.test(关系Xml) ||
      (/<p:sldIdLst\b/i.test(清单Xml) && !/<p:sldIdLst\b[^>]*(?:\/>|>[\s\S]*<\/p:sldIdLst>)/i.test(清单Xml))) {
    throw new Error('演示文件无效：文件结构不是有效的 PPTX 演示文稿')
  }
  const 关系 = 解析关系(关系Xml, 'ppt/presentation.xml')
  const 幻灯片路径 = []
  for (const 匹配 of 清单Xml.matchAll(/<p:sldId\b[^>]*\/?\s*>/gi)) {
    const 标识 = 读取Xml属性(匹配[0], 'r:id')
    const 项 = 关系.get(标识)
    const 路径 = 项 && !项.外部 && 项.类型.endsWith('/slide') ? 项.目标 : null
    if (!路径 || !/^ppt\/slides\/[^/]+\.xml$/i.test(路径) || !压缩包.file(路径)) {
      throw new Error('演示文件无效：幻灯片关系缺失或目标不存在')
    }
    读取部件(压缩包, 路径)
    const 页面标识 = 读取Xml属性(匹配[0], 'id')
    幻灯片路径.push({ 路径, 页面标识, 关系标识: 标识 })
  }
  return { 幻灯片路径, 清单Xml }
}

async function 读取pptx(数据) {
  let 压缩包
  try {
    压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  } catch {
    throw new Error('演示文件无效：不是有效的 PPTX 压缩包')
  }
  const { 幻灯片路径: 文件名, 清单Xml } = await 读取幻灯片路径(压缩包)
  const 幻灯片列表 = []
  const 警告 = new Set()
  const 资源表 = new Map()
  const 放映属性 = await 压缩包.file('ppt/presProps.xml')?.async('string') ?? ''
  const 放映节点 = 放映属性.match(/<p:showPr\b[^>]*(?:\/>|>[\s\S]*?<\/p:showPr>)/)?.[0] ?? ''
  // 页面尺寸：可变尺寸已完整支持；节点存在但无法解析（损坏）时给出明确警告
  const 尺寸标签 = 清单Xml.match(/<p:sldSz\b[^>]*\/?>/i)?.[0]
  const 页面尺寸 = 读取页面尺寸(清单Xml)
  if (尺寸标签 && !页面尺寸) 警告.add('页面尺寸未完整导入')
  // 主题与母版：真实部件解析，结构损坏时保留警告并继续保护来源文件
  let 主题 = null
  const 主题文件 = 压缩包.file('ppt/theme/theme1.xml')
  if (主题文件) {
    主题 = 读取主题(await 主题文件.async('string'))
    if (!主题) 警告.add('主题未完整导入')
  }
  const 母版结构 = await 读取母版结构(压缩包)
  for (const { 路径: 名称, 页面标识 } of 文件名) {
    const xml = await 读取部件(压缩包, 名称).async('string')
    if (!/<p:sld\b[^>]*>[\s\S]*<\/p:sld>\s*$/i.test(xml) ||
        !/<p:cSld\b[^>]*>[\s\S]*<\/p:cSld>/i.test(xml) ||
        !/(?:<p:spTree\b[^>]*\/>|<p:spTree\b[^>]*>[\s\S]*<\/p:spTree>)/i.test(xml)) {
      throw new Error(`演示文件无效：幻灯片内容损坏（${名称}）`)
    }
    const 页脚字段 = 读取页脚形状(xml)
    const 正文Xml = 移除字段形状(xml)
    const 嵌入 = await 读取附件对象(压缩包, 名称, 正文Xml)
    const 图示 = await 读取图示对象(压缩包, 名称, 嵌入.剩余)
    const 图片 = await 读取图片对象(压缩包, 名称, 图示.剩余)
    // 已识别的原生对象（含本机写入的公式）先被消费；剩余片段可能是外部改写过的公式。
    const 原生剩余 = 读取原生对象(图片.图表剩余)
    const 公式补充 = 读取剩余公式(原生剩余.剩余)
    // 媒体计时节点按对象种类与播放参数重写比对，先从已识别的媒体对象推导列表。
    const 媒体列表 = (图片.对象列表 ?? []).filter(项 => 项.类型 === '媒体').map(项 => {
      const 资源 = 图片.资源条目.find(条目 => 条目.标识 === 项.资源标识)
      let 种类 = '视频'
      try { if (资源) 种类 = 检查媒体字节(Buffer.from(资源.数据, 'base64'), 资源.类型).种类 } catch { 种类 = '视频' }
      return { 对象标识: 项.id, 种类, 参数: 项.媒体 ?? {} }
    })
    const 动画序列 = 读取动画(正文Xml, 媒体列表)
    收集幻灯片警告(动画序列 ? 公式补充.剩余.replace(/<p:timing>[\s\S]*?<\/p:timing>/, '') : 公式补充.剩余, 警告)
    const 幻灯片 = 解析幻灯片Xml(公式补充.剩余, 幻灯片列表.length, 页面标识, 主题)
    if (动画序列) 幻灯片.动画序列 = 动画序列
    const 原生切换 = 读取切换(正文Xml), 扩展 = 读取播放扩展(正文Xml)
    if (原生切换.切换 && 扩展.切换) {
      try { if (写入切换({ 切换: 扩展.切换, 换片: 原生切换.换片 }) === 写入切换({ 切换: 原生切换.切换, 换片: 原生切换.换片 })) 幻灯片.切换 = 扩展.切换 } catch { 警告.add('幻灯片切换效果未完整导入') }
    }
    const 对象列表 = [...图片.对象列表, ...公式补充.对象列表, ...嵌入.对象列表, ...图示.对象列表]
    if (对象列表.length) 幻灯片.对象列表 = 对象列表
    // 图表动态播放参数与原生构建清单一起读回；构建项缺失时明确告警并丢弃对应分步动画。
    const 图表构建 = 扩展.图表构建 && typeof 扩展.图表构建 === 'object' ? 扩展.图表构建 : {}
    for (const 对象 of 幻灯片.对象列表 ?? []) {
      const 构建 = 图表构建[对象.id]
      if (对象.类型 === '图表' && 构建?.动态) 对象.图表 = { ...对象.图表, 动态: 构建.动态 }
    }
    const 分步动画 = (幻灯片.动画序列 ?? []).filter(项 => 项.效果 === '图表分步')
    const 缺动态 = 分步动画.filter(项 => !(幻灯片.对象列表 ?? []).some(对象 => 对象.id === 项.对象标识 && 对象.类型 === '图表' && 对象.图表?.动态))
    if (缺动态.length) {
      警告.add('图表动态播放未完整导入')
      幻灯片.动画序列 = (幻灯片.动画序列 ?? []).filter(项 => !缺动态.includes(项))
      if (!幻灯片.动画序列.length) delete 幻灯片.动画序列
    }
    for (const 资源 of [...图片.资源条目, ...嵌入.资源条目, ...图示.资源条目]) 资源表.set(资源.标识, 资源)
    for (const 原因 of [...图片.警告, ...公式补充.警告, ...嵌入.警告, ...图示.警告]) 警告.add(原因)
    const 备注 = await 读取幻灯片备注(压缩包, 名称, 警告)
    if (备注 !== null) 幻灯片.备注 = 备注
    // 版式归属：按关系还原母版与版式标识，不使用文件名推断
    const 归属 = 母版结构.幻灯片位置[名称]
    if (归属) { 幻灯片.母版标识 = 归属.母版标识; 幻灯片.版式标识 = 归属.版式标识 }
    // 背景：纯色、渐变与图片均已支持；图片背景进入同一资源链路
    const 背景填充 = 读取背景填充(正文Xml)
    if (背景填充 && 背景填充.类型 !== '纯色') {
      if (背景填充.类型 === '图片') {
        const 资源标识 = await 解析背景图片资源(压缩包, 名称, 背景填充.关系标识, 资源表, 警告)
        if (资源标识) { 幻灯片.背景填充 = { 类型: '图片', 资源标识 }; 幻灯片.背景色 = '#FFFFFF' }
        else 警告.add('背景图片未完整导入')
      } else {
        幻灯片.背景填充 = 背景填充
        幻灯片.背景色 = 背景填充.起始色
      }
    } else if (背景填充) {
      幻灯片.背景色 = 背景填充.颜色
    }
    if (页脚字段) 幻灯片.页脚 = 页脚字段
    // 切换音效与切换效果共存于同一个 p:transition，音效需与扩展记录一致才认为完整导入。
    const 原生音效 = await 读取音效(压缩包, 名称, 正文Xml)
    for (const 资源 of 原生音效.资源条目) 资源表.set(资源.标识, 资源)
    for (const 原因 of 原生音效.警告) 警告.add(原因)
    const 扩展音效 = 读取播放扩展(正文Xml).音效
    if (原生音效.资源标识) {
      if (扩展音效 && 扩展音效.资源标识 === 原生音效.资源标识) 幻灯片.音效 = 扩展音效
      else 警告.add('切换音效未完整导入')
    } else if (扩展音效) 警告.add('切换音效未完整导入')
    幻灯片列表.push(幻灯片)
  }
  // 页脚设置：任一页存在页脚字段即视为整篇设置了页脚
  const 页脚设置 = 页脚字段汇总(幻灯片列表)
  if (页脚设置) {
    for (const 页 of 幻灯片列表) {
      if (页.页脚 === undefined) 页.页脚 = null
    }
  }
  await 收集母版警告(压缩包, 文件名.map((项) => 项.路径), 警告)
  const 批注列表 = await 读取批注(压缩包, 幻灯片列表, 警告)
  let 定稿
  try { 定稿 = await 读取定稿(压缩包) ?? undefined } catch { 警告.add('定稿信息未完整导入') }
  // 页跳转链接按幻灯片顺序换算成稳定页面标识，目标页缺失时明确告警而不是保留死链。
  for (const 幻灯片 of 幻灯片列表) {
    for (const 对象 of 幻灯片.对象列表 ?? []) {
      if (对象.链接?.类型 !== '页' || !对象.链接.目标路径) continue
      const 位置 = 文件名.findIndex((项) => 项.路径 === 对象.链接.目标路径)
      if (位置 >= 0) 对象.链接 = { 类型: '页', 目标: 幻灯片列表[位置].id }
      else { delete 对象.链接; 警告.add('页面跳转目标不存在，链接未完整导入') }
    }
  }
  let 讲义设置, 备注设置
  try { 讲义设置 = await 读取讲义母版(压缩包) ?? undefined } catch { 警告.add('讲义母版设置未完整导入') }
  try { 备注设置 = await 读取备注母版页眉页脚(压缩包) ?? undefined } catch { 警告.add('备注母版设置未完整导入') }
  // 自定义放映与全局放映设置：按原生部件与关系解析，无法完整表达的内容进入警告并保护来源文件
  const 关系映射 = new Map(文件名.map((项, 索引) => [项.关系标识, 索引]))
  const { 自定义放映, 原生标识映射 } = 读取自定义放映(清单Xml, 关系映射, 幻灯片列表.map((页) => 页.id), 警告)
  const 放映解析 = 读取放映设置(放映节点, 原生标识映射, 警告)
  return {
    演示文稿: {
      id: 'deck-imported',
      循环放映: 放映解析.循环放映 === true,
      name: '导入演示文稿',
      幻灯片列表,
      当前索引: 0,
      模型版本: 2,
      ...(定稿 ? { 定稿 } : {}),
      ...(讲义设置 ? { 讲义设置 } : {}),
      ...(备注设置 ? { 备注设置 } : {}),
      ...(自定义放映 === undefined ? {} : { 自定义放映 }),
      ...(放映解析.放映设置 === undefined ? {} : { 放映设置: 放映解析.放映设置 }),
      资源索引: Object.fromEntries(Array.from(资源表, ([标识, 资源]) => [标识, { 指纹: 标识, 类型: 资源.类型, 字节数: Buffer.from(资源.数据, 'base64').length }])),
      ...(批注列表.length ? { 批注列表 } : {}),
      ...(主题 ? { 主题 } : {}),
      ...(母版结构.母版列表.length ? { 母版列表: 母版结构.母版列表 } : {}),
      ...(页面尺寸 ? { 页面尺寸 } : {}),
      ...(页脚设置 ? { 页脚设置 } : {}),
    },
    警告: Array.from(警告),
    资源条目: Array.from(资源表.values()),
  }
}

/** 汇总各页页脚字段为整篇设置：首页没有页脚即记录"首页不显示"。 */
function 页脚字段汇总(幻灯片列表) {
  const 有页脚的页 = 幻灯片列表.filter((页) => 页.页脚)
  if (有页脚的页.length === 0) return null
  const 合并 = {}
  for (const 页 of 有页脚的页) Object.assign(合并, 页.页脚)
  return { ...合并, ...(幻灯片列表[0] && !幻灯片列表[0].页脚 ? { 首页不显示: true } : {}) }
}

/** 背景图片进入资源链路：关系 → 媒体部件 → 内容指纹。 */
async function 解析背景图片资源(压缩包, 幻灯片路径, 关系标识, 资源表, 警告) {
  if (!关系标识) return null
  const 关系 = await 读取关系(压缩包, 幻灯片路径)
  const 项 = 关系.get(关系标识)
  if (!项 || 项.外部 || !项.类型.endsWith('/image')) return null
  const 数据 = await 读取部件(压缩包, 项.目标).async('nodebuffer')
  const { 类型 } = 检查图片字节(数据)
  const 标识 = require('crypto').createHash('sha256').update(数据).digest('hex')
  资源表.set(标识, { 标识, 类型, 数据: 数据.toString('base64') })
  return 标识
}

/** 解析单张幻灯片 XML：背景色 + 各形状的位置与文字样式 */
function 解析幻灯片Xml(xml, 序号, 页面标识, 主题 = null) {
  // 幻灯片背景色
  let 背景色 = '#FFFFFF'
  const 背景匹配 = xml.match(/<p:bg>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"[\s\S]*?<\/p:bg>/)
  if (背景匹配 !== null) {
    背景色 = `#${背景匹配[1].toUpperCase()}`
  }
  const 文本框列表 = []
  const 页面名称 = 读取Xml属性(xml.match(/<p:cSld\b[^>]*>/i)?.[0] ?? '', 'name')
  const 稳定页面标识 = 解码标识(页面名称) ?? (页面标识 ? `slide-ooxml-${页面标识}` : `slide-${序号}`)
  const 形状正则 = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/gi
  let 形状匹配
  while ((形状匹配 = 形状正则.exec(xml)) !== null) {
    const 解析 = 解析形状Xml(形状匹配[1], 稳定页面标识, 文本框列表.length, 主题)
    if (解析 !== null) 文本框列表.push(解析)
  }
  const 首框 = 文本框列表[0]
  const 标题文本 = 首框 !== undefined ? 首框.text.split('\n')[0] : '幻灯片'
  const 过渡效果 = 解析过渡效果(xml).效果
  return {
    id: 稳定页面标识,
    title: 标题文本,
    版式: 文本框列表.length > 1 ? '标题和内容' : '标题幻灯片',
    背景色,
    ...(过渡效果 ? { 过渡效果 } : {}),
    ...(读取切换(xml).切换 ? { 切换: 读取切换(xml).切换, 换片: 读取切换(xml).换片 } : {}),
    ...(['0','false'].includes(读取Xml属性(xml.match(/<p:sld\b[^>]*>/)?.[0] ?? '', 'show')) ? { 隐藏: true } : {}),
    文本框列表,
  }
}

/** 解析单个 <p:sp> 形状；无文字时返回 null */
function 解析形状Xml(形状Xml, 页面标识, 框序号, 主题 = null) {
  const 段落列表 = Array.from(形状Xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/gi), (匹配) => 匹配[1])
  // 无文字的装饰形状不导入为文本框
  const 合并文本 = 段落列表.map((段落) => {
    const 片段 = Array.from(段落.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?\s*>/gi), (匹配) =>
      匹配[1] === undefined ? '\n' : 解码(匹配[1]))
    return 片段.join('')
  }).join('\n')
  if (合并文本.length === 0) {
    return null
  }
  // 位置与尺寸（EMU → 画布像素），缺省时给一个居中偏上的默认框
  const 位置 = 形状Xml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/)
  const 尺寸 = 形状Xml.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/)
  // 字符样式取首个带样式的 rPr；对齐取首个 pPr
  const 首个rPr = 形状Xml.match(/<a:rPr([^>]*)\/?>/)
  const 字号 = 首个rPr !== null && /sz="(\d+)"/.test(首个rPr[1]) ? Number(RegExp.$1) / 100 : 24
  const 字体 = 形状Xml.match(/<a:ea\b[^>]*typeface="([^"]+)"/i)?.[1]
    ?? 形状Xml.match(/<a:latin\b[^>]*typeface="([^"]+)"/i)?.[1]
  const 下划线 = 首个rPr?.[1].match(/\bu="([^"]+)"/i)?.[1]
  // 主题色引用优先于显式颜色：schemeClr 表示这段文字仍由主题驱动
  const 引用槽 = 读取主题色引用(形状Xml)
  const 颜色匹配 = 形状Xml.match(/<a:rPr[^>]*>[\s\S]{0,400}?<a:srgbClr val="([0-9A-Fa-f]{6})"/)
  const 对齐匹配 = 形状Xml.match(/<a:pPr[^>]*algn="(\w+)"/)
  const 属性标签 = 形状Xml.match(/<p:cNvPr\b[^>]*>/i)?.[0] ?? ''
  const 形状标识 = 读取Xml属性(属性标签, 'id') ?? String(框序号)
  const 框标识 = 解码标识(读取Xml属性(属性标签, 'name')) ?? `box-${页面标识}-${形状标识}`
  // 占位符：原生 p:ph 类型 + 海豹办公标记（占位符标识与单页覆盖状态）
  const 占位符标签 = 形状Xml.match(/<p:ph\b[^>]*\/?>/i)?.[0] ?? ''
  const 占位符类型 = 读取Xml属性(占位符标签, 'type')
  const 占位符 = 占位符类型 === 'title' ? '标题' : 占位符类型 === 'body' ? '正文'
    : 占位符类型 === 'sldNum' ? '页码' : 占位符类型 === 'dt' ? '日期' : 占位符类型 === 'ftr' ? '页脚' : undefined
  const 描述 = 读取Xml属性(属性标签, 'descr') ?? ''
  const 占位标记 = 描述.match(/seal-ph:(inherit|own)/)?.[1]
  const 占位标识 = 描述.match(/seal-ph-id:([^;]+)/)?.[1]
  return {
    id: 框标识,
    x: 位置 !== null ? EMU转像素(位置[1]) : 80,
    y: 位置 !== null ? EMU转像素(位置[2]) : 60,
    width: 尺寸 !== null ? EMU转像素(尺寸[1]) : 800,
    height: 尺寸 !== null ? EMU转像素(尺寸[2]) : 120,
    text: 合并文本,
    字号: Math.min(Math.max(Math.round(字号), 8), 96),
    ...(字体 && !字体.startsWith('+') ? { 字体 } : {}),
    加粗: 首个rPr !== null && /b="1"/.test(首个rPr[1]),
    斜体: 首个rPr !== null && /i="1"/.test(首个rPr[1]),
    下划线: Boolean(下划线 && 下划线 !== 'none'),
    ...(引用槽
      ? { 颜色引用: 引用槽, 颜色: 主题?.配色?.[引用槽] ?? (颜色匹配 !== null ? `#${颜色匹配[1].toUpperCase()}` : '#1A1D24') }
      : { 颜色: 颜色匹配 !== null ? `#${颜色匹配[1].toUpperCase()}` : '#1A1D24' }),
    对齐: 对齐匹配 !== null ? 对齐映射(对齐匹配[1]) : 'left',
    ...(占位符 && (占位符 === '标题' || 占位符 === '正文')
      ? {
        占位符,
        ...(占位标识 ? { 占位符标识: 占位标识 } : {}),
        ...(占位标记 === 'own' ? { 占位符继承: false } : 占位标记 === 'inherit' ? { 占位符继承: true } : {}),
      }
      : {}),
  }
}

const 对齐映射 = (algn) => {
  if (algn === 'ctr') return 'center'
  if (algn === 'r' || algn === 'end') return 'right'
  return 'left'
}

async function 写入pptx(模型) {
  const 文稿 = new pptxgen()
  // 富格式契约：{ 幻灯片: [{ 背景色, 文本框: [{ x, y, width, height, text, 字号, 加粗, 斜体, 颜色, 对齐, 片段 }] }] }
  // 旧契约 { 幻灯片: [{ 文本 }] } 与 { 幻灯片列表: [{ 标题, 内容 }] } 仍兼容。
  let 幻灯片列表 = []
  if (模型 && Array.isArray(模型.幻灯片)) {
    幻灯片列表 = 模型.幻灯片
  } else if (模型 && Array.isArray(模型.幻灯片列表)) {
    幻灯片列表 = 模型.幻灯片列表
  }
  if (!模型 || (!Array.isArray(模型.幻灯片) && !Array.isArray(模型.幻灯片列表))) {
    throw new Error('演示文稿保存模型无效：缺少幻灯片列表')
  }
  if (幻灯片列表.some((项) => (Array.isArray(项.对象列表) && 项.对象列表.some(对象 => !['图片', '组合', '图形', '表格', '图表', '公式', '附件', '图示', '媒体', '墨迹'].includes(对象.类型) || !对象.id || !Number.isFinite(对象.x) || !Number.isFinite(对象.y) || !(对象.width > 0) || !(对象.height > 0))) ||
      (Array.isArray(项.图片) && 项.图片.length > 0) ||
      (Array.isArray(项.图表) && 项.图表.length > 0) ||
      (Array.isArray(项.媒体) && 项.媒体.length > 0))) {
    throw new Error('演示文稿含当前写入器不支持的对象，已阻止有损保存')
  }
  if (幻灯片列表.some((项) => 项.动画)) {
    throw new Error('动画无法可靠保存为 PPTX，请先移除动画效果')
  }
  // 页面尺寸与母版：尺寸来自模型，版式由真实 slideMaster / slideLayout 部件承载
  const 页面尺寸 = 模型.页面尺寸 && Number.isFinite(模型.页面尺寸.宽) && Number.isFinite(模型.页面尺寸.高)
    ? { 宽: Math.round(模型.页面尺寸.宽), 高: Math.round(模型.页面尺寸.高) }
    : { ...默认页面尺寸 }
  文稿.defineLayout({ name: 'SEAL_PAGE', width: 页面尺寸.宽 / 72, height: 页面尺寸.高 / 72 })
  文稿.layout = 'SEAL_PAGE'
  const 主题 = 模型.主题 ?? null
  const 母版列表 = Array.isArray(模型.母版列表) ? 模型.母版列表 : []
  const 版式索引 = new Map()
  if (母版列表.length > 0) {
    for (const 母版 of 母版列表) {
      for (const 版式 of 母版.版式列表) {
        const 参数 = 版式转母版参数(母版, 版式, 主题)
        文稿.defineSlideMaster(参数)
        版式索引.set(版式.标识, 版式)
      }
    }
  }
  const 资源条目 = new Map((模型.资源条目 ?? []).map((项) => [项.标识, 项]))
  幻灯片列表.forEach((幻灯片数据) => {
    const 目标版式 = 幻灯片数据.版式标识 && 版式索引.has(幻灯片数据.版式标识) ? 幻灯片数据.版式标识 : null
    const 页面 = 目标版式 ? 文稿.addSlide({ masterName: 目标版式 }) : 文稿.addSlide()
    if (typeof 幻灯片数据.备注 === 'string' && 幻灯片数据.备注.length > 0) {
      页面.addNotes(幻灯片数据.备注)
    }
    const 背景 = 规整颜色(幻灯片数据.背景色, 'FFFFFF')
    页面.background = { color: 背景 }
    if (Array.isArray(幻灯片数据.文本框)) {
      // 富格式：逐文本框按位置与样式写入
      幻灯片数据.文本框.forEach((框) => {
        const 公共样式 = {
          x: 像素转英寸(框.x ?? 80),
          y: 像素转英寸(框.y ?? 60),
          w: 像素转英寸(框.width ?? 800),
          h: 像素转英寸(框.height ?? 120),
          fontSize: typeof 框.字号 === 'number' && 框.字号 > 0 ? 框.字号 : 24,
          bold: 框.加粗 === true,
          italic: 框.斜体 === true,
          color: 规整颜色(框.颜色, '1A1D24'),
          align: 框.对齐 === 'center' ? 'center' : 框.对齐 === 'right' ? 'right' : 'left',
          fontFace: typeof 框.字体 === 'string' && 框.字体.trim() ? 框.字体 : 'Microsoft YaHei',
          underline: 框.下划线 === true ? { style: 'sng' } : undefined,
          valign: 'top',
        }
        if (Array.isArray(框.片段) && 框.片段.length > 0) {
          const 运行列表 = 框.片段
            .filter((片段) => 片段 && typeof 片段.文本 === 'string')
            .map((片段) => ({
              text: 片段.文本,
              options: {
                bold: 片段.加粗 === true || 公共样式.bold,
                italic: 片段.斜体 === true || 公共样式.italic,
                color: 规整颜色(片段.颜色, 公共样式.color),
                underline: 片段.下划线 === true || 公共样式.underline ? { style: 'sng' } : undefined,
              },
            }))
          if (运行列表.length > 0) {
            页面.addText(运行列表, 公共样式)
            return
          }
        }
        页面.addText(typeof 框.text === 'string' ? 框.text : '', 公共样式)
      })
      return
    }
    // 旧契约：把文本压平进单个文本框
    let 文本内容 = ''
    if (typeof 幻灯片数据.文本 === 'string') {
      文本内容 = 幻灯片数据.文本
    } else {
      const 片段列表 = []
      if (幻灯片数据.标题) 片段列表.push(幻灯片数据.标题)
      if (Array.isArray(幻灯片数据.内容)) {
        幻灯片数据.内容.forEach((项) => {
          if (项 && typeof 项.文字 === 'string') 片段列表.push(项.文字)
        })
      }
      文本内容 = 片段列表.join('\n')
    }
    const 行列表 = 文本内容.split('\n')
    if (行列表.length === 0) {
      页面.addText('', { x: 0.5, y: 0.5, w: 10, h: 0.5, fontFace: 'Microsoft YaHei', fontSize: 24 })
    } else {
      const 段落列表 = 行列表.map((行) => ({
        text: 行,
        options: { fontFace: 'Microsoft YaHei', fontSize: 24, color: '1A1D24', breakLine: true },
      }))
      if (段落列表.length > 0) 段落列表[段落列表.length - 1].options.breakLine = false
      页面.addText(段落列表, { x: 0.5, y: 0.5, w: 11, h: 7 })
    }
  })
  const 原文件 = Buffer.from(await 文稿.write({ outputType: 'arraybuffer' }))
  if (!幻灯片列表.length && !模型.循环放映 && 模型.定稿 === undefined && !主题 && !母版列表.length && 模型.放映设置 === undefined && !模型.自定义放映?.length) return 原文件
  const 压缩包 = await JSZip.loadAsync(原文件)
  // 主题、母版与页面尺寸先落到真实部件，再逐页补丁
  if (主题) await 写入主题(压缩包, 主题)
  if (母版列表.length > 0) await 写入多母版(压缩包, 母版列表)
  if (页面尺寸.宽 !== 默认页面尺寸.宽 || 页面尺寸.高 !== 默认页面尺寸.高) await 写入页面尺寸(压缩包, 页面尺寸)
  // 幻灯片之间的关系目标与来源同目录，写成 slideN.xml，避免被解析成越界路径。
  const 页面路径 = (标识) => {
    const 位置 = 幻灯片列表.findIndex((项) => 项?.id === 标识)
    return 位置 < 0 ? null : `slide${位置 + 1}.xml`
  }
  for (let 索引 = 0; 索引 < 幻灯片列表.length; 索引 += 1) {
    const 页 = 幻灯片列表[索引]
    const 过渡Xml = 写入切换(页)
    const 名称 = `ppt/slides/slide${索引 + 1}.xml`
    const 文件 = 压缩包.file(名称)
    if (!文件) throw new Error(`生成幻灯片失败：缺少第 ${索引 + 1} 张幻灯片`)
    let xml = 移除占位符提示形状(写入稳定标识(await 文件.async('string'), 页, 索引))
    const 颜色引用列表 = (页.文本框 ?? [])
      .filter((框) => 框.颜色引用)
      .map((框) => ({ 框标识: 框.id, 槽: 框.颜色引用, 颜色: 框.颜色 }))
    if (颜色引用列表.length) xml = 写入主题色引用(xml, 颜色引用列表, 编码标识)
    const 占位符列表 = (页.文本框 ?? []).filter((框) => 框.占位符 === '标题' || 框.占位符 === '正文')
    if (占位符列表.length) xml = 写入占位符绑定(xml, 占位符列表, 版式索引.get(页.版式标识) ?? null)
    if (页.对象列表?.length) xml = await 写入图片对象(压缩包, 名称, xml, 页.对象列表, 模型.资源条目 ?? [], 页面路径)
    if (页.背景填充) {
      const 资源 = 页.背景填充.类型 === '图片' ? 资源条目.get(页.背景填充.资源标识) : null
      xml = await 写入背景填充(压缩包, 名称, xml, 页.背景填充, 资源)
    }
    const 页脚 = 复合页脚(模型.页脚设置, 页.页脚)
    if (页脚) xml = 写入页脚形状(xml, 页脚, 索引 + 1, 页面尺寸)
    if (页.隐藏 !== undefined && typeof 页.隐藏 !== 'boolean') throw new Error('隐藏页面状态无效')
    if (页.隐藏) xml = xml.replace('<p:sld ', '<p:sld show="0" ')
    // 媒体计时节点需要真实种类与播放参数；缺失字节一律拒绝写入。
    const 媒体列表 = (页.对象列表 ?? []).filter(项 => 项.类型 === '媒体').map(项 => {
      const 资源 = (模型.资源条目 ?? []).find(条目 => 条目.标识 === 项.资源标识)
      if (!资源?.数据) throw new Error(`媒体资源字节缺失：${项.资源标识}`)
      const 信息 = 检查媒体字节(Buffer.from(资源.数据, 'base64'), 资源.类型)
      return { 对象标识: 项.id, 种类: 信息.种类, 参数: 项.媒体 ?? {} }
    })
    const 动画Xml = 写入动画(xml, 页.动画序列, 媒体列表, 收集图表构建(页))
    const 音效Xml = 页.音效 ? await 写入音效(压缩包, 名称, 页.音效, 模型.资源条目 ?? []) : ''
    const 合并过渡Xml = 音效Xml ? (过渡Xml ? 过渡Xml.replace('</p:transition>', `${音效Xml}</p:transition>`) : `<p:transition>${音效Xml}</p:transition>`) : 过渡Xml
    xml = xml.replace('</p:sld>', `${合并过渡Xml}${动画Xml}${页.切换 || 页.动画序列 || 页.音效 ? 写入播放扩展(页) : ''}</p:sld>`)
    压缩包.file(名称, xml)
  }
  if (模型.循环放映 !== undefined && typeof 模型.循环放映 !== 'boolean') throw new Error('循环放映状态无效')
  await 写入批注(压缩包, 模型.批注列表, 幻灯片列表)
  if (模型.自定义放映 !== undefined && !Array.isArray(模型.自定义放映)) throw new Error('自定义放映参数无效')
  if (模型.放映设置 !== undefined && (typeof 模型.放映设置 !== 'object' || 模型.放映设置 === null || Array.isArray(模型.放映设置))) throw new Error('放映设置参数无效')
  if (模型.自定义放映?.length) {
    const 清单文件 = 压缩包.file('ppt/presentation.xml'), 关系文件 = 压缩包.file('ppt/_rels/presentation.xml.rels')
    if (!清单文件 || !关系文件) throw new Error('生成演示文稿失败：缺少演示清单或关系文件')
    压缩包.file('ppt/presentation.xml', 写入自定义放映(
      await 清单文件.async('string'), 幻灯片列表, await 关系文件.async('string'), 模型.自定义放映))
  }
  const 放映Xml = 写入放映设置(模型, 模型.自定义放映 ?? [])
  const 属性 = 压缩包.file('ppt/presProps.xml')
  if (放映Xml !== null) {
    if (!属性) throw new Error('生成演示文稿失败：缺少放映属性部件')
    const 内容 = (await 属性.async('string')).replace(/<p:presentationPr([^>]*)\/>/, '<p:presentationPr$1></p:presentationPr>').replace(/<p:showPr\b[^>]*(?:\/>|>[\s\S]*?<\/p:showPr>)/g, '')
    压缩包.file('ppt/presProps.xml', 内容.replace('</p:presentationPr>', `${放映Xml}</p:presentationPr>`))
  }
  if (模型.定稿 !== undefined) {
    校验定稿(模型.定稿)
    await 写入定稿(压缩包, 模型.定稿)
  }
  if (模型.讲义设置 !== undefined) await 写入讲义母版(压缩包, 模型.讲义设置)
  if (模型.备注设置 !== undefined) await 写入备注母版页眉页脚(压缩包, 模型.备注设置)
  return Buffer.from(await 压缩包.generateAsync({ type: 'nodebuffer' }))
}

/** 整篇页脚设置与单页覆盖合并；单页明确为 null 时本页不显示页脚。 */
function 复合页脚(整篇设置, 单页覆盖) {
  if (单页覆盖 === null) return null
  const 合并 = { ...(整篇设置 ?? {}), ...(单页覆盖 ?? {}) }
  if (!合并.页脚文本 && !合并.显示日期 && !合并.显示页码) return null
  return 合并
}

/**
 * 写入占位符绑定：加入原生 p:ph 类型并在 cNvPr 上记录占位符标识与继承状态。
 * 位置与文字样式仍为显式值，因此单页覆盖不会被版式重置。
 */
function 写入占位符绑定(xml, 占位符列表, 版式) {
  const 表 = new Map(占位符列表.map((框) => [编码标识(框.id), 框]))
  return xml.replace(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/gi, (形状) => {
    const 名称标签 = 形状.match(/<p:cNvPr\b[^>]*>/i)
    if (!名称标签) return 形状
    const 名称 = 读取Xml属性(名称标签[0], 'name')
    const 框 = 表.get(名称)
    if (!框) return 形状
    const 类型 = 框.占位符 === '标题' ? 'title' : 'body'
    const 序号 = 版式 ? 版式.占位符列表.findIndex((项) => 项.标识 === 框.占位符标识 || 项.类型 === 框.占位符) : -1
    const idx = 100 + (序号 >= 0 ? 序号 : 类型 === 'title' ? 0 : 1)
    const 标记 = `seal-ph:${框.占位符继承 === false ? 'own' : 'inherit'}${框.占位符标识 ? `;seal-ph-id:${框.占位符标识}` : ''}`
    let 更新 = 形状.replace(/<p:cNvPr\b[^>]*>/i, (标签) => (/\bdescr="[^"]*"/.test(标签)
      ? 标签.replace(/\bdescr="[^"]*"/, `descr="${标记}"`)
      : 标签.replace(/\/?>$/, (结束) => ` descr="${标记}"${结束}`)))
    const 占位节点 = `<p:ph type="${类型}" idx="${idx}"/>`
    if (/<p:nvPr\b[^>]*\/>/i.test(更新)) 更新 = 更新.replace(/<p:nvPr\b[^>]*\/>/i, `<p:nvPr>${占位节点}</p:nvPr>`)
    else if (/<p:nvPr\b[^>]*>\s*<\/p:nvPr>/i.test(更新)) 更新 = 更新.replace(/<p:nvPr\b[^>]*>\s*<\/p:nvPr>/i, `<p:nvPr>${占位节点}</p:nvPr>`)
    else if (/<p:nvPr\b[^>]*>/i.test(更新)) 更新 = 更新.replace(/(<p:nvPr\b[^>]*>)/i, `$1${占位节点}`)
    else 更新 = 更新.replace(/(<\/p:nvSpPr>)/i, `<p:nvPr>${占位节点}</p:nvPr>$1`)
    return 更新
  })
}

function 解码(文本) {
  const 实体映射 = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
  // 单次正则匹配所有命名实体和数字实体（十进制/十六进制），避免顺序问题
  return 文本.replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (匹配) => {
    if (匹配 in 实体映射) {
      return 实体映射[匹配]
    }
    if (匹配.startsWith('&#x')) {
      return String.fromCharCode(parseInt(匹配.slice(3, -1), 16))
    }
    return String.fromCharCode(parseInt(匹配.slice(2, -1), 10))
  })
}

module.exports = { 读取pptx, 写入pptx }
