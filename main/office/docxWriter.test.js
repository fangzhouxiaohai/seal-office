// docx 生成测试：生成后用 mammoth 反向解析，验证文字、样式、结构确实写入文件。
const mammoth = require('mammoth')
const { 生成docx } = require('./docxWriter')

/** 快速构造一个文字片段，只需指定与默认值不同的属性 */
function 片(文本, 覆盖 = {}) {
  return { 文本, 加粗: false, 倾斜: false, 下划线: false, 删除线: false, ...覆盖 }
}

/** 快速构造一个文本段落 */
function 段(文字, 覆盖 = {}) {
  return { 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字, ...覆盖 }
}

/** 生成 docx 后转回 HTML，便于断言内容 */
async function 往返(模型) {
  const 数据 = await 生成docx(模型)
  const 结果 = await mammoth.convertToHtml({ buffer: 数据 })
  return 结果.value
}

describe('生成docx - 基本结构', () => {
  it('返回可被解析的 docx 二进制数据', async () => {
    const 数据 = await 生成docx({ 段落: [段([片('海豹办公')])], 未覆盖: [] })
    expect(Buffer.isBuffer(数据)).toBe(true)
    // docx 本质是 zip，起始两字节固定为 PK
    expect(数据.subarray(0, 2).toString()).toBe('PK')
  })

  it('段落文字完整写入', async () => {
    const html = await 往返({ 段落: [段([片('海豹办公文档')])], 未覆盖: [] })
    expect(html).toContain('海豹办公文档')
  })

  it('多个段落按顺序写入', async () => {
    const html = await 往返({
      段落: [段([片('第一段')]), 段([片('第二段')]), 段([片('第三段')])],
      未覆盖: [],
    })
    expect(html.indexOf('第一段')).toBeLessThan(html.indexOf('第二段'))
    expect(html.indexOf('第二段')).toBeLessThan(html.indexOf('第三段'))
  })

  it('空文档也能生成合法文件', async () => {
    const 数据 = await 生成docx({ 段落: [段([])], 未覆盖: [] })
    expect(数据.length).toBeGreaterThan(0)
  })

  it('段落列表为空时补一个空段落，不抛异常', async () => {
    const 数据 = await 生成docx({ 段落: [], 未覆盖: [] })
    expect(Buffer.isBuffer(数据)).toBe(true)
  })
})

describe('生成docx - 标题', () => {
  it('一级标题写为 h1', async () => {
    const html = await 往返({ 段落: [段([片('文档标题')], { 级别: 1 })], 未覆盖: [] })
    expect(html).toContain('<h1>文档标题</h1>')
  })

  it('二级三级标题分别写为 h2 h3', async () => {
    const html = await 往返({
      段落: [段([片('二级')], { 级别: 2 }), 段([片('三级')], { 级别: 3 })],
      未覆盖: [],
    })
    expect(html).toContain('<h2>二级</h2>')
    expect(html).toContain('<h3>三级</h3>')
  })

  it('正文段落写为 p 而非标题', async () => {
    const html = await 往返({ 段落: [段([片('正文')])], 未覆盖: [] })
    expect(html).toContain('<p>正文</p>')
  })
})

