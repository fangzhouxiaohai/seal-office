const { 写入pptx, 读取pptx } = require('../pptxCodec')
const JSZip = require('jszip')

const 页 = () => ({ id: '定稿页', 背景色: '#FFFFFF', 文本框: [{ id: '定稿文字', text: '定稿核验', x: 40, y: 40, width: 400, height: 80, 字号: 20 }] })

describe('定稿信息随 PPTX 往返', () => {
  it('写入标准自定义属性部件并能完整读回', async () => {
    const 文件 = await 写入pptx({ 幻灯片: [页()], 定稿: { 时间: '2026-10-06T10:30:00.000Z', 标记人: '张三' } })
    const 压缩包 = await JSZip.loadAsync(文件)
    expect(压缩包.file('docProps/custom.xml')).toBeTruthy()
    expect(await 压缩包.file('[Content_Types].xml').async('string')).toContain('/docProps/custom.xml')
    expect(await 压缩包.file('_rels/.rels').async('string')).toContain('docProps/custom.xml')
    const 读取 = await 读取pptx(文件)
    expect(读取.演示文稿.定稿).toEqual({ 时间: '2026-10-06T10:30:00.000Z', 标记人: '张三' })
    expect(读取.警告).toEqual([])
    expect(读取.演示文稿.幻灯片列表).toHaveLength(1)
  })

  it('没有定稿标记的文稿读回不带定稿字段', async () => {
    const 读取 = await 读取pptx(await 写入pptx({ 幻灯片: [页()] }))
    expect(读取.演示文稿.定稿).toBeUndefined()
  })

  it('重复写入同一文稿两次仍只保留一份定稿属性', async () => {
    const 第一次 = await 读取pptx(await 写入pptx({ 幻灯片: [页()], 定稿: { 时间: '2026-10-06T10:30:00.000Z' } }))
    const 第二次 = await 写入pptx({ 幻灯片: [页()], 定稿: { 时间: '2026-10-07T09:00:00.000Z', 标记人: '李四' } })
    const 压缩包 = await JSZip.loadAsync(第二次)
    const 属性 = await 压缩包.file('docProps/custom.xml').async('string')
    expect(属性.match(/SealOfficeFinalized"/g)).toHaveLength(1)
    expect(第一次.演示文稿.定稿).toEqual({ 时间: '2026-10-06T10:30:00.000Z' })
    expect((await 读取pptx(第二次)).演示文稿.定稿).toEqual({ 时间: '2026-10-07T09:00:00.000Z', 标记人: '李四' })
  })

  it('非法定稿信息拒绝写入并给出真实原因', async () => {
    await expect(写入pptx({ 幻灯片: [页()], 定稿: { 时间: '2026/10/06' } })).rejects.toThrow('定稿时间无效')
    await expect(写入pptx({ 幻灯片: [页()], 定稿: null })).rejects.toThrow('定稿信息无效')
  })
})
