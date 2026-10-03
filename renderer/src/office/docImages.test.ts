import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { 准备图片保存内容, 读取插入图片 } from './docImages'
import { htmlToDocxModel } from '../editor/commands'

const 加载 = createRequire(import.meta.url)
const PNG = readFileSync(加载.resolve('../editor/__fixtures__/office-image.png')).toString('base64')

describe('旧版文档图片保存尺寸', () => {
  it('按浏览器实际显示尺寸保存旧版自适应图片，并同步正文', () => {
    const 根 = document.createElement('div')
    根.innerHTML = `<p><img src="data:image/png;base64,${PNG}" style="max-width:100%"></p>`
    const 图 = 根.querySelector('img')!
    Object.defineProperties(图, { complete: { value: true }, naturalWidth: { value: 160 }, naturalHeight: { value: 80 } })
    const 样式 = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ width: '100px', height: '50px' } as CSSStyleDeclaration)
    try {
      const html = 准备图片保存内容(根)
      expect(html).toBe(根.innerHTML)
      const 段 = htmlToDocxModel(html).段落[0]
      if (段.类型 !== '段落') throw new Error('图片未转换为正文段落')
      expect(段.文字[0].图片).toMatchObject({ 宽: 100, 高: 50 })
      expect(图.style.width).toBe('100px')
      expect(图.style.height).toBe('50px')
    } finally { 样式.mockRestore() }
  })

  it('明确尺寸的图片保留原设置，不读取缩放后的布局尺寸', () => {
    const 根 = document.createElement('div')
    根.innerHTML = `<p><img src="data:image/png;base64,${PNG}" width="120" height="60" style="max-width:100%"></p>`
    const 原文 = 根.innerHTML
    expect(准备图片保存内容(根)).toBe(原文)
  })

  it('图片未加载时明确阻止保存，避免写入假尺寸', () => {
    const 根 = document.createElement('div')
    根.innerHTML = `<p><img src="data:image/png;base64,${PNG}" style="max-width:100%"></p>`
    expect(() => 准备图片保存内容(根)).toThrow('图片尚未加载完成')
    expect(根.querySelector('img')!.hasAttribute('width')).toBe(false)
  })
})

describe('本机图片插入', () => {
  it('文件没有 MIME 类型时依据真实图片内容识别，按正文宽度等比缩小', async () => {
    const 原图像 = window.Image
    const 模拟图像 = class {
      naturalWidth = 160
      naturalHeight = 80
      onload?: () => void
      set src(_值: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('Image', 模拟图像)
    try {
      const 文件 = new File([Buffer.from(PNG, 'base64')], '平面图.png', { type: '' })
      const html = await 读取插入图片(文件, 100)
      expect(html).toContain(`src="data:image/png;base64,${PNG}"`)
      const 段 = htmlToDocxModel(`<p>${html}</p>`).段落[0]
      if (段.类型 !== '段落') throw new Error('图片未转换为正文段落')
      expect(段.文字[0].图片).toMatchObject({ 宽: 100, 高: 50, 说明: '平面图.png' })
    } finally { vi.stubGlobal('Image', 原图像) }
  })
})
