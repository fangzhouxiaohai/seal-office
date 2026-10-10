const { 渲染Body, 读取docx } = require('./docxReader')
const JSZip = require('jszip')
const run = 内容 => `<w:r>${内容}</w:r>`
const field = (指令, 内容) => run('<w:fldChar w:fldCharType="begin"/>') + run(`<w:instrText>${指令}</w:instrText>`) + run('<w:fldChar w:fldCharType="separate"/>') + 内容 + run('<w:fldChar w:fldCharType="end"/>')
describe('Word/WPS 嵌套目录域', () => {
  it('目录外层跨段落时保留内层超链接标题和页码，域指令不显示', () => {
    const 外层开始 = run('<w:fldChar w:fldCharType="begin"/>') + run('<w:instrText>TOC</w:instrText>') + run('<w:fldChar w:fldCharType="separate"/>')
    const 目录 = '<w:p>' + 外层开始 + field('HYPERLINK', run('<w:t>1 开始使用与后台通用操作</w:t><w:tab/>') + field('PAGEREF', run('<w:t>6</w:t>'))) + '</w:p><w:p>' + field('HYPERLINK', run('<w:t>1 1 这本手册怎样使用</w:t><w:tab/>') + field('PAGEREF', run('<w:t>6</w:t>'))) + run('<w:fldChar w:fldCharType="end"/>') + '</w:p>'
    const html = 渲染Body(目录)
    expect(html).toContain('开始使用与后台通用操作'); expect(html).toContain('这本手册怎样使用')
    expect(html.replace(/<[^>]*>/g, '')).toContain('这本手册怎样使用\t6')
    expect(html).not.toContain('PAGEREF'); expect(html).not.toContain('HYPERLINK')
  })
  it('单段多层嵌套不覆盖前后的文字，页码域仍可写回', () => {
    const html = 渲染Body('<w:p>' + run('<w:t>之前</w:t>') + field('TOC', field('HYPERLINK', run('<w:t>目录中文</w:t>') + field('PAGE', run('<w:t>3</w:t>')))) + run('<w:t>之后</w:t>') + '</w:p>')
    expect(html).toContain('目录中文'); expect(html).toContain('data-seal-field="PAGE"')
    expect(html.replace(/<[^>]*>/g, '')).toBe('之前目录中文3之后')
  })
  it('数字样式 ID 的标题通过继承大纲级别导入导航大纲', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="37"/></w:pPr><w:r><w:t>中文标题</w:t></w:r></w:p></w:body></w:document>')
    zip.file('word/styles.xml', '<w:styles><w:style w:styleId="3"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style><w:style w:styleId="37"><w:basedOn w:val="3"/></w:style></w:styles>')
    expect((await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))).html).toContain('<h2>中文标题</h2>')
  })
})
