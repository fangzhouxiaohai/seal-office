const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')
const crypto = require('crypto')

const 附件字节 = Buffer.from('附件真实内容 seal-office 核验', 'utf8')
const 附件标识 = crypto.createHash('sha256').update(附件字节).digest('hex')
const 图示数据部件 = '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="1"><dgm:prSet/><dgm:spPr/><dgm:t><a:p><a:r><a:t>流程节点</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst></dgm:dataModel>'
const 图示布局部件 = '<dgm:layoutDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>'
const 图示部件表 = [
  { 路径: 'ppt/diagrams/data1.xml', 内容类型: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml', 数据: Buffer.from(图示数据部件, 'utf8').toString('base64') },
  { 路径: 'ppt/diagrams/layout1.xml', 内容类型: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml', 数据: Buffer.from(图示布局部件, 'utf8').toString('base64') },
]
const 图示包 = Buffer.from(JSON.stringify({ 部件: 图示部件表 }), 'utf8')
const 图示标识 = crypto.createHash('sha256').update(图示包).digest('hex')

const 资源条目 = [
  { 标识: 附件标识, 类型: 'application/vnd.openxmlformats-officedocument.oleObject', 数据: 附件字节.toString('base64') },
  { 标识: 图示标识, 类型: 'application/vnd.seal.diagram+json', 数据: 图示包.toString('base64') },
]
const 页 = () => ({
  id: '验收页', 背景色: '#FFFFFF',
  文本框: [{ id: '标题', text: '公式与嵌入对象核验', x: 60, y: 40, width: 700, height: 70, 字号: 28 }],
  对象列表: [
    { id: '公式-1', 类型: '公式', x: 120, y: 140, width: 320, height: 90, 公式: { 表达式: '\\frac{a^2}{\\sqrt{b}}', 字号: 28, 颜色: '#1A1D24' } },
    { id: '附件-1', 类型: '附件', x: 120, y: 280, width: 220, height: 130, 附件: { 文件名: '说明.txt', 显示名称: '说明附件', 资源标识: 附件标识, 字节数: 附件字节.length } },
    { id: '图示-1', 类型: '图示', x: 460, y: 280, width: 280, height: 170, 图示: { 显示文本: '流程节点', 资源标识: 图示标识, 关系: [{ 角色: 'dm', 部件路径: 'ppt/diagrams/data1.xml' }, { 角色: 'lo', 部件路径: 'ppt/diagrams/layout1.xml' }] } },
  ],
})

it('公式、附件与原生图示写入真实部件并可原样读回', async () => {
  const 文件 = await 写入pptx({ 幻灯片: [页()], 资源条目 })
  const zip = await JSZip.loadAsync(文件)
  const slide = await zip.file('ppt/slides/slide1.xml').async('string')
  expect(slide).toContain('<a14:m')
  expect(slide).toContain('<m:f>')
  expect(slide).toContain('<p:oleObj')
  expect(slide).toContain('progId="Package"')
  expect(slide).toContain('<dgm:relIds')
  expect(zip.file(`ppt/embeddings/${附件标识}.bin`)).toBeTruthy()
  expect(zip.file('ppt/diagrams/data1.xml')).toBeTruthy()
  expect(zip.file('ppt/diagrams/layout1.xml')).toBeTruthy()
  const 类型 = await zip.file('[Content_Types].xml').async('string')
  expect(类型).toContain('Extension="bin"')
  expect(类型).toContain('/ppt/diagrams/data1.xml')
  const 关系 = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  expect(关系).toContain('relationships/oleObject')
  expect(关系).toContain('relationships/diagramData')

  const 读 = await 读取pptx(文件)
  expect(读.警告).toEqual([])
  const 对象 = 读.演示文稿.幻灯片列表[0].对象列表 ?? []
  expect(对象.map(项 => 项.类型).sort()).toEqual(['公式', '图示', '附件'].sort())
  const 公式 = 对象.find(项 => 项.类型 === '公式')
  expect(公式.公式.表达式).toBe('\\frac{a^2}{\\sqrt{b}}')
  const 附件 = 对象.find(项 => 项.类型 === '附件')
  expect(附件.附件).toMatchObject({ 文件名: '说明.txt', 显示名称: '说明附件', 资源标识: 附件标识 })
  expect(附件.x).toBe(120); expect(附件.width).toBe(220)
  const 图示 = 对象.find(项 => 项.类型 === '图示')
  expect(图示.图示.显示文本).toBe('流程节点')
  expect(图示.图示.关系).toHaveLength(2)
  expect(读.资源条目.find(项 => 项.标识 === 附件标识).数据).toBe(附件字节.toString('base64'))
  expect(读.资源条目.find(项 => 项.标识 === 图示标识)).toBeTruthy()
})

it('两轮保存重开保持公式表达式、附件字节与图示部件', async () => {
  let 模型 = { 幻灯片: [页()], 资源条目 }
  let 读
  for (let 轮 = 1; 轮 <= 2; 轮++) {
    const 文件 = await 写入pptx(模型)
    读 = await 读取pptx(文件)
    expect(读.警告).toEqual([])
    模型 = { 幻灯片: 读.演示文稿.幻灯片列表.map(页数据 => ({ ...页数据, 文本框: 页数据.文本框列表 })), 资源条目: 读.资源条目 }
  }
  const 对象 = 读.演示文稿.幻灯片列表[0].对象列表 ?? []
  expect(对象.find(项 => 项.类型 === '公式').公式.表达式).toBe('\\frac{a^2}{\\sqrt{b}}')
  expect(对象.find(项 => 项.类型 === '附件').附件.字节数).toBe(附件字节.length)
  const zip = await JSZip.loadAsync(await 写入pptx(模型))
  const 写出 = await zip.file('ppt/diagrams/data1.xml').async('string')
  expect(写出).toBe(图示数据部件)
})

it('外部改写公式数学部件后按风险登记，不伪造表达式', async () => {
  const 文件 = await 写入pptx({ 幻灯片: [页()], 资源条目 })
  const zip = await JSZip.loadAsync(文件)
  const slide = await zip.file('ppt/slides/slide1.xml').async('string')
  zip.file('ppt/slides/slide1.xml', slide.replace('<m:f>', '<m:nary>').replace('</m:f>', '</m:nary>'))
  const 读 = await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))
  const 公式 = (读.演示文稿.幻灯片列表[0].对象列表 ?? []).find(项 => 项.类型 === '公式')
  expect(公式).toBeUndefined()
  expect(读.警告.join('；')).toMatch(/公式|原生对象|图形/)
})

