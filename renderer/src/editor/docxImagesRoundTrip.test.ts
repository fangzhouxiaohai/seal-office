import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'

const 加载 = createRequire(import.meta.url)
const { 生成docx } = 加载('../../../main/office/docxWriter.js')
const { 读取docx } = 加载('../../../main/office/docxReader.js')
const JSZip = 加载('jszip')
const PNG = readFileSync(加载.resolve('./__fixtures__/office-image.png'))
const JPEG = readFileSync(加载.resolve('./__fixtures__/office-image.jpg'))
const 图片 = (数据: Buffer, 类型: string, 属性 = '') => `<img src="data:image/${类型};base64,${数据.toString('base64')}" ${属性}>`

describe('文档图片真实 DOCX 往返', () => {
  it('正文中两张不同格式的图片按原顺序、尺寸与说明连续保存重开', async () => {
    let html = `<p style="text-align:center">前文${图片(PNG, 'png', 'width="120" height="60" alt="平面图 &amp; 示意"')}` +
      `中间文字${图片(JPEG, 'jpeg', 'style="width:40px;height:60px" alt="示意照片"')}后文</p>`
    for (let 次数 = 0; 次数 < 2; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.未覆盖).toEqual([])
      const 数据 = await 生成docx(模型)
      const 包 = await JSZip.loadAsync(数据)
      const 媒体 = Object.keys(包.files).filter((名) => /^word\/media\/.*\.(png|jpe?g)$/.test(名))
      expect(媒体).toHaveLength(2)
      expect(媒体.some((名) => 名.endsWith('.jpg') || 名.endsWith('.jpeg'))).toBe(true)
      const 读取 = await 读取docx(数据)
      expect(读取.警告).toEqual([])
      html = 净化富文本(读取.html)
      const 容器 = document.createElement('div')
      容器.innerHTML = html
      const 图 = 容器.querySelectorAll('img')
      expect(图).toHaveLength(2)
      expect(图[0].getAttribute('src')).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
      expect(图[1].getAttribute('src')).toBe(`data:image/jpeg;base64,${JPEG.toString('base64')}`)
      expect(图[0].width).toBe(120)
      expect(图[0].height).toBe(60)
      expect(图[0].alt).toBe('平面图 & 示意')
      expect(图[1].width).toBe(40)
      expect(图[1].height).toBe(60)
      expect(容器.querySelector('p')!.style.textAlign).toBe('center')
      expect(容器.querySelector('p')!.childNodes[0].textContent).toContain('前文')
      expect(容器.querySelector('p')!.textContent).toBe('前文中间文字后文')
    }
  })

  it('表格内图片与多段正文可保存，图片单独成段时不增加空行', async () => {
    const 模型 = htmlToDocxModel(`<p>${图片(PNG, 'png')}</p><table><tr><td><p>表内前文${图片(JPEG, 'jpeg', 'width="20"')}</p><p>表内后文</p></td></tr></table>`)
    expect(模型.未覆盖).toEqual([])
    const 读取 = await 读取docx(await 生成docx(模型))
    expect(读取.警告).toEqual([])
    const 容器 = document.createElement('div')
    容器.innerHTML = 净化富文本(读取.html)
    expect(容器.querySelectorAll('img')).toHaveLength(2)
    expect(容器.querySelector('table img')!.getAttribute('height')).toBe('30')
    expect(容器.querySelector('table')!.textContent).toBe('表内前文表内后文')
    expect(容器.firstElementChild!.querySelector('img')!.getAttribute('width')).toBe('160')
  })

  it('修改导入图片尺寸后保存采用新尺寸', async () => {
    const 读取 = await 读取docx(await 生成docx(htmlToDocxModel(`<p>${图片(PNG, 'png')}</p>`)))
    const 容器 = document.createElement('div')
    容器.innerHTML = 净化富文本(读取.html)
    容器.querySelector('img')!.style.width = '96px'
    容器.querySelector('img')!.style.height = '48px'
    const 重开 = await 读取docx(await 生成docx(htmlToDocxModel(容器.innerHTML)))
    容器.innerHTML = 重开.html
    expect(容器.querySelector('img')!.width).toBe(96)
    expect(容器.querySelector('img')!.height).toBe(48)
  })

  it.each([
    '<img src="https://example.com/pic.png">',
    '<img src="data:image/png;base64,AAAA">',
    '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
  ])('未嵌入或无效图片明确报告，不伪装可保存：%s', (html) => {
    expect(htmlToDocxModel(`<p>${html}</p>`).未覆盖.length).toBeGreaterThan(0)
  })
})
