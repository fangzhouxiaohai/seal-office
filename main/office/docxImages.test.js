const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const { 生成docx } = require('./docxWriter')
const { 读取docx } = require('./docxReader')
const { 解码图片数据 } = require('./imageData')

const 样本根 = path.resolve(__dirname, '../../renderer/src/editor/__fixtures__')
const PNG = fs.readFileSync(path.join(样本根, 'office-image.png'))
const 构造图片 = () => ({ 数据: PNG.toString('base64'), 格式: 'png', 宽: 160, 高: 80, 说明: '图片说明' })
async function 构造来源(对象, 关系, 有资源 = true) {
  const 包 = new JSZip()
  包.file('word/document.xml', `<w:document><w:body><w:p><w:r>${对象}</w:r></w:p></w:body></w:document>`)
  包.file('word/_rels/document.xml.rels', `<Relationships>${关系}</Relationships>`)
  if (有资源) 包.file('word/media/picture.png', PNG)
  return 包.generateAsync({ type: 'nodebuffer' })
}
const 标准关系 = '<Relationship Id="pic1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture.png"/>'
const 标准图片 = '<w:drawing><wp:inline><wp:extent cx="1524000" cy="762000"/><wp:docPr descr="平面图 &amp; 说明"/><pic:pic><a:blip r:embed="pic1"/></pic:pic></wp:inline></w:drawing>'

