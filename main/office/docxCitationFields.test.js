const { 生成docx } = require('./docxWriter')
const { 读取docx, 渲染Body } = require('./docxReader')
const { 建域节点, 校验域代码 } = require('./docxCitationFields')
const JSZip = require('jszip')

const 引文代码 = 'ITEM CSL_CITATION {"citationID":"c1","citationItems":[{"id":"ITEM1","locator":"12","label":"page"}],"properties":{"noteIndex":0}}'
const 书目代码 = 'BIBL {} CSL_BIBLIOGRAPHY'

/** 取 document.xml 的 body，便于逐节点断言 */
async function 读正文Xml(数据) {
  const xml = await (await JSZip.loadAsync(数据)).file('word/document.xml').async('string')
  return xml.slice(xml.indexOf('<w:body>'), xml.indexOf('</w:body>') + 9)
}

const 引文段落 = (代码, 文字) => ({
  类型: '段落', 级别: 0, 对齐: '左', 列表: '无',
  文字: [{ 文本: 文字, 加粗: false, 倾斜: false, 下划线: false, 删除线: false, 引文域代码: 代码, 引文域缓存: [{ 文本: 文字, 加粗: false, 倾斜: false, 下划线: false, 删除线: false }] }],
})

describe('DOCX 引文域写入', () => {
  it('引文域写成 fldChar + instrText 三段式，缓存结果可见', async () => {
    const xml = await 读正文Xml(await 生成docx({ 段落: [引文段落(引文代码, '[1]')], 未覆盖: [] }))
    expect(xml).toContain('<w:fldChar w:fldCharType="begin"/>')
    expect(xml).toContain('<w:instrText xml:space="preserve">ITEM CSL_CITATION')
    expect(xml).toContain('<w:fldChar w:fldCharType="separate"/>')
    expect(xml).toContain('<w:fldChar w:fldCharType="end"/>')
    expect(xml).toContain('[1]')
    expect(xml).not.toContain('fldSimple')
  })

  it('域代码里的引号被转义，JSON 结构不被破坏', async () => {
    const xml = await 读正文Xml(await 生成docx({ 段落: [引文段落(引文代码, '[1]')], 未覆盖: [] }))
    expect(xml).toContain('&quot;citationID&quot;')
    expect(xml).not.toMatch(/<w:instrText[^>]*>"citationID"/)
  })

  it('参考文献表域同样写成可刷新域', async () => {
    const xml = await 读正文Xml(await 生成docx({ 段落: [引文段落(书目代码, '参考文献')], 未覆盖: [] }))
    expect(xml).toContain('CSL_BIBLIOGRAPHY')
    expect(xml).toContain('<w:fldChar w:fldCharType="end"/>')
  })

  it('缓存内容保留上标等内部格式', async () => {
    const 段 = {
      类型: '段落', 级别: 0, 对齐: '左', 列表: '无',
      文字: [{
        文本: '[1]', 加粗: false, 倾斜: false, 下划线: false, 删除线: false, 引文域代码: 引文代码,
        引文域缓存: [{ 文本: '[1]', 加粗: false, 倾斜: false, 下划线: false, 删除线: false, 基线: '上标' }],
      }],
    }
    const xml = await 读正文Xml(await 生成docx({ 段落: [段], 未覆盖: [] }))
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>')
  })

  it('缺少显示内容的引文域直接拒绝，不生成空域', async () => {
    const 段 = {
      类型: '段落', 级别: 0, 对齐: '左', 列表: '无',
      文字: [{ 文本: '', 加粗: false, 倾斜: false, 下划线: false, 删除线: false, 引文域代码: 引文代码, 引文域缓存: [] }],
    }
    await expect(生成docx({ 段落: [段], 未覆盖: [] })).rejects.toThrow('引文域缺少显示内容')
  })
})