describe('生成docx - 文字格式', () => {
  it('加粗写入文件', async () => {
    const html = await 往返({ 段落: [段([片('粗体', { 加粗: true })])], 未覆盖: [] })
    expect(html).toMatch(/<strong>粗体<\/strong>/)
  })

  it('倾斜写入文件', async () => {
    const html = await 往返({ 段落: [段([片('斜体', { 倾斜: true })])], 未覆盖: [] })
    expect(html).toMatch(/<em>斜体<\/em>/)
  })

  it('颜色写入文件，可在生成的文档 XML 中查到色值', async () => {
    const 数据 = await 生成docx({ 段落: [段([片('红字', { 颜色: 'FF0000' })])], 未覆盖: [] })
    const xml = await 读文档XML(数据)
    expect(xml).toContain('FF0000')
  })

  it('底纹写入文件', async () => {
    const 数据 = await 生成docx({ 段落: [段([片('高亮', { 底纹: 'FFFF00' })])], 未覆盖: [] })
    const xml = await 读文档XML(数据)
    expect(xml).toContain('FFFF00')
  })

  it('字号按半磅写入，12 磅对应 24', async () => {
    const 数据 = await 生成docx({ 段落: [段([片('大字', { 字号: 12 })])], 未覆盖: [] })
    const xml = await 读文档XML(数据)
    expect(xml).toMatch(/w:sz w:val="24"/)
  })

  it('字体名写入文件', async () => {
    const 数据 = await 生成docx({ 段落: [段([片('宋体字', { 字体: '宋体' })])], 未覆盖: [] })
    const xml = await 读文档XML(数据)
    expect(xml).toContain('宋体')
  })

  it('同段落多个片段各自保留格式', async () => {
    const html = await 往返({
      段落: [段([片('普通'), 片('加粗', { 加粗: true }), 片('结尾')])],
      未覆盖: [],
    })
    expect(html).toContain('普通')
    expect(html).toMatch(/<strong>加粗<\/strong>/)
    expect(html).toContain('结尾')
  })
})

describe('生成docx - 对齐与列表', () => {
  it('居中对齐写入文件', async () => {
    const 数据 = await 生成docx({ 段落: [段([片('居中')], { 对齐: '中' })], 未覆盖: [] })
    const xml = await 读文档XML(数据)
    expect(xml).toMatch(/w:jc w:val="center"/)
  })

  it('右对齐与两端对齐分别写入', async () => {
    const 数据 = await 生成docx({
      段落: [段([片('右')], { 对齐: '右' }), 段([片('两端')], { 对齐: '两端' })],
      未覆盖: [],
    })
    const xml = await 读文档XML(数据)
    expect(xml).toMatch(/w:jc w:val="right"/)
    expect(xml).toMatch(/w:jc w:val="both"/)
  })

  it('项目符号列表项写入文件', async () => {
    const html = await 往返({
      段落: [段([片('甲')], { 列表: '项目符号' }), 段([片('乙')], { 列表: '项目符号' })],
      未覆盖: [],
    })
    expect(html).toContain('<ul>')
    expect(html).toContain('甲')
  })

  it('编号列表项写入文件', async () => {
    const html = await 往返({
      段落: [段([片('一')], { 列表: '编号' }), 段([片('二')], { 列表: '编号' })],
      未覆盖: [],
    })
    expect(html).toContain('<ol>')
  })
})

describe('生成docx - 表格', () => {
  /** 构造表格单元 */
  const 单元 = (文本, 表头 = false) => ({ 表头, 文字: [片(文本)] })

  it('表格行列写入文件', async () => {
    const html = await 往返({
      段落: [
        {
          类型: '表格',
          行: [
            [单元('甲'), 单元('乙')],
            [单元('丙'), 单元('丁')],
          ],
        },
      ],
      未覆盖: [],
    })
    expect(html).toContain('<table>')
    expect(html).toContain('甲')
    expect(html).toContain('丁')
  })

  it('各行列数不一致时按最宽行补齐，避免生成非法表格', async () => {
    const 数据 = await 生成docx({
      段落: [{ 类型: '表格', 行: [[单元('甲'), 单元('乙')], [单元('丙')]] }],
      未覆盖: [],
    })
    const xml = await 读文档XML(数据)
    // 两行都应各有两个单元格
    const 单元数 = (xml.match(/<w:tc>/g) || []).length
    expect(单元数).toBe(4)
  })

  it('表格与段落混排时顺序保持', async () => {
    const html = await 往返({
      段落: [段([片('表前文字')]), { 类型: '表格', 行: [[单元('格内')]] }, 段([片('表后文字')])],
      未覆盖: [],
    })
    expect(html.indexOf('表前文字')).toBeLessThan(html.indexOf('格内'))
    expect(html.indexOf('格内')).toBeLessThan(html.indexOf('表后文字'))
  })
})

/** 从 docx 数据中取出 word/document.xml 的文本，用于断言底层写入结果 */
async function 读文档XML(数据) {
  const JSZip = require('jszip')
  const 压缩包 = await JSZip.loadAsync(数据)
  return await 压缩包.file('word/document.xml').async('string')
}
