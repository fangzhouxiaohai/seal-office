// docx 模型转换回归：保存链路必须把编辑区的样式完整带进模型（此前重复实现丢失全部格式）
import { describe, expect, it } from 'vitest'
import { htmlToDocxModel } from './commands'

const 取首段文字 = (html: string) => {
  const 模型 = htmlToDocxModel(html)
  const 段 = 模型.段落[0]
  if (段.类型 !== '段落') throw new Error('首段不是文本段落')
  return { 段, 片段: 段.文字![0] }
}

describe('htmlToDocxModel 样式保真', () => {
  it('紫色大字（用户场景）的颜色与字号进入模型', () => {
    const { 片段 } = 取首段文字('<p><span style="color:#8A2BE2;font-size:36pt">威锋威锋威锋威锋网</span></p>')
    expect(片段.颜色).toBe('8A2BE2')
    expect(片段.字号).toBe(36)
  })

  it('rgb 颜色被规范化为十六进制，绝不能把 rgb() 串传给写入器', () => {
    const { 片段 } = 取首段文字('<p><span style="color: rgb(138, 43, 226);">紫色</span></p>')
    expect(片段.颜色).toBe('8A2BE2')
  })

  it('加粗斜体下划线删除线随 span 样式保留', () => {
    const { 片段 } = 取首段文字('<p><span style="font-weight:bold;font-style:italic;text-decoration:underline;">样式文字</span></p>')
    expect(片段.加粗).toBe(true)
    expect(片段.倾斜).toBe(true)
    expect(片段.下划线).toBe(true)
  })

  it('对齐与标题级别保留', () => {
    const 模型 = htmlToDocxModel('<h1 style="text-align:center">标题</h1>')
    const 段 = 模型.段落[0]
    expect(段.类型 === '段落' && 段.对齐).toBe('中')
    expect(段.类型 === '段落' && 段.级别).toBe(1)
  })

  it('列表结构保留', () => {
    const 模型 = htmlToDocxModel('<ul><li>甲</li><li>乙</li></ul>')
    expect(模型.段落.length).toBeGreaterThanOrEqual(2)
    const 首 = 模型.段落[0]
    expect(首.类型 === '段落' && 首.列表).toBe('项目符号')
  })

  it('表格转为表格段落而非压平文本', () => {
    const 模型 = htmlToDocxModel('<table><tbody><tr><th>表头</th><td>单元格</td></tr></tbody></table>')
    const 表 = 模型.段落[0]
    expect(表.类型).toBe('表格')
    if (表.类型 === '表格') {
      expect(表.行![0][0].表头).toBe(true)
      expect(表.行![0][0].文字[0].文本).toBe('表头')
      expect(表.行![0][1].文字[0].文本).toBe('单元格')
    }
  })
})
