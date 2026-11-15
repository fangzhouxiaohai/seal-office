import { describe, it, expect } from 'vitest'
import { 保存为纯文本, 导出为Html, 导出为文本, 生成文件名 } from './exportDoc'

describe('导出文档', () => {
  it('HTML 输出包含中文标题、语言声明与 utf-8 编码', () => {
    const 结果 = 导出为Html('季度报告', '<p>正文</p>')
    expect(结果).toContain('<title>季度报告</title>')
    expect(结果).toContain('charset="utf-8"')
    expect(结果).toContain('lang="zh-CN"')
    expect(结果).toContain('<p>正文</p>')
  })

  it('导出 HTML 与 PDF 共用编辑区正文样式，避免打印回退到默认字体', () => {
    const 结果 = 导出为Html('季度报告', '<p>正文</p>')
    // A4 版心与页边距由 CSS 声明，配合 printToPDF 的 preferCSSPageSize 不再整体缩放
    expect(结果).toContain('@page { size: A4; margin: 20mm 18mm; }')
    expect(结果).toContain('font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif;')
    expect(结果).toContain('font-size: 14px;')
    expect(结果).toContain('line-height: 1.75;')
    expect(结果).toContain('p { margin: 0 0 10px; }')
    expect(结果).toContain('img, svg, video { max-width: 100%; height: auto; }')
    // 分页符在打印时强制换页
    expect(结果).toContain('.wps-page-break, [data-seal-page-break] { break-after: page; page-break-after: always;')
  })

  it('页眉页脚样式不再重复声明互相覆盖的 @page 边距', () => {
    const 结果 = 导出为Html('测试', '<p>正文</p>', '<div>页眉</div>', '<div>页脚</div>')
    expect(结果.match(/@page/g)).toHaveLength(1)
    expect(结果).toContain('class="seal-print-header"')
    expect(结果).toContain('class="seal-print-footer"')
  })

  it('打印 HTML 保留文字或图片水印，且不执行水印文字中的标签', () => {
    const 文字 = 导出为Html('测试', '<p>正文</p>', '', '', '<script>danger</script>')
    expect(文字).toContain('class="seal-print-watermark"')
    expect(文字).toContain('&lt;script&gt;danger&lt;/script&gt;')
    expect(文字).not.toContain('<script>danger</script>')
    const 图片 = 导出为Html('测试', '<p>正文</p>', '', '', '图片:data:image/png;base64,AQID')
    expect(图片).toContain('<img src="data:image/png;base64,AQID"')
  })

  it('文本输出按段落转换为换行', () => {
    expect(导出为文本('<p>第一段</p><p>第二段</p>')).toBe('第一段\n第二段')
  })

  it('br 标签转换为换行', () => {
    expect(导出为文本('第一行<br>第二行')).toBe('第一行\n第二行')
  })

  it('纯文本编辑区内的手动换行按来源风格保存，空段落占位符不多写换行', () => {
    expect(保存为纯文本('<p data-seal-line-ending="crlf">甲<br>乙</p><p><br></p>')).toBe('甲\r\n乙\r\n')
  })

  it('解码常见实体', () => {
    expect(导出为文本('<p>甲&nbsp;乙 &lt;标签&gt; &amp; 符号</p>')).toBe('甲 乙 <标签> & 符号')
  })

  it('空段落不产生额外空行', () => {
    expect(导出为文本('<p>一</p><p></p><p></p><p>二</p>')).toBe('一\n二')
  })

  it('去除首尾空白', () => {
    expect(导出为文本('   <p>内容</p>   ')).toBe('内容')
  })

  it('生成文件名时替换原有扩展名', () => {
    expect(生成文件名('季度报告.docx', 'txt')).toBe('季度报告.txt')
    expect(生成文件名('未命名文档', 'html')).toBe('未命名文档.html')
  })
})
