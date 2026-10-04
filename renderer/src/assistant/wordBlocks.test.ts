import { describe, expect, it } from 'vitest'
import { 生成文字上下文 } from './wordBlocks'
import { 预览文字修改 } from './proposal'

describe('Word 结构化引用', () => {
  it('包含独立段落、表格、段内换行及混合根文字', () => {
    const html = '开场文字<p>甲<strong>乙</strong><br>丙</p><table><tbody><tr><td>表格正文</td></tr></tbody></table>结尾'
    const 上下文 = 生成文字上下文(html)
    expect(上下文.map((项) => 项.原文)).toEqual(['开场文字', '甲乙\n丙', '表格正文', '结尾'])
    const 结果 = 预览文字修改(html, [{ 种类: '文字替换', 段落标识: '段落-4', 查找: '结尾', 替换为: '新结尾' }])
    expect(结果).toBe(html.replace('结尾', '新结尾'))
    expect(结果).not.toContain('data-seal-assistant-block')
  })
  it('嵌套列表包含上级文字且各块无重复或遗漏', () => {
    const html = '<ul><li>上级<ul><li>下级</li></ul>补充</li></ul>'
    expect(生成文字上下文(html).map((项) => 项.原文)).toEqual(['上级', '下级', '补充'])
    const 结果 = 预览文字修改(html, [{ 种类: '文字替换', 段落标识: '段落-1', 查找: '上级', 替换为: '上级改写' }])
    expect(结果).toBe(html.replace('上级', '上级改写'))
  })
})
