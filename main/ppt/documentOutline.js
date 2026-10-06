// 文档生成 PPT：把受支持的 DOCX、TXT、MD 与提纲文本转换成可确认的提纲。
// 只做文字与标题层级提取；图片、表格等未导入内容必须在遗漏中如实说明。
const path = require('path')

const 支持扩展名 = ['.docx', '.txt', '.md', '.markdown']
const 编码上限 = 5 * 1024 * 1024
const 标题上限 = 120
const 要点上限 = 200
const 单节要点上限 = 8
const 节数上限 = 60

const 清理 = (文本) => String(文本 ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim()

const 截断文本 = (文本, 上限) => (文本.length > 上限 ? 文本.slice(0, 上限) : 文本)

function 建节(标题) {
  return { 标题: 截断文本(清理(标题), 标题上限), 要点: [] }
}

function 收尾(提纲, 遗漏) {
  if (提纲.length > 节数上限) {
    遗漏.push({ 类型: '节数', 说明: `文档包含 ${提纲.length} 节，只导入前 ${节数上限} 节` })
    提纲 = 提纲.slice(0, 节数上限)
  }
  return { 提纲, 遗漏 }
}

/** 解析 Markdown：以 # 级标题分节，# 之前的内容归入首节。 */
function 解析Markdown(原文) {
  const 遗漏 = []
  const 提纲 = []
  let 当前 = null
  const 推入要点 = (文本) => {
    if (!当前) { 当前 = 建节(文本); 提纲.push(当前); return }
    if (当前.要点.length >= 单节要点上限) {
      if (!遗漏.some((项) => 项.类型 === '要点')) 遗漏.push({ 类型: '要点', 说明: `每节最多保留 ${单节要点上限} 条要点，超出部分未导入` })
      return
    }
    const 清洗 = 截断文本(清理(文本.replace(/^[-*+]\s+/, '')).replace(/^\d+[.)]\s+/, ''), 要点上限)
    if (清洗) 当前.要点.push(清洗)
  }
  for (const 行 of String(原文 ?? '').split('\n')) {
    const 标题匹配 = 行.match(/^\s{0,3}(#{1,6})\s+(.*)$/)
    if (标题匹配) {
      当前 = 建节(标题匹配[2])
      提纲.push(当前)
      continue
    }
    const 文本 = 清理(行)
    if (文本) 推入要点(文本)
  }
  if (提纲.length === 0) throw new Error('文档中没有可导入的文字')
  return 收尾(提纲, 遗漏)
}

/** 解析纯文本：首个非空行作标题，其余行作要点。 */
function 解析纯文本(原文) {
  const 遗漏 = []
  const 行 = String(原文 ?? '').split('\n').map(清理).filter(Boolean)
  if (行.length === 0) throw new Error('文档中没有可导入的文字')
  const 节 = 建节(行[0])
  for (const 文本 of 行.slice(1)) {
    if (节.要点.length >= 单节要点上限) {
      if (!遗漏.some((项) => 项.类型 === '要点')) 遗漏.push({ 类型: '要点', 说明: `每节最多保留 ${单节要点上限} 条要点，超出部分未导入` })
      continue
    }
    节.要点.push(截断文本(文本, 要点上限))
  }
  return 收尾([节], 遗漏)
}

const 去标签 = (html) => 清理(String(html ?? '')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
  .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '- ')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>'))

/** 解析 DOCX 转换后的 HTML：保留标题层级，并报告图片与表格遗漏。 */
function 解析DocxHtml(html) {
  const 遗漏 = []
  const 原文 = String(html ?? '')
  const 图片数 = (原文.match(/<img\b/gi) ?? []).length
  const 表格数 = (原文.match(/<table\b/gi) ?? []).length
  if (图片数) 遗漏.push({ 类型: '图片', 说明: `文档包含 ${图片数} 张图片，本次只导入文字，图片请另行插入` })
  if (表格数) 遗漏.push({ 类型: '表格', 说明: `文档包含 ${表格数} 个表格，本次只导入文字，表格请另行插入` })
  // 图片与表格已在遗漏中登记，抽取文字时排除它们，避免把表格单元格当成正文要点。
  const 正文 = 原文.replace(/<table\b[\s\S]*?<\/table>/gi, '').replace(/<img\b[^>]*\/?>/gi, '')
  const 节列表 = []
  let 当前 = null
  const 片段 = 正文.split(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/i)
  for (const 段 of 片段) {
    const 标题匹配 = 段.match(/^<h([1-6])[^>]*>([\s\S]*?)<\/h\1>$/i)
    if (标题匹配) {
      当前 = 建节(去标签(标题匹配[2]))
      节列表.push(当前)
      continue
    }
    const 文本 = 去标签(段)
    for (const 行 of 文本.split('\n')) {
      const 清洗 = 截断文本(清理(行.replace(/^[-*+]\s+/, '')), 要点上限)
      if (!清洗) continue
      if (!当前) { 当前 = 建节(清洗); 节列表.push(当前); continue }
      if (当前.要点.length >= 单节要点上限) {
        if (!遗漏.some((项) => 项.类型 === '要点')) 遗漏.push({ 类型: '要点', 说明: `每节最多保留 ${单节要点上限} 条要点，超出部分未导入` })
        continue
      }
      当前.要点.push(清洗)
    }
  }
  if (节列表.length === 0) throw new Error('文档中没有可导入的文字')
  return 收尾(节列表, 遗漏)
}

/** 读取一份受支持的文档并返回提纲；调用方可注入 DOCX 读取实现（生产使用 mammoth）。 */
async function 读取提纲文件({ 名称, 字节, 读取docx } = {}) {
  if (typeof 名称 !== 'string' || !名称.trim()) throw new Error('导入文件的名称无效')
  if (!Buffer.isBuffer(字节) || 字节.length === 0) throw new Error('导入文件内容为空')
  if (字节.length > 编码上限) throw new Error(`导入文件过大：最多 ${Math.round(编码上限 / 1024 / 1024)} MB`)
  const 扩展 = path.extname(名称).toLowerCase()
  if (!支持扩展名.includes(扩展)) throw new Error(`不支持的文件格式：${扩展 || '未知'}；支持 ${支持扩展名.join('、')}`)
  const 来源 = { 名称: 名称.trim(), 类型: 扩展, 字节数: 字节.length }
  if (扩展 === '.docx') {
    let html
    try {
      const 结果 = 读取docx ? await 读取docx(字节) : await (require('mammoth')).convertToHtml({ buffer: 字节 })
      html = typeof 结果 === 'string' ? 结果 : 结果?.value
    } catch (错误) {
      throw new Error(错误 instanceof Error ? 错误.message : 'DOCX 文档解析失败')
    }
    if (typeof html !== 'string' || !html.trim()) throw new Error('DOCX 文档中没有可导入的文字')
    const 解析 = 解析DocxHtml(html)
    return { ...解析, 来源 }
  }
  const 文本 = 字节.toString('utf8').replace(/^\uFEFF/, '')
  const 解析 = (扩展 === '.md' || 扩展 === '.markdown') ? 解析Markdown(文本) : 解析纯文本(文本)
  return { ...解析, 来源 }
}

module.exports = { 读取提纲文件, 解析Markdown, 解析纯文本, 解析DocxHtml, 支持扩展名, 节数上限, 单节要点上限 }
