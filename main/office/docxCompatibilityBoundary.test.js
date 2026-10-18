const JSZip = require('jszip')
const { createHash } = require('node:crypto')
const { 生成docx } = require('./docxWriter')
const { 读取docx } = require('./docxReader')
const 主空间 = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const 主文档 = body => `<w:document xmlns:w="${主空间}"><w:body>${body}</w:body></w:document>`

async function 读取样例(zip, variant) {
  if (variant !== '标准') for (const part of Object.values(zip.files)) {
    if (part.dir || !/\.(?:xml|rels)$/.test(part.name)) continue
    let xml = await part.async('string')
    if (variant === 'Strict') xml = xml.replaceAll(主空间, 'http://purl.oclc.org/ooxml/wordprocessingml/main').replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships')
    xml = xml.replace(/xmlns:w=/g, 'xmlns:word=').replace(/(<\/?|\s)w:/g, '$1word:')
    zip.file(part.name, xml)
  }
  const bytes = await zip.generateAsync({ type: 'nodebuffer' }), digest = createHash('sha256').update(bytes).digest('hex')
  const result = await 读取docx(bytes)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest)
  return result
}

describe.each(['标准', '别名前缀', 'Strict'])('DOCX 导入保真边界（%s）', variant => {
  it.each(['footnote', 'endnote'])('包内绝对路径的 %s 关系仍能读取中文正文', async kind => {
    const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '正文' }, { 文本: '', 注释引用: { 类型: kind, 标识: 1 } }] }], 注释: [{ 类型: kind, 标识: 1, 段落: [{ 类型: '段落', 文字: [{ 文本: '绝对路径注释中文' }] }] }] }))
    const rels = await zip.file('word/_rels/document.xml.rels').async('string')
    zip.file('word/_rels/document.xml.rels', rels.replace(`Target="${kind}s.xml"`, `Target='/word/${kind}s.xml'`))
    const result = await 读取样例(zip, variant)
    expect(result.html).toContain('绝对路径注释中文')
    expect(result.html).toContain(`data-seal-notes="${kind}"`)
    expect(result.警告).toEqual([])
  })

  it('单引号简单 PAGE 域保留动态标记与缓存', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 主文档("<w:p><w:fldSimple w:instr='PAGE \\* MERGEFORMAT'><w:r><w:t>7</w:t></w:r></w:fldSimple></w:p>"))
    const result = await 读取样例(zip, variant)
    expect(result.html).toContain('data-seal-field="PAGE"')
    expect(result.html).toContain('>7</span>')
    expect(result.警告).toEqual([])
  })

  it('未知正文域保留缓存且明确告警，分段指令的 PAGE 不误报', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 主文档('<w:p><w:fldSimple w:instr="DATE"><w:r><w:t>2026年10月18日</w:t></w:r></w:fldSimple></w:p>'))
    const result = await 读取样例(zip, variant)
    expect(result.html).toContain('2026年10月18日')
    expect(result.警告.some(w => w.includes('域'))).toBe(true)
    const page = new JSZip()
    page.file('word/document.xml', 主文档('<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PA</w:instrText></w:r><w:r><w:instrText>GE</w:instrText><w:fldChar w:fldCharType="separate"/><w:t>8</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>'))
    expect((await 读取样例(page, variant)).警告).toEqual([])
  })

  it('移动修订保留段落与字符层级的来源和目的标记，缺失OPC源包时明确告警', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 主文档('<w:moveFrom w:id="1" w:author="测试"><w:p><w:r><w:t>已移走整段</w:t></w:r></w:p></w:moveFrom><w:p><w:moveFrom w:id="2" w:author="测试"><w:r><w:t>移动前中文</w:t></w:r></w:moveFrom><w:moveTo w:id="3" w:author="测试"><w:r><w:t>移动后中文</w:t></w:r></w:moveTo></w:p>'))
    const result = await 读取样例(zip, variant)
    expect(result.html).toContain('移动后中文')
    expect(result.html).toContain('移动前中文')
    expect(result.html).toContain('已移走整段')
    expect(result.html).toContain('data-seal-revision-type="moveFrom"'); expect(result.html).toContain('data-seal-revision-type="moveTo"')
    expect(result.html.match(/data-seal-revision-type="moveFrom"/g)).toHaveLength(2)
    expect(result.警告.some(w => w.includes('移动修订') && w.includes('关联范围'))).toBe(true)
  })

  it('格式修订历史不污染当前字符与段落格式，并明确告警', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', 主文档('<w:p><w:pPr><w:pPrChange w:id="4"><w:pPr><w:ind w:left="720"/></w:pPr></w:pPrChange></w:pPr><w:r><w:rPr><w:b/><w:rPrChange w:id="5" w:author="测试"><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr><w:t>当前仅加粗</w:t></w:r></w:p>'))
    const result = await 读取样例(zip, variant)
    expect(result.html).toContain('font-weight:700')
    expect(result.html).not.toContain('font-style:italic')
    expect(result.html).not.toContain('margin-left:36pt')
    expect(result.警告.some(w => w.includes('格式修订') && w.includes('未完整导入'))).toBe(true)
  })
})
