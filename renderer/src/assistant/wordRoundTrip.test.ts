import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from '../editor/commands'
import { 预览文字修改 } from './proposal'
const 加载 = createRequire(import.meta.url)
const { 生成docx } = 加载('../../../main/office/docxWriter.js')
const { 读取docx } = 加载('../../../main/office/docxReader.js')

describe('助手排版修改真实 DOCX 往返', () => {
  it('跨片段改写与排版确认后的文字、字号、黑色、对齐和图片可保存重开', async () => {
    const 图 = readFileSync(加载.resolve('../editor/__fixtures__/office-image.png')).toString('base64')
    const 结果 = 预览文字修改(`<p><strong>旧</strong><span style="color:red">标题</span><img src="data:image/png;base64,${图}" width="120" height="60" alt="测试图片"></p><p>正文</p>`, [
      { 种类: '文字替换', 段落标识: '段落-1', 查找: '旧标题', 替换为: '正式标题' },
      { 种类: '段落排版', 段落标识: '段落-1', 原文: '旧标题', 格式: { 标题级别: 1, 字号: 24, 颜色: '#000000', 对齐: 'center', 加粗: false, 行距: 1.5, 段后: 12 } },
    ])
    let html = 结果
    for (let 次 = 0; 次 < 2; 次++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.未覆盖).toEqual([])
      const 读取 = await 读取docx(await 生成docx(模型))
      expect(读取.警告).toEqual([])
      html = 读取.html
      const 根 = document.createElement('div'); 根.innerHTML = html
      expect(根.textContent).toBe('正式标题正文')
      expect(根.querySelector('h1')?.style.textAlign).toBe('center')
      expect(根.querySelector('img')?.width).toBe(120)
      expect(根.querySelector('img')?.height).toBe(60)
      const 标题 = htmlToDocxModel(html).段落[0]
      if (标题.类型 !== '段落') throw new Error('应保持标题段落')
      expect(标题.文字.filter((项) => 项.文本)).toEqual([expect.objectContaining({ 颜色: '000000', 字号: 24, 加粗: false })])
    }
  })
})
