const JSZip = require('jszip')
const { 规范OfficeXml } = require('./ooxmlNamespaces')
const { 生成docx } = require('./docxWriter')
const { 读取docx } = require('./docxReader')
const { 写入pptx, 读取pptx } = require('./pptxCodec')

async function 改写前缀(bytes, aliases, strict = false) {
  const zip = await JSZip.loadAsync(bytes)
  for (const part of Object.values(zip.files)) {
    if (part.dir || !/\.(?:xml|rels)$/.test(part.name)) continue
    let xml = await part.async('string')
    for (const [source, target] of Object.entries(aliases)) {
      xml = xml.replace(/<[^>]+>/g, tag => tag.replace(new RegExp(`(<\\/?|\\s)${source}:`, 'g'), `$1${target}:`)
        .replace(new RegExp(`xmlns:${source}=`, 'g'), `xmlns:${target}=`))
    }
    if (strict) xml = xml.replace(/http:\/\/schemas\.openxmlformats\.org\/(wordprocessingml|presentationml|drawingml)\/2006\//g, 'http://purl.oclc.org/ooxml/$1/')
      .replace(/http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\//g, 'http://purl.oclc.org/ooxml/officeDocument/')
    zip.file(part.name, xml)
  }
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('Office 命名空间兼容', () => {
  it('标准默认关系命名空间中的 Strict Type 也转换，而正文 URI 保持原文', () => {
    const prefix = 'http://purl.oclc.org/ooxml/officeDocument/relationships/'
    const xml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${prefix}header" Target="header1.xml"/></Relationships>`
    expect(规范OfficeXml(xml)).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header"')
    const body = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${prefix}header</w:t></w:r></w:p></w:body></w:document>`
    expect(规范OfficeXml(body)).toBe(body)
  })
  it('按命名空间识别默认前缀和属性，正文内容不被字符串替换', () => {
    const xml = '<document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:attr="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><body><p><r><rPr><b attr:val="1"/></rPr><t>word:p &amp; http://purl.oclc.org/ooxml/wordprocessingml/main</t></r></p></body></document>'
    const result = 规范OfficeXml(xml)
    expect(result).toContain('<w:document')
    expect(result).toContain('<w:b w:val="1"/>')
    expect(result).toContain('word:p &amp; http://purl.oclc.org/ooxml/wordprocessingml/main')
  })

  it('规范前缀重绑定到第三方空间时不把扩展当成正文', () => {
    const result = 规范OfficeXml('<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w="urn:third-party"><x:body><w:p>扩展</w:p><x:p><x:r><x:t>正文</x:t></x:r></x:p></x:body></x:document>')
    expect(result).toMatch(/<sealExt\d+:p[^>]*>扩展/)
    expect(result).toContain('<w:p>')
  })

  it('扩展前缀的 Ignorable 与 Choice Requires 在标准前缀冲突时仍指向原 URI', () => {
    const result = 规范OfficeXml('<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w="urn:third-party" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w"><x:body><mc:AlternateContent><mc:Choice Requires="w"><w:part/></mc:Choice></mc:AlternateContent></x:body></x:document>')
    expect(result).toContain('mc:Ignorable="sealExt1"')
    expect(result).toContain('Requires="sealExt1"')
    expect(result).toContain('xmlns:sealExt1="urn:third-party"')
  })

  it('标准 XML 保持原文，文档类型声明拒绝', () => {
    const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body /></w:document>'
    expect(规范OfficeXml(xml)).toBe(xml)
    expect(() => 规范OfficeXml('<!DOCTYPE x><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')).toThrow(/文档类型/)
  })

  it.each([false, true])('DOCX 字符、段落、页眉样式在别名前缀 Strict=%s 时正常导入', async strict => {
    const original = await 生成docx({
      段落: [{ 类型: '段落', 对齐: '中', 文字: [{ 文本: '海豹 w:p & 文本', 加粗: true, 字号: 16, 颜色: 'CC0000' }] }],
      页眉: [{ 类型: '段落', 文字: [{ 文本: '测试页眉', 倾斜: true }] }],
    })
    const baseline = await 读取docx(original)
    const changed = await 改写前缀(original, { w: 'wordml', r: 'relation', a: 'draw', wp: 'anchor', pic: 'picture' }, strict)
    const result = await 读取docx(changed)
    expect(result.html).toBe(baseline.html)
    expect(result.页面设置).toEqual(baseline.页面设置)
    expect(result.警告).toEqual(baseline.警告)
    expect(await 读取docx(original)).toEqual(baseline)
  })

  it.each([false, true])('PPTX 文本、坐标和备注在别名前缀 Strict=%s 时正常导入', async strict => {
    const original = await 写入pptx({ 幻灯片: [{ id: 'p1', 文本框: [{ id: 't1', text: '海豹 p:sld & 文本', x: 30, y: 40, width: 300, height: 60, 字号: 28, 加粗: true, 颜色: '#CC0000' }], 备注: '演讲备注' }] })
    const baseline = await 读取pptx(original)
    const changed = await 改写前缀(original, { p: 'slides', a: 'draw', r: 'relation' }, strict)
    const result = await 读取pptx(changed)
    expect(result.演示文稿).toEqual(baseline.演示文稿)
    expect(result.警告).toEqual(baseline.警告)
  })

  it.each([false, true])('PPTX 原生图形不会因别名规范化改变实体/换行而退化 Strict=%s', async strict => {
    const shape = { id: 'shape', 类型: '图形', x: 72, y: 60, width: 160, height: 80, 旋转: 37,
      形状: { 种类: '矩形', 文本: 'it\'s a "shape"\t\n海豹 & <内容>', 填充: '#FFFFFF', 线条: '#334455', 线宽: 2, 颜色: '#112233', 字号: 24, 加粗: false } }
    const original = await 写入pptx({ 幻灯片: [{ id: 'native', 文本框: [], 对象列表: [shape] }] })
    const baseline = await 读取pptx(original)
    const changed = await 改写前缀(original, { p: 'slides', a: 'draw', r: 'relation' }, strict)
    const result = await 读取pptx(changed)
    expect(result.演示文稿.幻灯片列表[0].对象列表).toEqual([shape])
    expect(result.警告).toEqual(baseline.警告)
  })
})
