import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'
import fs from 'node:fs'
import path from 'node:path'
const load = createRequire(import.meta.url), JSZip = load('jszip')
const { 读取docx } = load('../../../main/office/docxReader')
const { 生成docx } = load('../../../main/office/docxWriter')
const { 读取安全源包 } = load('../../../main/office/docxSource')
const { complexWord } = load('../../../main/office/__fixtures__/complexWord.cjs')
const { bodyBlocks } = load('../../../main/office/docxSource')
async function fixture() {
  const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '可编辑正文' }, { 文本: '', 注释引用: { 类型: 'footnote', 标识: 7 } }] }, { 类型: '段落', 文字: [{ 文本: '受保护格式' }] }], 注释: [{ 类型: 'footnote', 标识: 7, 段落: [{ 类型: '段落', 文字: [{ 文本: '注释内容' }] }] }], 页眉: [{ 类型: '段落', 文字: [{ 文本: '默认页眉' }] }] }))
  let xml = await zip.file('word/document.xml').async('string')
  xml = xml.replace(/<w:r>(?:(?!<\/w:r>)[\s\S])*?<w:t[^>]*>受保护格式<\/w:t><\/w:r>/, '<w:r><w:rPr><w:b/><w:rPrChange w:id="42" w:author="旧作者" w:date="2026-10-17T10:00:00Z"><w:rPr><w:i/></w:rPr></w:rPrChange></w:rPr><w:t xml:space="preserve">受保护格式</w:t></w:r>')
  zip.file('word/document.xml', xml)
  return zip
}
describe('DOCX高级源结构与实际正文编辑', () => {
  it('反复重开修改不会复制未使用资源或重复样式；删除普通源块不会被来源快路径复活', async () => {
    let read = await 读取docx(await (await fixture()).generateAsync({ type: 'nodebuffer' })), firstEntries = 0, firstStyles = 0
    for (let i = 0; i < 6; i++) { const html = read.html.replace(i ? `循环正文${i - 1}` : '可编辑正文', `循环正文${i}`), saved = await 生成docx(htmlToDocxModel(html, read.页面设置)), zip = await JSZip.loadAsync(saved), entries = Object.values(zip.files).filter((file: any) => !file.dir).length, styles = (await zip.file('word/styles.xml').async('string')).match(/<w:style(?=[\s>])/g).length; if (!i) { firstEntries = entries; firstStyles = styles } else { expect(entries).toBe(firstEntries); expect(styles).toBe(firstStyles) } read = await 读取docx(saved) }
    const box = document.createElement('div'); box.innerHTML = read.html; box.querySelector('[data-seal-ooxml-block="b0"]')!.remove()
    const saved = await 读取docx(await 生成docx(htmlToDocxModel(box.innerHTML, read.页面设置))); expect(saved.html).not.toContain('循环正文5'); expect(saved.html).toContain('受保护格式')
  })
  it('真正段落移动的命名来源/目的范围一起审阅；隐形范围标记不变成正文且没有重复移动内容', async () => {
    const zip = await JSZip.loadAsync(await 生成docx({ 段落: [0, 1].map(() => ({ 类型: '段落', 文字: [{ 文本: '完整移动段落' }] })) }))
    let xml = await zip.file('word/document.xml').async('string'); const blocks = bodyBlocks(xml), moved = (block: any, type: string, id: string) => block.xml.replace('</w:pPr>', `<w:rPr><w:${type} w:id="${id}" w:author="移动作者" w:date="2026-10-18T09:00:00Z"/></w:rPr></w:pPr>`)
    xml = xml.replace(/(<w:body[^>]*>)[\s\S]*(<\/w:body>)/, '$1<w:moveFromRangeStart w:id="100" w:name="命名移动"/>' + moved(blocks[0], 'moveFrom', '21') + '<w:moveFromRangeEnd w:id="100"/><w:moveToRangeStart w:id="101" w:name="命名移动"/>' + moved(blocks[1], 'moveTo', '22') + '<w:moveToRangeEnd w:id="101"/>' + blocks[2].xml + '$2')
    zip.file('word/document.xml', xml); const read = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(read.html).toContain('data-seal-paragraph-revision-type="moveFrom"'); expect(read.html).toContain('data-seal-paragraph-revision-type="moveTo"'); expect(read.html).not.toContain('此原生对象保留')
    for (const 操作 of ['accept', 'reject']) { const model = htmlToDocxModel(read.html, read.页面设置); model.修订动作 = [{ 标识: '21', 操作: 操作 as any, 部件: 'word/document.xml' }]; const saved = await 生成docx(model), savedZip = await JSZip.loadAsync(saved), content = await savedZip.file('word/document.xml').async('string'); expect(content).not.toMatch(/w:move(?:From|To)/); expect(content.match(/完整移动段落/g)).toHaveLength(1); const reopened = await 读取docx(saved); expect(reopened.html).toContain('完整移动段落') }
  })
  it('表格行插删有可视标记、历史原包保护，审阅后真实删除对应行', async () => {
    const zip = await JSZip.loadAsync(await 生成docx({ 段落: [{ 类型: '表格', 行: ['原行', '插入行'].map(text => [{ 文字: [{ 文本: text }] }]) }] }))
    let xml = await zip.file('word/document.xml').async('string'), index = 0
    xml = xml.replace(/<w:tr>/g, () => `<w:tr><w:trPr><w:${index++ ? 'ins' : 'del'} w:id="${index + 30}" w:author="表格作者"/></w:trPr>`); zip.file('word/document.xml', xml)
    const read = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' })); expect(read.html).toMatch(/<tr[^>]*data-seal-revision-type="del"/); expect(read.html).toMatch(/<tr[^>]*data-seal-revision-type="ins"/)
    const model = htmlToDocxModel(read.html, read.页面设置); model.修订动作 = [{ 标识: '31', 操作: 'accept' }, { 标识: '32', 操作: 'accept' }]
    const saved = await 读取docx(await 生成docx(model)); expect(saved.html).not.toContain('原行'); expect(saved.html).toContain('插入行'); expect(saved.html).not.toContain('data-seal-revision-type')
  })
  it('横竖混排、奇数起节、独立页眉、双栏和锚定图片在真实正文修改后完整保留', async () => {
    const original = await complexWord(), source = await JSZip.loadAsync(original), read = await 读取docx(original)
    const box = document.createElement('div'); box.innerHTML = read.html
    const layouts = Array.from(box.querySelectorAll<HTMLElement>('[data-seal-section-layout]')).map(node => JSON.parse(decodeURIComponent(node.dataset.sealSectionLayout!)))
    expect(layouts).toHaveLength(3); expect(layouts[1].纸张.宽).toBeGreaterThan(layouts[1].纸张.高); expect(layouts[1].分栏.数量).toBe(2); expect(layouts[2].类型).toBe('oddPage'); expect(layouts[0].页眉Html.first).toContain('首页专用页眉甲')
    const paragraph = Array.from(box.querySelectorAll('p')).find(node => node.textContent?.includes('可编辑正文：原始甲'))!; paragraph.innerHTML = paragraph.innerHTML.replace('原始甲', '已修改乙')
    const model = htmlToDocxModel(净化富文本(box.innerHTML), read.页面设置); expect(model.未覆盖).toEqual([])
    const bytes = await 生成docx(model), saved = await JSZip.loadAsync(bytes), beforeXml = await source.file('word/document.xml').async('string'), xml = await saved.file('word/document.xml').async('string')
    expect(xml).toContain('已修改乙'); expect(xml.match(/<w:sectPr(?=[\s>])/g)).toHaveLength(3); expect(xml.match(/<wp:anchor[\s\S]*?<\/wp:anchor>/)?.[0]).toBe(beforeXml.match(/<wp:anchor[\s\S]*?<\/wp:anchor>/)?.[0])
    for (const file of Object.values(source.files) as any[]) if (!file.dir && /word\/(?:media\/|(?:header|footer|footnotes)\d*\.xml)/.test(file.name)) expect(await saved.file(file.name).async('uint8array')).toEqual(await file.async('uint8array'))
    const reopened = await 读取docx(bytes); expect(reopened.html).toContain('已修改乙'); expect(reopened.html).toContain('data:image/png;base64,'); expect(reopened.html).toContain('脚注：跨节页面')
    const output = path.join(path.dirname(load.resolve('../../../package.json')), '.upgrade-private/word-v200-final/complex-sections-saved.docx'); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bytes)
  })
  it('连续两次编辑普通正文保留原生格式历史、作者时间及原页眉脚注，正文确实写入', async () => {
    let read = await 读取docx(await (await fixture()).generateAsync({ type: 'nodebuffer' }))
    for (let index = 0; index < 2; index++) {
      const model = htmlToDocxModel(净化富文本(read.html.replace(index ? '已修改正文0' : '可编辑正文', `已修改正文${index}`)), read.页面设置)
      const bytes = await 生成docx(model), zip = await JSZip.loadAsync(bytes), xml = await zip.file('word/document.xml').async('string')
      expect(xml).toContain(`已修改正文${index}`); expect(xml).toContain('w:rPrChange w:id="42"'); expect(xml).toContain('旧作者')
      read = await 读取docx(bytes)
      expect(read.html).toContain('注释内容'); expect(read.页面设置.页眉Html).toContain('默认页眉')
    }
  })
  it('脚注正文与默认页眉实际修改后保存重开，来源保留不会掩盖用户编辑', async () => {
    const read = await 读取docx(await (await fixture()).generateAsync({ type: 'nodebuffer' }))
    const settings = { ...read.页面设置, 页眉Html: '<p>修改页眉</p>' }
    const saved = await 读取docx(await 生成docx(htmlToDocxModel(净化富文本(read.html.replace('>注释内容<', '>修改注释<')), settings)))
    expect(saved.html).toContain('修改注释'); expect(saved.页面设置.页眉Html).toContain('修改页眉')
    expect(saved.html).toContain('受保护格式')
  })
  it('修改或移除受保护原生块明确失败，不能静默覆盖', async () => {
    const read = await 读取docx(await (await fixture()).generateAsync({ type: 'nodebuffer' }))
    const box = document.createElement('div'); box.innerHTML = read.html
    const block = box.querySelector('[data-seal-ooxml-locked]')!
    block.textContent = '伪造修改'
    await expect(生成docx(htmlToDocxModel(box.innerHTML, read.页面设置))).rejects.toThrow('原生结构')
    block.remove()
    await expect(生成docx(htmlToDocxModel(box.innerHTML, read.页面设置))).rejects.toThrow('原生结构')
  })
  it('接受/拒绝原生格式修订通过真实OOXML实现当前或历史格式，保存重开结果可见', async () => {
    const read = await 读取docx(await (await fixture()).generateAsync({ type: 'nodebuffer' }))
    for (const 操作 of ['accept', 'reject']) {
      const model = htmlToDocxModel(read.html, read.页面设置); model.修订动作 = [{ 标识: '42', 操作: 操作 as any, 部件: 'word/document.xml' }]
      const bytes = await 生成docx(model), zip = await JSZip.loadAsync(bytes), xml = await zip.file('word/document.xml').async('string'), reopened = await 读取docx(bytes)
      expect(xml).not.toContain('rPrChange'); expect(reopened.html).toContain(操作 === 'accept' ? 'font-weight:700' : 'font-style:italic')
    }
  })
  it.each(['macro', 'external', 'embedded'])('HTML伪造的%s活动源包不能绕过安全限制', async kind => {
    const zip = await fixture()
    if (kind === 'macro') zip.file('[Content_Types].xml', (await zip.file('[Content_Types].xml').async('string')).replace('wordprocessingml.document.main+xml', 'ms-word.document.macroEnabled.main+xml'))
    if (kind === 'external') zip.file('word/_rels/document.xml.rels', (await zip.file('word/_rels/document.xml.rels').async('string')).replace('</Relationships>', '<Relationship Id="attack" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.com/track.png" TargetMode="External"/></Relationships>'))
    if (kind === 'embedded') zip.file('word/embeddings/object.bin', 'not executable but forbidden')
    await expect(读取安全源包(await zip.generateAsync({ type: 'base64' }))).rejects.toThrow(/活动|不安全|外部/)
  })
})
