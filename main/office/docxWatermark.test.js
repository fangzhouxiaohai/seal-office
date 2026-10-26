const JSZip = require('jszip')
const { 读取docx } = require('./docxReader')

describe('DOCX 页眉水印与字体回退', () => {
  it('从常见 VML 文字水印读取内容，避免把水印当成页眉正文', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:rPr><w:rFonts w:eastAsia="宋体"/></w:rPr><w:t>正文</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/></w:sectPr></w:body></w:document>')
    zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>')
    zip.file('word/header1.xml', '<w:hdr><w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1"><v:textpath string="机密"/></v:shape></w:pict></w:r></w:p></w:hdr>')
    const result = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(result.页面设置.水印).toBe('机密')
    expect(result.页面设置.页眉Html).toBeUndefined()
    expect(result.html).toContain("'Noto Sans SC','SealNotoSans'")
    expect(result.警告.join(' ')).toContain('无法将其写回 DOCX')
  })

  it('从页眉 VML 图片水印读取内嵌图像', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/></w:sectPr></w:body></w:document>')
    zip.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>')
    zip.file('word/header1.xml', '<w:hdr><w:p><w:r><w:pict><v:shape id="PowerPlusWaterMarkObject1" style="width:100pt;height:100pt"><v:imagedata r:id="pic1"/></v:shape></w:pict></w:r></w:p></w:hdr>')
    zip.file('word/_rels/header1.xml.rels', '<Relationships><Relationship Id="pic1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/watermark.png"/></Relationships>')
    zip.file('word/media/watermark.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'))
    const result = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(result.页面设置.水印).toMatch(/^图片:data:image\/png;base64,/)
    expect(result.页面设置.页眉Html).toBeUndefined()
  })
})
