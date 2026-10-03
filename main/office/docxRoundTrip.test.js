// docx 往返保真测试：写入颜色/字号/字体/对齐/标题/列表后读回应保留样式
const { 生成docx } = require('./docxWriter')
const { 读取docx, 渲染Body } = require('./docxReader')
const JSZip = require('jszip')

const 构造模型 = () => ({
  段落: [
    { 类型: '段落', 级别: 1, 对齐: '左', 列表: '无', 文字: [{ 文本: '项目标题', 加粗: true }] },
    {
      类型: '段落',
      级别: 0,
      对齐: '中',
      列表: '无',
      文字: [
        { 文本: '红色', 颜色: 'FF0000', 字号: 16, 字体: '宋体' },
        { 文本: '加粗斜体', 加粗: true, 倾斜: true, 下划线: true },
        { 文本: '删除线', 删除线: true },
      ],
    },
    { 类型: '段落', 级别: 0, 对齐: '右', 列表: '无', 文字: [{ 文本: '右对齐段落', 颜色: '2B6CF6' }] },
  ],
})

describe('docx 往返保真', () => {
  it('独立分页符在保存重开后保留位置', async () => {
    const buffer = await 生成docx({ 段落: [
      { 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '第一页' }] },
      { 类型: '分页符' },
      { 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '第二页' }] },
    ] })
    const 结果 = await 读取docx(buffer)
    const 标记 = '<div class="wps-page-break"></div>'
    expect(结果.html).toContain(标记)
    expect(结果.html.indexOf('第一页')).toBeLessThan(结果.html.indexOf(标记))
    expect(结果.html.indexOf(标记)).toBeLessThan(结果.html.indexOf('第二页'))
  })
  it('来源文档的段前分页符显示在对应段落之前', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body>' +
      '<w:p><w:r><w:t>第一页</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>第二页</w:t></w:r></w:p>' +
      '</w:body></w:document>')
    const { html } = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(html).toContain('<div class="wps-page-break"></div>')
    expect(html.indexOf('第一页')).toBeLessThan(html.indexOf('wps-page-break'))
    expect(html.indexOf('wps-page-break')).toBeLessThan(html.indexOf('第二页'))
  })
  it('页面尺寸、方向、页边距、分栏、边框、底色与文字方向保存后可读回', async () => {
    const 页面设置 = {
      纸张: 'A5', 纸张方向: '横向', 页边距: '窄', 分栏: '两栏',
      页面边框: '方框', 页面颜色: '#FFF2CC', 文字方向: '竖排', 水印: '无',
    }
    const buffer = await 生成docx({ ...构造模型(), 页面设置 })
    const 压缩包 = await JSZip.loadAsync(buffer)
    const xml = await 压缩包.file('word/document.xml').async('string')
    expect(xml).toMatch(/<w:pgSz[^>]*w:orient="landscape"/)
    expect(xml).toMatch(/<w:cols[^>]*w:num="2"/)
    expect(xml).toMatch(/<w:pgBorders[\s>]/)
    expect(xml).toMatch(/<w:background[^>]*w:color="FFF2CC"/)
    expect((await 读取docx(buffer)).页面设置).toEqual(页面设置)
  })

  it('自定义纸张与非对称页边距按原始数值打开，避免自动改格式', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>正文</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="12000" w:h="16000"/><w:pgMar w:top="1900" w:right="1300" w:bottom="1700" w:left="1400"/></w:sectPr>' +
      '</w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.页面设置).toMatchObject({
      纸张: '自定义', 页边距: '自定义',
      原始纸张: { 宽: 12000, 高: 16000 },
      原始页边距: { 上: 1900, 右: 1300, 下: 1700, 左: 1400 },
    })
    expect(结果.警告).not.toContain('自定义页面设置未完整导入')
    const 保存数据 = await 生成docx({ ...构造模型(), 页面设置: 结果.页面设置 })
    const 重开 = await 读取docx(保存数据)
    expect(重开.页面设置.原始纸张).toEqual({ 宽: 12000, 高: 16000 })
    expect(重开.页面设置.原始页边距).toEqual({ 上: 1900, 右: 1300, 下: 1700, 左: 1400 })
  })

  it('自定义横向纸张保存后宽高保持原值', async () => {
    const 页面设置 = {
      纸张: '自定义', 原始纸张: { 宽: 18000, 高: 11000 }, 纸张方向: '横向',
      页边距: '窄', 分栏: '一栏', 页面边框: '无', 页面颜色: '无', 文字方向: '横排', 水印: '无',
    }
    const 结果 = await 读取docx(await 生成docx({ ...构造模型(), 页面设置 }))
    expect(结果.页面设置.原始纸张).toEqual({ 宽: 18000, 高: 11000 })
    expect(结果.页面设置.纸张方向).toBe('横向')
  })

  it('未能保留段落缩进与跨列表格单元格时发出保真警告', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body>' +
      '<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t>缩进文字</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>合并单元格</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('margin-left:36pt')
    expect(结果.html).toContain('colspan="2"')
    expect(结果.警告).toContain('段落缩进未完整导入')
    expect(结果.警告).toContain('表格合并单元格未导入')
  })

  it('段落间距与超链接目标不会被静默丢弃', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p>' +
      '<w:pPr><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>' +
      '<w:hyperlink r:id="rId7"><w:r><w:t>官网</w:t></w:r></w:hyperlink>' +
      '</w:p></w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('margin-top:12pt')
    expect(结果.html).toContain('margin-bottom:6pt')
    expect(结果.html).toContain('line-height:1.5')
    expect(结果.警告).toContain('段落间距未完整导入')
    expect(结果.警告).toContain('超链接目标未导入')
  })

  it('写入器明确关闭的加粗、斜体和删除线在打开时保持关闭', async () => {
    const buffer = await 生成docx({
      段落: [{ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '正常正文', 加粗: false, 倾斜: false, 删除线: false }] }],
    })
    const { html } = await 读取docx(buffer)
    expect(html).toContain('正常正文')
    expect(html).not.toContain('font-weight:600')
    expect(html).not.toContain('font-style:italic')
    expect(html).not.toContain('line-through')
  })

  it('布尔格式的关闭值覆盖段落样式继承的开启值', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml',
      '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="强调段落"/></w:pPr>' +
      '<w:r><w:rPr><w:b w:val="0"/><w:i w:val="false"/><w:strike w:val="off"/><w:u w:val="none"/></w:rPr><w:t>普通片段</w:t></w:r>' +
      '<w:r><w:t>继承片段</w:t></w:r></w:p></w:body></w:document>')
    压缩包.file('word/styles.xml',
      '<w:styles><w:style w:type="paragraph" w:styleId="强调段落"><w:rPr>' +
      '<w:b/><w:i w:val="on"/><w:strike w:val="1"/><w:u w:val="single"/>' +
      '</w:rPr></w:style></w:styles>')
    const { html } = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(html).toMatch(/<span style="[^"]*font-weight:normal;[^"]*font-style:normal;[^"]*text-decoration:none;[^"]*">普通片段<\/span>/)
    expect(html).toMatch(/<span style="[^"]*font-weight:600;[^"]*font-style:italic;[^"]*text-decoration:underline line-through;[^"]*">继承片段<\/span>/)
  })

  it('空标签、true 与 1 表示启用格式', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/><w:i w:val="true"/><w:strike w:val="1"/><w:u w:val="single"/></w:rPr><w:t>加样式</w:t></w:r>' +
      '</w:p></w:body></w:document>')
    const { html } = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(html).toContain('font-weight:600')
    expect(html).toContain('font-style:italic')
    expect(html).toContain('text-decoration:underline line-through')
  })

  it('颜色在保存后重新打开时不丢失', async () => {
    const buffer = await 生成docx(构造模型())
    const { html } = await 读取docx(buffer)
    expect(html).toContain('#FF0000')
    expect(html).toContain('#2B6CF6')
    expect(html).toContain('红色')
  })

  it('字号与字体保留', async () => {
    const buffer = await 生成docx(构造模型())
    const { html } = await 读取docx(buffer)
    expect(html).toContain('font-size:16pt')
    expect(html).toContain('宋体')
  })

  it('加粗、斜体、下划线、删除线保留', async () => {
    const buffer = await 生成docx(构造模型())
    const { html } = await 读取docx(buffer)
    expect(html).toMatch(/font-weight:\s*600|<b>/)
    expect(html).toMatch(/font-style:\s*italic|<i>/)
    expect(html).toMatch(/text-decoration:\s*underline/)
    expect(html).toMatch(/text-decoration:\s*line-through|line-through/)
  })

  it('对齐保留', async () => {
    const buffer = await 生成docx(构造模型())
    const { html } = await 读取docx(buffer)
    expect(html).toContain('text-align:center')
    expect(html).toContain('text-align:right')
  })

  it('标题级别映射为 h 标签', async () => {
    const buffer = await 生成docx(构造模型())
    const { html } = await 读取docx(buffer)
    expect(html).toMatch(/<h1[^>]*>.*项目标题.*<\/h1>/)
  })

  it('列表段落渲染为 ul/ol', () => {
    const html = 渲染Body(
      '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:numFmt w:val="bullet"/></w:pPr><w:r><w:t>甲</w:t></w:r></w:p>' +
        '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>乙</w:t></w:r></w:p>'
    )
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>甲</li>')
    expect(html).toContain('<li>乙</li>')
  })

  it('表格渲染为带边框的 table', () => {
    const html = 渲染Body(
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>单元格</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    )
    expect(html).toContain('<table')
    expect(html).toContain('<td')
    expect(html).toContain('单元格')
  })

  it('普通文本与空段落', () => {
    const html = 渲染Body('<w:p><w:r><w:t>正文一行</w:t></w:r></w:p><w:p/>')
    expect(html).toContain('<p>正文一行</p>')
    expect(html).toContain('<p><br></p>')
  })
})

