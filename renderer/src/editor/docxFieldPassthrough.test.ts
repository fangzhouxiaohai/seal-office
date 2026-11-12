// 目录类域透传：读入时不再判为“域代码未完整导入”，经真实保存链路覆盖写回后
// 域指令、目录跳转书签与缓存页码必须原样保留。
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'
import { 增强字体回退Html } from '../fonts/fallback'
import { 存在内容风险, 引用域缓存提示, 警告级别 } from '../fileWarnings'

const 加载 = createRequire(import.meta.url), JSZip = 加载('jszip')
const { 读取docx } = 加载('../../../main/office/docxReader.js')
const { 生成docx } = 加载('../../../main/office/docxWriter.js')

const 域警告 = '域代码未完整导入，已保留可读取的缓存结果'
const 宋体 = '<w:rPr><w:rFonts w:ascii="宋体" w:eastAsia="宋体" w:hAnsi="宋体"/></w:rPr>'
const 字段 = (类型: string) => `<w:r>${宋体}<w:fldChar w:fldCharType="${类型}"/></w:r>`
const 指令 = (内容: string) => `<w:r>${宋体}<w:instrText xml:space="preserve">${内容}</w:instrText></w:r>`
const 文字 = (内容: string) => `<w:r>${宋体}<w:t xml:space="preserve">${内容}</w:t></w:r>`
const 制表 = `<w:r>${宋体}<w:tab/></w:r>`

/** 按 Word「引用 → 目录」与 WPS 的两种写法构造目录：w:hyperlink 锚点 与 HYPERLINK \l 域 */
const 目录Xml =
  '<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr>' + 字段('begin') + 指令(' TOC \\o "1-3" \\h \\z \\u ') + 字段('separate') +
  '<w:hyperlink w:anchor="_Toc1001" w:history="1">' + 文字('第一章 总则') + 制表 + 字段('begin') + 指令(' PAGEREF _Toc1001 \\h ') + 字段('separate') + 文字('3') + 字段('end') + '</w:hyperlink></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="TOC2"/></w:pPr>' + 字段('begin') + 指令(' HYPERLINK \\l "_Toc1002" ') + 字段('separate') + 文字('第二章 细则') + 制表 +
  字段('begin') + 指令(' PAGEREF _Toc1002 \\h ') + 字段('separate') + 文字('5') + 字段('end') + 字段('end') + '</w:p>' +
  '<w:p>' + 字段('end') + '</w:p>'

