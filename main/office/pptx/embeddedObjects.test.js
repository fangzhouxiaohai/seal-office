const JSZip = require('jszip')
const crypto = require('crypto')
const { 检查嵌入字节, 写入附件对象, 读取附件对象, 写入图示对象, 读取图示对象, 附件媒体类型 } = require('./embeddedObjects')

const 关系根 = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
const 类型根 = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
const 字节 = Buffer.from('这是一个用于往返核验的附件内容 seal-office', 'utf8')
const 标识 = crypto.createHash('sha256').update(字节).digest('hex')
const 附件对象 = () => ({ id: '附件-1', 类型: '附件', x: 120, y: 100, width: 200, height: 120, 附件: { 文件名: '说明.txt', 显示名称: '说明附件', 资源标识: 标识, 字节数: 字节.length } })

it('附件字节按内容指纹校验并识别宏风险格式', () => {
  expect(检查嵌入字节(字节, '说明.txt')).toMatchObject({ 类型: 附件媒体类型 })
  expect(() => 检查嵌入字节(Buffer.alloc(0), '说明.txt')).toThrow('附件内容为空')
  expect(检查嵌入字节(Buffer.from('x'), '报告.docm').宏风险).toBe(true)
  expect(检查嵌入字节(Buffer.from('x'), '报告.pdf').宏风险).toBe(false)
})

it('附件写入原生 oleObj 图形框，部件与关系齐全并可原样读回', async () => {
  const 包 = new JSZip()
  const 结果 = await 写入附件对象(附件对象(), 7, { 包, 关系Xml: 关系根, 类型Xml: 类型根, 资源表: new Map([[标识, { 标识, 类型: 附件媒体类型, 数据: 字节.toString('base64') }]]) })
  expect(结果.xml).toContain('<p:graphicFrame')
  expect(结果.xml).toContain('<p:oleObj')
  expect(结果.xml).toContain('progId="Package"')
  expect(结果.xml).toContain('descr="seal-element:')
  expect(结果.关系Xml).toContain('relationships/oleObject')
  expect(结果.类型Xml).toContain('Extension="bin"')
  const 部件路径 = `ppt/embeddings/${标识}.bin`
  expect(包.file(部件路径)).toBeTruthy()
  expect((await 包.file(部件路径).async('nodebuffer')).equals(字节)).toBe(true)

  // 用写入结果构造真实幻灯片部件与关系，再走读取路径
  const 页 = new JSZip()
  页.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>${结果.xml}</p:spTree></p:cSld></p:sld>`)
  页.file('ppt/slides/_rels/slide1.xml.rels', 结果.关系Xml)
  页.file(部件路径, 字节)
  const 读取 = await 读取附件对象(页, 'ppt/slides/slide1.xml', await 页.file('ppt/slides/slide1.xml').async('string'))
  expect(读取.警告).toEqual([])
  expect(读取.对象列表).toHaveLength(1)
  expect(读取.对象列表[0]).toMatchObject({ 类型: '附件', x: 120, y: 100, width: 200, height: 120, 附件: { 文件名: '说明.txt', 显示名称: '说明附件', 资源标识: 标识 } })
  expect(读取.资源条目[0].数据).toBe(字节.toString('base64'))
})

it('附件字节数与资源不一致时拒绝写入，不生成占位对象', async () => {
  const 包 = new JSZip()
  const 对象 = 附件对象(); 对象.附件.字节数 = 字节.length + 5
  await expect(写入附件对象(对象, 7, { 包, 关系Xml: 关系根, 类型Xml: 类型根, 资源表: new Map([[标识, { 标识, 类型: 附件媒体类型, 数据: 字节.toString('base64') }]]) })).rejects.toThrow('附件字节数与资源不一致')
})

it('缺少资源字节时明确失败，不写入空嵌入部件', async () => {
  const 包 = new JSZip()
  await expect(写入附件对象(附件对象(), 7, { 包, 关系Xml: 关系根, 类型Xml: 类型根, 资源表: new Map() })).rejects.toThrow('附件资源字节缺失')
})

it('读取缺少关系的嵌入对象时明确报错，不静默丢弃', async () => {
  const 页 = new JSZip()
  页.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="Object 1"/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole"><p:oleObj r:id="rId9" progId="Package"><p:embed/></p:oleObj></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>')
  页.file('ppt/slides/_rels/slide1.xml.rels', 关系根)
  await expect(读取附件对象(页, 'ppt/slides/slide1.xml', await 页.file('ppt/slides/slide1.xml').async('string'))).rejects.toThrow('嵌入对象关系缺失')
})

it('未知嵌入对象保留字节并按风险登记', async () => {
  const 包 = new JSZip()
  const 结果 = await 写入附件对象({ ...附件对象(), 附件: { ...附件对象().附件, 文件名: '数据.xlsm' } }, 7, { 包, 关系Xml: 关系根, 类型Xml: 类型根, 资源表: new Map([[标识, { 标识, 类型: 附件媒体类型, 数据: 字节.toString('base64') }]]) })
  const 页 = new JSZip()
  页.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>${结果.xml}</p:spTree></p:cSld></p:sld>`)
  页.file('ppt/slides/_rels/slide1.xml.rels', 结果.关系Xml)
  页.file(`ppt/embeddings/${标识}.bin`, 字节)
  const 读取 = await 读取附件对象(页, 'ppt/slides/slide1.xml', await 页.file('ppt/slides/slide1.xml').async('string'))
  expect(读取.警告).toContain('嵌入对象可能包含宏或脚本，本机不执行')
  expect(读取.对象列表[0].附件.文件名).toBe('数据.xlsm')
})

