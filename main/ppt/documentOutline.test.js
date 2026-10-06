const { 读取提纲文件, 解析Markdown, 解析纯文本, 解析DocxHtml, 支持扩展名 } = require('./documentOutline')

describe('文档生成 PPT 的提纲导入', () => {
  it('Markdown 按标题层级生成提纲，正文行成为要点', () => {
    const 文本 = ['# 季度汇报', '', '开场说明', '', '## 收入情况', '- 同比增长 12%', '- 新签客户 30 家', '', '## 交付节奏', '按期交付率 98%'].join('\n')
    const 结果 = 解析Markdown(文本)
    expect(结果.提纲.map((节) => 节.标题)).toEqual(['季度汇报', '收入情况', '交付节奏'])
    expect(结果.提纲[1].要点).toEqual(['同比增长 12%', '新签客户 30 家'])
    expect(结果.遗漏).toEqual([])
  })

  it('纯文本用首个非空行作标题，其余行作要点，忽略空行', () => {
    const 结果 = 解析纯文本('季度总结\n\n收入增长\n交付按期\n')
    expect(结果.提纲).toHaveLength(1)
    expect(结果.提纲[0].标题).toBe('季度总结')
    expect(结果.提纲[0].要点).toEqual(['收入增长', '交付按期'])
  })

  it('Docx 转换后的 HTML 提取标题与要点，并如实报告图片与表格遗漏', () => {
    const html = '<h1>季度汇报</h1><p>开场</p><h2>收入</h2><ul><li>增长 12%</li></ul><img src="a.png"/><table><tr><td>数据</td></tr></table>'
    const 结果 = 解析DocxHtml(html)
    expect(结果.提纲.map((节) => 节.标题)).toEqual(['季度汇报', '收入'])
    expect(结果.提纲[1].要点).toEqual(['增长 12%'])
    expect(结果.遗漏.map((项) => 项.类型)).toEqual(expect.arrayContaining(['图片', '表格']))
  })

  it('按扩展名选择解析方式，返回可追溯的来源信息', async () => {
    const 结果 = await 读取提纲文件({ 名称: '提纲.md', 字节: Buffer.from('# 标题\n要点一', 'utf8') })
    expect(结果.来源).toMatchObject({ 名称: '提纲.md', 类型: '.md' })
    expect(结果.来源.字节数).toBeGreaterThan(0)
    expect(结果.提纲[0].标题).toBe('标题')
    const docx = await 读取提纲文件({ 名称: '稿件.docx', 字节: Buffer.from('x'), 读取docx: async () => ({ value: '<h1>甲</h1><p>乙</p>' }) })
    expect(docx.提纲[0].标题).toBe('甲')
    expect(支持扩展名).toEqual(expect.arrayContaining(['.docx', '.txt', '.md']))
  })

  it('超量内容被截断并在遗漏中说明，不静默丢弃', () => {
    const 行 = ['# 标题']
    for (let i = 0; i < 20; i += 1) 行.push(`- 要点 ${i}`)
    const 结果 = 解析Markdown(行.join('\n'))
    expect(结果.提纲[0].要点).toHaveLength(8)
    expect(结果.遗漏.some((项) => 项.类型 === '要点')).toBe(true)

    const 多节 = []
    for (let i = 0; i < 70; i += 1) 多节.push(`## 第 ${i} 节`, '内容')
    const 截断 = 解析Markdown(多节.join('\n'))
    expect(截断.提纲.length).toBeLessThanOrEqual(60)
    expect(截断.遗漏.some((项) => 项.类型 === '节数')).toBe(true)
  })

  it('不支持的格式、空内容与过大文件给出真实原因', async () => {
    await expect(读取提纲文件({ 名称: '稿件.pdf', 字节: Buffer.from('x') })).rejects.toThrow('不支持')
    await expect(读取提纲文件({ 名称: '空.txt', 字节: Buffer.from('   \n  ') })).rejects.toThrow('没有可导入的文字')
    await expect(读取提纲文件({ 名称: '大.txt', 字节: Buffer.alloc(6 * 1024 * 1024, 97) })).rejects.toThrow('过大')
    await expect(读取提纲文件({ 名称: '坏.docx', 字节: Buffer.from('x'), 读取docx: async () => { throw new Error('文档结构损坏') } })).rejects.toThrow('文档结构损坏')
  })
})
