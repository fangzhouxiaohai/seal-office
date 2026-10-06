const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')

const 页 = () => ({ id: '页一', title: '页一', 背景色: '#FFFFFF', 文本框: [{ id: '页一-文字', text: '正文', x: 40, y: 40, width: 300, height: 60, 字号: 20 }] })
const 批注 = () => ({
  id: '批甲', 页标识: '页一', 对象标识: '页一-文字', 作者: '甲', 内容: '请核对',
  时间: '2026-10-06T10:00:00.000Z', 已解决: true,
  回复: [{ id: '回一', 作者: '乙', 内容: '已修改', 时间: '2026-10-06T11:00:00.000Z' }],
})

const 变异 = async (改法) => {
  const zip = await JSZip.loadAsync(await 写入pptx({ 幻灯片: [页()], 批注列表: [批注()] }))
  await 改法(zip)
  return await 读取pptx(await zip.generateAsync({ type: 'nodebuffer' }))
}

it('基线：批注的海豹扩展元数据（对象锚点、解决、回复）能读回', async () => {
  const 结果 = await 读取pptx(await 写入pptx({ 幻灯片: [页()], 批注列表: [批注()] }))
  expect(结果.警告).toEqual([])
  expect(结果.演示文稿.批注列表[0]).toMatchObject({ id: '批甲', 对象标识: '页一-文字', 已解决: true })
  expect(结果.演示文稿.批注列表[0].回复?.[0]).toMatchObject({ id: '回一', 内容: '已修改' })
})

it('原生批注索引被外部改写导致扩展元数据无法匹配时必须告警，不能静默丢弃', async () => {
  const 结果 = await 变异(async (zip) => {
    const 路径 = 'ppt/comments/comment1.xml'
    const xml = await zip.file(路径).async('string')
    zip.file(路径, xml.replace(/idx="\d+"/, 'idx="9"'))
  })
  const 批注结果 = 结果.演示文稿.批注列表 ?? []
  const 元数据丢失 = 批注结果.length > 0 && !批注结果[0].已解决 && !(批注结果[0].回复?.length)
  if (元数据丢失) expect(结果.警告).toContain('批注未完整导入')
  else expect(批注结果[0]).toMatchObject({ 已解决: true })
})

it('扩展部件里未闭合的批注条目必须告警，不能静默丢弃', async () => {
  const 结果 = await 变异(async (zip) => {
    const 路径 = 'ppt/sealComments.xml'
    const xml = await zip.file(路径).async('string')
    zip.file(路径, xml.replace(/<\/seal:comment>/g, ''))
  })
  const 批注结果 = 结果.演示文稿.批注列表 ?? []
  const 元数据丢失 = 批注结果.length > 0 && !批注结果[0].已解决
  if (元数据丢失) expect(结果.警告).toContain('批注未完整导入')
  else expect(批注结果[0]).toMatchObject({ 已解决: true })
})

it('扩展部件引用不存在的幻灯片序号或索引必须告警', async () => {
  const 结果 = await 变异(async (zip) => {
    const 路径 = 'ppt/sealComments.xml'
    const xml = await zip.file(路径).async('string')
    zip.file(路径, xml.replace(/slide="1"/, 'slide="99"'))
  })
  expect(结果.警告).toContain('批注未完整导入')
})

it('扩展部件覆盖未知属性时告警而不是当成完整导入', async () => {
  const 未知属性 = await 变异(async (zip) => {
    const 路径 = 'ppt/sealComments.xml'
    const xml = await zip.file(路径).async('string')
    zip.file(路径, xml.replace('<seal:comment ', '<seal:comment vendorHighlight="1" '))
  })
  expect(未知属性.警告.length).toBeGreaterThan(0)
})

it('扩展部件缺少必需属性时告警并保留原生批注正文', async () => {
  const 缺属性 = await 变异(async (zip) => {
    const 路径 = 'ppt/sealComments.xml'
    const xml = await zip.file(路径).async('string')
    zip.file(路径, xml.replace(/\sid="[^"]*"/, ''))
  })
  expect(缺属性.警告).toContain('批注未完整导入')
  expect((缺属性.演示文稿.批注列表 ?? []).length).toBeGreaterThan(0)
})
