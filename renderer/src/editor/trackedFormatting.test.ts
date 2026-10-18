import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
import { prepareTrackedFormatting } from './trackedFormatting'
import { htmlToDocxModel } from './commands'
const load = createRequire(import.meta.url), { 生成docx } = load('../../../main/office/docxWriter'), { 读取docx } = load('../../../main/office/docxReader'), JSZip = load('jszip')
afterEach(() => { document.body.innerHTML = '' })
it('新增字符格式修订记录原属性，生成真实rPrChange并能拒绝恢复', async () => {
  const root = document.createElement('div'); root.innerHTML = '<p><span style="font-weight:400;font-style:italic;font-size:16px;color:rgb(0,0,0)">历史文字</span></p>'; document.body.appendChild(root)
  const range = document.createRange(); range.selectNodeContents(root.querySelector('span')!); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  expect(prepareTrackedFormatting(root, '格式作者').changed).toBe(true)
  const changed = root.querySelector<HTMLElement>('[data-seal-format-change]')!; changed.style.fontWeight = '700'; changed.style.fontStyle = 'normal'
  const model = htmlToDocxModel(root.innerHTML), revision = (model.段落[0] as any).文字[0].格式修订
  expect(revision.原来格式.倾斜).toBe(true); expect(revision.原来格式.加粗).toBe(false)
  const bytes = await 生成docx(model), zip = await JSZip.loadAsync(bytes), xml = await zip.file('word/document.xml').async('string')
  expect(xml).toContain('w:rPrChange'); expect(xml).toContain('w:author="格式作者"'); expect(xml).toMatch(/<w:rPrChange[\s\S]*?<w:i\/>/)
  const read = await 读取docx(bytes), reject = htmlToDocxModel(read.html, read.页面设置); reject.修订动作 = [{ 标识: revision.标识, 操作: 'reject' }]
  const restored = await 读取docx(await 生成docx(reject)); expect(restored.html).toContain('font-style:italic'); expect(restored.html).not.toContain('font-weight:700')
})
