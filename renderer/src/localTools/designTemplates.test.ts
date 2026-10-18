import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { createDesign, designTemplates } from './designTemplates'
import { 构建演示保存模型 } from '../ppt/saveModel'
const require = createRequire(import.meta.url), codec = require('../../../main/office/pptxCodec.js')
it('六类设计有真实可编辑对象，原生PPTX保存重开保持尺寸与文字', async () => {
  for (const template of designTemplates) {
    const deck = createDesign(template.id), size = deck.页面尺寸!, slide = deck.幻灯片列表[0]
    expect(slide.对象列表!.length).toBeGreaterThan(1)
    for (const item of [...slide.对象列表!, ...slide.文本框列表]) { expect(item.x).toBeGreaterThanOrEqual(0); expect(item.y).toBeGreaterThanOrEqual(0); expect(item.x + item.width).toBeLessThanOrEqual(size.宽 + .01); expect(item.y + item.height).toBeLessThanOrEqual(size.高 + .01) }
    const bytes = await codec.写入pptx(构建演示保存模型(deck, [])), read = await codec.读取pptx(bytes)
    expect(read.演示文稿.页面尺寸).toEqual(size)
    expect(read.演示文稿.幻灯片列表[0].文本框列表.map((t: {text:string})=>t.text)).toContain(template.title)
    expect(read.演示文稿.幻灯片列表[0].对象列表.length).toBe(slide.对象列表!.length)
  }
  expect(createDesign('blank',800,1200).页面尺寸).toEqual({宽:800,高:1200})
  expect(() => createDesign('blank',Infinity,800)).toThrow(/尺寸/)
})
