const { 生成docx } = require('./docxWriter')
const { 读取docx } = require('./docxReader')
const JSZip = require('jszip')
const revision = (类型, 标识) => ({ 类型, 标识, 作者: '张三 & 李四', 时间: '2026-10-18T09:30:00Z' })

describe('原生文字修订历史', () => {
  it('插入、删除和移动的作者、时间及原生类型实际保存重开不丢', async () => {
    const 模型 = { 段落: [{ 类型: '段落', 文字: [
      { 文本: '保留' }, { 文本: '插入', 加粗: true, 修订: [revision('ins', '1')] },
      { 文本: '删除', 倾斜: true, 修订: [revision('del', '2')] },
      { 文本: '移动前', 修订: [revision('moveFrom', '3')] }, { 文本: '移动后', 修订: [revision('moveTo', '4')] },
    ] }] }
    const bytes = await 生成docx(模型), zip = await JSZip.loadAsync(bytes), xml = await zip.file('word/document.xml').async('string')
    expect(xml).toContain('<w:ins '); expect(xml).toContain('<w:del '); expect(xml).toContain('<w:moveFrom '); expect(xml).toContain('<w:moveTo ')
    expect(xml).toContain('w:author="张三 &amp; 李四"'); expect(xml).toContain('w:date="2026-10-18T09:30:00Z"')
    expect(xml).toMatch(/<w:delText[^>]*>删除<\/w:delText>/)
    const result = await 读取docx(bytes)
    for (const type of ['ins', 'del', 'moveFrom', 'moveTo']) expect(result.html).toContain(`data-seal-revision-type="${type}"`)
    expect(result.html).toContain('data-seal-revision-author="张三 &amp; 李四"')
    expect(result.html).toContain('删除'); expect(result.html).toContain('移动前'); expect(result.html).toContain('移动后')
  })
  it('无效修订不能被静默写成普通文字', async () => {
    for (const 修订 of [[{ ...revision('ins', '1'), 作者: undefined }], [revision('bad', '1')], [revision('del', 'NaN')], [{ ...revision('del', '2'), 时间: 'wrong' }]]) await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '保留', 修订 }] }] })).rejects.toThrow('修订')
  })
})
