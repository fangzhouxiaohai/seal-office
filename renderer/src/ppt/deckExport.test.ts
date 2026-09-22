import { describe, it, expect } from 'vitest'
import { 导出为Html预览, 生成演示文件名 } from './deckExport'
import { 创建演示文稿, 添加幻灯片 } from './deck'

describe('演示文稿导出', () => {
  it('为每张幻灯片生成一个区块', () => {
    const 文稿 = 添加幻灯片(添加幻灯片(创建演示文稿()))
    const html = 导出为Html预览(文稿, '演示文稿')
    expect((html.match(/<section/g) ?? []).length).toBe(3)
  })

  it('包含标题、语言声明与幻灯片内容', () => {
    const html = 导出为Html预览(创建演示文稿(), '测试演示')
    expect(html).toContain('<title>测试演示</title>')
    expect(html).toContain('lang="zh-CN"')
    expect(html).toContain('单击此处添加标题')
  })

  it('文本框格式写入内联样式', () => {
    const html = 导出为Html预览(创建演示文稿(), '演示')
    expect(html).toContain('font-size:40px')
    expect(html).toContain('font-weight:600')
  })

  it('无幻灯片时返回空字符串', () => {
    const 文稿 = { ...创建演示文稿(), 幻灯片列表: [] }
    expect(导出为Html预览(文稿, '空')).toBe('')
  })

  it('文本框内容中的 HTML 标签被转义', () => {
    const 文稿 = 创建演示文稿()
    文稿.幻灯片列表[0].文本框列表[0].text = '<b>粗体</b>'
    const html = 导出为Html预览(文稿, '测试')
    expect(html).not.toContain('<b>粗体</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('斜体与下划线写入内联样式', () => {
    const 文稿 = 创建演示文稿()
    文稿.幻灯片列表[0].文本框列表[0].斜体 = true
    文稿.幻灯片列表[0].文本框列表[0].下划线 = true
    const html = 导出为Html预览(文稿, '测试')
    expect(html).toContain('font-style:italic')
    expect(html).toContain('text-decoration:underline')
  })
})

describe('演示文件名', () => {
  it('替换原有扩展名', () => {
    expect(生成演示文件名('未命名演示.pptx', 'html')).toBe('未命名演示.html')
  })

  it('空名称回落默认值', () => {
    expect(生成演示文件名('   ', 'html')).toBe('演示文稿.html')
  })
})