async function 构造目录文档(包装为内容控件 = false): Promise<Buffer> {
  const 基础 = await 生成docx({ 段落: [
    { 类型: '段落', 级别: 1, 文字: [{ 文本: '第一章 总则' }] },
    { 类型: '段落', 级别: 0, 文字: [{ 文本: '正文段落原文' }] },
    { 类型: '段落', 级别: 2, 文字: [{ 文本: '第二章 细则' }] },
    { 类型: '段落', 级别: 0, 文字: [{ 文本: '第二段正文' }] },
  ] })
  const zip = await JSZip.loadAsync(基础)
  let xml: string = await zip.file('word/document.xml').async('string')
  for (const [标题, 名称, 编号] of [['第一章 总则', '_Toc1001', 11], ['第二章 细则', '_Toc1002', 12]] as const) {
    xml = xml.replace(new RegExp(`(<w:p>(?:(?!</w:p>)[\\s\\S])*?)(<w:r>(?:(?!</w:r>)[\\s\\S])*?${标题}</w:t></w:r>)`),
      `$1<w:bookmarkStart w:id="${编号}" w:name="${名称}"/>$2<w:bookmarkEnd w:id="${编号}"/>`)
  }
  // Word 2013 及以后与 WPS 常把目录包在 w:sdt 文档部件中
  const 目录 = 包装为内容控件 ? `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>${目录Xml}</w:sdtContent></w:sdt>` : 目录Xml
  xml = xml.replace(/(<w:body>)/, `$1${目录}`)
  zip.file('word/document.xml', xml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** 模拟文件打开链路：净化 + 字体回退增强，然后交给编辑器修改 */
function 打开为编辑区(html: string, 修改: (根: HTMLElement) => void): string {
  const 根 = document.createElement('div')
  根.innerHTML = 增强字体回退Html(净化富文本(html))
  修改(根)
  return 根.innerHTML
}

describe('目录、页码引用与内部跳转域的透传保存', () => {
  it('含 TOC、PAGEREF、HYPERLINK \\l 与 _Toc 书签的文档读入后不再提示域未完整导入', async () => {
    const 读取 = await 读取docx(await 构造目录文档())
    expect(读取.警告).not.toContain(域警告)
    // 只剩“目录页码沿用缓存”的保真提示，允许覆盖保存
    expect(读取.警告).toEqual([引用域缓存提示])
    expect(警告级别(引用域缓存提示)).toBe('保真')
    expect(存在内容风险(读取.警告)).toBe(false)
    const 纯文本 = 读取.html.replace(/<[^>]*>/g, '')
    expect(纯文本).toContain('第一章 总则')
    expect(纯文本).toContain('3')
    expect(读取.html).not.toContain('PAGEREF')
  })

  it.each([['普通段落目录', false], ['内容控件包裹的目录', true]])('%s：修改普通正文后覆盖写回，目录域指令、书签与缓存页码原样保留', async (_名称, 包装) => {
    const 原始 = await 构造目录文档(包装 as boolean)
    const 读取 = await 读取docx(原始)
    const html = 打开为编辑区(读取.html, (根) => {
      const 段落 = Array.from(根.querySelectorAll('p')).find((项) => 项.textContent === '正文段落原文')!
      段落.textContent = '正文段落已修改'
    })
    const 模型 = htmlToDocxModel(html, 读取.页面设置)
    expect(模型.未覆盖).toEqual([])
    const 保存 = await 生成docx(模型)
    const xml: string = await (await JSZip.loadAsync(保存)).file('word/document.xml').async('string')
    expect(xml).toContain('正文段落已修改')
    expect(xml).not.toContain('正文段落原文')
    expect(xml).toContain('TOC \\o "1-3" \\h \\z \\u')
    expect(xml).toContain('PAGEREF _Toc1001 \\h')
    expect(xml).toContain('PAGEREF _Toc1002 \\h')
    expect(xml).toContain('HYPERLINK \\l "_Toc1002"')
    expect(xml).toContain('w:anchor="_Toc1001"')
    expect(xml).toMatch(/<w:bookmarkStart[^>]*w:name="_Toc1001"/)
    expect(xml).toMatch(/<w:bookmarkStart[^>]*w:name="_Toc1002"/)
    // 缓存页码保留在各自的域结果中
    expect(xml).toMatch(/PAGEREF _Toc1001 \\h[\s\S]*?separate[\s\S]*?<w:t[^>]*>3<\/w:t>/)
    expect(xml).toMatch(/PAGEREF _Toc1002 \\h[\s\S]*?separate[\s\S]*?<w:t[^>]*>5<\/w:t>/)
    // 三段式完整：begin 与 end 数量一致
    expect((xml.match(/w:fldCharType="begin"/g) ?? []).length).toBe((xml.match(/w:fldCharType="end"/g) ?? []).length)
    expect((xml.match(/w:fldCharType="begin"/g) ?? []).length).toBe(4)
    const 重开 = await 读取docx(保存)
    expect(重开.警告).not.toContain(域警告)
    expect(重开.html).toContain('正文段落已修改')
  })

  it('修改带目录书签的标题文字后，书签名称仍保留，目录跳转与页码引用不失效', async () => {
    const 读取 = await 读取docx(await 构造目录文档())
    const html = 打开为编辑区(读取.html, (根) => {
      for (const [标签, 原文] of [['h1', '第一章'], ['h2', '第二章']]) {
        const 标题 = Array.from(根.querySelectorAll(标签)).find((项) => 项.textContent?.includes(原文))!
        const 文本节点 = [标题, ...Array.from(标题.querySelectorAll('*'))].flatMap((元素) => Array.from(元素.childNodes)).find((节点) => 节点.nodeType === Node.TEXT_NODE && 节点.textContent?.includes(原文))!
        文本节点.textContent = `${文本节点.textContent}（修订）`
      }
    })
    const 模型 = htmlToDocxModel(html, 读取.页面设置)
    expect(模型.未覆盖).toEqual([])
    const xml: string = await (await JSZip.loadAsync(await 生成docx(模型))).file('word/document.xml').async('string')
    expect(xml).toContain('第一章 总则（修订）')
    expect(xml).toContain('第二章 细则（修订）')
    expect(xml).toMatch(/<w:bookmarkStart[^>]*w:name="_Toc1001"/)
    expect(xml).toMatch(/<w:bookmarkStart[^>]*w:name="_Toc1002"/)
    expect(xml).toContain('PAGEREF _Toc1001 \\h')
    // 书签起止标识成对且不与其他书签重复
    const 起点 = [...xml.matchAll(/<w:bookmarkStart[^>]*w:id="(\d+)"/g)].map((项) => 项[1])
    const 终点 = [...xml.matchAll(/<w:bookmarkEnd[^>]*w:id="(\d+)"/g)].map((项) => 项[1])
    expect(new Set(起点).size).toBe(起点.length)
    expect([...起点].sort()).toEqual([...终点].sort())
  })

  it('目录末尾只含域结束符的段落受保护，删除它会被阻止而不是写出残缺域', async () => {
    const 读取 = await 读取docx(await 构造目录文档())
    const html = 打开为编辑区(读取.html, (根) => {
      const 块列表 = Array.from(根.querySelectorAll<HTMLElement>('[data-seal-ooxml-block]'))
      // 第三个块是只含 TOC 结束符的段落
      块列表[2].remove()
    })
    await expect(生成docx(htmlToDocxModel(html, 读取.页面设置))).rejects.toThrow('受保护的原生结构')
  })

  it('页脚中的日期等可透传域在保留源包时不再提示，写回后域指令仍在', async () => {
    const zip = await JSZip.loadAsync(await 构造目录文档())
    let xml: string = await zip.file('word/document.xml').async('string')
    xml = xml.replace(/<w:sectPr([^>]*)>/, '<w:sectPr$1><w:footerReference w:type="default" r:id="rIdSealFooter"/>')
    if (!/xmlns:r=/.test(xml)) xml = xml.replace('<w:document ', '<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ')
    zip.file('word/document.xml', xml)
    zip.file('word/footer9.xml', '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> DATE \\@ "yyyy-MM-dd" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2026-11-12</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>')
    const rels: string = await zip.file('word/_rels/document.xml.rels').async('string')
    zip.file('word/_rels/document.xml.rels', rels.replace('</Relationships>', '<Relationship Id="rIdSealFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer9.xml"/></Relationships>'))
    const types: string = await zip.file('[Content_Types].xml').async('string')
    zip.file('[Content_Types].xml', types.replace('</Types>', '<Override PartName="/word/footer9.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'))
    const 读取 = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(读取.警告).not.toContain('页脚中的域或制表符未完整导入')
    expect(读取.页面设置.页脚Html).toContain('2026-11-12')
    const html = 打开为编辑区(读取.html, (根) => {
      Array.from(根.querySelectorAll('p')).find((项) => 项.textContent === '第二段正文')!.textContent = '第二段正文已修改'
    })
    const 保存 = await 生成docx(htmlToDocxModel(html, 读取.页面设置))
    const 输出 = await JSZip.loadAsync(保存)
    expect(await 输出.file('word/footer9.xml').async('string')).toContain('DATE \\@ "yyyy-MM-dd"')
  })

  it('含 SmartArt 的文档仍产生内容级警告，并按内容风险阻止覆盖', async () => {
    const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '组织结构' }] }] }))
    let xml: string = await zip.file('word/document.xml').async('string')
    const 智能图形 = '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="5486400" cy="3200400"/><wp:docPr id="1" name="图示 1"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">' +
      '<dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:dm="rIdDm" r:lo="rIdLo" r:qs="rIdQs" r:cs="rIdCs"/>' +
      '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    xml = xml.replace(/(<w:body>)/, `$1${智能图形}`)
    zip.file('word/document.xml', xml)
    const 读取 = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(读取.警告).toContain('图形未导入')
    expect(存在内容风险(读取.警告)).toBe(true)
  })
})
