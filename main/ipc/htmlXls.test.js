const { 识别网页型旧版表格 } = require('./htmlXls')
const { 读取兼容文档 } = require('../office/compatibleFormats')

describe('旧版表格实际内容识别', () => {
  it('识别带编码标记的网页报表并保留原文', () => {
    const 原文 = '\uFEFF<html><head><meta charset="UTF-8"></head><body><table><tr><td>0012</td></tr></table></body></html>'
    expect(识别网页型旧版表格(Buffer.from(原文))).toBe(原文)
  })

  it('传统复合文档和普通二进制不误判为网页', () => {
    expect(识别网页型旧版表格(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBeNull()
    expect(识别网页型旧版表格(Buffer.from([0x00, 0x01, 0x02]))).toBeNull()
  })

  it('网页型内容编码损坏时明确拒绝', () => {
    expect(() => 识别网页型旧版表格(Buffer.from([60, 104, 116, 109, 108, 62, 0xff]))).toThrow('编码')
  })

  it('旧版二进制转换入口拒绝误传入的网页报表', async () => {
    await expect(读取兼容文档('xls', Buffer.from('<html><table><tr><td>报表</td></tr></table></html>'))).rejects.toThrow('网页表格')
  })
})
