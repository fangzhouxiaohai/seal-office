// DOCX 域代码分类：决定哪些域可以“只保留缓存结果、不重算”地原样透传。
//
// 透传的前提是保存链路能把域的 XML 原样写回：正文里含 fldChar / instrText 的块由
// docxSource.js 标记为受保护的原生块，未修改时逐字节写回原 XML；页眉页脚、脚注尾注
// 含此类域时同样保留原部件。因此这里列出的域只要求“本程序不负责重新计算”，Word、
// WPS 打开文件时会按自身规则刷新（或在用户选择“更新域”时刷新）。
//
// 不放行的域：需要本程序参与计算或会引入外部内容、交互、排版副作用的域，例如
// IF、=（公式）、MERGEFIELD、INCLUDETEXT、INCLUDEPICTURE、LINK、DDE、DDEAUTO、
// EMBED、ASK、FILLIN、SET、MACROBUTTON、GOTOBUTTON、DATABASE、QUOTE、FORMTEXT、
// FORMCHECKBOX、FORMDROPDOWN、EQ、ADVANCE、SYMBOL、AUTONUM、LISTNUM 等。这些域
// 仍保留缓存结果与原始 XML，但会继续给出“域代码未完整导入”的保真提示。

/** 能由编辑器重新写成域代码的页码类域（编辑区以 data-seal-field 占位） */
const 可重写域 = new Set(['PAGE', 'NUMPAGES'])

/**
 * 可安全透传的域：只显示 Word 已算好的缓存结果，不依赖本程序计算。
 * 每一项的确认理由：
 * - PAGE / NUMPAGES / SECTIONPAGES / SECTION：页码与节号，Word 打开时按实际分页重算。
 * - TOC：自动目录外层域，目录条目与页码是缓存结果，结构原样保留。
 * - PAGEREF / REF / NOTEREF：按书签引用页码、文字或脚注编号，书签随原块保留。
 * - HYPERLINK：外部链接与 \l 内部跳转，目标写在域指令里，不触发任何加载。
 * - SEQ：题注编号（图 1、表 2），只显示编号缓存。
 * - STYLEREF：引用最近一个指定样式段落的文字（常见于页眉章节名），只读不改排版。
 * - DATE / TIME / CREATEDATE / SAVEDATE / PRINTDATE / EDITTIME：日期时间显示。
 * - FILENAME / FILESIZE / AUTHOR / LASTSAVEDBY / TITLE / SUBJECT / KEYWORDS / COMMENTS /
 *   DOCPROPERTY / NUMWORDS / NUMCHARS / REVNUM / TEMPLATE：文档属性显示。
 * - TC / XE：目录项与索引项标记域，本身不显示内容。
 * - INDEX：索引表，条目为缓存结果。
 */
const 可透传域 = new Set([
  ...可重写域,
  'SECTIONPAGES', 'SECTION',
  'TOC', 'PAGEREF', 'REF', 'NOTEREF', 'HYPERLINK', 'SEQ', 'STYLEREF',
  'DATE', 'TIME', 'CREATEDATE', 'SAVEDATE', 'PRINTDATE', 'EDITTIME',
  'FILENAME', 'FILESIZE', 'AUTHOR', 'LASTSAVEDBY', 'TITLE', 'SUBJECT', 'KEYWORDS', 'COMMENTS',
  'DOCPROPERTY', 'NUMWORDS', 'NUMCHARS', 'REVNUM', 'TEMPLATE',
  'TC', 'XE', 'INDEX',
])

/**
 * 目录、页码引用、交叉引用、题注编号等引用类域：缓存的页码或编号不会随本程序的编辑重算。
 * 文件中含这类域时给出保真级提示，保存时告知用户在 Word 或 WPS 中更新域。
 * 文案须与 renderer/src/fileWarnings.ts 的 引用域缓存提示 完全一致。
 */
const 引用类域 = new Set(['TOC', 'PAGEREF', 'REF', 'NOTEREF', 'SEQ', 'STYLEREF', 'INDEX'])
const 引用域缓存提示 = '目录与交叉引用的页码沿用原文件缓存，修改后请在 Word 或 WPS 中更新域'