describe('docx 往返保真：委托解析后的完整模型', () => {
  it('底纹与项目符号列表往返保留', async () => {
    const 模型 = {
      段落: [
        {
          类型: '段落',
          级别: 0,
          对齐: '左',
          列表: '项目符号',
          文字: [{ 文本: '带底纹的列表项', 加粗: false, 底纹: 'FFF3B0', 颜色: 'B8860B' }],
        },
        {
          类型: '段落',
          级别: 0,
          对齐: '左',
          列表: '编号',
          文字: [{ 文本: '编号项', 字体: '宋体', 字号: 12 }],
        },
      ],
      未覆盖: [],
    }
    const buffer = await 生成docx(模型)
    const { html } = await 读取docx(buffer)
    expect(html).toContain('#FFF3B0')
    expect(html).toContain('#B8860B')
    expect(html).toMatch(/<ul>/)
    expect(html).toMatch(/<ol>/)
    expect(html).toContain('宋体')
  })

  it('类型为段落的模型不再依赖旧的文字类型标记', async () => {
    const 模型 = { 段落: [{ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '正文' }] }], 未覆盖: [] }
    const buffer = await 生成docx(模型)
    const { html } = await 读取docx(buffer)
    expect(html).toContain('正文')
  })
})

describe('损坏的文档', () => {
  it('无法解压的内容应拒绝读取', async () => {
    await expect(读取docx(Buffer.from('不是压缩包'))).rejects.toThrow()
  })

  it('缺少正文文件的压缩包应拒绝读取', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('无关文件.txt', '内容')
    const 数据 = await 压缩包.generateAsync({ type: 'nodebuffer' })

    await expect(读取docx(数据)).rejects.toThrow(/word\/document\.xml/)
  })

  it('正文结构损坏时应拒绝读取', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body>')
    const 数据 = await 压缩包.generateAsync({ type: 'nodebuffer' })

    await expect(读取docx(数据)).rejects.toThrow(/正文|结构|格式/)
  })

  it('正文段落未闭合时不能伪装为空白文档', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>正文</w:t></w:r></w:body></w:document>')
    const 数据 = await 压缩包.generateAsync({ type: 'nodebuffer' })

    await expect(读取docx(数据)).rejects.toThrow(/正文|结构|格式/)
  })
})

