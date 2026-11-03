import { describe, it, expect } from 'vitest'
import {
  刷新文档域,
  取消链接,
  生成引文域Html,
  生成书目域Html,
  新建引文簇,
  收集引文域,
  收集书目域,
  收集引用键,
  读取引文簇,
  建立条目表,
} from './documentModel'
import { 取内置样式 } from './styles'
import type { Csl条目, 引文簇引用 } from './types'

const 条目 = (id: string): Csl条目 => ({
  id,
  type: 'article-journal',
  title: `${id} 题名`,
  author: [{ family: 'Zhang', given: 'San' }],
  issued: { 'date-parts': [[2020]] },
  'container-title': 'Journal',
  page: '1-10',
})

const 条目表 = 建立条目表([条目('a'), 条目('b'), 条目('c')])
const 样式 = 取内置样式('gb-t-7714-2015-numeric')

const 簇 = (citationID: string, ids: string[]): 引文簇引用 => ({
  citationID,
  citationItems: ids.map((id) => ({ id })),
  properties: { noteIndex: 0 },
})

function 建文档(html: string): HTMLElement {
  const 根 = document.createElement('div')
  根.innerHTML = html
  return 根
}

describe('引文域节点', () => {
  it('生成的节点不可编辑并携带域代码', () => {
    const html = 生成引文域Html(簇('c1', ['a']), '<sup>[1]</sup>')
    const 根 = 建文档(html)
    const 域 = 收集引文域(根)
    expect(域).toHaveLength(1)
    expect(域[0].元素.getAttribute('contenteditable')).toBe('false')
    expect(域[0].代码).toContain('ITEM CSL_CITATION')
    expect(域[0].元素.textContent).toBe('[1]')
  })

  it('属性中的引号被转义，域代码不会被截断', () => {
    const html = 生成引文域Html(簇('c1', ['a']), 'x')
    const 根 = 建文档(html)
    expect(收集引文域(根)[0].代码).toBe(
      'ITEM CSL_CITATION {"citationID":"c1","citationItems":[{"id":"a"}],"properties":{"noteIndex":0}}',
    )
  })

  it('书目节点包含标题、编号与条目正文', () => {
    const html = 生成书目域Html([{ 序号: 1, 标识: 'a', 文字: '张三. 题名[J]. 2020.', 编号文字: '[1]' }])
    const 根 = 建文档(html)
    const 域 = 收集书目域(根)
    expect(域).toHaveLength(1)
    expect(域[0].元素.textContent).toContain('参考文献')
    expect(域[0].元素.textContent).toContain('[1]')
    expect(域[0].代码).toContain('CSL_BIBLIOGRAPHY')
  })
})

