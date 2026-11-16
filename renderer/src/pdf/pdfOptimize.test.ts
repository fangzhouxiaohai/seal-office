import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { 优化PDF大图, 缩放像素, 面积阈值, 目标最长边 } from './pdfOptimize'

/** jsdom 环境缺少 Web Streams，用 Node 自带实现补齐，测试真实解压与压缩路径 */
async function 补齐流接口() {
  if (typeof globalThis.DecompressionStream === 'undefined') {
    const 流模块 = await import('node:stream/web')
    globalThis.DecompressionStream = 流模块.DecompressionStream as unknown as typeof DecompressionStream
    globalThis.CompressionStream = 流模块.CompressionStream as unknown as typeof CompressionStream
  }

}

async function 压缩(数据: Uint8Array): Promise<Uint8Array> {
  const 转换 = new CompressionStream('deflate')
  const 写入 = 转换.writable.getWriter()
  const 完成 = 写入.write(数据 as unknown as BufferSource).then(() => 写入.close())
  const 读取 = 转换.readable.getReader()
  const 块: Uint8Array[] = []
  let 总数 = 0
  for (;;) {
    const { done, value } = await 读取.read()
    if (done) break
    if (value) { 块.push(value); 总数 += value.length }
  }
  await 完成
  const 结果 = new Uint8Array(总数)
  let 偏移 = 0
  for (const 一块 of 块) { 结果.set(一块, 偏移); 偏移 += 一块.length }
  return 结果
}
/** 构造一张纯灰位图页：宽 8200、高 3000，超过面积阈值且最长边超过目标宽度 */
async function 构造大图PDF(): Promise<Uint8Array> {
  const 文档 = await PDFDocument.create()
  const 页 = 文档.addPage([595, 842])
  const 宽 = 8200, 高 = Math.ceil(面积阈值 / 宽) + 10
  const 像素 = new Uint8Array(宽 * 高).fill(0x80)
  const 压缩数据 = await 压缩(像素)
  const 字典 = 文档.context.obj({})
  字典.set(PDFName.of('Type'), PDFName.of('XObject'))
  字典.set(PDFName.of('Subtype'), PDFName.of('Image'))
  字典.set(PDFName.of('Width'), 文档.context.obj(宽))
  字典.set(PDFName.of('Height'), 文档.context.obj(高))
  字典.set(PDFName.of('ColorSpace'), PDFName.of('DeviceGray'))
  字典.set(PDFName.of('BitsPerComponent'), 文档.context.obj(8))
  字典.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  const 流 = PDFRawStream.of(字典, 压缩数据)
  const 引用 = 文档.context.register(流)
  const 资源 = 页.node.Resources(); if (资源) 资源.set(PDFName.of('XObject'), 文档.context.obj({ 大图: 引用 }))
  const 内容 = 文档.context.stream('q 595 0 0 842 0 0 cm /大图 Do Q')
  页.node.set(PDFName.of('Contents'), 文档.context.register(内容))
  return 文档.save({ useObjectStreams: false })
}

describe('PDF 超大位图优化', () => {
  it('普通小图 PDF 原样返回，不做无谓重写', async () => {
    await 补齐流接口()
    const 文档 = await PDFDocument.create()
    文档.addPage([595, 842])
    const 原数据 = await 文档.save()
    const 结果 = await 优化PDF大图(原数据)
    expect(结果.已优化).toBe(false)
    expect(结果.数据).toBe(原数据)
  })

  it('超过位图上限的整页图片按整数因子等比缩小并保留页面尺寸', async () => {
    await 补齐流接口()
    const 原数据 = await 构造大图PDF()
    const 结果 = await 优化PDF大图(原数据)
    expect(结果.错误).toBeUndefined()
    expect(结果.已优化).toBe(true)
    expect(结果.条目).toHaveLength(1)
    const 条目 = 结果.条目[0]
    expect(条目.原宽).toBe(8200)
    expect(条目.新宽).toBeLessThanOrEqual(目标最长边)
    expect(Math.abs(条目.原宽 / 条目.原高 - 条目.新宽 / 条目.新高)).toBeLessThan(0.01)
    // 页面尺寸与内容流保持不变，只是位图分辨率降低
    const 优化后 = await PDFDocument.load(结果.数据)
    expect(优化后.getPageCount()).toBe(1)
    expect(优化后.getPage(0).getWidth()).toBeCloseTo(595, 2)
    // 再次优化应直接返回原样，避免重复解码
    const 再次 = await 优化PDF大图(结果.数据)
    expect(再次.已优化).toBe(false)
  }, 120000)

  it('缩放像素按盒式平均降低分辨率，尺寸按整数因子收敛', () => {
    const 宽 = 8, 高 = 6, 通道 = 1
    const 像素 = new Uint8Array(宽 * 高)
    for (let y = 0; y < 高; y += 1) for (let x = 0; x < 宽; x += 1) 像素[y * 宽 + x] = x < 4 ? 0 : 255
    const 结果 = 缩放像素(像素, 宽, 高, 通道, 2)
    expect(结果.新宽).toBe(4)
    expect(结果.新高).toBe(3)
    expect(结果.数据[0]).toBe(0)
    expect(结果.数据[3]).toBe(255)
  })
})