it('外部改写公式外观后按原生数学部件恢复表达式并提示差异', async () => {
  const 文件 = await 写入pptx({ 幻灯片: [页()], 资源条目 })
  const zip = await JSZip.loadAsync(文件)
  const slide = await zip.file('ppt/slides/slide1.xml').async('string')
  const 公式片段 = slide.match(/<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g).filter((项) => 项.includes('<a14:m'))[0]
  zip.file('ppt/slides/slide1.xml', slide.replace(公式片段, 公式片段.replace('sz="2800"', 'sz="2400"')))
  const 读 = await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))
  const 公式 = (读.演示文稿.幻灯片列表[0].对象列表 ?? []).find(项 => 项.类型 === '公式')
  expect(公式).toBeTruthy()
  expect(公式.公式.表达式).toBe('\\frac{a^2}{\\sqrt{b}}')
  expect(公式.公式.字号).toBe(24)
  expect(读.警告.join('；')).toContain('公式已被外部修改')
})

it('附件资源缺失或类型不符时阻止有损保存', async () => {
  await expect(写入pptx({ 幻灯片: [页()], 资源条目: [资源条目[1]] })).rejects.toThrow('附件资源字节缺失')
  await expect(写入pptx({ 幻灯片: [页()], 资源条目: [{ ...资源条目[0], 类型: 'image/png' }, 资源条目[1]] })).rejects.toThrow('附件资源类型无效')
})
