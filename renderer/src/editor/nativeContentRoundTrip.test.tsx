import { createRequire } from 'node:module'
import fs from 'node:fs'
import { fireEvent, render, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { 生成图表Svg, 生成公式Html, 生成SmartArtHtml, 公式模板列表 } from './graphics'
import { 生成批注, 提取批注 } from './review'
import { revisionElement } from './trackedEditing'
import { insertDocumentNote } from './notes'
import EditorCanvas from './EditorCanvas'
import { 净化富文本 } from './sanitizeHtml'
import { 写出办公文档 } from '../office/writeDocument'
import { 读取本地文件内容 } from '../fileOpen'

const require = createRequire(import.meta.url), codec = require('../../../main/office/sealFormat.js')
const original = window.electronAPI
afterEach(() => { cleanup(); window.electronAPI = original })
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html').body

function actualContent() {
  const root = document.createElement('div')
  const image = fs.readFileSync(require.resolve('./__fixtures__/office-image.png')).toString('base64')
  root.innerHTML = '<p>原生正文𠮷🦭 العربية e\u0301</p>' +
    (['柱形图', '折线图', '饼图'] as const).map(type => `<div class="wps-chart" contenteditable="false">${生成图表Svg(type, { 类别: ['项目𠮷', '第二项'], 数值: [12, 25] })}</div>`).join('') +
    公式模板列表.map(template => 生成公式Html(template.键)).join('') +
    (['流程', '层级', '循环'] as const).map(type => 生成SmartArtHtml(type, ['开始𠮷', '结束🦭'])).join('') +
    '<div style="width:160px;height:80px;border:1.6px solid #2B6CF6;border-radius:6px"></div>' +
    '<div style="border:1px solid #E8EBF0;padding:8px 10px;border-radius:6px">文本框内容</div>' +
    `<p><img src="data:image/png;base64,${image}" style="width:320px;height:180px" alt="原始内嵌图片𠮷"></p>` +
    '<table><tbody><tr><td rowspan="2">合并</td><td>数字00123</td></tr><tr><td>换行<br>内容</td></tr></tbody></table>' +
    '<div class="wps-page-break"></div>' + 生成批注(3, '保留批注𠮷与引号"')
  const identity = { id: '12', author: '编辑作者𠮷', date: '2026-10-21T10:00:00Z' }
  for (const type of ['ins', 'del'] as const) { const node = revisionElement(type, identity); node.textContent = `${type} 修订🦭`; root.append(node) }
  // Imported complex DOCX provenance is opaque content stored on ordinary HTML
  // markers. Native save must retain it without decoding or executing it.
  const provenance = document.createElement('span')
  provenance.dataset.sealDocxPackage = Buffer.from('opaque-original-ooxml').toString('base64')
  provenance.dataset.sealRevisionCatalog = encodeURIComponent(JSON.stringify([{ 标识: '12', 作者: identity.author }]))
  provenance.hidden = true; provenance.setAttribute('contenteditable', 'false'); root.prepend(provenance)
  const noteRoot = document.createElement('div'); noteRoot.innerHTML = '<p>正文注释位置</p>'
  insertDocumentNote(noteRoot, 'footnote', '脚注𠮷\n第二行', null)
  root.append(...Array.from(noteRoot.childNodes))
  return root.innerHTML
}

it('实际生成的图表在 EditorCanvas 输入与真实 .sldoc 反复保存重开后保留全部 SVG 几何、文字、资源及审阅标记', async () => {
  const source = actualContent(), expected = parse(source)
  const files = new Map<string, string>(), converted = vi.fn()
  window.electronAPI = {
    readFile: async (path: string) => ({ 成功: true, 内容: files.get(path), 扩展名: 'sldoc', 二进制: true }),
    office: {
      writeDocx: converted,
      writeSeal: async (type: string, value: unknown) => ({ 成功: true, 数据: (await codec.writeSeal(type, value)).toString('base64') }),
      readSeal: async (extension: string, data: string) => ({ 成功: true, ...await codec.readSeal(extension, Buffer.from(data, 'base64')) }),
    },
  } as any
  let html = source
  const header = { 页眉Html: `<p>页眉𠮷</p>${生成图表Svg('折线图', { 类别: ['页眉图'], 数值: [10] })}`, 页脚Html: '<p><span data-seal-field="PAGE" contenteditable="false">1</span>页脚🦭</p>' }
  for (let round = 0; round < 3; round++) {
    const onChange = vi.fn(), canvas = render(<EditorCanvas html={html} headerHtml={header.页眉Html} footerHtml={header.页脚Html} onChange={onChange} />)
    const body = canvas.container.querySelector<HTMLElement>('.wps-editor-canvas__content')!
    expect(body.querySelectorAll('svg')).toHaveLength(3)
    fireEvent.input(body)
    const edited = onChange.mock.calls[onChange.mock.calls.length - 1][0] as string
    const path = 'private:/完整原生内容.sldoc'
    const output = await 写出办公文档('word', path, {}, undefined, { html: edited, 页面设置: header })
    files.set(path, output.数据)
    const opened = await 读取本地文件内容(path)
    html = opened.内容!
    const actual = parse(html)
    expect([...actual.querySelectorAll('svg')].map(node => node.outerHTML)).toEqual([...expected.querySelectorAll('svg')].map(node => node.outerHTML))
    for (const selector of ['.wps-formula', '.wps-smartart', '[data-seal-revision-type]', '[data-seal-docx-package]', '[data-seal-revision-catalog]', '[data-seal-note-ref]', '[data-seal-notes]', '.wps-page-break', 'img', 'table']) {
      expect([...actual.querySelectorAll(selector)].map(node => node.outerHTML)).toEqual([...expected.querySelectorAll(selector)].map(node => node.outerHTML))
    }
    expect(提取批注(html)).toEqual([{ 编号: 3, 内容: '保留批注𠮷与引号"' }])
    expect(actual.textContent).toBe(expected.textContent)
    expect(opened.页面设置?.页眉Html).toBe(parse(header.页眉Html).innerHTML)
    expect(opened.页面设置?.页脚Html).toBe(header.页脚Html)
    canvas.unmount()
  }
  expect(converted).not.toHaveBeenCalled()
})

it('保留静态图形不启用 SVG 脚本、动画、foreignObject、外部引用或事件处理', () => {
  const clean = 净化富文本('<div>正文</div><svg xmlns="http://www.w3.org/2000/svg" onload="evil()"><script>evil()</script><foreignObject><iframe src="javascript:evil()"></iframe></foreignObject><use href="javascript:evil()"></use><animate attributeName="href" values="javascript:evil()" onbegin="evil()"></animate><rect x="1" y="2" width="10" height="20" fill="#2b6cf6" onclick="evil()"></rect><text x="1" y="30">安全图表</text></svg><input value="交互控件"><img src="x" onerror="evil()">')
  const body = parse(clean)
  expect(body.querySelectorAll('svg rect')).toHaveLength(1)
  expect(body.querySelector('svg text')?.textContent).toBe('安全图表')
  expect(body.querySelector('script,foreignObject,iframe,use,animate,input')).toBeNull()
  expect(clean).not.toMatch(/onload|onclick|onerror|onbegin|javascript:|evil\(\)/i)
})