/** 引文域与参考文献表域的前缀判定，与 docxCitationFields.js 保持一致 */
const 引文域前缀 = /^ITEM\s+CSL_CITATION\b/
const 书目域前缀 = /^BIBL\b/

/** 取域指令的关键字（PAGE、NUMPAGES、DATE 等），忽略 \* MERGEFORMAT 之类的开关 */
function 域名称(指令) {
  const 首个 = String(指令 ?? '').trim().split(/\s+/)[0]
  return 首个 === '' ? '' : 首个.toUpperCase()
}

/** 判断域指令是不是 Zotero 引文域或参考文献表域 */
function 是引文域(指令) {
  const 规范 = String(指令 ?? '').trim()
  return 引文域前缀.test(规范) || (书目域前缀.test(规范) && /CSL_BIBLIOGRAPHY\s*$/.test(规范))
}

/**
 * 判断域指令能否透传。Word 允许把书签名直接写成域指令（等同 REF），
 * 这里只放行 Word 自动生成的交叉引用与目录书签（_Ref、_Toc 开头），
 * 避免把任意未知关键字误当成书签引用。
 */
function 是可透传域(指令) {
  const 名称 = 域名称(指令)
  return 可透传域.has(名称) || /^_(?:REF|TOC)\d+$/.test(名称)
}

function 解码实体(文本) {
  return String(文本).replace(/&(?:lt|gt|quot|apos|amp|#(\d+)|#x([0-9a-f]+));/gi, (全部, 十进制, 十六进制) => {
    if (十进制) return String.fromCodePoint(Number(十进制))
    if (十六进制) return String.fromCodePoint(Number.parseInt(十六进制, 16))
    return { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' }[全部.toLowerCase()]
  })
}

/**
 * 分析一段 XML 中的域：
 * - 未保留：存在结构残缺的域，或不在透传白名单内的域；
 * - 需原样保留：存在页码与引文之外的域，保存时必须原样写回原 XML，不能由编辑器重建。
 */
function 分析域代码(xml) {
  const 结果 = { 未保留: false, 需原样保留: false, 含引用域: false }
  const 记录 = (指令) => {
    if (引用类域.has(域名称(指令)) || /^_(?:REF|TOC)d+$/.test(域名称(指令))) 结果.含引用域 = true
    if (!是可透传域(指令) && !是引文域(指令)) 结果.未保留 = true
    if (!可重写域.has(域名称(指令)) && !是引文域(指令)) 结果.需原样保留 = true
  }
  for (const 匹配 of String(xml).matchAll(/<w:fldSimple(?=[\s/>])[^>]*\bw:instr\s*=\s*(["'])([\s\S]*?)\1/gi)) 记录(解码实体(匹配[2]))
  const 栈 = []
  for (const 匹配 of String(xml).matchAll(/<w:fldChar(?=[\s/>])[^>]*>|<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi)) {
    if (匹配[1] !== undefined) {
      if (!栈.length) { 结果.未保留 = true; 结果.需原样保留 = true; continue }
      栈.at(-1).指令 += 解码实体(匹配[1])
      continue
    }
    const 类型 = 匹配[0].match(/\bw:fldCharType\s*=\s*["']([^"']*)["']/i)?.[1]
    if (类型 === 'begin') 栈.push({ 指令: '' })
    else if (类型 === 'end') {
      const 域 = 栈.pop()
      if (!域) { 结果.未保留 = true; 结果.需原样保留 = true } else 记录(域.指令)
    } else if (类型 !== 'separate' || !栈.length) { 结果.未保留 = true; 结果.需原样保留 = true }
  }
  // 跨段落的 TOC 在单个段落片段里只看得到开头；整份 XML 中仍未闭合才算残缺。
  if (栈.length) 结果.需原样保留 = true
  return { ...结果, 未闭合: 栈.length > 0 }
}

module.exports = { 引用类域, 引用域缓存提示, 可重写域, 可透传域, 域名称, 是引文域, 是可透传域, 分析域代码, 引文域前缀, 书目域前缀 }
