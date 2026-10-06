const { 注册演示通道 } = require('./presentationChannel')
const { 创建资源存储 } = require('../ppt/resources')
const { 写入pptx } = require('../office/pptxCodec')
const fs = require('fs')
const os = require('os')
const path = require('path')

const 页 = () => ({ id: '页一', title: '页一', 背景色: '#FFFFFF', 文本框: [{ id: '页一-文字', text: '内容', x: 40, y: 40, width: 300, height: 60, 字号: 20 }] })
const 批注 = (id, 覆盖 = {}) => ({ id, 页标识: '页一', 作者: '甲', 内容: '请核对', 时间: '2026-10-06T10:00:00.000Z', ...覆盖 })

const 写文件 = async (名称, 模型) => {
  const 目录 = fs.mkdtempSync(path.join(process.env.TEMP ?? os.tmpdir(), 'seal-review-compare-'))
  const 路径 = path.join(目录, 名称)
  fs.writeFileSync(路径, await 写入pptx(模型))
  return 路径
}

it('比对通道必须把批注差异一起返回，不能只返回页面差异', async () => {
  const 甲 = await 写文件('甲.pptx', { 幻灯片: [页()], 批注列表: [批注('批甲')] })
  const 乙 = await 写文件('乙.pptx', { 幻灯片: [页()], 批注列表: [批注('批甲', { 已解决: true }), 批注('批乙', { 内容: '新增批注' })] })
  const 处理 = new Map()
  注册演示通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, 创建资源存储())
  const 结果 = await 处理.get('presentation.compareFiles')(null, 甲, 乙)
  expect(结果.成功).toBe(true)
  const 全部 = [...(结果.页面 ?? []).flatMap(项 => 项.差异 ?? []), ...(结果.批注?.差异 ?? [])]
  expect(全部.some(项 => 项.类型 === '批注')).toBe(true)
  expect(结果.批注?.数量).toBeGreaterThan(0)
})
