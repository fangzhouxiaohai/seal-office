import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { htmlToDocxModel, 命令表 } from './commands'
import { 净化富文本 } from './sanitizeHtml'

const load = createRequire(import.meta.url)
const JSZip = load('jszip')
const { 读取docx } = load('../../../main/office/docxReader.js')
const { 生成docx } = load('../../../main/office/docxWriter.js')
const 文档 = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
async function 读正文(body: string) {
  const zip = new JSZip(); zip.file('word/document.xml', 文档(body))
  return 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
}
afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('真实 DOCX 兼容边界到编辑器保存链路', () => {
  it('绝对关系的脚注尾注经过净化与真实模型两次保存仍有原生引用和中文内容', async () => {
    const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '正文' }, { 文本: '', 注释引用: { 类型: 'footnote', 标识: 1 } }, { 文本: '', 注释引用: { 类型: 'endnote', 标识: 1 } }] }], 注释: ['footnote', 'endnote'].map(类型 => ({ 类型, 标识: 1, 段落: [{ 类型: '段落', 文字: [{ 文本: `${类型}中文注释` }] }] })) }))
    zip.file('word/_rels/document.xml.rels', (await zip.file('word/_rels/document.xml.rels').async('string')).replace(/Target="((?:foot|end)notes.xml)"/g, "Target='/word/$1'"))
    let 读取 = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    for (let 次数 = 0; 次数 < 2; 次数++) {
      expect(读取.警告).toEqual([])
      const 模型 = htmlToDocxModel(净化富文本(读取.html))
      expect(模型.注释).toHaveLength(2)
      expect(模型.注释!.map((n: any) => n.段落[0].文字[0].文本)).toEqual(['footnote中文注释', 'endnote中文注释'])
      const bytes = await 生成docx(模型), saved = await JSZip.loadAsync(bytes)
      expect(await saved.file('word/document.xml').async('string')).toContain('<w:endnoteReference ')
      读取 = await 读取docx(bytes)
    }
  })

  it('单引号 PAGE 域经过真实编辑器模型两次保存仍写为动态域', async () => {
    let 读取 = await 读正文("<w:p><w:fldSimple w:instr='PAGE'><w:r><w:t>7</w:t></w:r></w:fldSimple></w:p>")
    for (let 次数 = 0; 次数 < 2; 次数++) {
      expect(读取.警告).toEqual([])
      const 模型 = htmlToDocxModel(净化富文本(读取.html))
      expect(模型.段落[0]).toMatchObject({ 文字: [expect.objectContaining({ 域: 'PAGE' })] })
      const bytes = await 生成docx(模型), saved = await JSZip.loadAsync(bytes)
      expect(await saved.file('word/document.xml').async('string')).toMatch(/<w:fldSimple\s+w:instr="\s*PAGE\s*">[\s\S]*?<w:t[^>]*>7<\/w:t>[\s\S]*?<\/w:fldSimple>/)
      读取 = await 读取docx(bytes)
    }
  })

  it.each([
    '<w:p><w:fldSimple w:instr="DATE"><w:r><w:t>2026年10月18日</w:t></w:r></w:fldSimple></w:p>',
    '<w:p><w:moveFrom w:id="1"><w:r><w:t>移动前</w:t></w:r></w:moveFrom><w:moveTo w:id="2"><w:r><w:t>移动后</w:t></w:r></w:moveTo></w:p>',
    '<w:p><w:r><w:rPr><w:b/><w:rPrChange w:id="3"><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr><w:t>当前仅加粗</w:t></w:r></w:p>',
  ])('实际导入警告阻止 file.save 直接覆盖原始 DOCX：%s', async body => {
    const 读取 = await 读正文(body)
    expect(读取.警告.length).toBeGreaterThan(0)
    const 保存 = vi.fn(), 写出 = vi.fn(), 提示 = vi.fn(), 来源 = 'C:\\资料\\原始.docx'
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { saveToFile: 保存, office: { writeDocx: 写出 } } })
    命令表['file.save'].run({ 当前文档名: '原始.docx', 当前文档路径: 来源, 读取内容: () => 净化富文本(读取.html), 保真风险: { 来源路径: 来源, 警告: 读取.警告 }, 提示保真风险: 提示, notify: vi.fn() } as any)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(提示).toHaveBeenCalledWith(读取.警告)
    expect(写出).not.toHaveBeenCalled(); expect(保存).not.toHaveBeenCalled()
  })
})