describe('读取时的保真警告', () => {
  const 构造文档 = async (正文, 额外文件 = {}) => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', `<w:document><w:body>${正文}</w:body></w:document>`)
    Object.entries(额外文件).forEach(([路径, 内容]) => 压缩包.file(路径, 内容))
    return 压缩包.generateAsync({ type: 'nodebuffer' })
  }

  it('纯文字没有未导入内容时不生成警告', async () => {
    const 数据 = await 构造文档('<w:p><w:r><w:t>正文</w:t></w:r></w:p>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
  })

  it('正文含图片和图形时分别指出未导入对象', async () => {
    const 数据 = await 构造文档(
      '<w:p><w:r><w:t>正文</w:t></w:r><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r>' +
      '<w:r><w:pict><v:shape id="形状"/></w:pict></w:r></w:p>'
    )
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toContain('图片未导入')
    expect(结果.警告).toContain('图形未导入')
  })

  it('只对正文实际引用的页眉页脚生成警告', async () => {
    const 仅有孤立文件 = await 构造文档('<w:p><w:r><w:t>正文</w:t></w:r></w:p>', {
      'word/header1.xml': '<w:hdr><w:p><w:r><w:t>孤立页眉</w:t></w:r></w:p></w:hdr>',
    })
    expect((await 读取docx(仅有孤立文件)).警告).toEqual([])

    const 数据 = await 构造文档(
      '<w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr><w:headerReference r:id="rId2"/><w:footerReference r:id="rId3"/></w:sectPr>',
      { 'word/header1.xml': '<w:hdr/>', 'word/footer1.xml': '<w:ftr/>' }
    )
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toContain('页眉未导入')
    expect(结果.警告).toContain('页脚未导入')
  })

  it('正文引用音视频和批注时列出对应丢失项', async () => {
    const 数据 = await 构造文档(
      '<w:p><w:r><w:t>正文</w:t></w:r><w:r><w:drawing><a:videoFile r:link="rId4"/></w:drawing></w:r>' +
      '<w:r><w:commentReference w:id="1"/></w:r></w:p>'
    )
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toContain('媒体未导入')
    expect(结果.警告).toContain('批注未导入')
  })
})