it('原生图示部件与关系可按原样读入并完整写回', async () => {
  const 数据部件 = '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:ptLst><dgm:pt modelId="1"><dgm:prSet/><dgm:spPr/><dgm:t><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:t>流程节点</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst></dgm:dataModel>'
  const 布局部件 = '<dgm:layoutDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>'
  const 页 = new JSZip()
  页.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><p:cSld><p:spTree><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Diagram 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1524000" y="1270000"/><a:ext cx="3048000" cy="1905000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rId1" r:lo="rId2" r:qs="rId3" r:cs="rId4"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>')
  页.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout" Target="../diagrams/layout1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle" Target="../diagrams/quickStyle1.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors" Target="../diagrams/colors1.xml"/></Relationships>')
  页.file('ppt/diagrams/data1.xml', 数据部件)
  页.file('ppt/diagrams/layout1.xml', 布局部件)
  页.file('ppt/diagrams/quickStyle1.xml', '<dgm:styleDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>')
  页.file('ppt/diagrams/colors1.xml', '<dgm:colorsDef xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"/>')
  const 读取 = await 读取图示对象(页, 'ppt/slides/slide1.xml', await 页.file('ppt/slides/slide1.xml').async('string'))
  expect(读取.警告).toEqual([])
  expect(读取.对象列表).toHaveLength(1)
  expect(读取.对象列表[0]).toMatchObject({ 类型: '图示', x: 120, y: 100, width: 240, height: 150, 图示: { 显示文本: '流程节点' } })

  const 包 = new JSZip()
  const 写出 = await 写入图示对象(读取.对象列表[0], 11, { 包, 关系Xml: 关系根, 类型Xml: 类型根, 资源表: new Map(读取.资源条目.map(项 => [项.标识, 项])) })
  expect(写出.xml).toContain('dgm:relIds')
  expect(写出.xml).toContain('descr="seal-element:')
  const 部件 = Object.keys(包.files).filter(名称 => 名称.startsWith('ppt/diagrams/') && !名称.endsWith('/'))
  expect(部件).toHaveLength(4)
  expect(await 包.file(部件.find(名称 => 名称.includes('data'))).async('string')).toBe(数据部件)
  expect(写出.关系Xml).toContain('diagramData')
})

it('图示缺少数据部件关系时明确报错', async () => {
  const 页 = new JSZip()
  页.file('ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><p:cSld><p:spTree><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="Diagram 1"/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rId1"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>')
  页.file('ppt/slides/_rels/slide1.xml.rels', 关系根)
  await expect(读取图示对象(页, 'ppt/slides/slide1.xml', await 页.file('ppt/slides/slide1.xml').async('string'))).rejects.toThrow('图示关系缺失')
})
