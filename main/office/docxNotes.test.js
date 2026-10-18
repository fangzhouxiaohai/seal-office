const JSZip = require('jszip')
const { 生成docx } = require('./docxWriter')
const { 读取docx } = require('./docxReader')
const para = text => ({ 类型: '段落', 文字: [{ 文本: text }] })

describe('审核整改 DOCX 结构回归', () => {
  it('脚注与尾注分为真实 OOXML 部件，引用、内容与转义均可读回', async () => {
    const bytes = await 生成docx({ 段落: [{ 类型: '段落', 文字: [
      { 文本: '正文' }, { 文本: '', 注释引用: { 类型: 'footnote', 标识: 1 } }, { 文本: '', 注释引用: { 类型: 'endnote', 标识: 1 } },
    ] }], 注释: [
      { 类型: 'footnote', 标识: 1, 段落: [para('脚注 & <中文> 😀')] },
      { 类型: 'endnote', 标识: 1, 段落: [para('尾注 & 中文 𠀀')] },
    ] })
    const zip = await JSZip.loadAsync(bytes)
    expect(await zip.file('word/document.xml').async('string')).toContain('<w:endnoteReference w:id="2"/>')
    const foot = await zip.file('word/footnotes.xml').async('string'), end = await zip.file('word/endnotes.xml').async('string')
    expect(foot).toContain('脚注 &amp; &lt;中文&gt; 😀'); expect(foot).not.toContain('尾注 &amp;')
    expect(end).toContain('尾注 &amp; 中文 𠀀'); expect(end).not.toContain('脚注 &amp;')
    expect(await zip.file('word/_rels/document.xml.rels').async('string')).toContain('/endnotes')
    const read = await 读取docx(bytes)
    expect(read.警告).toEqual([])
    expect(read.html).toContain('data-seal-notes="footnote"'); expect(read.html).toContain('data-seal-notes="endnote"')
    expect(read.html).toContain('尾注 &amp; 中文 𠀀')
  })
  it('丢失注释正文时拒绝生成假成功文件', async () => {
    await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '', 注释引用: { 类型: 'footnote', 标识: 3 } }] }] })).rejects.toThrow('缺少对应正文')
  })
  it.each(['cjk-ideographic', 'lower-alpha', 'square', 'circle'])('列表样式 %s 保存重开保持一致', async style => {
    const bytes = await 生成docx({ 段落: [{ ...para('列表项'), 列表: ['square','circle'].includes(style) ? '项目符号' : '编号', 列表样式: style }] })
    const read = await 读取docx(bytes)
    expect(read.警告).toEqual([]); expect(read.html).toContain(`list-style-type:${style}`)
  })
})
