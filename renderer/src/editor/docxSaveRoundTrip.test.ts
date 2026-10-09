import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'
import { 净化富文本 } from './sanitizeHtml'

const 加载模块 = createRequire(import.meta.url)
const { 生成docx } = 加载模块('../../../main/office/docxWriter.js')
const { 读取docx } = 加载模块('../../../main/office/docxReader.js')
const JSZip = 加载模块('jszip')

describe('编辑区到真实 DOCX 的段落格式往返', () => {
  it('标题显式字号、加粗与空段落标记连续三次保存不变', async () => {
    let html = '<h1 style="font-size:24pt;font-weight:700;text-align:center">修改后的标题</h1><p style="font-size:18pt;line-height:2"><br></p><p style="font-size:10.5pt">正文</p>'
    for (let 次数 = 0; 次数 < 3; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.段落[0]).toMatchObject({ 标记: { 字号: 24, 加粗: true }, 文字: [{ 字号: 24, 加粗: true }] })
      expect(模型.段落[1]).toMatchObject({ 标记: { 字号: 18 }, 文字: [], 间距: { 行距: 480, 行距规则: 'auto' } })
      html = 净化富文本((await 读取docx(await 生成docx(模型))).html)
    }
  })

  it('CSS 关键字、四分之一磅字号和 XML 符号保持真实内容', async () => {
    let html = '<p><span style="font-size:x-large">18磅</span><span style="font-size:15px">11.25磅 &amp; &lt; &gt; &quot; &#39; &amp;lt;</span></p>'
    for (let 次数 = 0; 次数 < 3; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.段落[0]).toMatchObject({ 文字: [{ 字号: 18 }, { 字号: 11.25, 文本: '11.25磅 & < > " \' &lt;' }] })
      html = 净化富文本((await 读取docx(await 生成docx(模型))).html)
    }
  })

  it('表格宽度、边框、底色和内边距保存后不强制替换或追加空行', async () => {
    let html = '<table style="width:300pt;border-collapse:collapse"><tr><td style="width:180pt;padding:3pt 6pt;border:1pt solid #C00000;background-color:#FFFF00"><p>单元格</p></td><td style="width:120pt;padding:3pt 6pt;border:1pt solid #C00000"><p>第二格</p></td></tr></table><p>表后正文</p>'
    for (let 次数 = 0; 次数 < 3; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.段落).toHaveLength(2)
      expect(模型.段落[0]).toMatchObject({ 宽度: 300, 行: [[{ 宽度: 180, 内边距: { 上: 3, 右: 6, 下: 3, 左: 6 }, 底纹: 'FFFF00', 边框: { top: { 样式: 'solid', 宽: 1, 颜色: 'C00000' } } }, { 宽度: 120 }]] })
      html = 净化富文本((await 读取docx(await 生成docx(模型))).html)
    }
  })

  it('相邻表格使用隐藏分隔标记，重开不添加可编辑的空段落', async () => {
    let html = '<table><tr><td>第一表</td></tr></table><table><tr><td>第二表</td></tr></table>'
    for (let 次数 = 0; 次数 < 3; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.段落.map(段 => 段.类型)).toEqual(['表格', '表格'])
      html = 净化富文本((await 读取docx(await 生成docx(模型))).html)
    }
  })

  it('百分比表宽连续保存不被读成 0%，兼容两种 OOXML 百分比表示', async () => {
    let html = '<table style="width:80%;border-collapse:collapse"><tr><td><p>百分比表格</p></td></tr></table>'
    for (let 次数 = 0; 次数 < 3; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.段落[0]).toMatchObject({ 宽度百分比: 80 })
      const bytes = await 生成docx(模型)
      html = 净化富文本((await 读取docx(bytes)).html)
      expect(html).toContain('width:80%')
      const zip = await JSZip.loadAsync(bytes)
      const xml = await zip.file('word/document.xml').async('string')
      zip.file('word/document.xml', xml.replace('w:w="80%"', 'w:w="4000"'))
      expect((await 读取docx(await zip.generateAsync({ type: 'nodebuffer' }))).html).toContain('width:80%')
    }
  })

  it('页眉页脚采用自身 12px 基准字号并保留空行格式', async () => {
    const 模型 = htmlToDocxModel('<p>正文</p>', { 页眉Html: '<p>页眉</p>', 页脚Html: '<p style="font-size:16pt"><br></p>' } as any)
    expect(模型.页眉?.[0]).toMatchObject({ 标记: { 字号: 9 }, 文字: [{ 字号: 9 }] })
    expect(模型.页脚?.[0]).toMatchObject({ 标记: { 字号: 16 } })
  })

  it.each([1, 2, 3, 4, 5, 6])('默认 %i 级标题重开不会增加蓝色', async (级别) => {
    const 结果 = await 读取docx(await 生成docx(htmlToDocxModel(`<h${级别}>默认标题</h${级别}>`)))
    expect(结果.警告).toEqual([])
    const 模型 = htmlToDocxModel(净化富文本(结果.html))
    expect(模型.段落[0]).toMatchObject({ 级别, 文字: [expect.objectContaining({ 颜色: undefined })] })
    expect(结果.html).not.toMatch(/#(?:2E74B5|1F4D78)/)
  })

  it.each([
    { 名称: '默认标题', html: '<h1>默认标题</h1>', 颜色: [undefined] },
    { 名称: '命名黑色标题', html: '<h1 style="color:black">黑色标题</h1>', 颜色: ['000000'] },
    { 名称: '旧式黑色标题', html: '<h1><font color="black">黑色标题</font></h1>', 颜色: ['000000'] },
    { 名称: '显式黑色标题', html: '<h1 style="color:#000000">黑色标题</h1>', 颜色: ['000000'] },
    { 名称: '黑色与彩色混排', html: '<h1 style="color:black">黑色<span style="color:#C00000">红色</span></h1>', 颜色: ['000000', 'C00000'] },
  ])('$名称连续保存重开不会套用蓝色标题样式', async ({ html: 原文, 颜色 }) => {
    let html = 原文
    for (let 次数 = 0; 次数 < 3; 次数++) {
      const 模型 = htmlToDocxModel(html)
      expect(模型.未覆盖).toEqual([])
      const 段 = 模型.段落[0]
      if (段.类型 !== '段落') throw new Error('标题应为文本段落')
      expect(段.级别).toBe(1)
      expect(段.文字.map((片) => 片.颜色)).toEqual(颜色)
      const 结果 = await 读取docx(await 生成docx(模型))
      expect(结果.警告).toEqual([])
      html = 净化富文本(结果.html)
      expect(html).not.toContain('#2E74B5')
    }
  })

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
      expect.objectContaining({ 对齐: '右', 缩进: { 首行: 480 } }), expect.objectContaining({ 间距: { 段前: 240, 行距: 420, 行距规则: 'auto' } }),
    ] }]] })
  })

  it('字间距、合并单元格与页脚页码域连续保存两次都完整保留', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body>' +
      '<w:p><w:pPr><w:spacing w:line="240" w:lineRule="exact"/><w:rPr><w:spacing w:val="-12"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:spacing w:val="8"/></w:rPr><w:t>加宽字距</w:t></w:r></w:p>' +
      '<w:tbl>' +
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>跨两列</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>跨两行</w:t></w:r></w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:p><w:r><w:t>左下</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>中下</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>' +
      '</w:tbl></w:body></w:document>')
    压缩包.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>')
    压缩包.file('word/footer1.xml', '<w:ftr><w:p><w:r><w:t>第</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve">PAGE  \\* MERGEFORMAT</w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>3</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
      '<w:r><w:t>页</w:t></w:r></w:p></w:ftr>')
    // 正文段落末尾的 sectPr 指向页脚
    let 数据 = await 压缩包.generateAsync({ type: 'nodebuffer' })
    const 补正 = await JSZip.loadAsync(数据)
    const 正文 = await 补正.file('word/document.xml').async('string')
    补正.file('word/document.xml', 正文.replace('</w:body>', '<w:sectPr><w:footerReference r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>'))
    数据 = await 补正.generateAsync({ type: 'nodebuffer' })

    for (let 次数 = 0; 次数 < 2; 次数++) {
      const 读取 = await 读取docx(数据)
      expect(读取.警告).toEqual([])
      const html = 净化富文本(读取.html)
      expect(html).toContain('letter-spacing:0.4pt')
      expect(html).toContain('colspan="2"')
      expect(html).toContain('rowspan="2"')
      expect(读取.页面设置.页脚Html).toContain('data-seal-field="PAGE"')

      const 模型 = htmlToDocxModel(html, {
        ...读取.页面设置,
        // 编辑区里的页脚 HTML 会先过净化，域标记必须能存活
        页脚Html: 净化富文本(读取.页面设置?.页脚Html ?? ''),
      })
      expect(净化富文本(读取.页面设置?.页脚Html ?? '')).toContain('data-seal-field="PAGE"')
      expect(模型.未覆盖).toEqual([])
      expect(模型.页脚?.[0]).toMatchObject({ 文字: expect.arrayContaining([expect.objectContaining({ 域: 'PAGE' })]) })
      const 表 = 模型.段落.find((段) => 段.类型 === '表格')
      if (表?.类型 !== '表格') throw new Error('正文应保留表格')
      expect(表.行).toHaveLength(2)
      expect(表.行[0]).toMatchObject([
        expect.objectContaining({ 跨列: 2 }),
        expect.objectContaining({ 跨行: 2, 文字: [expect.objectContaining({ 文本: '跨两行' })] }),
      ])
      expect(表.行[1]).toHaveLength(2)
      数据 = await 生成docx(模型)
    }
  })
})
