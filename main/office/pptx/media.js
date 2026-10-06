const { 读取对象标识 } = require('./objectIds')
const { 准备图表, 图框Xml, 读取图表 } = require('./charts')
const { 写入原生对象, 读取原生对象 } = require('./elements')
const { 检查媒体字节, 生成封面占位图, 按种类校正类型 } = require('./mediaTypes')
const { 构建链接, 解析链接, 构建媒体Xml, 解析媒体片段, 构建墨迹Xml, 解析墨迹片段, 视频扩展, 音频扩展, 图片扩展 } = require('./audioVideo')
const crypto = require('crypto')
const path = require('path')
const zlib = require('zlib')
const sax = require('sax')
const { 读取关系 } = require('./relations')
const { 读取部件 } = require('./parts')

const 属性 = (标签, 键) => 标签.match(new RegExp(`\\b${键}=["']([^"']*)["']`))?.[1]
const 转义Xml = 值 => String(值).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const 布尔真值 = 值 => ['1','true'].includes(值)
const 锁定属性未保真 = 属性表 => Object.entries(属性表).some(([键,值]) => !['noMove','noResize'].includes(键) || !['0','1','false','true'].includes(值)) || 布尔真值(属性表.noMove) !== 布尔真值(属性表.noResize)
const 编码标识 = 标识 => `seal-id:${Buffer.from(标识, 'utf8').toString('base64url')}`
const 转EMU = 值 => Math.round(值 * 12700)
const 转像素 = 值 => Number(值) / 12700

/** 根据真实文件头和完整数据结构识别可保真保存的位图。 */
function 检查图片字节(数据, 声明类型) {
  if (!Buffer.isBuffer(数据) || !数据.length || 数据.length > 50 * 1024 * 1024) throw new Error('图片字节为空或超过大小限制')
  let 类型, 宽, 高
  if (数据.length >= 33 && 数据.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    类型 = 'image/png'
    let 位置 = 8, 结束 = false
    const 压缩块 = []
    while (位置 + 12 <= 数据.length) {
      const 长度 = 数据.readUInt32BE(位置)
      if (位置 + 长度 + 12 > 数据.length) throw new Error('图片 PNG 数据截断')
      const 标签 = 数据.toString('ascii', 位置 + 4, 位置 + 8)
      let 校验 = 0xffffffff
      for (const 字节 of 数据.subarray(位置 + 4, 位置 + 8 + 长度)) {
        校验 ^= 字节
        for (let 位 = 0; 位 < 8; 位++) 校验 = (校验 >>> 1) ^ (校验 & 1 ? 0xedb88320 : 0)
      }
      if (((校验 ^ 0xffffffff) >>> 0) !== 数据.readUInt32BE(位置 + 8 + 长度)) throw new Error('图片 PNG 校验损坏')
      if (位置 === 8) {
        if (标签 !== 'IHDR' || 长度 !== 13) throw new Error('图片 PNG 头部损坏')
        宽 = 数据.readUInt32BE(位置 + 8); 高 = 数据.readUInt32BE(位置 + 12)
      }
      if (标签 === 'IDAT') 压缩块.push(数据.subarray(位置 + 8, 位置 + 8 + 长度))
      位置 += 长度 + 12
      if (标签 === 'IEND') { 结束 = 长度 === 0 && 位置 === 数据.length; break }
    }
    if (!结束 || !压缩块.length) throw new Error('图片 PNG 缺少完整图像数据')
    try { zlib.inflateSync(Buffer.concat(压缩块), { maxOutputLength: 100 * 1024 * 1024 }) } catch { throw new Error('图片 PNG 压缩数据损坏或解码后过大') }
  } else if (数据.length > 4 && 数据[0] === 255 && 数据[1] === 216 && 数据[数据.length - 2] === 255 && 数据[数据.length - 1] === 217) {
    类型 = 'image/jpeg'
    let 位置 = 2
    while (位置 + 4 < 数据.length) {
      if (数据[位置] !== 255) throw new Error('图片 JPEG 标记损坏')
      const 标记 = 数据[位置 + 1]
      if (标记 === 218) break
      const 长度 = 数据.readUInt16BE(位置 + 2)
      if (长度 < 2 || 位置 + 长度 + 2 > 数据.length) throw new Error('图片 JPEG 数据截断')
      if ([192,193,194].includes(标记)) { 高 = 数据.readUInt16BE(位置 + 5); 宽 = 数据.readUInt16BE(位置 + 7) }
      位置 += 长度 + 2
    }
  } else throw new Error('图片格式不受支持或文件已损坏；请选择 PNG 或 JPEG 图片')
  if (!宽 || !高 || 宽 > 30000 || 高 > 30000 || 宽 * 高 > 25000000) throw new Error('图片尺寸无效或超过解码限制')
  if (声明类型 !== undefined && 声明类型 !== 类型) throw new Error('图片声明类型与实际字节类型不一致')
  return { 类型, 宽, 高 }
}

