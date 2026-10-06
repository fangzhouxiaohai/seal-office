const JSZip = require('jszip')
const {
  读取页面尺寸,
  写入页面尺寸,
  应用背景填充,
  写入背景填充,
  读取背景填充,
  写入页脚形状,
  读取页脚形状,
  移除字段形状,
  页脚形状Xml,
} = require('./pageSetup')

const 幻灯片骨架 = '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld></p:sld>'

describe('页面尺寸、背景与页脚的部件读写', () => {
  it('写入与读取页面尺寸使用 EMU 换算', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('ppt/presentation.xml', '<p:presentation><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
    await 写入页面尺寸(压缩包, { 宽: 960, 高: 720 })
    const xml = await 压缩包.file('ppt/presentation.xml').async('string')
    expect(xml).toContain('<p:sldSz cx="12192000" cy="9144000"/>')
    expect(xml).toContain('<p:notesSz')
    expect(读取页面尺寸(xml)).toEqual({ 宽: 960, 高: 720 })
    await expect(写入页面尺寸(压缩包, { 宽: 0, 高: 720 })).rejects.toThrow(/尺寸/)
  })

  it('纯色与渐变背景写入 p:bg 并可读回', () => {
    const 纯色 = 应用背景填充(幻灯片骨架, { 类型: '纯色', 颜色: '#EEF3FF' })
    expect(纯色).toMatch(/<p:bg><p:bgPr><a:solidFill><a:srgbClr val="EEF3FF"\/><\/a:solidFill><a:effectLst\/><\/p:bgPr><\/p:bg>/)
    expect(读取背景填充(纯色)).toEqual({ 类型: '纯色', 颜色: '#EEF3FF' })

    const 渐变 = 应用背景填充(幻灯片骨架, { 类型: '渐变', 起始色: '#FFFFFF', 结束色: '#DCE6FF', 角度: 90 })
    expect(渐变).toContain('<a:gradFill')
    expect(渐变).toContain('<a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs>')
    expect(渐变).toContain('<a:gs pos="100000"><a:srgbClr val="DCE6FF"/></a:gs>')
    expect(渐变).toContain('<a:lin ang="5400000" scaled="0"/>')
    expect(读取背景填充(渐变)).toEqual({ 类型: '渐变', 起始色: '#FFFFFF', 结束色: '#DCE6FF', 角度: 90 })
    expect(读取背景填充(幻灯片骨架)).toBeNull()
  })

  it('图片背景写入关系与媒体部件', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('ppt/slides/slide1.xml', 幻灯片骨架)
    压缩包.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>')
    压缩包.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>')
    const 数据 = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const xml = await 写入背景填充(压缩包, 'ppt/slides/slide1.xml', 幻灯片骨架, { 类型: '图片', 资源标识: '指纹一' }, { 标识: '指纹一', 类型: 'image/png', 数据: 数据.toString('base64') })
    expect(xml).toContain('<a:blipFill><a:blip r:embed="sealBg')
    expect(压缩包.file('ppt/media/指纹一.png')).not.toBeNull()
    const 关系 = await 压缩包.file('ppt/slides/_rels/slide1.xml.rels').async('string')
    expect(关系).toContain('../media/指纹一.png')
    const 读取 = 读取背景填充(xml)
    expect(读取.类型).toBe('图片')
    expect(读取.关系标识).toMatch(/^sealBg/)
  })

  it('页脚、日期与页码写入形状并使用原生字段', () => {
    const xml = 写入页脚形状(幻灯片骨架, { 页脚文本: '海豹办公', 显示日期: true, 显示页码: true, 日期文本: '2026-10-04' }, 2, { 宽: 960, 高: 540 })
    expect(xml).toContain('<a:fld id="{')
    expect(xml).toContain('type="slidenum"')
    expect(xml).toContain('>海豹办公<')
    expect(xml).toContain('>2026-10-04<')
    expect(xml).toContain('>2<')
    const 读取 = 读取页脚形状(xml)
    expect(读取.页脚文本).toBe('海豹办公')
    expect(读取.日期文本).toBe('2026-10-04')
    expect(读取.显示日期).toBe(true)
    expect(读取.显示页码).toBe(true)
    expect(读取页脚形状(幻灯片骨架)).toBeNull()
    expect(页脚形状Xml({ 显示页码: true }, 3, { 宽: 960, 高: 540 }).页码).toContain('>3<')
    expect(移除字段形状(xml)).not.toContain('seal-field:')
  })

  it('首页不显示时写入函数不产生页脚形状', () => {
    const xml = 写入页脚形状(幻灯片骨架, { 页脚文本: '海豹办公', 显示页码: true, 首页不显示: true }, 1, { 宽: 960, 高: 540 })
    expect(xml).toBe(幻灯片骨架)
    expect(读取页脚形状(xml)).toBeNull()
    const 第二页 = 写入页脚形状(幻灯片骨架, { 页脚文本: '海豹办公', 显示页码: true, 首页不显示: true }, 2, { 宽: 960, 高: 540 })
    expect(读取页脚形状(第二页).显示页码).toBe(true)
  })
})
