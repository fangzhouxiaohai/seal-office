import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'

const 加载模块 = createRequire(import.meta.url)
const { 生成docx } = 加载模块('../../../main/office/docxWriter.js')
const { 读取docx } = 加载模块('../../../main/office/docxReader.js')
const JSZip = 加载模块('jszip')

describe('编辑区到真实 DOCX 的段落格式往返', () => {
  it('WPS 常见的字符单位缩进、行单位段距和自动间距属性原样往返', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:pPr>' +
      '<w:ind w:leftChars="100" w:firstLineChars="200"/>' +
      '<w:spacing w:beforeLines="100" w:afterLines="50" w:beforeAutospacing="0" w:afterAutospacing="1"/>' +
      '</w:pPr><w:r><w:t>字符单位正文</w:t></w:r></w:p></w:body></w:document>')
    let 数据 = await 压缩包.generateAsync({ type: 'nodebuffer' })
    for (let 次数 = 0; 次数 < 2; 次数++) {
      const 读取 = await 读取docx(数据)
      expect(读取.警告).toEqual([])
      const 模型 = htmlToDocxModel(净化富文本(读取.html))
      expect(模型.未覆盖).toEqual([])
      expect(模型.段落[0]).toMatchObject({
        缩进: { 左字符: 100, 首行字符: 200 },
        间距: { 段前行: 100, 段后行: 50, 自动段前: false, 自动段后: true },
      })
      数据 = await 生成docx(模型)
      const 文件 = await JSZip.loadAsync(数据)
      const xml = await 文件.file('word/document.xml').async('string')
      expect(xml).toContain('w:firstLineChars="200"')
      expect(xml).toContain('w:beforeLines="100"')
      expect(xml).toContain('w:afterAutospacing="1"')
    }
  })

  it('修改导入的字符缩进后，新排版覆盖来源元数据', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:pPr><w:ind w:firstLineChars="200"/></w:pPr><w:r><w:t>正文</w:t></w:r></w:p></w:body></w:document>')
    const 读取 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    const 容器 = document.createElement('div')
    容器.innerHTML = 净化富文本(读取.html)
    容器.querySelector('p')!.style.textIndent = '24pt'
    const 模型 = htmlToDocxModel(容器.innerHTML)
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落[0]).toMatchObject({ 缩进: { 首行: 480 } })
    const 文件 = await JSZip.loadAsync(await 生成docx(模型))
    const xml = await 文件.file('word/document.xml').async('string')
    expect(xml).toContain('w:firstLine="480"')
    expect(xml).not.toContain('w:firstLineChars')
  })

  it('编辑段前距后删除对应原生行单位和自动属性，其余排版仍保留', async () => {
    const 读取 = await 读取docx(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '正文' }],
      缩进: { 左: 360, 左字符: 100, 首行字符: 200 },
      间距: { 段前: 120, 段前行: 100, 自动段前: true, 段后行: 50, 自动段后: false },
    }] }))
    const 容器 = document.createElement('div')
    容器.innerHTML = 净化富文本(读取.html)
    容器.querySelector('p')!.style.marginTop = '24pt'
    const 模型 = htmlToDocxModel(容器.innerHTML)
    expect(模型.未覆盖).toEqual([])
    expect(模型.段落[0]).toMatchObject({ 缩进: { 左: 360, 左字符: 100, 首行字符: 200 }, 间距: { 段前: 480, 段后行: 50, 自动段后: false } })
    const 文件 = await JSZip.loadAsync(await 生成docx(模型))
    const xml = await 文件.file('word/document.xml').async('string')
    expect(xml).toContain('w:before="480"')
    expect(xml).not.toContain('w:beforeLines')
    expect(xml).not.toContain('w:beforeAutospacing')
    expect(xml).toContain('w:afterAutospacing="0"')
  })

  it('损坏的来源排版明确报告，不能掩盖为可保存文档', () => {
    const 来源 = JSON.stringify({ 样式: 'text-indent:2em', 缩进: { 首行字符: '200' } })
    const 段 = document.createElement('p')
    段.textContent = '正文'
    段.style.textIndent = '2em'
    段.dataset.sealParagraphFormat = 来源
    expect(htmlToDocxModel(段.outerHTML).未覆盖).toContain('段落来源排版数据无效')
  })

  it('WPS 带类型的软回车与回车标签保留段内换行', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>第一行</w:t><w:br w:type="textWrapping"/><w:t>第二行</w:t><w:cr/><w:t>第三行</w:t></w:r></w:p></w:body></w:document>')
    const 读取 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(读取.警告).toEqual([])
    const 模型 = htmlToDocxModel(净化富文本(读取.html))
    expect(模型.段落).toHaveLength(1)
    const 段 = 模型.段落[0]
    if (段.类型 !== '段落') throw new Error('软回车应位于文本段落内')
    expect(段.文字.filter((片) => 片.换行)).toHaveLength(2)
    const 重开 = await 读取docx(await 生成docx(模型))
    expect(重开.html.match(/<br>/g)).toHaveLength(2)
  })

  it('备案文字的缩进、段距、行距和署名对齐连续保存两次仍保留', async () => {
    let html = '<h1 style="text-align:center;margin-bottom:18pt">备案承诺书</h1>' +
      '<p style="font-size:16pt;font-family:宋体;text-indent:2em;margin-top:6pt;margin-bottom:12pt;line-height:1.5">备案正文</p>' +
      '<p style="text-align:right;line-height:24px">公司署名</p>' +
      '<p data-seal-line-rule="atLeast" style="line-height:18pt">最小行距正文</p>'
    for (let 次数 = 0; 次数 < 2; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.未覆盖).toEqual([])
      const 结果 = await 读取docx(await 生成docx(模型))
      expect(结果.警告).toEqual([])
      html = 净化富文本(结果.html)
      const 重开模型 = htmlToDocxModel(html)
      expect(重开模型.未覆盖).toEqual([])
      expect(重开模型.段落[1]).toMatchObject({ 缩进: { 首行: 640 }, 间距: { 段前: 120, 段后: 240, 行距: 360, 行距规则: 'auto' } })
      expect(重开模型.段落[2]).toMatchObject({ 对齐: '右', 间距: { 行距: 360, 行距规则: 'exact' } })
      expect(重开模型.段落[3]).toMatchObject({ 间距: { 行距: 360, 行距规则: 'atLeast' } })
    }
  })

  it('工具栏缩进、列表行距、软回车、上标下标与表格段落共同保存', async () => {
    const 模型 = htmlToDocxModel('<blockquote style="margin:0 0 0 40px;border:none;padding:0"><p style="line-height:1.5">缩进正文<br>第二行 m<sup>2</sup> H<sub>2</sub>O</p></blockquote>' +
      '<ul><li style="margin-bottom:8pt;line-height:2">列表条目</li></ul>' +
      '<table><tr><td><p style="text-align:right;text-indent:24pt;line-height:1.5">表内正文</p><p style="margin-top:12pt">表内第二段</p></td></tr></table>')
    expect(模型.未覆盖).toEqual([])
    const 结果 = await 读取docx(await 生成docx(模型))
    expect(结果.警告).toEqual([])
    const 重开模型 = htmlToDocxModel(净化富文本(结果.html))
    expect(重开模型.未覆盖).toEqual([])
    expect(重开模型.段落[0]).toMatchObject({ 缩进: { 左: 600 }, 文字: expect.arrayContaining([
      expect.objectContaining({ 换行: true }), expect.objectContaining({ 基线: '上标' }), expect.objectContaining({ 基线: '下标' }),
    ]) })
    expect(重开模型.段落[1]).toMatchObject({ 列表: '项目符号', 间距: { 段后: 160, 行距: 480, 行距规则: 'auto' } })
    expect(重开模型.段落[2]).toMatchObject({ 行: [[{ 段落: [
      expect.objectContaining({ 对齐: '右', 缩进: { 首行: 480 } }), expect.objectContaining({ 间距: { 段前: 240 } }),
    ] }]] })
  })
})
