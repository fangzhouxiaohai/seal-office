const { 写入定稿, 读取定稿, 定稿属性名, 校验定稿 } = require('./finalize')
const JSZip = require('jszip')

const 内容类型头 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
const 基础包 = () => {
  const 包 = new JSZip()
  包.file('[Content_Types].xml', 内容类型头 + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>')
  包.file('_rels/.rels', 内容类型头 + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')
  return 包
}
const 读文本 = async (包, 路径) => 包.file(路径) ? 包.file(路径).async('string') : null

describe('演示文稿定稿', () => {
  it('写入定稿后压缩包含自定义属性、内容类型与关系，并能读回', async () => {
    const 包 = 基础包()
    await 写入定稿(包, { 时间: '2026-10-06T10:30:00.000Z', 标记人: '张三' })
    const 属性 = await 读文本(包, 'docProps/custom.xml')
    expect(属性).toContain(`name="${定稿属性名}"`)
    expect(属性).toContain('2026-10-06T10:30:00.000Z')
    expect(属性).toContain('张三')
    expect(await 读文本(包, '[Content_Types].xml')).toContain('PartName="/docProps/custom.xml"')
    expect(await 读文本(包, '_rels/.rels')).toContain('Target="docProps/custom.xml"')
    expect(await 读取定稿(包)).toEqual({ 时间: '2026-10-06T10:30:00.000Z', 标记人: '张三' })
  })

  it('重复写入只更新数值，不产生重复关系或重复内容类型', async () => {
    const 包 = 基础包()
    await 写入定稿(包, { 时间: '2026-10-06T10:30:00.000Z' })
    await 写入定稿(包, { 时间: '2026-10-07T08:00:00.000Z' })
    const 关系 = await 读文本(包, '_rels/.rels')
    expect(关系.match(/custom-properties/g)).toHaveLength(1)
    const 内容类型 = await 读文本(包, '[Content_Types].xml')
    expect(内容类型.match(/\/docProps\/custom\.xml/g)).toHaveLength(1)
    expect((await 读文本(包, 'docProps/custom.xml')).match(new RegExp(定稿属性名, 'g'))).toHaveLength(1)
    expect((await 读取定稿(包)).时间).toBe('2026-10-07T08:00:00.000Z')
  })

  it('保留工作簿已有的其它自定义属性', async () => {
    const 包 = 基础包()
    包.file('docProps/custom.xml', 内容类型头 + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="来源系统"><vt:lpwstr>外部系统</vt:lpwstr></property></Properties>')
    await 写入定稿(包, { 时间: '2026-10-06T10:30:00.000Z' })
    const 属性 = await 读文本(包, 'docProps/custom.xml')
    expect(属性).toContain('来源系统')
    expect(属性).toContain('外部系统')
    expect(await 读取定稿(包)).toMatchObject({ 时间: '2026-10-06T10:30:00.000Z' })
  })

  it('没有定稿属性时返回 null', async () => {
    const 包 = 基础包()
    expect(await 读取定稿(包)).toBeNull()
    包.file('docProps/custom.xml', 内容类型头 + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="其它"><vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">x</vt:lpwstr></property></Properties>')
    expect(await 读取定稿(包)).toBeNull()
  })

  it('拒绝无效定稿信息并给出真实原因', async () => {
    expect(() => 校验定稿(null)).toThrow('定稿信息无效')
    expect(() => 校验定稿({ 时间: '2026/10/06' })).toThrow('定稿时间无效')
    expect(() => 校验定稿({ 时间: '2026-10-06T10:30:00.000Z', 标记人: 'x'.repeat(65) })).toThrow('定稿标记人过长')
    await expect(写入定稿(基础包(), { 时间: '不是时间' })).rejects.toThrow('定稿时间无效')
  })

  it('定稿属性损坏时报真实原因而不是静默当作未定稿', async () => {
    const 包 = 基础包()
    包.file('docProps/custom.xml', 内容类型头 + '<Properties><property name="' + 定稿属性名 + '"><vt:lpwstr>2026-10-06T10:30:00.000Z</vt:lpwstr>')
    await expect(读取定稿(包)).rejects.toThrow('定稿信息损坏')
  })
})
