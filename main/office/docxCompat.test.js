const JSZip = require('jszip')
const { 补齐兼容设置Xml } = require('./docxCompat')
const { 生成docx } = require('./docxWriter')

describe('Word 兼容设置', () => {
  it('新建文档写入 compatibilityMode=15 与中文主题语言，避免 Word 以兼容模式打开', async () => {
    const 数据 = await 生成docx({ 段落: [{ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '兼容测试', 加粗: false, 倾斜: false, 下划线: false, 删除线: false }] }], 未覆盖: [] })
    const 包 = await JSZip.loadAsync(数据)
    const 设置 = await 包.file('word/settings.xml').async('string')
    expect(设置).toContain('w:name="compatibilityMode"')
    const 模式项 = 设置.match(/<w:compatSetting\b(?=[^>]*w:name="compatibilityMode")[^>]*\/>/)?.[0]
    expect(模式项).toContain('w:val="15"')
    expect(设置.match(/w:name="compatibilityMode"/g)).toHaveLength(1)
    expect(设置).toContain('<w:themeFontLang w:val="en-US" w:eastAsia="zh-CN"/>')
    expect(设置.indexOf('<w:compat>')).toBeLessThan(设置.indexOf('<w:themeFontLang'))
    expect(设置.indexOf('<w:decimalSymbol')).toBeLessThan(设置.indexOf('<w:listSeparator'))
  })

  it('已有兼容设置与语言时保持原值', () => {
    const 原始 = '<w:settings xmlns:w="w"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="14"/></w:compat><w:themeFontLang w:val="zh-CN"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=","/></w:settings>'
    expect(补齐兼容设置Xml(原始)).toBe(原始)
  })

  it('新建文档强制把低版本兼容模式提升为 15，属性顺序不影响识别', () => {
    const 结果 = 补齐兼容设置Xml('<w:settings xmlns:w="w"><w:compat><w:compatSetting w:val="12" w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word"/></w:compat></w:settings>', { 强制最新: true })
    expect(结果).toContain('<w:compatSetting w:val="15" w:name="compatibilityMode"')
    expect(结果.match(/compatibilityMode/g)).toHaveLength(1)
  })

  it('空 compat 元素补齐兼容项并插在 rsids 之前', () => {
    const 结果 = 补齐兼容设置Xml('<w:settings xmlns:w="w"><w:zoom w:percent="100"/><w:rsids/></w:settings>')
    expect(结果.indexOf('<w:compat>')).toBeGreaterThan(结果.indexOf('<w:zoom'))
    expect(结果.indexOf('<w:compat>')).toBeLessThan(结果.indexOf('<w:rsids'))
  })
})
