import { describe, it, expect } from 'vitest'
import { 导出为Html, 导出为文本, 生成文件名 } from './exportDoc'

describe('导出文档', () => {
  it('HTML 输出包含中文标题、语言声明与 utf-8 编码', () => {
    const 结果 = 导出为Html('季度报告', '<p>正文</p>')
    expect(结果).toContain('<title>季度报告</title>')
    expect(结果).toContain('charset="utf-8"')
    expect(结果).toContain('lang="zh-CN"')
    expect(结果).toContain('<p>正文</p>')
  })

  it('文本输出按段落转换为换行', () => {
    expect(导出为文本('<p>第一段</p><p>第二段</p>')).toBe('第一段\n第二段')
  })

  it('br 标签转换为换行', () => {
    expect(导出为文本('第一行<br>第二行')).toBe('第一行\n第二行')
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
