// 讲义母版与备注母版的页眉页脚：写入 OOXML 原生部件并读回。
// 讲义母版使用 ppt/handoutMasters/handoutMaster1.xml；备注母版在既有 ppt/notesMasters/notesMaster1.xml 上注入 p:hf。
const 讲义母版路径 = 'ppt/handoutMasters/handoutMaster1.xml'
const 备注母版路径 = 'ppt/notesMasters/notesMaster1.xml'
const 讲义母版内容类型 = 'application/vnd.openxmlformats-officedocument.presentationml.handoutMaster+xml'
const 讲义母版关系类型 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/handoutMaster'
const 演示关系路径 = 'ppt/_rels/presentation.xml.rels'
const 讲义张数表 = new Set([1, 2, 3, 4, 6, 9])
const 文本上限 = 120

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

function 转义(文本) {
  return String(文本).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function 反转义(文本) {
  const 表 = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" }
  return String(文本).replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (匹配) => {
    if (匹配 in 表) return 表[匹配]
    if (匹配.startsWith('&#x')) return String.fromCharCode(parseInt(匹配.slice(3, -1), 16))
    return String.fromCharCode(parseInt(匹配.slice(2, -1), 10))
  })
}

/** 校验讲义设置（主进程侧与渲染端同规则，避免跨进程后失去保护） */
function 校验母版设置(设置) {
  if (!是记录(设置)) throw new Error('讲义设置无效')
  if (!讲义张数表.has(设置.每页张数)) throw new Error('讲义每页张数只支持 1、2、3、4、6、9')
  for (const [键, 名称] of [['页眉', '讲义页眉'], ['页脚', '讲义页脚']]) {
    if (typeof 设置[键] !== 'string') throw new Error(`${名称}必须是文本`)
    if (设置[键].length > 文本上限) throw new Error(`${名称}过长：最多 ${文本上限} 个字符`)
  }
  if (typeof 设置.显示日期 !== 'boolean') throw new Error('讲义日期开关必须是开关状态')
  if (typeof 设置.显示页码 !== 'boolean') throw new Error('讲义页码开关必须是开关状态')
}

function 校验备注设置(设置) {
  if (!是记录(设置)) throw new Error('备注设置无效')
  if (设置.排版 !== '幻灯片加备注' && 设置.排版 !== '仅备注') throw new Error('备注排版只支持「幻灯片加备注」或「仅备注」')
  for (const [键, 名称] of [['页眉', '备注页眉'], ['页脚', '备注页脚']]) {
    if (typeof 设置[键] !== 'string') throw new Error(`${名称}必须是文本`)
    if (设置[键].length > 文本上限) throw new Error(`${名称}过长：最多 ${文本上限} 个字符`)
  }
  if (typeof 设置.显示日期 !== 'boolean') throw new Error('备注日期开关必须是开关状态')
  if (typeof 设置.显示页码 !== 'boolean') throw new Error('备注页码开关必须是开关状态')
}

/** 占位符形状：hdr/ftr/dt/sldNum 与 PowerPoint 讲义母版保持一致 */
function 占位符形状(id, 类型, 文本, x, y) {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Seal ${类型}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>` +
    `<p:nvPr><p:ph type="${类型}"/></p:nvPr></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="5486400" cy="457200"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1200"><a:solidFill><a:srgbClr val="5A6473"/></a:solidFill><a:latin typeface="Microsoft YaHei"/></a:rPr>` +
    `<a:t>${转义(文本)}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`
  )
}

