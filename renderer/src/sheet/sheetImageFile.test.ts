import { describe, expect, it } from 'vitest'
import { 准备图片数据 } from './sheetImageFile'

const 图片数据 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg=='), (字符) => 字符.charCodeAt(0))

describe('本机图片导入校验', () => {
  it('只接受签名与扩展名一致的 PNG，并按比例限制显示尺寸', () => {
    expect(准备图片数据('图像.png', 'image/png', 图片数据)).toMatchObject({ 格式: 'png', 宽: 1, 高: 1 })
    expect(() => 准备图片数据('伪装.jpg', 'image/jpeg', 图片数据)).toThrow('图片格式')
    expect(() => 准备图片数据('伪装.png', 'image/png', new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toThrow('图片格式')
  })

  it('拒绝超过上限或过大像素尺寸，防止保存与解码占用过多内存', () => {
    expect(() => 准备图片数据('过大.png', 'image/png', new Uint8Array(5 * 1024 * 1024 + 1))).toThrow('5 MB')
    const 巨大尺寸 = new Uint8Array(图片数据)
    巨大尺寸.set([0, 0, 32, 0], 16)
    巨大尺寸.set([0, 0, 32, 0], 20)
    expect(() => 准备图片数据('巨大.png', 'image/png', 巨大尺寸)).toThrow('像素')
  })
})
