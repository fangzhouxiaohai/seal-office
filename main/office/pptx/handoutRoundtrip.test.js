const JSZip = require('jszip')
const { 写入pptx, 读取pptx } = require('../pptxCodec')

const 文稿 = (覆盖 = {}) => ({
  幻灯片: [{ id: '页', 背景色: '#FFFFFF', 备注: '备注内容', 文本框: [{ id: '文字', text: '正文', x: 0, y: 0, width: 100, height: 40, 字号: 18 }] }],
  ...覆盖,
})

describe('讲义与备注母版设置随 PPTX 往返', () => {
  it('写入讲义设置与备注设置后可读回，且原生部件真实存在', async () => {
    const 字节 = await 写入pptx(文稿({
      讲义设置: { 每页张数: 4, 页眉: '培训讲义', 页脚: '第 <页码> 页', 显示日期: true, 显示页码: true },
      备注设置: { 排版: '幻灯片加备注', 页眉: '备注页眉', 页脚: '', 显示日期: false, 显示页码: true },
    }))
    const 压缩包 = await JSZip.loadAsync(字节)
    expect(压缩包.file('ppt/handoutMasters/handoutMaster1.xml')).toBeTruthy()
    expect(await 压缩包.file('ppt/notesMasters/notesMaster1.xml').async('string')).toContain('<p:hf')
    const 读取 = await 读取pptx(字节)
    expect(读取.警告).toEqual([])
    expect(读取.演示文稿.讲义设置).toEqual({ 每页张数: 4, 页眉: '培训讲义', 页脚: '第 <页码> 页', 显示日期: true, 显示页码: true })
    expect(读取.演示文稿.备注设置).toMatchObject({ 排版: '幻灯片加备注', 页眉: '备注页眉', 显示日期: false, 显示页码: true })
    expect(读取.演示文稿.幻灯片列表[0].备注).toBe('备注内容')
  })

  it('没有母版设置时读回不带这些字段', async () => {
    const 读取 = await 读取pptx(await 写入pptx(文稿()))
    expect(读取.演示文稿.讲义设置).toBeUndefined()
    expect(读取.演示文稿.备注设置).toBeUndefined()
  })

  it('非法讲义设置拒绝写入并给出真实原因', async () => {
    await expect(写入pptx(文稿({ 讲义设置: { 每页张数: 5, 页眉: '', 页脚: '', 显示日期: false, 显示页码: true } }))).rejects.toThrow('讲义每页张数')
    await expect(写入pptx(文稿({ 备注设置: { 排版: '随便', 页眉: '', 页脚: '', 显示日期: false, 显示页码: true } }))).rejects.toThrow('备注排版')
  })
})
