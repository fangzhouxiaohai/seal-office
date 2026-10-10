import { describe, it, expect } from 'vitest'
import { 查找文字, 索引文字, 定位文字, 替换范围 } from './textSearch'

function 文档(html: string) { const 根 = document.createElement('div'); 根.innerHTML = html; document.body.append(根); return 根 }
describe('正文搜索定位与替换', () => {
  it('跨粗体和超链接文字准确选中，不跨不同段落或换行误匹配', () => {
    const 根 = 文档('<p>继续补<b>充</b>自己的需求</p><p>补</p><p>充</p><p>补<br>充</p>')
    const 结果 = 查找文字(根, '补充')
    expect(结果).toHaveLength(1); expect(结果[0].toString()).toBe('补充')
    定位文字(根, 结果[0]); expect(window.getSelection()?.toString()).toBe('补充')
    const 原文 = 根.innerHTML; 查找文字(根, '补充'); expect(根.innerHTML).toBe(原文)
    根.remove()
  })
  it('大小写、正则元字符和多次命中保留实际字符位置', () => {
    const 根 = 文档('<p>Word word a.b A.B</p>')
    expect(查找文字(根, 'WORD')).toHaveLength(2)
    expect(查找文字(根, 'Word', true)).toHaveLength(1)
    expect(查找文字(根, 'a.b').map(x => x.toString())).toEqual(['a.b', 'A.B'])
    根.remove()
  })
  it('替换跨内联节点的当前结果，其他命中和无关格式不变', () => {
    const 根 = 文档('<p>补<b>充</b><i>原格式</i>补充</p>')
    const 结果 = 查找文字(根, '补充')
    替换范围(结果[1], '$&'); expect(根.textContent).toBe('补充原格式$&')
    替换范围(结果[0], '完善'); expect(根.textContent).toBe('完善原格式$&')
    expect(根.querySelector('i')?.textContent).toBe('原格式'); 根.remove()
  })
  it('从末尾全部替换不会遗漏或破坏跨节点结果', () => {
    const 根 = 文档('<p>补<b>充</b>补充补充</p>')
    for (const 范围 of 查找文字(根, '补充').reverse()) 替换范围(范围, '完善')
    expect(索引文字(根).文字).toBe('完善完善完善'); 根.remove()
  })
})