function 生成讲义母版(设置) {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
    '<p:handoutMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:seal="urn:seal-office:handout" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    占位符形状(2, 'hdr', 设置.页眉, 457200, 274320) +
    占位符形状(3, 'ftr', 设置.页脚, 457200, 6271275) +
    占位符形状(4, 'dt', '', 5486400, 274320) +
    占位符形状(5, 'sldNum', '', 5486400, 6271275) +
    '</p:spTree></p:cSld>' +
    `<p:hf hdr="${设置.页眉 ? 1 : 0}" ftr="${设置.页脚 ? 1 : 0}" dt="${设置.显示日期 ? 1 : 0}" sldNum="${设置.显示页码 ? 1 : 0}"/>` +
    // 每页张数在 OOXML 中由母版版式决定，这里用标准扩展列表保存本机选择，外部软件可原样保留
    `<p:extLst><p:ext uri="{SEAL-OFFICE-HANDOUT}"><seal:handoutCount count="${设置.每页张数}"/></p:ext></p:extLst>` +
    '</p:handoutMaster>'
  )
}

/** 读取 p:hf 属性，兼容单引号与属性间空白 */
function 读取页眉页脚标记(xml) {
  const 标签 = xml.match(/<p:hf\b[^>]*\/?>/)?.[0]
  if (!标签) return null
  const 表 = Object.fromEntries([...标签.matchAll(/\s([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(匹配 => [匹配[1], 匹配[3]]))
  return { 页眉: 表.hdr === '1', 页脚: 表.ftr === '1', 日期: 表.dt === '1', 页码: 表.sldNum === '1' }
}

/** 读取指定占位符的文本 */
function 读取占位符文本(xml, 类型) {
  for (const 形状 of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? []) {
    if (!new RegExp(`<p:ph[^>]*type="${类型}"`).test(形状)) continue
    const 文本 = [...形状.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(匹配 => 反转义(匹配[1])).join('')
    return 文本
  }
  return ''
}

async function 写入讲义母版(压缩包, 设置) {
  校验母版设置(设置)
  if (!压缩包?.file || !压缩包.file('[Content_Types].xml') || !压缩包.file(演示关系路径) || !压缩包.file('ppt/presentation.xml')) {
    throw new Error('压缩包缺少内容类型或演示部件，无法写入讲义母版')
  }
  压缩包.file(讲义母版路径, 生成讲义母版(设置))

  const 内容类型 = await 压缩包.file('[Content_Types].xml').async('string')
  if (!内容类型.includes(`/${讲义母版路径}`)) {
    if (!内容类型.includes('</Types>')) throw new Error('内容类型部件结构无效，无法写入讲义母版')
    压缩包.file('[Content_Types].xml', 内容类型.replace('</Types>', `<Override PartName="/${讲义母版路径}" ContentType="${讲义母版内容类型}"/></Types>`))
  }

  const 关系 = await 压缩包.file(演示关系路径).async('string')
  if (!关系.includes(讲义母版关系类型)) {
    if (!关系.includes('</Relationships>')) throw new Error('演示关系部件结构无效，无法写入讲义母版')
    const 已用 = [...关系.matchAll(/\bId\s*=\s*["']rId(\d+)["']/g)].map(匹配 => Number(匹配[1]))
    const 标识 = `rId${(已用.length ? Math.max(...已用) : 0) + 1}`
    压缩包.file(演示关系路径, 关系.replace('</Relationships>', `<Relationship Id="${标识}" Type="${讲义母版关系类型}" Target="handoutMasters/handoutMaster1.xml"/></Relationships>`))
  }

  const 演示 = await 压缩包.file('ppt/presentation.xml').async('string')
  if (!演示.includes('handoutMasterIdLst')) {
    const 关系内容 = await 压缩包.file(演示关系路径).async('string')
    const 标识 = 关系内容.match(new RegExp(`Id="(rId\\d+)"[^>]*Type="${讲义母版关系类型}"`))?.[1]
    if (!标识) throw new Error('讲义母版关系缺失，无法写入演示引用')
    const 节点 = `<p:handoutMasterIdLst><p:handoutMasterId r:id="${标识}"/></p:handoutMasterIdLst>`
    const 插入点 = /<p:sldIdLst\b/.test(演示) ? 演示.search(/<p:sldIdLst\b/) : 演示.indexOf('</p:presentation>')
    if (插入点 < 0) throw new Error('演示部件结构无效，无法写入讲义母版引用')
    压缩包.file('ppt/presentation.xml', `${演示.slice(0, 插入点)}${节点}${演示.slice(插入点)}`)
  }
  return { 成功: true }
}

async function 读取讲义母版(压缩包) {
  const 文件 = 压缩包?.file?.(讲义母版路径)
  if (!文件) return null
  const xml = await 文件.async('string')
  if (!/<p:handoutMaster\b/.test(xml) || !/<\/p:handoutMaster>/.test(xml)) throw new Error('讲义母版部件损坏，无法读取设置')
  const 标记 = 读取页眉页脚标记(xml)
  if (!标记) throw new Error('讲义母版缺少页眉页脚标记，无法读取设置')
  return {
    每页张数: 读取讲义张数(xml),
    页眉: 读取占位符文本(xml, 'hdr'),
    页脚: 读取占位符文本(xml, 'ftr'),
    显示日期: 标记.日期,
    显示页码: 标记.页码,
  }
}

/** 讲义每页张数保存在标准扩展列表中；缺失或非法时回退到 PowerPoint 默认的 6 张 */
function 读取讲义张数(xml) {
  const 匹配 = xml.match(/<seal:handoutCount[^>]*\bcount="(\d+)"/)
  if (!匹配) return 6
  const 数值 = Number(匹配[1])
  return 讲义张数表.has(数值) ? 数值 : 6
}

async function 写入备注母版页眉页脚(压缩包, 设置) {
  校验备注设置(设置)
  const 文件 = 压缩包?.file?.(备注母版路径)
  if (!文件) throw new Error('缺少备注母版部件，无法写入备注页眉页脚')
  let xml = await 文件.async('string')
  if (!/<p:notesMaster\b/.test(xml) || !/<\/p:notesMaster>/.test(xml)) throw new Error('备注母版部件损坏，无法写入备注页眉页脚')
  // 清理既有页眉页脚形状与标记，保证重复写入不产生重复项
  xml = xml.replace(/<p:hf\b[^>]*\/?>/g, '')
  for (const 类型 of ['hdr', 'ftr']) {
    xml = xml.replace(new RegExp(`<p:sp>(?:(?!</p:sp>)[\\s\\S])*?<p:ph[^>]*type="${类型}"[\\s\\S]*?</p:sp>`, 'g'), '')
  }
  const 形状 = 占位符形状(50, 'hdr', 设置.页眉, 457200, 274320) + 占位符形状(51, 'ftr', 设置.页脚, 457200, 6271275)
  const 标记 = `<p:hf hdr="${设置.页眉 ? 1 : 0}" ftr="${设置.页脚 ? 1 : 0}" dt="${设置.显示日期 ? 1 : 0}" sldNum="${设置.显示页码 ? 1 : 0}"/>`
  xml = xml.replace('</p:spTree>', `${形状}</p:spTree>`).replace('</p:notesMaster>', `${标记}</p:notesMaster>`)
  压缩包.file(备注母版路径, xml)
  return { 成功: true }
}

async function 读取备注母版页眉页脚(压缩包) {
  const 文件 = 压缩包?.file?.(备注母版路径)
  if (!文件) return null
  const xml = await 文件.async('string')
  if (!/<p:notesMaster\b/.test(xml) || !/<\/p:notesMaster>/.test(xml)) throw new Error('备注母版部件损坏，无法读取设置')
  const 标记 = 读取页眉页脚标记(xml)
  if (!标记) return null
  return {
    排版: '幻灯片加备注',
    页眉: 读取占位符文本(xml, 'hdr'),
    页脚: 读取占位符文本(xml, 'ftr'),
    显示日期: 标记.日期,
    显示页码: 标记.页码,
  }
}

module.exports = { 写入讲义母版, 读取讲义母版, 写入备注母版页眉页脚, 读取备注母版页眉页脚, 校验母版设置, 校验备注母版设置: 校验备注设置 }
