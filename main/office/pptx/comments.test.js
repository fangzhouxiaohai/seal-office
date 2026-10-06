const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')

const 页 = () => ({ id: '页一', 背景色: '#FFFFFF', 文本框: [{ id: '文字', text: '批注核验', x: 50, y: 60, width: 300, height: 100, 字号: 24 }] })
const 批注 = (覆盖 = {}) => ({ id: '批注一', 页标识: '页一', 对象标识: '文字', 作者: '张三', 内容: '标题再短一些', 时间: '2026-10-06T08:00:00.000Z', ...覆盖 })

it('原生批注部件、作者表与关系完整写入，读回保留作者、时间与文本', async () => {
  const 文件 = await 写入pptx({
    幻灯片: [页()],
    批注列表: [批注(), 批注({
      id: '批注二', 对象标识: undefined, 作者: '李四', 内容: '整页配色偏暗', 时间: '2026-10-06T09:00:00.000Z', 已解决: true,
      回复: [{ id: '回复一', 作者: '张三', 内容: '已调整', 时间: '2026-10-06T09:30:00.000Z' }],
    })],
  })
  const 包 = await JSZip.loadAsync(文件)
  const 内容类型 = await 包.file('[Content_Types].xml').async('string')
  expect(内容类型).toContain('/ppt/comments/comment1.xml')
  expect(内容类型).toContain('/ppt/commentAuthors.xml')
  const 作者Xml = await 包.file('ppt/commentAuthors.xml').async('string')
  expect(作者Xml).toContain('name="张三"')
  expect(作者Xml).toContain('name="李四"')
  const 批注Xml = await 包.file('ppt/comments/comment1.xml').async('string')
  expect(批注Xml).toContain('<p:cmLst')
  expect(批注Xml).toContain('dt="2026-10-06T08:00:00.000Z"')
  expect(批注Xml).toContain('标题再短一些')
  expect(批注Xml).toContain('<p:pos ')
  const 关系Xml = await 包.file('ppt/slides/_rels/slide1.xml.rels').async('string')
  expect(关系Xml).toContain('../comments/comment1.xml')
  const 读取 = await 读取pptx(文件)
  expect(读取.警告).toEqual([])
  expect(读取.演示文稿.批注列表).toHaveLength(2)
  expect(读取.演示文稿.批注列表[0]).toMatchObject({ 页标识: '页一', 对象标识: '文字', 作者: '张三', 内容: '标题再短一些', 时间: '2026-10-06T08:00:00.000Z' })
  expect(读取.演示文稿.批注列表[1]).toMatchObject({ 作者: '李四', 内容: '整页配色偏暗', 已解决: true })
  expect(读取.演示文稿.批注列表[1].对象标识).toBeUndefined()
  expect(读取.演示文稿.批注列表[1].回复[0]).toMatchObject({ 作者: '张三', 内容: '已调整', 时间: '2026-10-06T09:30:00.000Z' })
})

it('两轮保存重开批注稳定，备注与批注相互独立', async () => {
  const 模型 = { 幻灯片: [{ ...页(), 备注: '这是演讲备注' }], 批注列表: [批注({ 回复: [{ id: '回复一', 作者: '李四', 内容: '收到', 时间: '2026-10-06T10:00:00.000Z' }] })] }
  let 当前 = 模型
  for (let 轮次 = 1; 轮次 <= 2; 轮次++) {
    const 读取 = await 读取pptx(await 写入pptx(当前))
    expect(读取.警告).toEqual([])
    expect(读取.演示文稿.幻灯片列表[0].备注).toBe('这是演讲备注')
    expect(读取.演示文稿.批注列表).toHaveLength(1)
    expect(读取.演示文稿.批注列表[0]).toMatchObject({ id: '批注一', 页标识: '页一', 对象标识: '文字', 作者: '张三', 内容: '标题再短一些', 时间: '2026-10-06T08:00:00.000Z' })
    expect(读取.演示文稿.批注列表[0].回复).toHaveLength(1)
    当前 = { 幻灯片: 读取.演示文稿.幻灯片列表.map(项 => ({ ...项, 文本框: 项.文本框列表 })), 批注列表: 读取.演示文稿.批注列表 }
  }
})

it('没有批注时不写入批注部件与作者表', async () => {
  const 包 = await JSZip.loadAsync(await 写入pptx({ 幻灯片: [页()] }))
  expect(包.file('ppt/commentAuthors.xml')).toBeNull()
  expect(Object.keys(包.files).some(名称 => 名称.startsWith('ppt/comments/'))).toBe(false)
})

it('外部现代批注与未知属性不入库，只用风险提示保护来源文件', async () => {
  const 原文件 = await 写入pptx({ 幻灯片: [页()], 批注列表: [批注()] })
  const 包 = await JSZip.loadAsync(原文件)
  const 路径 = 'ppt/comments/comment1.xml'
  包.file(路径, (await 包.file(路径).async('string')).replace('<p:cm ', '<p:cm status="resolved" '))
  expect((await 读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))).警告).toContain('批注未完整导入')
  const 现代 = await JSZip.loadAsync(原文件)
  现代.file('ppt/comments/modernComment1.xml', '<p188:cmLst xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main"/>')
  expect((await 读取pptx(await 现代.generateAsync({ type: 'nodebuffer' }))).警告).toContain('批注未完整导入')
})

it('外部办公软件写出的无时区批注时间与单引号属性都能导入', async () => {
  const 原文件 = await 写入pptx({ 幻灯片: [页()], 批注列表: [批注()] })
  const 包 = await JSZip.loadAsync(原文件)
  const 路径 = 'ppt/comments/comment1.xml'
  包.file(路径, (await 包.file(路径).async('string')).replace('dt="2026-10-06T08:00:00.000Z"', "dt='2026-10-06T08:00:00.000'"))
  const 读取 = await 读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))
  expect(读取.警告).toEqual([])
  expect(读取.演示文稿.批注列表[0]).toMatchObject({ 作者: '张三', 内容: '标题再短一些', 时间: '2026-10-06T08:00:00.000' })
})

it('外部办公软件重写批注部件后仍能读回正文，扩展信息缺失如实降级', async () => {
  const 原文件 = await 写入pptx({ 幻灯片: [页()], 批注列表: [批注({ 已解决: true, 回复: [{ id: '回复一', 作者: '李四', 内容: '收到', 时间: '2026-10-06T10:00:00.000Z' }] })] })
  const 包 = await JSZip.loadAsync(原文件)
  // 模拟外部软件：丢弃本机扩展部件，并重写作者表与注释部件
  包.remove('ppt/sealComments.xml')
  包.file('ppt/_rels/presentation.xml.rels', (await 包.file('ppt/_rels/presentation.xml.rels').async('string')).replace(/<Relationship[^>]*sealComments\.xml"[^>]*\/>/, ''))
  const 读取 = await 读取pptx(await 包.generateAsync({ type: 'nodebuffer' }))
  expect(读取.警告).toEqual([])
  expect(读取.演示文稿.批注列表).toHaveLength(1)
  expect(读取.演示文稿.批注列表[0]).toMatchObject({ 作者: '张三', 内容: '标题再短一些' })
  expect(读取.演示文稿.批注列表[0].回复).toBeUndefined()
  expect(读取.演示文稿.批注列表[0].已解决).toBeUndefined()
})

it('批注引用不存在的页面时拒绝写入，避免产生悬挂批注', async () => {
  await expect(写入pptx({ 幻灯片: [页()], 批注列表: [批注({ 页标识: '不存在的页' })] })).rejects.toThrow('批注引用')
})
