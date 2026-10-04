import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { 调整图片尺寸, 对齐图片, 移动图片到选区 } from './imageEditing'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'

const 加载模块 = createRequire(import.meta.url)
const 图片数据 = 加载模块('node:fs').readFileSync(加载模块.resolve('./__fixtures__/office-image.png')).toString('base64')
const { 生成docx } = 加载模块('../../../main/office/docxWriter.js')
const { 读取docx } = 加载模块('../../../main/office/docxReader.js')

function 文档(html = `<p>前文<strong><img src="data:image/png;base64,${图片数据}" width="120" height="80" alt="插图">后文</strong></p><p>目标段落</p>`) {
  const 根 = document.createElement('div')
  根.innerHTML = html
  const 图 = 根.querySelector('img')!
  return { 根, 图 }
}

describe('图片尺寸和正文位置', () => {
  it('精确尺寸写入图片，非法尺寸不留下部分修改', () => {
    const { 图 } = 文档()
    调整图片尺寸(图, 240, 160)
    expect(图.style.width).toBe('240px')
    expect(图.style.height).toBe('160px')
    const 原文 = 图.outerHTML
    for (const [宽, 高] of [[0, 160], [240, NaN], [Infinity, 160], [240, 32769]]) {
      expect(() => 调整图片尺寸(图, 宽, 高)).toThrow('图片尺寸')
      expect(图.outerHTML).toBe(原文)
    }
  })

  it('图片独立居中时拆分前后段落，保留原有文字格式', () => {
    const { 根, 图 } = 文档()
    对齐图片(根, 图, 'center')
    expect([...根.children].map(段 => 段.textContent)).toEqual(['前文', '', '后文', '目标段落'])
    expect(图.parentElement?.style.textAlign).toBe('center')
    expect(根.children[2].querySelector('strong')).toHaveTextContent('后文')
    expect(根.querySelectorAll('img')).toHaveLength(1)
  })

  it('移动到正文目标字符位置不复制图片，正文外目标拒绝修改', () => {
    const { 根, 图 } = 文档()
    const 范围 = document.createRange()
    范围.setStart(根.lastElementChild!.firstChild!, 2)
    范围.collapse(true)
    移动图片到选区(根, 图, 范围)
    expect(根.lastElementChild!.childNodes[0].textContent).toBe('目标')
    expect(根.lastElementChild!.childNodes[1]).toBe(图)
    expect(根.querySelectorAll('img')).toHaveLength(1)
    const 外部 = document.createElement('p')
    外部.textContent = '外部'
    范围.selectNodeContents(外部)
    const 原文 = 根.innerHTML
    expect(() => 移动图片到选区(根, 图, 范围)).toThrow('正文')
    expect(根.innerHTML).toBe(原文)
  })

  it('单元格内没有段落包装的图片也可独立对齐，不破坏表格', () => {
    const { 根, 图 } = 文档(`<table><tr><td>前文<strong><img src="data:image/png;base64,${图片数据}" width="120" height="80">后文</strong></td></tr></table>`)
    对齐图片(根, 图, 'right')
    expect(根.querySelectorAll('td')).toHaveLength(1)
    expect(图.parentElement?.tagName).toBe('P')
    expect(图.parentElement?.parentElement?.tagName).toBe('TD')
    expect(图.parentElement?.style.textAlign).toBe('right')
    expect(根.querySelector('td')?.textContent).toBe('前文后文')
    expect(htmlToDocxModel(根.innerHTML).未覆盖).toEqual([])
  })

  it('尺寸、居中位置、原始媒体和相邻正文连续保存重开仍保留', async () => {
    const { 根, 图 } = 文档()
    调整图片尺寸(图, 240, 160)
    对齐图片(根, 图, 'center')
    let html = 根.innerHTML
    for (let 次数 = 0; 次数 < 2; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.未覆盖).toEqual([])
      expect(模型.段落[1]).toMatchObject({ 对齐: '中', 文字: [expect.objectContaining({ 图片: { 数据: 图片数据, 格式: 'png', 宽: 240, 高: 160, 说明: '插图' } })] })
      const 重开 = await 读取docx(await 生成docx(模型))
      expect(重开.警告).toEqual([])
      html = 净化富文本(重开.html)
      expect(html).toContain('前文')
      expect(html).toContain('后文')
    }
  })
})
