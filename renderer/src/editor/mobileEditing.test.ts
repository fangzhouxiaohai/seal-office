import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyListStyle } from './listStyle'
import { insertDocumentNote } from './notes'
import { htmlToDocxModel } from './commands'
import { 创建工作表, 写入单元格 } from '../sheet/model'
import { chartDataFromRange } from '../sheet/SheetChartDialog'

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })
function select(root: HTMLElement, node: Node) {
  document.body.append(root)
  const range = document.createRange(); range.selectNodeContents(node)
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
  return range
}
describe('移动审核编辑回归', () => {
  it('中文编号与字母切换不会反复取消已有列表，保存模型保留样式', () => {
    const root = document.createElement('div'); root.innerHTML = '<ol><li>第一项</li><li>第二项</li></ol>'
    select(root, root.querySelector('li')!)
    const exec = vi.spyOn(document, 'execCommand')
    expect(applyListStyle(root, 'insertOrderedList', '中文数字')).toBe(true)
    expect(root.querySelector('ol')?.style.listStyleType).toBe('cjk-ideographic')
    expect(exec).not.toHaveBeenCalled()
    expect(htmlToDocxModel(root.innerHTML).段落[0]).toMatchObject({ 列表: '编号', 列表样式: 'cjk-ideographic' })
    applyListStyle(root, 'insertOrderedList', '字母')
    expect(root.querySelectorAll('li')).toHaveLength(2)
    expect(root.querySelector('ol')?.style.listStyleType).toBe('lower-alpha')
  })
  it('脚注尾注进入真实可保存模型，正文不重复出现注释内容', () => {
    const root = document.createElement('div'); root.innerHTML = '<p>正文甲</p>'
    const range = select(root, root.firstChild!); range.collapse(false)
    insertDocumentNote(root, 'footnote', '注释 & <不执行> 😀', range)
    const range2 = document.createRange(); range2.selectNodeContents(root.firstChild!); range2.collapse(false)
    insertDocumentNote(root, 'endnote', '尾注乙', range2)
    const model = htmlToDocxModel(root.innerHTML)
    expect(model.未覆盖).toEqual([])
    expect(model.注释).toHaveLength(2)
    expect(JSON.stringify(model.段落)).not.toContain('注释 &')
    expect(JSON.stringify(model.注释)).toContain('注释 & <不执行> 😀')
    expect(JSON.stringify(model.段落)).toContain('注释引用')
  })
  it('图表使用真实范围数值，不把空白或非数字悄悄变成零', () => {
    let sheet = 创建工作表('图表数据')
    for (const [address, value] of [['A1','地区'],['B1','销售'],['A2','华北'],['B2','120'],['A3','华南'],['B3','200']]) sheet = 写入单元格(sheet, address, value)
    expect(chartDataFromRange(sheet, 'A1:B3', true)).toEqual({ 类别: ['华北', '华南'], 数值: [120, 200] })
    sheet = 写入单元格(sheet, 'B3', '非数字')
    expect(() => chartDataFromRange(sheet, 'A1:B3', true)).toThrow('第 3 行')
    expect(() => chartDataFromRange(sheet, 'A1:C3', true)).toThrow('两列')
  })
})