async function 写入图片对象(包, 路径, xml, 对象列表, 资源列表, 页面路径 = () => null) {
  const 标识表 = new Set(), 父表 = new Map()
  for (const 对象 of 对象列表) {
    if (!对象.id || 标识表.has(对象.id)) throw new Error('图片对象标识为空或重复')
    标识表.add(对象.id)
    if (对象.连接 && [对象.连接.起点,对象.连接.终点].some(端 => !对象列表.some(项 => 项.id === 端.对象 && 项.形状 && !项.连接))) throw new Error('连接线引用的节点不存在或无效')
    if (![对象.x,对象.y,对象.width,对象.height,对象.旋转 ?? 0].every(Number.isFinite) || 对象.width <= 0 || 对象.height <= 0) throw new Error('图片对象位置或尺寸无效')
    const 裁剪 = 对象.裁剪
    if (裁剪 && (!['左','上','右','下'].every(边 => Number.isFinite(裁剪[边]) && 裁剪[边] >= 0 && 裁剪[边] < 1) || 裁剪.左 + 裁剪.右 >= 1 || 裁剪.上 + 裁剪.下 >= 1)) throw new Error('图片裁剪范围无效')
    for (const 子 of 对象.子对象标识 ?? []) {
      if (父表.has(子)) throw new Error('组合成员重复引用')
      父表.set(子, 对象.id)
    }
  }
  for (const 子 of 父表.keys()) {
    if (!标识表.has(子)) throw new Error('组合成员缺失')
    const 已访问 = new Set([子])
    let 父 = 父表.get(子)
    while (父) { if (已访问.has(父)) throw new Error('组合成员循环引用'); 已访问.add(父); 父 = 父表.get(父) }
  }
  const 资源表 = new Map(资源列表.map(项 => [项.标识, 项]))
  const 关系路径 = path.posix.join(path.posix.dirname(路径), '_rels', `${path.posix.basename(路径)}.rels`)
  let 关系Xml = 包.file(关系路径) ? await 包.file(关系路径).async('string') : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  let 类型Xml = await 读取部件(包, '[Content_Types].xml').async('string')
  const 图表部件 = await 准备图表(包, 路径, 对象列表)
  let 编号 = Math.max(1, ...Array.from(xml.matchAll(/<p:cNvPr\b[^>]*id="(\d+)"/g), 项 => Number(项[1]))) + 1
  const 成员 = new Set(对象列表.flatMap(项 => 项.类型 === '组合' ? 项.子对象标识 ?? [] : []))
  const 原生标识 = new Map()
  let 预分配 = 编号
  const 分配标识 = 对象 => { 原生标识.set(对象.id,预分配++); for (const id of 对象.子对象标识 ?? []) 分配标识(对象列表.find(项 => 项.id === id)) }
  对象列表.filter(项 => !成员.has(项.id)).forEach(分配标识)
  const 生成 = 对象 => {
    if (对象.链接 && !['图片','媒体'].includes(对象.类型)) throw new Error('当前只有图片与媒体对象支持保真写入超链接动作，已阻止有损保存')
    const 链接 = 对象.链接 ? 构建链接(对象.链接, 编号, 页面路径) : null
    if (链接?.关系.length) 关系Xml = 关系Xml.replace('</Relationships>', `${链接.关系.map(项 => 项.外部
      ? `<Relationship Id="${项.标识}" Type="${项.类型}" Target="${转义Xml(项.目标)}" TargetMode="External"/>`
      : `<Relationship Id="${项.标识}" Type="${项.类型}" Target="${项.目标}"/>`).join('')}</Relationships>`)
    const 链接子元素 = 链接?.子元素 ?? ''
    if (对象.类型 === '媒体') {
      const 资源 = 资源表.get(对象.资源标识)
      if (!资源 || !资源.数据) throw new Error(`媒体资源字节缺失：${对象.资源标识}`)
      const 数据 = Buffer.from(资源.数据, 'base64')
      const 媒体信息 = 检查媒体字节(数据, 资源.类型)
      if (crypto.createHash('sha256').update(数据).digest('hex') !== 资源.标识) throw new Error('媒体资源指纹不匹配')
      const 媒体路径 = `ppt/media/${资源.标识}.${媒体信息.扩展}`
      包.file(媒体路径, 数据)
      if (!new RegExp(`Extension="${媒体信息.扩展}"`).test(类型Xml)) 类型Xml = 类型Xml.replace('</Types>', `<Default Extension="${媒体信息.扩展}" ContentType="${媒体信息.类型}"/></Types>`)
      const 编号值 = 编号++
      const 媒体关系标识 = `sealMedia${编号值}`
      关系Xml = 关系Xml.replace('</Relationships>', `<Relationship Id="${媒体关系标识}" Type="${媒体信息.种类 === '视频' ? 视频扩展 : 音频扩展}" Target="../media/${资源.标识}.${媒体信息.扩展}"/></Relationships>`)
      let 封面标识, 封面扩展
      const 封面资源 = 对象.媒体?.封面资源标识 ? 资源表.get(对象.媒体.封面资源标识) : null
      if (封面资源) {
        if (!封面资源.数据) throw new Error(`媒体封面资源字节缺失：${对象.媒体.封面资源标识}`)
        const 封面字节 = Buffer.from(封面资源.数据, 'base64')
        if (crypto.createHash('sha256').update(封面字节).digest('hex') !== 封面资源.标识) throw new Error('媒体封面资源指纹不匹配')
        const 封面类型 = 检查图片字节(封面字节, 封面资源.类型).类型
        封面扩展 = 封面类型 === 'image/png' ? 'png' : 'jpg'
        封面标识 = 封面资源.标识
        包.file(`ppt/media/${封面标识}.${封面扩展}`, 封面字节)
        if (!new RegExp(`Extension="${封面扩展}"`).test(类型Xml)) 类型Xml = 类型Xml.replace('</Types>', `<Default Extension="${封面扩展}" ContentType="${封面类型}"/></Types>`)
      } else {
        const 占位 = 生成封面占位图(媒体信息.种类)
        封面标识 = crypto.createHash('sha256').update(占位).digest('hex')
        封面扩展 = 'png'
        包.file(`ppt/media/${封面标识}.png`, 占位)
        if (!/Extension="png"/.test(类型Xml)) 类型Xml = 类型Xml.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>')
      }
      const 封面关系标识 = `sealPoster${编号值}`
      关系Xml = 关系Xml.replace('</Relationships>', `<Relationship Id="${封面关系标识}" Type="${图片扩展}" Target="../media/${封面标识}.${封面扩展}"/></Relationships>`)
      return 构建媒体Xml({ 对象, 编号: 编号值, 媒体关系标识, 封面关系标识, 媒体种类: 媒体信息.种类, 锁定: 对象.锁定 === true, 链接: 链接子元素 })
    }
    if (对象.类型 === '墨迹') {
      if (链接子元素) throw new Error('笔迹不支持超链接动作')
      return 构建墨迹Xml(对象, 编号++)
    }
    if (对象.类型 === '组合') {
      if (对象.旋转) throw new Error('当前不能保真保存旋转组合，已阻止有损保存')
      const 子对象 = (对象.子对象标识 ?? []).map(id => 对象列表.find(项 => 项.id === id))
      if (!子对象.length || 子对象.some(项 => !项)) throw new Error('组合对象成员缺失')
      return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${编号++}" name="${编码标识(对象.id)}"${对象.语义类型 ? ` descr="seal-diagram:${对象.语义类型}"` : ''}/><p:cNvGrpSpPr><a:grpSpLocks noMove="${对象.锁定 ? 1 : 0}" noResize="${对象.锁定 ? 1 : 0}"/></p:cNvGrpSpPr><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/><a:chOff x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:chExt cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></a:xfrm></p:grpSpPr>${子对象.map(生成).join('')}</p:grpSp>`
    }
    if (对象.类型 === '图表') {
      const 名称 = 图表部件.get(对象.id), 关系标识 = `sealChart${编号}`
      关系Xml = 关系Xml.replace('</Relationships>', `<Relationship Id="${关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${名称}.xml"/></Relationships>`)
      类型Xml = 类型Xml.replace('</Types>', `<Override PartName="/ppt/charts/${名称}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`)
      if (!类型Xml.includes('Extension="xlsx"')) 类型Xml = 类型Xml.replace('</Types>', '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>')
      return 图框Xml(对象,编号++,关系标识)
    }
    if (['图形','表格'].includes(对象.类型)) return 写入原生对象(对象, 编号++, 原生标识)
    if (对象.类型 !== '图片') throw new Error('当前不能保真保存此对象，已阻止有损保存')
    const 资源 = 资源表.get(对象.资源标识)
    if (!资源 || !资源.数据) throw new Error(`图片资源字节缺失：${对象.资源标识}`)
    const 数据 = Buffer.from(资源.数据, 'base64')
    const { 类型 } = 检查图片字节(数据, 资源.类型)
    if (crypto.createHash('sha256').update(数据).digest('hex') !== 资源.标识) throw new Error('图片资源指纹不匹配')
    const 扩展 = 类型 === 'image/png' ? 'png' : 'jpg'
    const 媒体路径 = `ppt/media/${资源.标识}.${扩展}`
    包.file(媒体路径, 数据)
    if (!new RegExp(`Extension="${扩展}"`).test(类型Xml)) 类型Xml = 类型Xml.replace('</Types>', `<Default Extension="${扩展}" ContentType="${类型}"/></Types>`)
    const 关系标识 = `sealImage${编号}`
    关系Xml = 关系Xml.replace('</Relationships>', `<Relationship Id="${关系标识}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${资源.标识}.${扩展}"/></Relationships>`)
    const 裁剪 = 对象.裁剪 ?? { 左: 0, 上: 0, 右: 0, 下: 0 }
    const 编号值 = 编号++
    return `<p:pic><p:nvPicPr><p:cNvPr id="${编号值}" name="${编码标识(对象.id)}"${链接子元素 ? `>${链接子元素}</p:cNvPr>` : '/>'}<p:cNvPicPr><a:picLocks noMove="${对象.锁定 ? 1 : 0}" noResize="${对象.锁定 ? 1 : 0}"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${关系标识}"/><a:srcRect l="${Math.round(裁剪.左 * 100000)}" t="${Math.round(裁剪.上 * 100000)}" r="${Math.round(裁剪.右 * 100000)}" b="${Math.round(裁剪.下 * 100000)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm rot="${Math.round((对象.旋转 ?? 0) * 60000)}"><a:off x="${转EMU(对象.x)}" y="${转EMU(对象.y)}"/><a:ext cx="${转EMU(对象.width)}" cy="${转EMU(对象.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  }
  const 内容 = 对象列表.filter(项 => !成员.has(项.id)).map(生成).join('')
  包.file(关系路径, 关系Xml); 包.file('[Content_Types].xml', 类型Xml)
  if (!xml.includes('</p:spTree>')) throw new Error('幻灯片对象树缺失，不能嵌入图片')
  return xml.replace('</p:spTree>', `${内容}</p:spTree>`)
}

/** 切换音效：音频部件 + 音频关系 + 原生 p:sndAc 节点。 */
async function 写入音效(包, 路径, 音效, 资源列表) {
  if (!音效 || typeof 音效 !== 'object' || Array.isArray(音效)) throw new Error('切换音效设置无效')
  if (Object.keys(音效).some(键 => !['资源标识','音量','循环'].includes(键))) throw new Error('切换音效含未知属性，已阻止有损保存')
  if (typeof 音效.资源标识 !== 'string' || !音效.资源标识) throw new Error('切换音效资源标识无效')
  if (音效.音量 !== undefined && (!Number.isFinite(音效.音量) || 音效.音量 < 0 || 音效.音量 > 100)) throw new Error('切换音效音量无效')
  if (音效.循环 !== undefined && typeof 音效.循环 !== 'boolean') throw new Error('切换音效循环设置无效')
  const 资源 = new Map(资源列表.map(项 => [项.标识, 项])).get(音效.资源标识)
  if (!资源?.数据) throw new Error(`切换音效资源字节缺失：${音效.资源标识}`)
  const 数据 = Buffer.from(资源.数据, 'base64')
  const 信息 = 检查媒体字节(数据, 资源.类型)
  if (信息.种类 !== '音频') throw new Error('切换音效必须使用音频文件')
  if (crypto.createHash('sha256').update(数据).digest('hex') !== 资源.标识) throw new Error('切换音效资源指纹不匹配')
  const 关系路径 = path.posix.join(path.posix.dirname(路径), '_rels', `${path.posix.basename(路径)}.rels`)
  let 关系Xml = 包.file(关系路径) ? await 包.file(关系路径).async('string') : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  let 类型Xml = await 读取部件(包, '[Content_Types].xml').async('string')
  包.file(`ppt/media/${资源.标识}.${信息.扩展}`, 数据)
  if (!new RegExp(`Extension="${信息.扩展}"`).test(类型Xml)) 类型Xml = 类型Xml.replace('</Types>', `<Default Extension="${信息.扩展}" ContentType="${信息.类型}"/></Types>`)
  const 关系标识 = 'sealSound1'
  const 已有 = [...关系Xml.matchAll(/Id="([^"]+)"/g)].map(项 => 项[1])
  const 唯一标识 = 已有.includes(关系标识) ? `sealSound${已有.length + 1}` : 关系标识
  关系Xml = 关系Xml.replace('</Relationships>', `<Relationship Id="${唯一标识}" Type="${音频扩展}" Target="../media/${资源.标识}.${信息.扩展}"/></Relationships>`)
  包.file(关系路径, 关系Xml); 包.file('[Content_Types].xml', 类型Xml)
  return `<p:sndAc><p:stSnd><p:snd r:embed="${唯一标识}"/><p:endSnd/></p:stSnd></p:sndAc>`
}

/** 读取原生切换音效，只返回资源标识；音量等本机参数由播放扩展核验。 */
async function 读取音效(包, 路径, xml) {
  const 匹配 = xml.match(/<p:sndAc\b[^>]*>[\s\S]*?<\/p:sndAc>/)
  if (!匹配) return { 资源条目: [], 警告: [] }
  const 音频标签 = 匹配[0].match(/<p:snd\b[^>]*>/)?.[0] ?? ''
  const 关系标识 = 属性(音频标签, 'r:embed')
  const 关系 = await 读取关系(包, 路径)
  const 关联 = 关系.get(关系标识)
  if (!关联 || 关联.外部 || !关联.类型.endsWith('/audio')) return { 资源条目: [], 警告: ['切换音效未完整导入'] }
  try {
    const 数据 = await 读取部件(包, 关联.目标).async('nodebuffer')
    const 信息 = 检查媒体字节(数据)
    const 标识 = crypto.createHash('sha256').update(数据).digest('hex')
    return { 资源标识: 标识, 资源条目: [{ 标识, 类型: 信息.类型, 数据: 数据.toString('base64') }], 警告: [] }
  } catch {
    return { 资源条目: [], 警告: ['切换音效字节损坏或格式不受支持，未完整导入'] }
  }
}

async function 读取图片对象(包, 路径, xml) {
  const 关系 = await 读取关系(包, 路径)
  const 原生 = 读取原生对象(xml)
  const 图表 = await 读取图表(包, 路径, xml)
  const 对象列表 = [...原生.对象列表,...图表.对象列表], 资源表 = new Map(), 警告 = [...原生.警告,...图表.警告]
  const 已识别媒体片段 = []
  const 首图 = 原生.剩余.search(/<p:pic\b/), 文字位置 = Array.from(原生.剩余.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)).filter(项 => !项[0].includes('descr="seal-ink:')).map(项 => 项.index)
  if (首图 >= 0 && 文字位置.some(位置 => 位置 > 首图)) 警告.push('图片与文字图层未完整导入')
  if (/<p:pic\b[^>]*\/>/.test(xml)) 警告.push('图片未导入')
  for (const 匹配 of xml.matchAll(/<p:pic\b[^>]*>([\s\S]*?)<\/p:pic>/g)) {
    const 内容 = 匹配[1]
    if (/<a:(?:videoFile|audioFile)\b/.test(内容) || /<p14:media\b/.test(内容)) {
      const 解析 = 解析媒体片段(内容)
      if (!解析) { 警告.push('媒体对象未完整导入'); continue }
      if (解析.警告) { 警告.push(解析.警告); continue }
      const 媒体关联 = 关系.get(解析.媒体关系)
      if (!媒体关联 || 媒体关联.外部 || !/\/(?:video|audio)$/.test(媒体关联.类型)) { 警告.push('媒体关系缺失或类型不符，媒体未完整导入'); continue }
      let 数据, 信息
      try {
        数据 = await 读取部件(包, 媒体关联.目标).async('nodebuffer')
        信息 = 检查媒体字节(数据)
      } catch { 警告.push('媒体字节损坏或格式不受支持，媒体未完整导入'); continue }
      // WebM 与 ISO BMFF 同时承载音频和视频，读取时按原生节点种类校正媒体类型。
      const 校正类型 = 按种类校正类型(信息, 解析.种类)
      if (!校正类型) { 警告.push('媒体声明类型与实际字节不符，媒体未完整导入'); continue }
      信息 = { ...信息, 类型: 校正类型 }
      const 媒体标识 = crypto.createHash('sha256').update(数据).digest('hex')
      资源表.set(媒体标识, { 标识: 媒体标识, 类型: 信息.类型, 数据: 数据.toString('base64') })
      let 封面标识
      if (解析.封面关系) {
        const 封面关联 = 关系.get(解析.封面关系)
        if (!封面关联 || 封面关联.外部 || !封面关联.类型.endsWith('/image')) 警告.push('媒体封面关系无效，封面未完整导入')
        else {
          try {
            const 封面数据 = await 读取部件(包, 封面关联.目标).async('nodebuffer')
            const 封面信息 = 检查图片字节(封面数据)
            const 候选 = crypto.createHash('sha256').update(封面数据).digest('hex')
            const 占位 = crypto.createHash('sha256').update(生成封面占位图(解析.种类)).digest('hex')
            if (候选 !== 占位) {
              封面标识 = 候选
              资源表.set(候选, { 标识: 候选, 类型: 封面信息.类型, 数据: 封面数据.toString('base64') })
            }
          } catch { 警告.push('媒体封面字节损坏，封面未完整导入') }
        }
      } else 警告.push('媒体封面缺失，封面未完整导入')
      const 链接解析 = 解析链接(内容.match(/<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/)?.[0] ?? '', 关系)
      if (链接解析.警告) 警告.push(链接解析.警告)
      对象列表.push({
        id: 读取对象标识(属性(内容.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? '', 'name'), 路径, 属性(内容.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? '', 'id')),
        类型: '媒体',
        x: 转像素(解析.几何[0]), y: 转像素(解析.几何[1]), width: 转像素(解析.几何[2]), height: 转像素(解析.几何[3]),
        ...(解析.锁定 ? { 锁定: true } : {}),
        资源标识: 媒体标识,
        媒体: { ...(封面标识 ? { 封面资源标识: 封面标识 } : {}), ...解析.参数 },
        ...(链接解析.链接 ? { 链接: 链接解析.链接 } : {}),
      })
      已识别媒体片段.push(匹配[0])
      continue
    }
    const 支持标签 = new Set(['p:pic','p:nvPicPr','p:cNvPr','p:cNvPicPr','p:nvPr','p:blipFill','p:spPr','a:picLocks','a:blip','a:srcRect','a:stretch','a:fillRect','a:xfrm','a:off','a:ext','a:prstGeom','a:avLst','a:hlinkClick'])
    if (Array.from(内容.matchAll(/<([\w:]+)\b/g), 项 => 项[1]).some(标签 => !支持标签.has(标签))) 警告.push('图片效果未完整导入')
    const 支持属性 = { 'p:cNvPr': ['id','name'], 'a:picLocks': ['noMove','noResize'], 'a:blip': ['r:embed'], 'a:srcRect': ['l','t','r','b'], 'a:fillRect': ['l','t','r','b'], 'a:xfrm': ['rot','flipH','flipV'], 'a:off': ['x','y'], 'a:ext': ['cx','cy'], 'a:prstGeom': ['prst'] }
    const 属性解析器 = sax.parser(true)
    属性解析器.onopentag = 标签 => {
      if (Object.keys(标签.attributes).some(键 => !(支持属性[标签.name] ?? []).includes(键))) 警告.push('图片属性未完整导入')
      if (标签.name === 'a:xfrm' && ['flipH','flipV'].some(键 => 标签.attributes[键] !== undefined && !['0','false'].includes(标签.attributes[键]))) 警告.push('图片效果未完整导入')
    }
    属性解析器.write(`<p:pic>${内容}</p:pic>`).close()
    const 嵌入 = 属性(内容.match(/<a:blip\b[^>]*>/)?.[0] ?? '', 'r:embed')
    const 关联 = 关系.get(嵌入)
    if (!关联 || 关联.外部 || !关联.类型.endsWith('/image')) throw new Error('图片嵌入关系缺失或使用外部链接')
    const 数据 = await 读取部件(包, 关联.目标).async('nodebuffer')
    const { 类型 } = 检查图片字节(数据)
    const 标识 = crypto.createHash('sha256').update(数据).digest('hex')
    资源表.set(标识, { 标识, 类型, 数据: 数据.toString('base64') })
    const 变换 = 内容.match(/<a:xfrm\b[^>]*>([\s\S]*?)<\/a:xfrm>/)?.[0]
    const 位置 = 变换?.match(/<a:off\b[^>]*>/)?.[0], 尺寸 = 变换?.match(/<a:ext\b[^>]*>/)?.[0]
    if (!位置 || !尺寸) throw new Error('图片缺少位置或尺寸')
    const 裁剪 = 内容.match(/<a:srcRect\b[^>]*>/)?.[0] ?? ''
    const 裁剪值 = { 左: Number(属性(裁剪, 'l') ?? 0) / 100000, 上: Number(属性(裁剪, 't') ?? 0) / 100000, 右: Number(属性(裁剪, 'r') ?? 0) / 100000, 下: Number(属性(裁剪, 'b') ?? 0) / 100000 }
    const 属性标签 = 内容.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
    const 锁标签 = 内容.match(/<a:picLocks\b[^>]*>/)?.[0] ?? ''
    const 锁定值 = 键 => 布尔真值(属性(锁标签, 键))
    const 链接解析 = 解析链接(内容.match(/<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/)?.[0] ?? '', 关系)
    if (链接解析.警告) 警告.push(链接解析.警告)
    if (锁定属性未保真(Object.fromEntries(Array.from(锁标签.matchAll(/\b([\w:]+)=["']([^"']*)["']/g),项=>[项[1],项[2]])))) 警告.push('图片锁定属性未完整导入')
    const 旋转 = Number(属性(变换, 'rot') ?? 0) / 60000
    if (/\bflip[HV]="(?:1|true)"|<a:(?:effectLst|effectDag|tile|duotone|lum|alphaModFix|ln|custGeom)\b|<a:prstGeom\b[^>]*prst="(?!rect")/.test(内容)) 警告.push('图片效果未完整导入')
    const 填充区域 = 内容.match(/<a:fillRect\b[^>]*>/)?.[0] ?? ''
    if (['l','t','r','b'].some(名称 => Number(属性(填充区域, 名称) ?? 0) !== 0)) 警告.push('图片填充区域未完整导入')
    const 几何值 = [属性(位置,'x'),属性(位置,'y'),属性(尺寸,'cx'),属性(尺寸,'cy')].map(Number)
    if (!几何值.every(Number.isFinite) || 几何值[2] <= 0 || 几何值[3] <= 0 || !Number.isFinite(旋转) || Object.values(裁剪值).some(值 => !Number.isFinite(值) || 值 < 0 || 值 >= 1) || 裁剪值.左 + 裁剪值.右 >= 1 || 裁剪值.上 + 裁剪值.下 >= 1) throw new Error('图片几何或裁剪数据损坏')
    对象列表.push({ id: 读取对象标识(属性(属性标签, 'name'), 路径, 属性(属性标签, 'id')), 类型: '图片', x: 转像素(属性(位置, 'x')), y: 转像素(属性(位置, 'y')), width: 转像素(属性(尺寸, 'cx')), height: 转像素(属性(尺寸, 'cy')), ...(旋转 ? { 旋转 } : {}), ...(锁定值('noMove') ? { 锁定: true } : {}), ...(Object.values(裁剪值).some(Boolean) ? { 裁剪: 裁剪值 } : {}), 资源标识: 标识, ...(链接解析.链接 ? { 链接: 链接解析.链接 } : {}) })
  }
  // 组合按原生对象树读取；非恒等坐标变换保留风险提示，不能覆盖来源。
  const 栈 = [], 组合列表 = [], 顺序 = []
  let 组合属性 = false
  const 解析器 = sax.parser(true)
  解析器.onopentag = 标签 => {
    if (标签.name === 'p:grpSpPr') 组合属性 = true
    if (组合属性 && !['p:grpSpPr','a:xfrm','a:off','a:ext','a:chOff','a:chExt'].includes(标签.name)) 警告.push('组合外观未完整导入')
    if (标签.name === 'p:cNvPr') 顺序.push(读取对象标识(标签.attributes.name, 路径, 标签.attributes.id))
    if (标签.name === 'p:grpSp') {
      const 组合 = { id: '', 类型: '组合', x: 0, y: 0, width: 0, height: 0, 子对象标识: [] }
      if (栈.length) 栈[栈.length - 1].子对象标识.push(组合)
      栈.push(组合); 组合列表.push(组合)
    }
    if (!栈.length) return
    const 当前 = 栈[栈.length - 1]
    if (标签.name === 'a:grpSpLocks') {
      if (布尔真值(标签.attributes.noMove)) 当前.锁定 = true
      if (锁定属性未保真(标签.attributes)) 警告.push('组合锁定属性未完整导入')
    }
    if (标签.name === 'p:cNvPr') {
      const 标识 = 读取对象标识(标签.attributes.name, 路径, 标签.attributes.id)
      if (!当前.id) { 当前.id = 标识; const 语义 = 标签.attributes.descr?.replace(/^seal-diagram:/, ''); if (['流程','层级','循环','脑图'].includes(语义)) 当前.语义类型 = 语义 }
      else 当前.子对象标识.push(标识)
    }
    if (标签.name === 'a:off' && !当前.子对象标识.length) { 当前.x = 转像素(标签.attributes.x); 当前.y = 转像素(标签.attributes.y) }
    if (标签.name === 'a:ext' && !当前.子对象标识.length) { 当前.width = 转像素(标签.attributes.cx); 当前.height = 转像素(标签.attributes.cy) }
    if (标签.name === 'a:chOff' && (转像素(标签.attributes.x) !== 当前.x || 转像素(标签.attributes.y) !== 当前.y)) 警告.push('组合坐标变换未完整导入')
    if (标签.name === 'a:chExt' && (转像素(标签.attributes.cx) !== 当前.width || 转像素(标签.attributes.cy) !== 当前.height)) 警告.push('组合坐标变换未完整导入')
    if (标签.name === 'a:xfrm' && !当前.子对象标识.length && (Number(标签.attributes.rot ?? 0) || ['1','true'].includes(标签.attributes.flipH) || ['1','true'].includes(标签.attributes.flipV))) 警告.push('组合旋转未完整导入')
  }
  解析器.onclosetag = 名称 => { if (名称 === 'p:grpSp') 栈.pop(); if (名称 === 'p:grpSpPr') 组合属性 = false }
  解析器.write(xml).close()
  for (const 组合 of 组合列表) {
    组合.子对象标识 = 组合.子对象标识.map(项 => typeof 项 === 'string' ? 项 : 项.id)
    if (!组合.子对象标识.length || 组合.子对象标识.some(id => !对象列表.some(项 => 项.id === id) && !组合列表.some(项 => 项.id === id))) 警告.push('组合非图片成员未完整导入')
    else 对象列表.push(组合)
  }
  对象列表.sort((甲, 乙) => 顺序.indexOf(甲.id) - 顺序.indexOf(乙.id))
  // 永久笔迹：只认带私有标记的自由曲线，其余形状继续交给文字与语义结构解析。
  let 剩余Xml = 图表.剩余
  for (const 匹配 of [...剩余Xml.matchAll(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g)]) {
    const 片段 = 匹配[0]
    if (!片段.includes('descr="seal-ink:')) continue
    const 解析 = 解析墨迹片段(片段)
    if (!解析) continue
    if (解析.警告) { 警告.push(解析.警告); continue }
    const 标签 = 片段.match(/<p:cNvPr\b[^>]*>/)?.[0] ?? ''
    对象列表.push({
      id: 读取对象标识(属性(标签, 'name'), 路径, 属性(标签, 'id')),
      类型: '墨迹',
      x: 转像素(解析.几何[0]), y: 转像素(解析.几何[1]), width: 转像素(解析.几何[2]), height: 转像素(解析.几何[3]),
      墨迹: 解析.墨迹,
    })
    剩余Xml = 剩余Xml.replace(片段, '')
  }
  // 已识别的媒体与笔迹不再参与「未导入内容」扫描，避免重复告警。
  for (const 片段 of 已识别媒体片段) 剩余Xml = 剩余Xml.replace(片段, '')
  return { 对象列表, 资源条目: Array.from(资源表.values()), 警告, 图表剩余: 剩余Xml }
}

module.exports = { 检查图片字节, 读取图片对象, 写入图片对象, 写入音效, 读取音效 }
