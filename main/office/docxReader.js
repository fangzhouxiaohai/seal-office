// docx 读取模块：直接解析 OOXML（document.xml）生成带内联样式的 HTML。
// 相比 mammoth 的语义化输出，直接解析保留颜色、字号、字体、加粗、斜体、
// 下划线、删除线、对齐、标题与列表，使「保存后再次打开」的格式不丢失。
const JSZip = require('jszip')

/** 十六进制颜色补齐 6 位并转为 #RRGGBB 形式 */
function 规整颜色(值) {
  if (typeof 值 !== 'string') return null
  const 文本 = 值.trim().toUpperCase().replace(/^#/, '')
  if (/^[0-9A-F]{6}$/.test(文本)) return `#${文本}`
  if (/^[0-9A-F]{3}$/.test(文本)) return `#${文本[0]}${文本[0]}${文本[1]}${文本[1]}${文本[2]}${文本[2]}`
  return null
}

/** 转义 HTML 特殊字符，防止文档内容破坏页面结构 */
function 转义(文本) {
  return 文本.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[字符]))
}

/** 提取某段 XML 里第一个 <标签 ... 属性="值"> 的属性值 */
function 取属性(片段, 标签, 属性) {
  const 匹配 = 片段.match(new RegExp(`<${标签}[^>]*\\s${属性}="([^"]*)"`, 'i'))
  return 匹配 === null ? null : 匹配[1]
}

/** 判断某个子标签是否出现（带 w: 命名空间前缀） */
const 存在 = (片段, 标签) => new RegExp(`<w:${标签}[\\s/>]`, 'i').test(片段)

/** 把 run 属性（w:rPr）解析为字符级样式片段 */
function 解析字符属性(rPr) {
  if (!rPr) return { 样式: '', 加粗: false }
  let 样式 = ''
  if (存在(rPr, 'b')) 样式 += 'font-weight:600;'
  if (存在(rPr, 'i')) 样式 += 'font-style:italic;'
  if (存在(rPr, 'strike')) 样式 += 'text-decoration:line-through;'
  if (存在(rPr, 'u')) 样式 += 'text-decoration:underline;'
  const 颜色 = 规整颜色(取属性(rPr, 'w:color', 'w:val'))
  if (颜色 !== null && 颜色 !== '#AUTO') 样式 += `color:${颜色};`
  // 字符底纹：w:shd 的 fill 即背景色
  const 底纹匹配 = rPr.match(/<w:shd[^>]*w:fill="([0-9A-Fa-f]{6})"/)
  if (底纹匹配 !== null && 底纹匹配[1].toUpperCase() !== 'AUTO') {
    样式 += `background-color:#${底纹匹配[1].toUpperCase()};`
  }
  const 半磅 = 取属性(rPr, 'w:sz', 'w:val')
  if (半磅 !== null && /^\d+$/.test(半磅)) 样式 += `font-size:${Number(半磅) / 2}pt;`
  const 字体 = 取属性(rPr, 'w:rFonts', 'w:eastAsia') ?? 取属性(rPr, 'w:rFonts', 'w:ascii')
  if (字体) 样式 += `font-family:'${字体}';`
  return { 样式, 加粗: 存在(rPr, 'b') }
}

/** 标题样式名到 HTML 标签的映射（Heading1..Heading6 / 内置中文样式名） */
function 标题标签(样式名) {
  if (typeof 样式名 !== 'string') return null
  const 匹配 = 样式名.match(/^heading\s*([1-6])$/i) ?? 样式名.match(/^标题\s*([1-6])$/)
  return 匹配 === null ? null : `h${匹配[1]}`
}

/**
 * 解析段落属性（w:pPr）中的对齐、标题与列表信息。
 * 列表是否有序由 numbering.xml 的 numFmt 决定（经 编号映射 传入：numId → 'bullet' | 'decimal'）；
 * 无映射信息时按无序列表呈现。
 */
function 解析段落属性(pPr, 编号映射) {
  if (!pPr) return { 标签: 'p', 样式: '', 列表: false, 有编号: false }
  const 对齐 = 取属性(pPr, 'w:jc', 'w:val')
  let 样式 = ''
  if (对齐 === 'center') 样式 += 'text-align:center;'
  else if (对齐 === 'right' || 对齐 === 'end') 样式 += 'text-align:right;'
  else if (对齐 === 'both' || 对齐 === 'justify') 样式 += 'text-align:justify;'
  const 样式名 = 取属性(pPr, 'w:pStyle', 'w:val')
  const 标题 = 标题标签(样式名)
  const 列表 = 存在(pPr, 'numPr')
  let 有编号 = false
  if (列表 && 编号映射 !== undefined) {
    const 序号 = 取属性(pPr, 'w:numId', 'w:val')
    有编号 = 编号映射[序号] === 'decimal'
  }
  return { 标签: 标题 ?? 'p', 样式, 列表, 有编号 }
}

