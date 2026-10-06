// 演示文稿定稿：把定稿元数据写入 OOXML 标准的自定义属性部件 docProps/custom.xml，
// 并同步内容类型与根关系。定稿只是可恢复的只读标记，不是加密保护。
const 定稿属性名 = 'SealOfficeFinalized'
const 标记人属性名 = 'SealOfficeFinalizedBy'
const 自定义属性内容类型 = 'application/vnd.openxmlformats-officedocument.custom-properties+xml'
const 自定义属性关系类型 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties'
const 属性格式标识 = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}'
const 时间格式 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)
const 实体映射 = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }

function 反转义(文本) {
  return String(文本).replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (匹配) => {
    if (匹配 in 实体映射) return 实体映射[匹配]
    if (匹配.startsWith('&#x')) return String.fromCharCode(parseInt(匹配.slice(3, -1), 16))
    return String.fromCharCode(parseInt(匹配.slice(2, -1), 10))
  })
}

function 转义(文本) {
  return String(文本).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 解析标签属性，兼容单引号与属性间空白。 */
function 读取属性(标签, 名称) {
  const 表 = Object.fromEntries([...String(标签).matchAll(/\s([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(匹配 => [匹配[1], 反转义(匹配[3])]))
  return 表[名称] ?? null
}

/** 校验定稿信息，非法时给出真实原因。 */
function 校验定稿(定稿) {
  if (!是记录(定稿)) throw new Error('定稿信息无效：需要定稿时间')
  if (typeof 定稿.时间 !== 'string' || !时间格式.test(定稿.时间)) throw new Error('定稿时间无效：需要 ISO 8601 UTC 时间')
  if (定稿.标记人 !== undefined) {
    if (typeof 定稿.标记人 !== 'string' || 定稿.标记人.trim().length === 0) throw new Error('定稿标记人无效')
    if (定稿.标记人.trim().length > 64) throw new Error('定稿标记人过长：最多 64 个字符')
  }
}

function 提取属性值(属性Xml, 名称) {
  const 匹配 = String(属性Xml).match(/<property\b[^>]*>[\s\S]*?<\/property>/g) ?? []
  for (const 块 of 匹配) {
    const 开始标签 = 块.slice(0, 块.indexOf('>') + 1)
    if (读取属性(开始标签, 'name') !== 名称) continue
    const 内部 = 块.slice(开始标签.length, 块.lastIndexOf('</property>'))
    const 文本标签 = 内部.match(/<vt:lpwstr\b[^>]*>([\s\S]*?)<\/vt:lpwstr>/)
    return 反转义(文本标签 ? 文本标签[1] : 内部.replace(/<[^>]+>/g, ''))
  }
  return null
}

/** 读取定稿信息；没有定稿标记返回 null，损坏时报真实原因。 */
async function 读取定稿(压缩包) {
  const 文件 = 压缩包?.file?.('docProps/custom.xml')
  if (!文件) return null
  const 内容 = await 文件.async('string')
  if (!内容.includes(定稿属性名)) return null
  const 时间 = 提取属性值(内容, 定稿属性名)
  if (!时间 || !时间格式.test(时间)) throw new Error('定稿信息损坏：无法解析定稿时间')
  const 标记人 = 提取属性值(内容, 标记人属性名)
  return { 时间, ...(标记人 ? { 标记人 } : {}) }
}

/** 把定稿信息写入压缩包；重复写入只更新数值。 */
async function 写入定稿(压缩包, 定稿) {
  校验定稿(定稿)
  if (!压缩包?.file || !压缩包?.file('_rels/.rels') || !压缩包.file('[Content_Types].xml')) {
    throw new Error('压缩包缺少内容类型或关系部件，无法写入定稿信息')
  }
  const 已有 = 压缩包.file('docProps/custom.xml')
  let 属性Xml = 已有 ? await 已有.async('string') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>`
  if (!/<Properties\b[^>]*>/.test(属性Xml) || !/<\/Properties>/.test(属性Xml)) throw new Error('定稿信息损坏：自定义属性部件结构无效')
  // 移除同名属性，保证重复写入不产生重复项
  for (const 名称 of [定稿属性名, 标记人属性名]) {
    属性Xml = 属性Xml.replace(new RegExp(`<property\\b[^>]*name=["']${名称}["'][^>]*>[\\s\\S]*?<\\/property>|<property\\b[^>]*name=["']${名称}["'][^>]*\\/>`, 'g'), '')
  }
  const 已用 = [...属性Xml.matchAll(/<property\b[^>]*\bpid\s*=\s*["'](\d+)["']/g)].map(匹配 => Number(匹配[1]))
  let pid = (已用.length ? Math.max(...已用) : 1) + 1
  const 新属性 = [
    `<property fmtid="${属性格式标识}" pid="${pid++}" name="${定稿属性名}"><vt:lpwstr>${转义(定稿.时间)}</vt:lpwstr></property>`,
    ...(定稿.标记人 ? [`<property fmtid="${属性格式标识}" pid="${pid++}" name="${标记人属性名}"><vt:lpwstr>${转义(定稿.标记人.trim())}</vt:lpwstr></property>`] : []),
  ].join('')
  属性Xml = 属性Xml.replace('</Properties>', `${新属性}</Properties>`)
  压缩包.file('docProps/custom.xml', 属性Xml)

  const 内容类型 = await 压缩包.file('[Content_Types].xml').async('string')
  if (!内容类型.includes('/docProps/custom.xml')) {
    if (!内容类型.includes('</Types>')) throw new Error('定稿信息损坏：内容类型部件结构无效')
    压缩包.file('[Content_Types].xml', 内容类型.replace('</Types>', `<Override PartName="/docProps/custom.xml" ContentType="${自定义属性内容类型}"/></Types>`))
  }

  const 关系 = await 压缩包.file('_rels/.rels').async('string')
  if (!关系.includes(自定义属性关系类型)) {
    if (!关系.includes('</Relationships>')) throw new Error('定稿信息损坏：根关系部件结构无效')
    const 已用关系 = [...关系.matchAll(/\bId\s*=\s*["']rId(\d+)["']/g)].map(匹配 => Number(匹配[1]))
    const 新标识 = `rId${(已用关系.length ? Math.max(...已用关系) : 0) + 1}`
    压缩包.file('_rels/.rels', 关系.replace('</Relationships>', `<Relationship Id="${新标识}" Type="${自定义属性关系类型}" Target="docProps/custom.xml"/></Relationships>`))
  }
}

module.exports = { 写入定稿, 读取定稿, 校验定稿, 定稿属性名, 标记人属性名 }
