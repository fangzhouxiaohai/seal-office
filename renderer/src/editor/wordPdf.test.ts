import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { wordPdfRoute } from './wordPdf'
const load = createRequire(import.meta.url), JSZip = load('jszip'), { 生成docx } = load('../../../main/office/docxWriter'), { 读取docx } = load('../../../main/office/docxReader')
it.each(['first', 'even'])('单节独立%s页眉不走普通HTML，即使正文无受保护绘图', async kind => {
  const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '单节正文' }] }], 页眉: [{ 类型: '段落', 文字: [{ 文本: '特殊页眉' }] }] })); zip.file('word/document.xml', (await zip.file('word/document.xml').async('string')).replace(/(<w:headerReference[^>]*w:type=")default"/, '$1' + kind + '"'))
  const read = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' })); expect(read.html).not.toContain('data-seal-ooxml-locked'); expect(read.html.match(/data-seal-section-layout=/g)).toHaveLength(1); expect(wordPdfRoute(read.html, htmlToDocxModel(read.html, read.页面设置))).toBe('native')
})
it.each(['field', 'revision'])('单节原生%s需要兼容引擎，不能因没有多节而走HTML', async kind => {
  const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '内容' }] }] })); let xml = await zip.file('word/document.xml').async('string'); xml = xml.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>内容<\/w:t><\/w:r>/, kind === 'field' ? '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>' : '<w:ins w:id="1" w:author="甲"><w:r><w:t>内容</w:t></w:r></w:ins>'); zip.file('word/document.xml', xml)
  const read = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' })); expect(wordPdfRoute(read.html, htmlToDocxModel(read.html, read.页面设置))).toBe('native')
})