/** 解析一个 <w:p> 段落为 HTML；列表项返回 li 内容由外层聚合 */
function 解析段落(段落Xml, 编号映射) {
  const pPr匹配 = 段落Xml.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/i)
  const 段属性 = 解析段落属性(pPr匹配 === null ? null : pPr匹配[1], 编号映射)
  const 片段列表 = []
  // 逐个 run 解析：rPr 决定字符样式，w:t 与 w:br 决定内容
  const run正则 = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/gi
  let run匹配
  while ((run匹配 = run正则.exec(段落Xml)) !== null) {
    const runXml = run匹配[1]
    const rPr匹配 = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/i)
    const { 样式 } = 解析字符属性(rPr匹配 === null ? null : rPr匹配[1])
    const 文本正则 = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>/gi
    let 文本匹配
    while ((文本匹配 = 文本正则.exec(runXml)) !== null) {
      if (/^<w:br/i.test(文本匹配[0])) {
        片段列表.push('<br>')
      } else if (文本匹配[1] !== undefined) {
        const 内容 = 转义(文本匹配[1])
        片段列表.push(样式 === '' ? 内容 : `<span style="${样式}">${内容}</span>`)
      }
    }
  }
  return { 段属性, 内容: 片段列表.join('') }
}

/** 解析表格：<w:tbl> → <table>，逐行逐格，单元格内部递归段落 */
function 解析表格(表Xml, 编号映射) {
  const 行列表 = []
  const 行正则 = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/gi
  let 行匹配
  while ((行匹配 = 行正则.exec(表Xml)) !== null) {
    const 单元列表 = []
    const 单元正则 = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gi
    let 单元匹配
    while ((单元匹配 = 单元正则.exec(行匹配[1])) !== null) {
      const 单元Xml = 单元匹配[1]
      const 段落列表 = []
      const 段正则 = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/gi
      let 段匹配
      while ((段匹配 = 段正则.exec(单元Xml)) !== null) {
        段落列表.push(渲染段落Xml(段匹配[0], { 允许标题: false }, 编号映射).html)
      }
      单元列表.push(`<td style="border:1px solid #D5DBE3;padding:4px 8px">${段落列表.join('') || '<br>'}</td>`)
    }
    if (单元列表.length > 0) 行列表.push(`<tr>${单元列表.join('')}</tr>`)
  }
  if (行列表.length === 0) return ''
  return `<table style="border-collapse:collapse;width:100%">${行列表.join('')}</table>`
}

/** 渲染单个段落 XML；列表项由外层聚合为 ul/ol */
function 渲染段落Xml(段落Xml, 选项, 编号映射) {
  const { 段属性, 内容 } = 解析段落(段落Xml, 编号映射)
  if (段属性.列表 && (选项 === undefined || 选项.允许标题 !== false)) {
    const 列表标签 = 段属性.有编号 ? 'ol' : 'ul'
    return { 列表项: true, 列表标签, html: `<li>${内容 === '' ? '<br>' : 内容}</li>` }
  }
  if (内容 === '' && 段属性.标签 === 'p') {
    return { 列表项: false, html: '<p><br></p>' }
  }
  const 样式 = 段属性.样式 === '' ? '' : ` style="${段属性.样式}"`
  return { 列表项: false, html: `<${段属性.标签}${样式}>${内容 === '' ? '<br>' : 内容}</${段属性.标签}>` }
}

/** 把 body XML 顶层的段落与表格按顺序渲染；相邻列表项聚合进同一列表 */
function 渲染Body(bodyXml, 编号映射 = {}) {
  const 输出 = []
  const 块正则 = /<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/gi
  let 块匹配
  let 当前列表 = null
  const 结束列表 = () => {
    if (当前列表 !== null) {
      输出.push(`</${当前列表}>`)
      当前列表 = null
    }
  }
  while ((块匹配 = 块正则.exec(bodyXml)) !== null) {
    const 块Xml = 块匹配[0]
    if (/^<w:tbl/i.test(块Xml)) {
      结束列表()
      const 表格Html = 解析表格(块Xml, 编号映射)
      if (表格Html !== '') 输出.push(表格Html)
      continue
    }
    const 渲染 = 渲染段落Xml(块Xml, undefined, 编号映射)
    if (渲染.列表项) {
      if (当前列表 !== 渲染.列表标签) {
        结束列表()
        当前列表 = 渲染.列表标签
        输出.push(`<${当前列表}>`)
      }
      输出.push(渲染.html)
    } else {
      结束列表()
      输出.push(渲染.html)
    }
  }
  结束列表()
  return 输出.join('')
}

