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
  it('文档默认段落格式与样式继承按属性叠加，直接格式覆盖相同字段', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="正文"/><w:ind w:left="720"/></w:pPr><w:r><w:t>继承段落格式</w:t></w:r></w:p></w:body></w:document>')
    压缩包.file('word/styles.xml', '<w:styles><w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="基准"><w:pPr><w:ind w:left="240" w:right="360"/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="正文"><w:basedOn w:val="基准"/><w:pPr><w:spacing w:before="240"/></w:pPr></w:style></w:styles>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('margin-left:36pt')
    expect(结果.html).toContain('margin-right:18pt')
    expect(结果.html).toContain('margin-top:12pt')
    expect(结果.html).toContain('margin-bottom:6pt')
    expect(结果.html).toContain('line-height:1.5')
    expect(结果.警告).toEqual([])
  })

  it.each([{ 缩进: { 首行: -1 } }, { 间距: { 行距: 0, 行距规则: 'auto' } }, { 间距: { 段前: -1 } }, { 间距: { 行距: 360, 行距规则: '未知' } }])('无效段落参数明确报错，不静默丢弃：%j', async (格式) => {
    await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '正文' }], ...格式 }] })).rejects.toThrow('段落')
  })

  it('段落缩进、悬挂、段距与倍数行距写入真实 DOCX 后完整读回', async () => {
    const 数据 = await 生成docx({ 段落: [{ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无',
      文字: [{ 文本: '段落排版正文' }], 缩进: { 左: 720, 右: 240, 悬挂: 360 },
      间距: { 段前: 0, 段后: 120, 行距: 360, 行距规则: 'auto' },
    }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const xml = await 压缩包.file('word/document.xml').async('string')
    expect(xml).toMatch(/<w:ind[^>]*w:left="720"/)
    expect(xml).toMatch(/<w:ind[^>]*w:hanging="360"/)
    const 结果 = await 读取docx(数据)
    expect(结果.html).toContain('margin-left:36pt')
    expect(结果.html).toContain('margin-right:12pt')
    expect(结果.html).toContain('text-indent:-18pt')
    expect(结果.html).toContain('margin-top:0pt')
    expect(结果.html).toContain('margin-bottom:6pt')
    expect(结果.html).toContain('line-height:1.5')
    expect(结果.警告).toEqual([])
  })

  it.each(['exact', 'atLeast'])('固定或最小行距 %s 保留规则，不扁平化为倍数行距', async (规则) => {
    const 数据 = await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '正文' }],
      缩进: { 首行: 480 }, 间距: { 行距: 360, 行距规则: 规则 },
    }] })
    const 结果 = await 读取docx(数据)
    expect(结果.html).toContain('text-indent:24pt')
    expect(结果.html).toContain('line-height:18pt')
    expect(结果.html).toContain(`data-seal-line-rule="${规则}"`)
    expect(结果.警告).toEqual([])
  })

  it('列表项与空段落的缩进和间距不因渲染分支丢失', async () => {
    const 数据 = await 生成docx({ 段落: [
      { 类型: '段落', 列表: '项目符号', 文字: [{ 文本: '条目' }], 间距: { 段后: 160 } },
      { 类型: '段落', 文字: [], 缩进: { 首行: 480 }, 间距: { 段前: 240 } },
    ] })
    const 结果 = await 读取docx(数据)
    expect(结果.html).toMatch(/<li[^>]*style="[^"]*margin-bottom:8pt/)
    expect(结果.html).toMatch(/<p[^>]*style="[^"]*text-indent:24pt;[^\"]*margin-top:12pt;[^\"]*"><br><\/p>/)
    expect(结果.警告).toEqual([])
  })

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

  it('普通段落缩进不再误报，横向与纵向合并单元格按 colspan、rowspan 导入', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body>' +
      '<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t>缩进文字</w:t></w:r></w:p>' +
      '<w:tbl>' +
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:t>跨两列</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>跨两行</w:t></w:r></w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:p><w:r><w:t>左下</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:p><w:r><w:t>中下</w:t></w:r></w:p></w:tc>' +
      '<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr>' +
      '</w:tbl></w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('margin-left:36pt')
    expect(结果.html).toContain('colspan="2"')
    expect(结果.html).toContain('rowspan="2"')
    expect(结果.html).toContain('跨两行')
    // 被 rowspan 覆盖的续格不再重复输出，第二行只留两个真实单元格
    expect(结果.html.match(/<tr>/g)).toHaveLength(2)
    expect(结果.html.match(/<td/g)).toHaveLength(4)
    expect(结果.警告).not.toContain('段落缩进未完整导入')
    expect(结果.警告).not.toContain('表格合并单元格未导入')
  })

  it('越界或非法的合并跨度仍提示未导入', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:tbl>' +
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="999"/></w:tcPr><w:p><w:r><w:t>超宽合并</w:t></w:r></w:p></w:tc></w:tr>' +
      '<w:tr><w:tc><w:tcPr><w:vMerge w:val="未知"/></w:tcPr><w:p/></w:tc></w:tr>' +
      '</w:tbl></w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告).toContain('表格合并单元格未导入')
  })

  it('段落标记里的字符间距不再误判为段落间距，字间距按 letter-spacing 导入', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p>' +
      '<w:pPr><w:spacing w:line="240" w:lineRule="exact"/><w:rPr><w:spacing w:val="-12"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:spacing w:val="8"/></w:rPr><w:t>加宽字距</w:t></w:r>' +
      '<w:r><w:rPr><w:spacing w:val="-12"/></w:rPr><w:t>收紧字距</w:t></w:r>' +
      '</w:p></w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('letter-spacing:0.4pt')
    expect(结果.html).toContain('letter-spacing:-0.6pt')
    expect(结果.html).toContain('line-height:12pt')
    expect(结果.警告).toEqual([])
    // 段落标记自身的字符间距不参与段落排版，不应被写成段落属性
    expect(结果.html).not.toContain('data-seal-paragraph-format')
  })

  it('横向与纵向合并单元格写入真实 DOCX 后可完整读回', async () => {
    const 数据 = await 生成docx({ 段落: [{ 类型: '表格', 行: [
      [{ 文字: [{ 文本: '跨两列' }], 跨列: 2 }, { 文字: [{ 文本: '跨两行' }], 跨行: 2 }],
      [{ 文字: [{ 文本: '左下' }] }, { 文字: [{ 文本: '中下' }] }],
    ] }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const xml = await 压缩包.file('word/document.xml').async('string')
    expect(xml).toContain('<w:gridSpan w:val="2"/>')
    expect(xml).toContain('<w:vMerge w:val="restart"/>')
    expect(xml).toContain('<w:vMerge w:val="continue"/>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.html).toContain('colspan="2"')
    expect(结果.html).toContain('rowspan="2"')
    expect(结果.html).toContain('跨两列')
    expect(结果.html).toContain('中下')
  })

  it('非法的合并跨度明确报错，不静默写成错误表格', async () => {
    await expect(生成docx({ 段落: [{ 类型: '表格', 行: [[{ 文字: [], 跨列: 0 }]] }] })).rejects.toThrow('表格')
    await expect(生成docx({ 段落: [{ 类型: '表格', 行: [[{ 文字: [], 跨行: 999 }]] }] })).rejects.toThrow('表格')
  })

  it('字间距按 characterSpacing 写回，越界数值明确报错', async () => {
    const 数据 = await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '字距', 字间距: 0.4 }] }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const xml = await 压缩包.file('word/document.xml').async('string')
    expect(xml).toContain('<w:spacing w:val="8"/>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.html).toContain('letter-spacing:0.4pt')
    await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '字距', 字间距: 999999 }] }] })).rejects.toThrow('字间距')
  })

  it('普通段落间距不再误报，未覆盖的超链接目标仍提示风险', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p>' +
      '<w:pPr><w:spacing w:before="240" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>' +
      '<w:hyperlink r:id="rId7"><w:r><w:t>官网</w:t></w:r></w:hyperlink>' +
      '</w:p></w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.html).toContain('margin-top:12pt')
    expect(结果.html).toContain('margin-bottom:6pt')
    expect(结果.html).toContain('line-height:1.5')
    expect(结果.警告).not.toContain('段落间距未完整导入')
    expect(结果.警告).toContain('超链接目标未导入')
  })

  it('上标、下标、段内换行与表格内多段格式写入真实 DOCX', async () => {
    const 数据 = await 生成docx({ 段落: [
      { 类型: '段落', 文字: [{ 文本: '上标', 基线: '上标' }, { 文本: '', 换行: true }, { 文本: '下标', 基线: '下标' }] },
      { 类型: '表格', 行: [[{ 表头: false, 文字: [], 段落: [
        { 类型: '段落', 对齐: '右', 文字: [{ 文本: '表内第一段' }], 缩进: { 首行: 480 }, 间距: { 行距: 360, 行距规则: 'auto' } },
        { 类型: '段落', 文字: [{ 文本: '表内第二段' }], 间距: { 段前: 240 } },
      ] }]] },
    ] })
    const 结果 = await 读取docx(数据)
    expect(结果.html).toContain('vertical-align:super')
    expect(结果.html).toContain('vertical-align:sub')
    expect(结果.html).toContain('<br>')
    expect(结果.html).toContain('text-align:right')
    expect(结果.html).toContain('text-indent:24pt')
    expect(结果.html).toContain('margin-top:12pt')
    expect(结果.警告).toEqual([])
  })

  it('未知缩进字段与无效自动段距开关仍提示导入风险', async () => {
    const 压缩包 = new JSZip()
    压缩包.file('word/document.xml', '<w:document><w:body><w:p><w:pPr><w:ind w:unknownIndent="200"/><w:spacing w:beforeAutospacing="invalid"/></w:pPr><w:r><w:t>复杂段落设置</w:t></w:r></w:p></w:body></w:document>')
    const 结果 = await 读取docx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告).toContain('段落缩进未完整导入')
    expect(结果.警告).toContain('段落间距未完整导入')
  })

  it.each([
    { 缩进: { 首行字符: -1 } }, { 缩进: { 左字符: '100' } },
    { 间距: { 段前行: -1 } }, { 间距: { 自动段前: 1 } },
    { 间距: { 自动段后: '1\"/><w:p/>' } }, { 缩进: { 首行字符: 200, 悬挂: 240 } },
  ])('非法原生段落排版不能写入文件：%j', async (格式) => {
    await expect(生成docx({ 段落: [{ 类型: '段落', 文字: [], ...格式 }] })).rejects.toThrow('段落')
  })

  it('原生扩展属性按真实段落顺序写入表格、空行和分页符后的正文', async () => {
    const 数据 = await 生成docx({ 段落: [
      { 类型: '段落', 文字: [], 缩进: { 首行字符: 0 }, 间距: { 自动段前: false } },
      { 类型: '表格', 行: [[{ 段落: [
        { 类型: '段落', 文字: [{ 文本: '表内首段' }], 缩进: { 左字符: -100, 悬挂字符: 50 } },
        { 类型: '段落', 文字: [{ 文本: '表内第二段' }], 间距: { 段后行: 100 } },
      ] }, { 文字: [] }]] },
      { 类型: '分页符' },
      { 类型: '段落', 文字: [{ 文本: '最后正文' }], 缩进: { 右字符: 200 }, 间距: { 自动段后: true } },
    ] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const xml = await 压缩包.file('word/document.xml').async('string')
    const 段列表 = [...xml.matchAll(/<w:p(?=[\s/>])[^>]*\/>|<w:p(?=[\s>])[^>]*>[\s\S]*?<\/w:p>/g)].map((项) => 项[0])
    expect(段列表).toHaveLength(7)
    expect(段列表[0]).toContain('w:firstLineChars="0"')
    expect(段列表[1]).toContain('w:hangingChars="50"')
    expect(段列表[2]).toContain('w:afterLines="100"')
    expect(段列表[3]).not.toContain('Chars=')
    expect(段列表[4]).not.toContain('Chars=')
    expect(段列表[5]).toContain('w:type="page"')
    expect(段列表[6]).toContain('w:rightChars="200"')
    expect(段列表[6]).toContain('w:afterAutospacing="1"')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.html).toContain('margin-left:-1em')
    expect(结果.html).toContain('text-indent:-0.5em')
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

  it('缺省页边距、空页眉页脚和 VML 水平线不误报内容丢失', async () => {
    const 水平线 = '<w:p><w:r><w:pict><v:rect o:hr="t"><v:imagedata o:title=""/></v:rect></w:pict></w:r></w:p>'
    const 数据 = await 构造文档(`<w:p><w:r><w:t>正文</w:t></w:r></w:p>${水平线}<w:sectPr><w:headerReference r:id="rId1"/><w:footerReference r:id="rId2"/><w:pgSz w:w="11905" w:h="16840"/></w:sectPr>`, {
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
      'word/header1.xml': '<w:hdr><w:p/></w:hdr>',
      'word/footer1.xml': '<w:ftr><w:p/></w:ftr>',
    })
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.html).toContain('<hr>')
    expect(结果.页面设置).toMatchObject({ 纸张: 'A4', 原始页边距: { 上: 1440, 右: 1440, 下: 1440, 左: 1440 } })
  })

  it('有内容的页眉页脚及页眉图片可以读取并写回', async () => {
    const 段落 = (文字) => ({ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字 })
    const 图片 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg=='
    const 数据 = await 生成docx({
      段落: [段落([{ 文本: '正文' }])],
      页眉: [段落([{ 文本: '公司名称', 加粗: true }, { 文本: '', 图片: { 数据: 图片, 格式: 'png', 宽: 20, 高: 20, 说明: '标志' } }])],
      页脚: [段落([{ 文本: '联系地址' }])],
    })
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.页面设置.页眉Html).toContain('公司名称')
    expect(结果.页面设置.页眉Html).toContain('data:image/png;base64,')
    expect(结果.页面设置.页脚Html).toContain('联系地址')
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
    expect(结果.警告).toContain('页眉未导入：引用关系缺失或无效')
    expect(结果.警告).toContain('页脚未导入：引用关系缺失或无效')
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

  const 域序列 = (指令, 结果文字) =>
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve">${指令}</w:instrText></w:r>` +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    `<w:r><w:t>${结果文字}</w:t></w:r>` +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>'

  const 带页脚文档 = (页脚) => 构造文档(
    '<w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr><w:footerReference r:id="rId2"/></w:sectPr>',
    {
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
      'word/footer1.xml': 页脚,
    }
  )

  it('页脚页码域保留为占位，不再报告域未导入', async () => {
    const 数据 = await 带页脚文档('<w:ftr><w:p><w:r><w:t>第</w:t></w:r>' +
      域序列('PAGE  \\* MERGEFORMAT', '3') + '<w:r><w:t>页</w:t></w:r></w:p></w:ftr>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.页面设置.页脚Html).toContain('data-seal-field="PAGE"')
    expect(结果.页面设置.页脚Html).toContain('第')
    expect(结果.页面设置.页脚Html).toContain('3')
    // 写回真实域代码后重开仍能识别
    const 保存 = await 生成docx({ ...构造模型(), 页面设置: 结果.页面设置, 页脚: [
      { 类型: '段落', 对齐: '中', 文字: [{ 文本: '第' }, { 文本: '3', 域: 'PAGE' }, { 文本: '页' }] },
    ] })
    const 压缩包 = await JSZip.loadAsync(保存)
    const 页脚Xml = await 压缩包.file('word/footer1.xml').async('string')
    expect(页脚Xml).toContain('<w:fldSimple w:instr=" PAGE ">')
    const 重开 = await 读取docx(保存)
    expect(重开.警告).toEqual([])
    expect(重开.页面设置.页脚Html).toContain('data-seal-field="PAGE"')
  })

  it('简单域写法的页码页脚同样识别', async () => {
    const 数据 = await 带页脚文档('<w:ftr><w:p><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>5</w:t></w:r></w:fldSimple></w:p></w:ftr>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.页面设置.页脚Html).toContain('data-seal-field="NUMPAGES"')
  })

  it('没有缓存结果的空页码域同样保留', async () => {
    const 数据 = await 带页脚文档('<w:ftr><w:p><w:fldSimple w:instr="PAGE"/></w:p></w:ftr>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.页面设置.页脚Html).toContain('data-seal-field="PAGE"')
  })

  it('页码域写回时保留缓存结果的字符格式', async () => {
    const 数据 = await 生成docx({ ...构造模型(), 页脚: [
      { 类型: '段落', 对齐: '中', 文字: [
        { 文本: '－', 字号: 14, 字体: '宋体' },
        { 文本: '3', 字号: 14, 字体: '宋体', 域: 'PAGE' },
      ] },
    ] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const 页脚Xml = await 压缩包.file('word/footer1.xml').async('string')
    const 域Xml = 页脚Xml.match(/<w:fldSimple[\s\S]*?<\/w:fldSimple>/)?.[0] ?? ''
    expect(域Xml).toContain('w:instr=" PAGE "')
    expect(域Xml).toContain('w:sz w:val="28"')
    expect(域Xml).toContain('宋体')
    const 重开 = await 读取docx(数据)
    expect(重开.警告).toEqual([])
    expect(重开.页面设置.页脚Html).toMatch(/data-seal-field="PAGE"[^>]*style="[^"]*font-size:14pt/)
  })

  it('当前无法写回的域保留显示结果，并如实提示未导入', async () => {
    const 数据 = await 带页脚文档('<w:ftr><w:p>' + 域序列('TIME \\@ "HH:mm"', '10:30') + '</w:p></w:ftr>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toContain('页脚中的域或制表符未完整导入')
    expect(结果.页面设置.页脚Html).toContain('10:30')
    expect(结果.页面设置.页脚Html).not.toContain('data-seal-field')
  })

  it('页脚中的制表符仍提示未导入', async () => {
    const 数据 = await 带页脚文档('<w:ftr><w:p><w:r><w:t>左</w:t><w:tab/><w:t>右</w:t></w:r></w:p></w:ftr>')
    const 结果 = await 读取docx(数据)
    expect(结果.警告).toContain('页脚中的域或制表符未完整导入')
  })

  it('未启用的首页或奇偶页页脚不算丢失，启用且内容不同才提示', async () => {
    const 通用页脚 = '<w:ftr><w:p><w:r><w:t>通用页脚</w:t></w:r></w:p></w:ftr>'
    const 偶数页脚 = '<w:ftr><w:p><w:r><w:t>偶数页脚</w:t></w:r></w:p></w:ftr>'
    const 正文 = '<w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr>' +
      '<w:footerReference w:type="even" r:id="rId4"/><w:footerReference w:type="default" r:id="rId5"/></w:sectPr>'
    const 文件 = {
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/></Relationships>',
      'word/footer1.xml': 偶数页脚,
      'word/footer2.xml': 通用页脚,
    }
    // 未开启 evenAndOddHeaders 时偶数页页脚不生效，忽略它是完整保真
    const 未启用 = await 读取docx(await 构造文档(正文, 文件))
    expect(未启用.警告).toEqual([])
    expect(未启用.页面设置.页脚Html).toContain('通用页脚')

    const 已启用 = await 读取docx(await 构造文档(正文, {
      ...文件, 'word/settings.xml': '<w:settings><w:evenAndOddHeaders/></w:settings>',
    }))
    expect(已启用.警告).toContain('页脚的首页或奇偶页版本未完整导入')
    expect(已启用.页面设置.页脚Html).toContain('通用页脚')

    // 首页页脚只在 w:titlePg 生效后才提示
    const 首页正文 = '<w:p><w:r><w:t>正文</w:t></w:r></w:p><w:sectPr>' +
      '<w:footerReference w:type="first" r:id="rId4"/><w:footerReference w:type="default" r:id="rId5"/><w:titlePg/></w:sectPr>'
    expect((await 读取docx(await 构造文档(首页正文, 文件))).警告).toContain('页脚的首页或奇偶页版本未完整导入')
  })
})
