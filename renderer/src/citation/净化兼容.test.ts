// 引文域节点必须能通过编辑器现有的富文本净化。
// 这是整条链路最容易失效的一环：只要 DOMPurify 把 data-seal-citation-code
// 过滤掉，编辑器重新渲染后域代码就丢了，刷新与保存都会失败。
import { describe, it, expect } from 'vitest'
import { 净化富文本 } from '../editor/sanitizeHtml'
import { 生成引文域Html, 生成书目域Html, 收集引文域, 收集书目域 } from './documentModel'
import { 解析文档 } from '../office/docModel'
import { 新建引文簇 } from './documentModel'

const 簇 = 新建引文簇([], [{ id: 'A', locator: '3', label: 'page' }])

describe('引文域与富文本净化', () => {
  it('引文域的属性与不可编辑标记全部保留', () => {
    const html = 净化富文本(`<p>正文${生成引文域Html(簇, '<sup>[1]</sup>')}</p>`)
    const 根 = document.createElement('div')
    根.innerHTML = html
    const 域 = 收集引文域(根)
    expect(域).toHaveLength(1)
    expect(域[0].元素.getAttribute('contenteditable')).toBe('false')
    expect(域[0].代码).toContain('ITEM CSL_CITATION')
    expect(域[0].元素.textContent).toBe('[1]')
  })

  it('参考文献表域的属性与编号保留', () => {
    const html = 净化富文本(生成书目域Html([{ 序号: 1, 标识: 'A', 文字: '张三. 题名[J]. 2020.', 编号文字: '[1]' }]))
    const 根 = document.createElement('div')
    根.innerHTML = html
    const 域 = 收集书目域(根)
    expect(域).toHaveLength(1)
    expect(域[0].元素.getAttribute('contenteditable')).toBe('false')
    expect(域[0].元素.textContent).toContain('[1]')
  })

  it('引文里的上标格式不会被净化掉', () => {
    const html = 净化富文本(生成引文域Html(簇, '<sup>[1]</sup>'))
    expect(html).toContain('<sup>')
  })
})

describe('引文域与文档模型', () => {
  it('保存时把域代码与缓存内容一起写进模型', () => {
    const 模型 = 解析文档(`<p>正文${生成引文域Html(簇, '<sup>[1]</sup>')}</p>`)
    const 片段 = 模型.段落.flatMap((段) => (段.类型 === '段落' ? 段.文字 : []))
      .find((项) => 项.引文域代码 !== undefined)
    expect(片段).toBeTruthy()
    expect(片段!.引文域代码).toContain('ITEM CSL_CITATION')
    expect(片段!.引文域缓存?.some((项) => 项.文本.includes('[1]'))).toBe(true)
    expect(模型.未覆盖).not.toContain('域代码')
  })

  it('域代码缺失时如实进未覆盖清单，不静默丢弃', () => {
    const 模型 = 解析文档('<p><span data-seal-citation="x">[1]</span></p>')
    expect(模型.未覆盖).toContain('引文域代码无效')
  })
})
