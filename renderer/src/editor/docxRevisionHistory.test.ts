import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'
import { 接受修订, 拒绝修订 } from './review'
const load = createRequire(import.meta.url)
const { 读取docx } = load('../../../main/office/docxReader')
const { 生成docx } = load('../../../main/office/docxWriter')
const 标记 = (type: string, id: string, html: string) => `<span class="${type === 'del' || type === 'moveFrom' ? 'wps-delete' : 'wps-insert'}" data-seal-revision-type="${type}" data-seal-revision-id="${id}" data-seal-revision-author="作者甲" data-seal-revision-date="2026-10-18T09:30:00Z">${html}</span>`

describe('原生修订模型与实际保存', () => {
  it('插删移动历史经过净化、模型和两次真实DOCX往返，作者时间和字符格式保留', async () => {
    let html = `<p>正文${标记('ins', '1', '<b>插入</b>')}${标记('del', '2', '<i>删除</i>')}${标记('moveFrom', '3', '移走')}${标记('moveTo', '4', '移入')}</p>`
    for (let i = 0; i < 2; i++) {
      const model = htmlToDocxModel(净化富文本(html))
      expect(model.未覆盖).not.toContain('修订标记')
      const text = model.段落[0] as any
      expect(text.文字.filter((r: any) => r.修订).map((r: any) => r.修订[0])).toEqual(['ins', 'del', 'moveFrom', 'moveTo'].map((类型, n) => ({ 类型, 标识: String(n + 1), 作者: '作者甲', 时间: '2026-10-18T09:30:00Z' })))
      const read = await 读取docx(await 生成docx(model)); html = read.html
      expect(html).toContain('font-weight:700'); expect(html).toContain('font-style:italic')
    }
  })
  it('逐条接受/拒绝保留子节点格式，按同一ID收敛跨run标记，其余历史保留', () => {
    const html = `<p>${标记('ins', '1', '<b>甲</b>')}${标记('ins', '1', '<i>乙</i>')}${标记('del', '2', '<a href="https://example.com">丙</a>')}</p>`
    const accepted = 接受修订(html, '1')
    expect(accepted.文本).toContain('<b>甲</b><i>乙</i>'); expect(accepted.文本).toContain('data-seal-revision-id="2"')
    const rejected = 拒绝修订(accepted.文本, '2')
    expect(rejected.文本).toContain('<a href="https://example.com">丙</a>')
    expect(rejected.文本).not.toContain('data-seal-revision-id')
  })
})
