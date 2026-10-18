import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTrackedInput, installTrackedEditing, nextRevision } from './trackedEditing'
import { htmlToDocxModel } from './commands'
import { 接受修订, 拒绝修订 } from './review'
const load = createRequire(import.meta.url), JSZip = load('jszip'), { 生成docx } = load('../../../main/office/docxWriter'), { 读取docx } = load('../../../main/office/docxReader')
const identity = { id: '15', author: '审阅甲', date: '2026-10-18T10:00:00Z' }
function root(html: string) { const element = document.createElement('div'); element.innerHTML = html; document.body.appendChild(element); return element }
function select(start: Node, offset: number, end = start, endOffset = offset) { const range = document.createRange(); range.setStart(start, offset); range.setEnd(end, endOffset); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range) }
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })
describe('真实输入修订与原生段落历史', () => {
  it('最大原生修订ID和仅在源包目录中的ID不阻止新增合法历史，也不复用旧ID', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const element = root('<p><span data-seal-revision-id="2147483647">旧历史</span>正文</p>'), source = document.createElement('span'); source.hidden = true; source.dataset.sealRevisionCatalog = encodeURIComponent(JSON.stringify([{ 标识: '101', 部件: 'word/header1.xml' }])); element.prepend(source)
    const stamp = nextRevision(element, '新作者'); expect(stamp.id).toBe('102')
    select(element.querySelector('p')!.lastChild!, 2); expect(applyTrackedInput(element, 'insertText', '新历史', stamp).changed).toBe(true)
    const reopened = await 读取docx(await 生成docx(htmlToDocxModel(element.innerHTML))); expect(reopened.html).toContain('新历史'); expect(reopened.html).toContain('data-seal-revision-id="102"')
  })
  it('替换带格式文字同时保存插入和删除，作者时间和原字符样式保留', async () => {
    const element = root('<p>原<b>文字</b>尾</p>'); select(element.querySelector('b')!.firstChild!, 0, element.querySelector('b')!.firstChild!, 2)
    expect(applyTrackedInput(element, 'insertText', '新内容', identity).changed).toBe(true)
    expect(element.querySelector('.wps-delete b') || element.querySelector('b .wps-delete')).toBeTruthy()
    const zip = await JSZip.loadAsync(await 生成docx(htmlToDocxModel(element.innerHTML))), xml = await zip.file('word/document.xml').async('string')
    expect(xml).toMatch(/<w:del[^>]*w:author="审阅甲"/); expect(xml).toContain('<w:delText'); expect(xml).toContain('新内容')
    expect(接受修订(element.innerHTML).文本).not.toContain('文字'); expect(拒绝修订(element.innerHTML).文本).not.toContain('新内容')
  })
  it('Enter按原生段落标记保存，拒绝后重新合并原段落，接受后保留拆段', async () => {
    const element = root('<p>前文后文</p>'); select(element.firstElementChild!.firstChild!, 2)
    expect(applyTrackedInput(element, 'insertParagraph', '', identity).changed).toBe(true)
    expect(element.querySelectorAll('p')).toHaveLength(2)
    const bytes = await 生成docx(htmlToDocxModel(element.innerHTML)), zip = await JSZip.loadAsync(bytes), xml = await zip.file('word/document.xml').async('string')
    expect(xml).toMatch(/<w:pPr>[\s\S]*?<w:rPr>[\s\S]*?<w:ins w:id="15"/)
    const read = await 读取docx(bytes); expect(read.html).toContain('data-seal-paragraph-revision')
    for (const 操作 of ['accept', 'reject']) { const model = htmlToDocxModel(read.html, read.页面设置); model.修订动作 = [{ 标识: '15', 操作: 操作 as any }]; const saved = await 读取docx(await 生成docx(model)); const box = root(saved.html); expect(box.querySelectorAll('p')).toHaveLength(操作 === 'accept' ? 2 : 1); expect(box.textContent).toBe('前文后文') }
    expect(root(拒绝修订(element.innerHTML).文本).querySelectorAll('p')).toHaveLength(1)
  })
  it('跨三段删除/替换保留各段原文字和段落删除历史，接受后得到替换后的单段', async () => {
    const element = root('<p>甲前<b>删除一</b></p><p><i>删除二</i></p><p>删除三乙后</p>'); const paragraphs = element.querySelectorAll('p')
    select(paragraphs[0].firstChild!, 2, paragraphs[2].firstChild!, 3)
    expect(applyTrackedInput(element, 'insertText', '新', identity).changed).toBe(true)
    const bytes = await 生成docx(htmlToDocxModel(element.innerHTML)), read = await 读取docx(bytes)
    const accepted = htmlToDocxModel(read.html, read.页面设置); accepted.修订动作 = [{ 标识: '15', 操作: 'accept' }]
    const saved = await 读取docx(await 生成docx(accepted)), box = root(saved.html)
    expect(box.textContent).toBe('甲前新乙后'); expect(box.querySelectorAll('p')).toHaveLength(1)
    const rejected = htmlToDocxModel(read.html, read.页面设置); rejected.修订动作 = [{ 标识: '15', 操作: 'reject' }]
    const original = await 读取docx(await 生成docx(rejected)), originalBox = root(original.html)
    expect(originalBox.textContent).toBe('甲前删除一删除二删除三乙后'); expect(originalBox.querySelectorAll('p')).toHaveLength(3)
  })
  it('中文IME只记录最终词语为一次插入，不保存拼音中间态', () => {
    const element = root('<p>正文</p>'); select(element.firstElementChild!.firstChild!, 2)
    const stop = installTrackedEditing(element, { enabled: () => true, readOnly: () => false, author: () => '中文作者', notice: () => {}, changed: () => {} })
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); element.firstElementChild!.textContent = '正文zhong'
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
    expect(element.querySelectorAll('.wps-insert')).toHaveLength(1); expect(element.textContent).toBe('正文中文'); expect(element.innerHTML).not.toContain('zhong'); stop()
  })
  it('删除一个emoji字素不会留下半个代理字符，受保护结构不会被改动', () => {
    const element = root('<p>甲👨‍👩‍👧‍👦乙</p>'); select(element.firstElementChild!.firstChild!, 12)
    expect(applyTrackedInput(element, 'deleteContentBackward', null, identity).changed).toBe(true)
    expect(element.querySelector('.wps-delete')!.textContent).toBe('👨‍👩‍👧‍👦')
    const locked = root('<div data-seal-ooxml-locked="true"><p>不可改</p></div>'); select(locked.querySelector('p')!.firstChild!, 1)
    expect(applyTrackedInput(locked, 'insertText', '丢失', identity).error).toContain('原生结构'); expect(locked.textContent).toBe('不可改')
  })
})