describe('文档域刷新', () => {
  it('按文档顺序重排编号', () => {
    const 根 = 建文档(
      `<p>甲${生成引文域Html(簇('c1', ['b']), '旧')}乙${生成引文域Html(簇('c2', ['a']), '旧')}</p>`,
    )
    const 结果 = 刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })
    expect(结果.引文数).toBe(2)
    const 文字 = 收集引文域(根).map(({ 元素 }) => 元素.textContent)
    expect(文字).toEqual(['[1]', '[2]'])
  })

  it('删除中间引文后编号与书目自动重排', () => {
    const 根 = 建文档(
      `<p>${生成引文域Html(簇('c1', ['a']), '')}</p><p>${生成引文域Html(簇('c2', ['b']), '')}</p>` +
      `<p>${生成引文域Html(簇('c3', ['c']), '')}</p>${生成书目域Html([])}`,
    )
    刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })
    // 删除第二个引文域后重新刷新
    收集引文域(根)[1].元素.remove()
    const 结果 = 刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })
    expect(结果.引文数).toBe(2)
    expect(收集引文域(根).map(({ 元素 }) => 元素.textContent)).toEqual(['[1]', '[2]'])
    const 书目 = 收集书目域(根)[0].元素
    expect(书目.textContent).toContain('a 题名')
    expect(书目.textContent).toContain('c 题名')
    expect(书目.textContent).not.toContain('b 题名')
  })

  it('书目域保留原有属性，只替换内容', () => {
    const 根 = 建文档(`<p>${生成引文域Html(簇('c1', ['a']), '')}</p><div data-seal-bibliography="1" data-seal-bibliography-code="BIBL {} CSL_BIBLIOGRAPHY" class="自定义样式"></div>`)
    刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })
    const 书目 = 收集书目域(根)[0].元素
    expect(书目.className).toContain('自定义样式')
    expect(书目.textContent).toContain('a 题名')
  })

  it('无引文时清空残留书目', () => {
    const 根 = 建文档(`<p>正文</p>${生成书目域Html([{ 序号: 1, 标识: 'a', 文字: '残留', 编号文字: '[1]' }])}`)
    const 结果 = 刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })
    expect(结果.引文数).toBe(0)
    expect(收集书目域(根)).toHaveLength(0)
  })

  it('损坏的域如实进异常列表，不影响其余引文', () => {
    const 根 = 建文档(
      `<p>${生成引文域Html(簇('c1', ['a']), '')}</p><span data-seal-citation="bad" data-seal-citation-code="坏数据"></span>`,
    )
    const 结果 = 刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })
    expect(结果.引文数).toBe(1)
    expect(结果.异常).toHaveLength(1)
    expect(结果.异常[0].原因).toContain('不是 Zotero 引文域')
  })

  it('引用不存在的文献时抛出中文错误，不静默丢弃', () => {
    const 根 = 建文档(`<p>${生成引文域Html(簇('c1', ['缺失']), '')}</p>`)
    expect(() => 刷新文档域(根, { 样式, 语言: 'zh-CN', 条目: 条目表 })).toThrow('引文排版失败')
  })
})

describe('取消链接', () => {
  it('去掉域属性但保留可见文字', () => {
    const 根 = 建文档(`<p>甲${生成引文域Html(簇('c1', ['a']), '<sup>[1]</sup>')}乙</p>`)
    const 数量 = 取消链接(根)
    expect(数量).toBe(1)
    expect(收集引文域(根)).toHaveLength(0)
    expect(根.textContent).toContain('[1]')
    expect(根.innerHTML).not.toContain('ITIM')
    expect(根.innerHTML).not.toContain('data-seal-citation')
  })

  it('参考文献表的容器展开为普通段落', () => {
    const 根 = 建文档(`<div>${生成书目域Html([{ 序号: 1, 标识: 'a', 文字: '张三. 题名[J]. 2020.', 编号文字: '[1]' }])}</div>`)
    取消链接(根)
    expect(收集书目域(根)).toHaveLength(0)
    expect(根.querySelectorAll('p').length).toBeGreaterThan(0)
    expect(根.textContent).toContain('参考文献')
  })
})

describe('引文簇与文献表', () => {
  it('新簇编号在文档内唯一', () => {
    const 现有 = [簇('c1', ['a']), 簇('c2', ['b'])]
    expect(新建引文簇(现有, [{ id: 'c' }]).citationID).toBe('c3')
  })

  it('编号被占用时向后顺延', () => {
    const 现有 = [簇('c1', ['a']), 簇('c3', ['b'])]
    expect(新建引文簇(现有, [{ id: 'c' }]).citationID).toBe('c4')
  })

  it('收集引用键去重', () => {
    expect(收集引用键([簇('c1', ['a', 'b']), 簇('c2', ['b'])]).sort()).toEqual(['a', 'b'])
  })

  it('读取引文簇按文档顺序', () => {
    const 根 = 建文档(
      `${生成引文域Html(簇('c1', ['b']), '')}${生成引文域Html(簇('c2', ['a']), '')}`,
    )
    expect(读取引文簇(根).簇.map((项) => 项.citationID)).toEqual(['c1', 'c2'])
  })

  it('缺失 citationID 的域补一个稳定标识', () => {
    const 根 = 建文档(`<span data-seal-citation="x" data-seal-citation-code="ITEM CSL_CITATION {&quot;citationItems&quot;:[{&quot;id&quot;:&quot;a&quot;}]}"></span>`)
    expect(读取引文簇(根).簇[0].citationID).toBe('cluster-1')
  })

  it('条目表按 id 建索引', () => {
    expect(Object.keys(建立条目表([条目('a'), 条目('b')]))).toEqual(['a', 'b'])
  })
})
