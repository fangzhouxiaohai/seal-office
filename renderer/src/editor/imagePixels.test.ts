import { describe, expect, it } from 'vitest'
import { 检查裁剪, 裁剪图片像素 } from './imagePixels'

describe('本地裁剪参数与来源', () => {
  it('四边均合法且必须留下有效像素区域', () => {
    expect(() => 检查裁剪({ 左: 25, 上: 10, 右: 25, 下: 0 })).not.toThrow()
    for (const 裁剪 of [{ 左: 50, 上: 0, 右: 50, 下: 0 }, { 左: 0, 上: 60, 右: 0, 下: 40 }, { 左: -1, 上: 0, 右: 0, 下: 0 }, { 左: NaN, 上: 0, 右: 0, 下: 0 }]) expect(() => 检查裁剪(裁剪)).toThrow('裁剪边距')
  })
  it('拒绝访问外部图片，避免在裁剪中丢失原图或因跨域导致空白', async () => {
    await expect(裁剪图片像素('https://example.com/image.png', { 左: 0, 上: 0, 右: 0, 下: 0 })).rejects.toThrow('嵌入正文')
  })
})
