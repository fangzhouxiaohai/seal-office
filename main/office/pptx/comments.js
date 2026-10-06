// 原生演示批注读写：commentAuthors.xml + 每页 comments 部件 + 部件关系 + 内容类型声明。
// 回复、对象锚点与解决状态没有对应的原生属性，保存在海豹办公扩展部件中，并在文档中说明。
const { 读取部件 } = require('./parts')
const { 关联目标 } = require('./relations')

const 内容类型 = {
  批注: 'application/vnd.openxmlformats-officedocument.presentationml.comments+xml',
  批注作者: 'application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml',
}
const 关系类型 = {
  批注: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
  批注作者: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors',
  扩展: 'urn:seal-office:relationship/sealComments',
}
const 扩展命名空间 = 'urn:seal-office:ppt:comments:1'
const 扩展路径 = 'ppt/sealComments.xml'
const 声明 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

const 转义 = (文本) => String(文本)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const 解码 = (文本) => String(文本).replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (匹配) => {
  const 映射 = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
  if (匹配 in 映射) return 映射[匹配]
  if (匹配.startsWith('&#x')) return String.fromCharCode(parseInt(匹配.slice(3, -1), 16))
  return String.fromCharCode(parseInt(匹配.slice(2, -1), 10))
})

/** 读取标签属性，兼容单引号与属性间空白；与主编解码器使用同一规则。 */
function 读取属性表(标签) {
  return Object.fromEntries([...String(标签).matchAll(/\s([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(匹配 => [匹配[1], 解码(匹配[3])]))
}

const 转义正则 = (文本) => String(文本).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const 关系路径 = (来源) => {
  const 片段 = 来源.split('/')
  return [...片段.slice(0, -1), '_rels', `${片段[片段.length - 1]}.rels`].join('/')
}

const 追加关系 = (xml, 标识, 类型, 目标) =>
  xml.replace('</Relationships>', `<Relationship Id="${转义(标识)}" Type="${转义(类型)}" Target="${转义(目标)}"/></Relationships>`)

const 去掉关系 = (xml, 类型) => xml.replace(new RegExp(`<Relationship[^>]*Type="${转义正则(类型)}"[^>]*/>`, 'g'), '')

function 追加内容类型(xml, 部件名, 类型) {
  if (xml.includes(`PartName="${部件名}"`)) return xml
  return xml.replace('</Types>', `<Override PartName="${部件名}" ContentType="${类型}"/></Types>`)
}

const 初始关系文档 = `${声明}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`

async function 关系文档(压缩包, 来源) {
  const 路径 = 关系路径(来源)
  const 文件 = 压缩包.file(路径)
  return 文件 ? 文件.async('string') : 初始关系文档
}

/** 写入批注；页面标识无法对应幻灯片时拒绝写入，避免产生悬挂批注。 */
async function 写入批注(压缩包, 批注列表, 幻灯片列表) {
  if (批注列表 === undefined) return
  if (!Array.isArray(批注列表)) throw new Error('批注列表无效')
  if (批注列表.length === 0) return
  const 序号按页标识 = new Map(幻灯片列表.map((页, 序号) => [页.id, 序号]))
  const 作者列表 = []
  const 取作者编号 = (名称) => {
    const 已有 = 作者列表.indexOf(名称)
    if (已有 >= 0) return 已有
    作者列表.push(名称)
    return 作者列表.length - 1
  }
  const 按页 = new Map()
  for (const 批注 of 批注列表) {
    if (!批注 || typeof 批注 !== 'object') throw new Error('批注数据无效')
    if (!序号按页标识.has(批注.页标识)) throw new Error(`批注引用的页面不存在：${String(批注.页标识)}`)
    for (const 必备 of ['作者', '内容', '时间']) if (typeof 批注[必备] !== 'string' || !批注[必备].trim()) throw new Error(`批注${必备}无效`)
    const 序号 = 序号按页标识.get(批注.页标识)
    if (!按页.has(序号)) 按页.set(序号, [])
    按页.get(序号).push(批注)
  }
  // 先登记作者并分配页内序号，再写作者表；作者编号必须与注释部件中的 authorId 一致
  const 条目列表 = []
  for (const [序号, 页批注] of [...按页.entries()].sort((左, 右) => 左[0] - 右[0])) {
    页批注.forEach((批注, 位置) => {
      const 作者编号 = 取作者编号(批注.作者)
      for (const 回复 of 批注.回复 ?? []) {
        if (!回复 || typeof 回复.作者 !== 'string' || !回复.作者.trim() || typeof 回复.内容 !== 'string' || !回复.内容.trim()) throw new Error('批注回复无效')
        取作者编号(回复.作者)
      }
      条目列表.push({ 幻灯片序号: 序号 + 1, 索引: 位置 + 1, 批注, 作者编号 })
    })
  }
  const 最大索引 = new Map()
  for (const 条目 of 条目列表) 最大索引.set(条目.批注.作者, Math.max(最大索引.get(条目.批注.作者) ?? 0, 条目.索引))
  const 作者Xml = 作者列表.map((名称, 编号) =>
    `<p:cmAuthor id="${编号}" name="${转义(名称)}" initials="${转义([...名称][0] ?? '')}" lastIdx="${最大索引.get(名称) ?? 1}" clrIdx="${编号 % 6}"/>`).join('')
  压缩包.file('ppt/commentAuthors.xml', `${声明}<p:cmAuthorLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${作者Xml}</p:cmAuthorLst>`)
  for (const 序号 of 按页.keys()) {
    const 注释 = 条目列表.filter(条目 => 条目.幻灯片序号 === 序号 + 1)
      .map(条目 => `<p:cm authorId="${条目.作者编号}" dt="${转义(条目.批注.时间)}" idx="${条目.索引}"><p:pos x="0" y="0"/><p:text>${转义(条目.批注.内容)}</p:text></p:cm>`).join('')
    压缩包.file(`ppt/comments/comment${序号 + 1}.xml`, `${声明}<p:cmLst xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${注释}</p:cmLst>`)
    const 幻灯片路径 = `ppt/slides/slide${序号 + 1}.xml`
    const 原关系 = await 关系文档(压缩包, 幻灯片路径)
    压缩包.file(关系路径(幻灯片路径), 追加关系(去掉关系(原关系, 关系类型.批注), `rIdSealComments${序号 + 1}`, 关系类型.批注, `../comments/comment${序号 + 1}.xml`))
  }
  const 扩展条目 = 条目列表.map(条目 => {
    const 回复 = (条目.批注.回复 ?? []).map(项 => `<seal:reply id="${转义(项.id ?? '')}" author="${转义(项.作者)}" dt="${转义(项.时间 ?? '')}">${转义(项.内容)}</seal:reply>`).join('')
    return `<seal:comment slide="${条目.幻灯片序号}" idx="${条目.索引}" id="${转义(条目.批注.id ?? '')}"${条目.批注.对象标识 ? ` object="${转义(条目.批注.对象标识)}"` : ''}${条目.批注.已解决 ? ' resolved="1"' : ''}>${回复}</seal:comment>`
  }).join('')
  压缩包.file(扩展路径, `${声明}<seal:sealComments xmlns:seal="${扩展命名空间}">${扩展条目}</seal:sealComments>`)
  const 清单路径 = 'ppt/presentation.xml'
  const 清单关系 = 去掉关系(去掉关系(await 关系文档(压缩包, 清单路径), 关系类型.批注作者), 关系类型.扩展)
  压缩包.file(关系路径(清单路径), 追加关系(追加关系(清单关系, 'rIdSealCommentAuthors', 关系类型.批注作者, 'commentAuthors.xml'), 'rIdSealComments', 关系类型.扩展, 'sealComments.xml'))
  const 类型文件 = 压缩包.file('[Content_Types].xml')
  if (!类型文件) throw new Error('生成批注失败：缺少内容类型声明')
  let 类型Xml = await 类型文件.async('string')
  类型Xml = 追加内容类型(类型Xml, '/ppt/commentAuthors.xml', 内容类型.批注作者)
  for (const 序号 of 按页.keys()) 类型Xml = 追加内容类型(类型Xml, `/ppt/comments/comment${序号 + 1}.xml`, 内容类型.批注)
  压缩包.file('[Content_Types].xml', 类型Xml)
}

/** 解析单个批注部件；结构超出本机能力时返回警告标记。 */
function 解析批注Xml(xml) {
  if (!/<p:cmLst\b[^>]*>[\s\S]*<\/p:cmLst>\s*$/.test(xml)) return { 列表: [], 警告: true }
  const 列表 = []
  let 警告 = false
  const 正则 = /<p:cm\b([^>]*?)(?:\/>|>([\s\S]*?)<\/p:cm>)/g
  let 匹配
  while ((匹配 = 正则.exec(xml)) !== null) {
    const 属性 = 读取属性表(`<p:cm${匹配[1]}>`)
    if (Object.keys(属性).some(键 => !['authorId', 'dt', 'idx'].includes(键))) 警告 = true
    const 内容 = 匹配[2] ?? ''
    const 剩余 = 内容.replace(/<p:pos\b[^>]*\/>/g, '').replace(/<p:text>[\s\S]*?<\/p:text>/g, '').trim()
    if (剩余 !== '') 警告 = true
    const 文本 = 内容.match(/<p:text>([\s\S]*?)<\/p:text>/)?.[1]
    if (文本 === undefined) { 警告 = true; continue }
    列表.push({ 作者编号: Number(属性.authorId ?? -1), 时间: 属性.dt ?? '', 索引: Number(属性.idx ?? 0), 内容: 解码(文本) })
  }
  return { 列表, 警告 }
}

async function 读取作者表(压缩包, 警告) {
  const 文件 = 压缩包.file('ppt/commentAuthors.xml')
  if (!文件) return new Map()
  const xml = await 文件.async('string')
  if (!/<p:cmAuthorLst\b[^>]*>[\s\S]*<\/p:cmAuthorLst>\s*$/.test(xml)) { 警告.add('批注未完整导入'); return new Map() }
  const 表 = new Map()
  for (const 匹配 of xml.matchAll(/<p:cmAuthor\b([^>]*?)\/?>/g)) {
    const 属性 = 读取属性表(`<p:cmAuthor${匹配[1]}>`)
    if (Object.keys(属性).some(键 => !['id', 'name', 'initials', 'lastIdx', 'clrIdx'].includes(键))) 警告.add('批注未完整导入')
    if (属性.id !== undefined && 属性.name !== undefined) 表.set(Number(属性.id), 属性.name)
  }
  return 表
}

async function 读取扩展(压缩包, 警告) {
  const 文件 = 压缩包.file(扩展路径)
  if (!文件) return new Map()
  const xml = await 文件.async('string')
  if (!xml.includes(扩展命名空间)) { 警告.add('批注未完整导入'); return new Map() }
  const 表 = new Map()
  for (const 匹配 of xml.matchAll(/<seal:comment\b([^>]*?)(?:\/>|>([\s\S]*?)<\/seal:comment>)/g)) {
    const 属性 = 读取属性表(`<seal:comment${匹配[1]}>`)
    if (!属性.slide || !属性.idx || !属性.id) { 警告.add('批注未完整导入'); continue }
    if (Object.keys(属性).some(键 => !['slide', 'idx', 'id', 'object', 'resolved'].includes(键))) 警告.add('批注未完整导入')
    const 回复 = [...(匹配[2] ?? '').matchAll(/<seal:reply\b([^>]*?)(?:\/>|>([\s\S]*?)<\/seal:reply>)/g)].map(项 => {
      const 回复属性 = 读取属性表(`<seal:reply${项[1]}>`)
      if (Object.keys(回复属性).some(键 => !['id', 'author', 'dt'].includes(键))) 警告.add('批注未完整导入')
      if (!回复属性.id || !回复属性.author || !回复属性.dt) 警告.add('批注未完整导入')
      return { id: 回复属性.id ?? '', 作者: 回复属性.author ?? '', 内容: 解码(项[2] ?? ''), 时间: 回复属性.dt ?? '' }
    })
    // 声明的回复数与解析出的回复数不一致说明存在未闭合或结构异常的条目
    const 声明回复数 = (匹配[2] ?? '').match(/<seal:reply\b/g)?.length ?? 0
    if (声明回复数 !== 回复.length) 警告.add('批注未完整导入')
    const 键 = `${属性.slide}|${属性.idx}`
    if (表.has(键)) 警告.add('批注未完整导入')
    表.set(键, { id: 属性.id, 对象标识: 属性.object, 已解决: 属性.resolved === '1', 回复 })
  }
  // 声明的批注条目数与成功解析数不一致（未闭合、缺少必需属性或重复键）时提示风险
  const 声明批注数 = xml.match(/<seal:comment\b/g)?.length ?? 0
  if (声明批注数 !== (xml.match(/<seal:comment\b[^>]*?(?:\/>|>[\s\S]*?<\/seal:comment>)/g) ?? []).length) 警告.add('批注未完整导入')
  return 表
}

/** 读取全部批注；没有批注能力的内容只登记风险，不静默丢弃。 */
async function 读取批注(压缩包, 幻灯片列表, 警告) {
  if (Object.keys(压缩包.files).some(名称 => /^ppt\/comments\/modernComment/i.test(名称))) 警告.add('批注未完整导入')
  const 作者表 = await 读取作者表(压缩包, 警告)
  const 扩展表 = await 读取扩展(压缩包, 警告)
  const 结果 = []
  const 已用扩展键 = new Set()
  for (let 序号 = 0; 序号 < 幻灯片列表.length; 序号++) {
    const 幻灯片路径 = `ppt/slides/slide${序号 + 1}.xml`
    const 目标 = await 关联目标(压缩包, 幻灯片路径, 'comments')
    for (const 批注路径 of 目标) {
      if (!/^ppt\/comments\/[^/]+\.xml$/i.test(批注路径)) { 警告.add('批注未完整导入'); continue }
      const xml = await 读取部件(压缩包, 批注路径).async('string')
      if (/p188:/.test(xml)) { 警告.add('批注未完整导入'); continue }
      const 解析 = 解析批注Xml(xml)
      if (解析.警告) 警告.add('批注未完整导入')
      for (const 项 of 解析.列表) {
        const 扩展键 = `${序号 + 1}|${项.索引}`
        const 元数据 = 扩展表.get(扩展键)
        if (元数据) {
          已用扩展键.add(扩展键)
          // 回复缺少时间会被模型拒绝，这里必须提示而不是静默少一条回复
          if ((元数据.回复 ?? []).some(回复 => !回复.时间)) 警告.add('批注未完整导入')
        }
        结果.push({
          id: 元数据?.id || `批注-s${序号 + 1}-${项.索引}`,
          页标识: 幻灯片列表[序号].id,
          ...(元数据?.对象标识 ? { 对象标识: 元数据.对象标识 } : {}),
          作者: 作者表.get(项.作者编号) ?? '未知作者',
          内容: 项.内容,
          时间: 项.时间,
          ...(元数据?.回复?.length ? { 回复: 元数据.回复.filter(回复 => 回复.时间) } : {}),
          ...(元数据?.已解决 ? { 已解决: true } : {}),
        })
      }
    }
  }
  // 扩展部件里存在无法对应到原生批注的条目（外部改写、索引变化或引用已删除页面）时必须提示风险
  if ([...扩展表.keys()].some(键 => !已用扩展键.has(键))) 警告.add('批注未完整导入')
  return 结果
}

module.exports = { 写入批注, 读取批注, 解析批注Xml }