/** 提取 document.xml 中 <w:body> 的内容 */
function 取Body(documentXml) {
  if (!/<w:document(?:\s[^>]*)?>[\s\S]*<\/w:document>/i.test(documentXml)) {
    throw new Error('文字文档结构损坏，缺少完整的文档节点')
  }
  const 匹配 = documentXml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/i)
  if (匹配 !== null) return 匹配[1]
  if (/<w:body\s*\/>/i.test(documentXml)) return ''
  throw new Error('文字文档正文结构损坏')
}

/**
 * 解析 numbering.xml，得到 numId → 'bullet' | 'decimal' 的映射。
 * 缺失或解析失败时返回空映射，列表一律按无序列表呈现。
 */
function 解析编号映射(numberingXml) {
  const 映射 = {}
  if (typeof numberingXml !== 'string') return 映射
  // abstractNumId → 格式（取第一级 w:lvl 的 numFmt）
  const 抽象格式 = {}
  const 抽象正则 = /<w:abstractNum[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/gi
  let 抽象匹配
  while ((抽象匹配 = 抽象正则.exec(numberingXml)) !== null) {
    const 级匹配 = 抽象匹配[2].match(/<w:lvl[^>]*w:ilvl="0"[^>]*>[\s\S]*?<w:numFmt w:val="(\w+)"/i)
    if (级匹配 !== null) {
      抽象格式[抽象匹配[1]] = 级匹配[1]
    }
  }
  // numId → abstractNumId → 格式
  const 序号正则 = /<w:num[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId w:val="(\d+)"[^>]*\/>[\s\S]*?<\/w:num>/gi
  let 序号匹配
  while ((序号匹配 = 序号正则.exec(numberingXml)) !== null) {
    const 格式 = 抽象格式[序号匹配[2]]
    if (格式 !== undefined) {
      映射[序号匹配[1]] = 格式
    }
  }
  return 映射
}

/** 只依据正文里真实存在的、当前解析器未保留的对象生成警告。 */
function 收集未导入警告(bodyXml) {
  const 警告 = []
  const 有标签 = (标签) => new RegExp(`<${标签}[\\s/>]`, 'i').test(bodyXml)
  const 绘图块 = Array.from(bodyXml.matchAll(/<w:(drawing|pict)(?:\s[^>]*)?>[\s\S]*?<\/w:\1>/gi), (匹配) => 匹配[0])
  if (有标签('a:blip') || 有标签('v:imagedata')) 警告.push('图片未导入')
  if (绘图块.some((片段) => !/<(?:a:blip|v:imagedata|a:videoFile|a:audioFile)[\s/>]/i.test(片段)) || 有标签('w:object')) {
    警告.push('图形未导入')
  }
  if (有标签('a:videoFile') || 有标签('a:audioFile') || 有标签('w:movie')) 警告.push('媒体未导入')
  if (有标签('w:headerReference')) 警告.push('页眉未导入')
  if (有标签('w:footerReference')) 警告.push('页脚未导入')
  if (有标签('w:footnoteReference')) 警告.push('脚注未导入')
  if (有标签('w:endnoteReference')) 警告.push('尾注未导入')
  if (有标签('w:commentReference')) 警告.push('批注未导入')
  if (有标签('w:ins') || 有标签('w:del')) 警告.push('修订信息未导入')
  return 警告
}

/**
 * 读取 docx 为带内联样式的 HTML。
 * @param 数据 - docx 文件的 Buffer
 * @returns { html, 警告 }；文件损坏时抛出错误，由上层报告读取失败
 */
async function 读取docx(数据) {
  const 警告 = []
  let 压缩包
  try {
    压缩包 = await JSZip.loadAsync(Buffer.from(数据))
  } catch {
    throw new Error('文字文档压缩包损坏，无法读取')
  }
  const 文档文件 = 压缩包.file('word/document.xml')
  if (文档文件 === null) throw new Error('文字文档缺少 word/document.xml')
  let documentXml
  try {
    documentXml = await 文档文件.async('string')
  } catch {
    throw new Error('文字文档正文损坏，无法读取')
  }
  const 编号文件 = 压缩包.file('word/numbering.xml')
  const 编号映射 = 编号文件 !== null && 编号文件 !== undefined ? 解析编号映射(await 编号文件.async('string')) : {}
  const bodyXml = 取Body(documentXml)
  警告.push(...收集未导入警告(bodyXml))
  const html = 渲染Body(bodyXml, 编号映射)
  if (html.trim() === '') {
    if (/<w:(?:p|tbl)[\s/>]/i.test(bodyXml)) throw new Error('文字文档正文结构损坏，无法读取')
    警告.push('文档内容为空')
    return { html: '<p><br></p>', 警告 }
  }
  return { html, 警告 }
}

module.exports = { 读取docx, 渲染Body, 取Body, 解析字符属性, 解析段落属性, 解析表格, 解析编号映射 }