describe('DOCX 引文域读取', () => {
  const run = 内容 => `<w:r>${内容}</w:r>`
  const field = (指令, 内容) => run('<w:fldChar w:fldCharType="begin"/>') + run(`<w:instrText xml:space="preserve">${指令.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:instrText>`) + run('<w:fldChar w:fldCharType="separate"/>') + 内容 + run('<w:fldChar w:fldCharType="end"/>')

  it('把引文域还原成可刷新的占位节点，保留域代码', () => {
    const html = 渲染Body(`<w:p>${run('<w:t>正文</w:t>')}${field(引文代码, run('<w:t>[1]</w:t>'))}</w:p>`)
    expect(html).toContain('data-seal-citation-code')
    expect(html).toContain('contenteditable="false"')
    expect(html).toContain('[1]')
    // 域代码只能出现在属性里，不能作为可见文字渲染出来
    expect(html.replace(/<[^>]*>/g, '')).toBe('正文[1]')
  })

  it('参考文献表域还原为书目占位节点', () => {
    const html = 渲染Body(`<w:p>${field(书目代码, run('<w:t>参考文献</w:t>'))}</w:p>`)
    expect(html).toContain('data-seal-bibliography-code')
    expect(html).toContain('参考文献')
    expect(html.replace(/<[^>]*>/g, '')).toBe('参考文献')
  })

  it('非法引文域代码降级为纯文字并给出中文警告', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml',
      `<w:document><w:body><w:p>${field('ITEM CSL_CITATION 坏数据', run('<w:t>[9]</w:t>'))}</w:p></w:body></w:document>`)
    const 结果 = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('[9]')
    expect(结果.html).not.toContain('data-seal-citation-code')
    expect((结果.警告 || []).join()).toContain('引文域代码无效')
  })

  it('页码域仍按原逻辑处理，不受引文域改动影响', () => {
    const html = 渲染Body(`<w:p>${field('PAGE', run('<w:t>3</w:t>'))}</w:p>`)
    expect(html).toContain('data-seal-field="PAGE"')
  })
})

describe('引文域往返', () => {
  it('生成 docx 再读回，域代码逐字一致', async () => {
    const 数据 = await 生成docx({ 段落: [引文段落(引文代码, '[1]')], 未覆盖: [] })
    const 结果 = await 读取docx(数据)
    expect(结果.html).toContain('data-seal-citation-code')
    const 代码 = /data-seal-citation-code="([^"]+)"/.exec(结果.html)?.[1]
    expect(代码).toBeTruthy()
    const 还原 = 代码.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    expect(还原).toBe(引文代码)
  })

  it('Word 产生的 fldSimple 形式也能识别为引文域', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml',
      `<w:document><w:body><w:p><w:fldSimple w:instr="${引文代码.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"><w:r><w:t>[1]</w:t></w:r></w:fldSimple></w:p></w:body></w:document>`)
    const 结果 = await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('data-seal-citation-code')
    expect(结果.html).toContain('[1]')
  })
})

describe('域代码校验', () => {
  it('只放行 Zotero 的两种域', () => {
    expect(校验域代码(引文代码)).toBe(引文代码)
    expect(校验域代码(书目代码)).toBe(书目代码)
    expect(() => 校验域代码('INCLUDETEXT "C:\\\\secret.docx"')).toThrow('引文域代码格式无效')
    expect(() => 校验域代码('')).toThrow('引文域代码长度无效')
    expect(() => 校验域代码('ITEM CSL_CITATION')).toThrow('缺少数据部分')
    expect(() => 校验域代码('ITEM CSL_CITATION {\u0000}')).toThrow('不可见控制字符')
  })

  it('书目域必须以 CSL_BIBLIOGRAPHY 结尾', () => {
    expect(() => 校验域代码('BIBL {}')).toThrow('引文域代码格式无效')
  })

  it('建域节点产出 5 段结构', () => {
    const 节点 = 建域节点(引文代码, ['缓存'])
    expect(节点).toHaveLength(5)
    expect(节点[3]).toBe('缓存')
  })
})
