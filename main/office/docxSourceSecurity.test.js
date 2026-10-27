const JSZip = require('jszip')
const { 生成docx } = require('./docxWriter')
const { 读取docx } = require('./docxReader')
const { 读取安全源包, 应用原生修订动作 } = require('./docxSource')
const base = async () => JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '安全测试正文' }] }] }))
describe('DOCX保留包边界', () => {
  it('关系指向ZIP外或伪装的宏关系均拒绝；同包绝对正常路径可读', async () => {
    for (const target of ['../../outside.xml', 'file:///etc/passwd', '../%2e%2e/outside.xml']) { const zip = await base(); zip.file('word/_rels/document.xml.rels', (await zip.file('word/_rels/document.xml.rels').async('string')).replace('</Relationships>', `<Relationship Id="attack" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/></Relationships>`)); await expect(读取安全源包(await zip.generateAsync({ type: 'base64' }))).rejects.toThrow(/关系|越界/) }
    const macro = await base(); macro.file('word/custom.dat', 'inactive test bytes'); macro.file('word/_rels/document.xml.rels', (await macro.file('word/_rels/document.xml.rels').async('string')).replace('</Relationships>', '<Relationship Id="attack" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="custom.dat"/></Relationships>')); await expect(读取安全源包(await macro.generateAsync({ type: 'base64' }))).rejects.toThrow(/活动|嵌入/)
    const safe = await base(); safe.file('word/_rels/document.xml.rels', (await safe.file('word/_rels/document.xml.rels').async('string')).replace('Target="styles.xml"', "Target='/word/styles.xml'")); await expect(读取安全源包(await safe.generateAsync({ type: 'base64' }))).resolves.toBeTruthy()
  })
  it('残缺的外部超链接按普通文本忽略，不阻止表单 DOCX 打开', async () => {
    const zip = await base()
    const rels = (await zip.file('word/_rels/document.xml.rels').async('string'))
      .replace('</Relationships>', '<Relationship Id="badLink" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="HTTPS" TargetMode="External"/></Relationships>')
    zip.file('word/_rels/document.xml.rels', rels)
    const xml = (await zip.file('word/document.xml').async('string')).replace('</w:body>', '<w:p><w:hyperlink r:id="badLink"><w:r><w:t>普通链接文字</w:t></w:r></w:hyperlink></w:p></w:body>')
    zip.file('word/document.xml', xml)
    const bytes = await zip.generateAsync({ type: 'nodebuffer' })
    await expect(读取安全源包(bytes.toString('base64'))).resolves.toBeTruthy()
    const result = await 读取docx(bytes)
    expect(result.html).toContain('普通链接文字')
    expect(result.警告.join('\n')).not.toContain('外部资源')
    expect(result.警告.join('\n')).not.toContain('超链接目标未导入')
  })

  it('ZIP路径穿越、过多entry和过大展开在解析正文前受限', async () => {
    const traversal = await base(); traversal.file('../escape.xml', '<test/>'); await expect(读取安全源包(await traversal.generateAsync({ type: 'base64' }))).rejects.toThrow('不安全')
    const many = await base(); for (let i = 0; i < 2001; i++) many.file(`customXml/test${i}.xml`, '<test/>'); const bytes = await many.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); await expect(读取docx(bytes)).rejects.toThrow('2000'); await expect(读取安全源包(bytes.toString('base64'))).rejects.toThrow('2000')
    const expanded = await base(); expanded.file('customXml/large.xml', ' '.repeat(20 * 1024 * 1024 + 1)); const compressed = await expanded.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }); await expect(读取docx(compressed)).rejects.toThrow('展开'); await expect(读取安全源包(compressed.toString('base64'))).rejects.toThrow('展开')
  })
  it('无效修订动作不能当作审阅成功，未知单元格结构历史明确保留', () => {
    for (const actions of [[null], ['bad'], [{ 标识: '1', 操作: 'unknown' }]]) expect(() => 应用原生修订动作('<w:p/>', actions)).toThrow('修订')
    expect(() => 应用原生修订动作('<w:tcPr><w:cellMerge w:id="1" w:author="测试"/></w:tcPr>', [{ 标识: '1', 操作: 'reject' }])).toThrow('尚不支持')
  })
})