describe('DOCX 图片数据与来源关系', () => {
  it.each([{ 旋转: NaN }, { 旋转: 360 }, { 旋转: -1 }, { 水平翻转: 'true' }, { 垂直翻转: 1 }])('错误变换参数阻止写盘：%j', async (参数) => {
    await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [{ 图片: { ...构造图片(), ...参数 } }] }] })).rejects.toThrow('图片旋转或翻转参数无效')
  })
  it.each(['png', 'jpg', 'gif', 'bmp'])('真实 %s 图片按实际格式生成媒体文件并完整读取', async (后缀) => {
    const 原文 = fs.readFileSync(path.join(样本根, `office-image.${后缀}`))
    const 信息 = 解码图片数据(原文.toString('base64'))
    const 数据 = await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 图片: { ...信息, 字节: undefined, 数据: 原文.toString('base64'), 说明: 后缀 } }] }] })
    const 包 = await JSZip.loadAsync(数据)
    const 媒体 = Object.keys(包.files).find((名) => 名.startsWith('word/media/') && 名.endsWith(`.${后缀}`))
    expect(媒体).toBeTruthy()
    expect(Buffer.compare(await 包.file(媒体).async('nodebuffer'), 原文)).toBe(0)
    const 读取 = await 读取docx(数据)
    expect(读取.警告).toEqual([])
    expect(读取.html).toContain(`data:image/${信息.格式};base64,${原文.toString('base64')}`)
  })

  it('来源包内的内嵌图片关系、实际尺寸和说明正确读取', async () => {
    const 读取 = await 读取docx(await 构造来源(标准图片, 标准关系))
    expect(读取.警告).toEqual([])
    expect(读取.html).toContain('width="160" height="80"')
    expect(读取.html).toContain('alt="平面图 &amp; 说明"')
  })

  it('VML 行内图片可读取，尺寸按实际磅值换算', async () => {
    const 对象 = '<w:pict><v:shape style="width:60pt;height:30pt" alt="旧式图片"><v:imagedata r:id="pic1"/></v:shape></w:pict>'
    const 读取 = await 读取docx(await 构造来源(对象, 标准关系))
    expect(读取.警告).toEqual([])
    expect(读取.html).toContain('width="80" height="40"')
    expect(读取.html).toContain('alt="旧式图片"')
  })

  it('兼容分支的现代图片与旧式备用图只导入一份', async () => {
    const 备用 = '<w:pict><v:shape style="width:120pt;height:60pt"><v:imagedata r:id="pic1"/></v:shape></w:pict>'
    const 对象 = `<mc:AlternateContent><mc:Choice Requires="wps">${标准图片}</mc:Choice><mc:Fallback>${备用}</mc:Fallback></mc:AlternateContent>`
    const 读取 = await 读取docx(await 构造来源(对象, 标准关系))
    expect(读取.警告).toEqual([])
    expect(读取.html.match(/<img /g)).toHaveLength(1)
  })

  it('现代分支无法读取时使用有效备用图片，不报告未选中分支的错误', async () => {
    const 备用 = '<w:pict><v:shape style="width:120pt;height:60pt"><v:imagedata r:id="pic1"/></v:shape></w:pict>'
    const 对象 = `<mc:AlternateContent><mc:Choice Requires="wps">${标准图片.replace('pic1', 'missing')}</mc:Choice><mc:Fallback>${备用}</mc:Fallback></mc:AlternateContent>`
    const 读取 = await 读取docx(await 构造来源(对象, 标准关系))
    expect(读取.警告).toEqual([])
    expect(读取.html.match(/<img /g)).toHaveLength(1)
  })

  it('嵌套兼容分支保留正文并只选择一张图片', async () => {
    const 内层 = `<mc:AlternateContent><mc:Choice Requires="wps">${标准图片}</mc:Choice><mc:Fallback>${标准图片}</mc:Fallback></mc:AlternateContent>`
    const 对象 = `<mc:AlternateContent><mc:Choice Requires="wps"><w:t>兼容正文</w:t>${内层}</mc:Choice><mc:Fallback><w:t>备用正文</w:t></mc:Fallback></mc:AlternateContent>`
    const 读取 = await 读取docx(await 构造来源(对象, 标准关系))
    expect(读取.警告).toEqual([])
    expect(读取.html).toContain('兼容正文')
    expect(读取.html).not.toContain('备用正文')
    expect(读取.html.match(/<img /g)).toHaveLength(1)
  })

  it('图片段落包含分页符时不丢失图片并报告分页风险', async () => {
    const 读取 = await 读取docx(await 构造来源(`${标准图片}<w:br w:type="page"/>`, 标准关系))
    expect(读取.html).toContain('<img ')
    expect(读取.警告).toContain('段内分页或分栏换行未完整导入')
  })

  it('孤立图片引用没有正文绘图容器时仍报告未导入', async () => {
    const 读取 = await 读取docx(await 构造来源('<a:blip r:embed="pic1"/>', 标准关系))
    expect(读取.警告).toContain('图片未导入')
  })

  it('组合绘图含多张图片时如实报告风险，不只导入第一张冒充完整', async () => {
    const 对象 = 标准图片.replace('<a:blip r:embed="pic1"/>', '<a:blip r:embed="pic1"/><a:blip r:embed="pic1"/>')
    const 读取 = await 读取docx(await 构造来源(对象, 标准关系))
    expect(读取.警告.join('、')).toContain('组合图片')
    expect(读取.html).not.toContain('<img ')
  })

  it('大图片的编码校验不会因长字符串导致调用栈溢出', () => {
    const 字节 = Buffer.concat([PNG.subarray(0, -12), Buffer.alloc(19 * 1024 * 1024), PNG.subarray(-12)])
    expect(() => 解码图片数据(字节.toString('base64'))).not.toThrow()
  })

  it('缺失资源不替换成默认图片，明确报告导入风险', async () => {
    const 读取 = await 读取docx(await 构造来源(标准图片, 标准关系, false))
    expect(读取.警告.join('、')).toContain('图片资源缺失')
    expect(读取.html).not.toContain('<img ')
  })

  it('外部关系不会在打开文档时下载图片', async () => {
    const 关系 = 标准关系.replace('Target="media/picture.png"', 'Target="https://example.com/picture.png" TargetMode="External"')
    const 读取 = await 读取docx(await 构造来源(标准图片, 关系))
    expect(读取.警告).toContain('外部链接图片未导入')
    expect(读取.html).not.toContain('<img ')
  })

  it('浮动与裁剪图片显示原始图片并如实报告排版风险', async () => {
    const 对象 = 标准图片.replaceAll('wp:inline', 'wp:anchor').replace('<a:blip', '<a:srcRect l="10000"/><a:blip')
    const 读取 = await 读取docx(await 构造来源(对象, 标准关系))
    expect(读取.html).toContain('<img ')
    expect(读取.警告).toContain('浮动图片排版未完整导入')
    expect(读取.警告).toContain('图片裁剪或旋转未完整导入')
  })

  it.each([{ 宽: -1 }, { 高: Infinity }, { 格式: 'jpeg' }, { 数据: 'AAAA' }, { 说明: 1 }])('非法图片模型不能写入文件：%j', async (改动) => {
    await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [{ 图片: { ...构造图片(), ...改动 } }] }] })).rejects.toThrow('图片')
  })
})
