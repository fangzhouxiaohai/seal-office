import { describe, it, expect, beforeEach } from 'vitest'
import { 插入引文, 插入书目, 刷新域, 执行取消链接, 当前语言, 当前样式, type 引文上下文 } from './commands'
import { 收集引文域, 收集书目域, 生成引文域Html, 新建引文簇 } from './documentModel'
import type { Csl条目, 引文偏好 } from './types'

const 条目 = (id: string): Csl条目 => ({
  id,
  type: 'article-journal',
  title: `${id} 题名`,
  author: [{ family: 'Zhang', given: 'San' }],
  issued: { 'date-parts': [[2020]] },
  'container-title': 'Journal',
  page: '1-10',
})

let 根: HTMLElement
let 提示: string[]

function 建上下文(偏好: 引文偏好 = { 样式标识: 'gb-t-7714-2015-numeric', 语言: 'zh-CN' }): 引文上下文 {
  return {
    根,
    条目: { a: 条目('a'), b: 条目('b'), c: 条目('c') },
    偏好,
    插入内容: (html: string) => {
      if (html) 根.insertAdjacentHTML('beforeend', html)
    },
    notify: (文本: string) => 提示.push(文本),
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  根 = document.createElement('div')
  根.innerHTML = '<p>正文</p>'
  document.body.appendChild(根)
  提示 = []
})

describe('样式与语言', () => {
  it('默认使用国标顺序编码制与中文语言', () => {
    const 偏好: 引文偏好 = { 样式标识: '不存在', 语言: '' }
    expect(当前样式(偏好).标识).toBe('gb-t-7714-2015-numeric')
    expect(当前语言(偏好)).toBe('zh-CN')
  })

  it('样式自带语言优先，避免国标样式配英文语言', () => {
    expect(当前语言({ 样式标识: 'apa', 语言: 'zh-CN' })).toBe('en-US')
  })
})

describe('插入引文', () => {
  it('插入后生成域节点并按文档顺序编号', () => {
    插入引文(建上下文(), ['b'])
    插入引文(建上下文(), ['a'])
    const 域 = 收集引文域(根)
    expect(域).toHaveLength(2)
    expect(域.map(({ 元素 }) => 元素.textContent)).toEqual(['[1]', '[2]'])
  })

  it('域代码可往返，含 citationID 与条目 id', () => {
    插入引文(建上下文(), ['a', 'b'])
    const 域 = 收集引文域(根)[0]
    expect(域.代码).toContain('ITEM CSL_CITATION')
    expect(域.代码).toContain('"a"')
    expect(域.代码).toContain('"b"')
  })

  it('同一位置多条文献合并编号', () => {
    插入引文(建上下文(), ['a', 'b'])
    expect(收集引文域(根)[0].元素.textContent).toBe('[1,2]')
  })

  it('不存在的文献直接拒绝，不生成空域', () => {
    expect(() => 插入引文(建上下文(), ['缺失'])).toThrow('所选文献不在当前文档文献库中')
    expect(收集引文域(根)).toHaveLength(0)
  })

  it('新簇编号在文档内唯一', () => {
    const 上下文 = 建上下文()
    const 首个 = 插入引文(上下文, ['a'])
    const 第二个 = 插入引文(上下文, ['b'])
    expect(首个).not.toBe(第二个)
  })
})

describe('插入书目', () => {
  it('没有引文时拒绝生成', () => {
    expect(() => 插入书目(建上下文())).toThrow('文档中还没有引文')
    expect(收集书目域(根)).toHaveLength(0)
  })

  it('生成参考文献表并带编号', () => {
    插入引文(建上下文(), ['a'])
    插入引文(建上下文(), ['b'])
    插入书目(建上下文())
    const 表 = 收集书目域(根)
    expect(表).toHaveLength(1)
    expect(表[0].元素.textContent).toContain('参考文献')
    expect(表[0].元素.textContent).toContain('[1]')
    expect(表[0].元素.textContent).toContain('[2]')
  })

  it('重复插入不产生第二个表，改为重新生成', () => {
    const 上下文 = 建上下文()
    插入引文(上下文, ['a'])
    插入书目(上下文)
    插入书目(上下文)
    expect(收集书目域(根)).toHaveLength(1)
    expect(提示.join()).toContain('已存在')
  })
})

describe('刷新域', () => {
  it('删除中间引文后编号与书目重排', () => {
    const 上下文 = 建上下文()
    插入引文(上下文, ['a'])
    插入引文(上下文, ['b'])
    插入引文(上下文, ['c'])
    插入书目(上下文)
    收集引文域(根)[1].元素.remove()
    刷新域(上下文)
    expect(收集引文域(根).map(({ 元素 }) => 元素.textContent)).toEqual(['[1]', '[2]'])
    const 表 = 收集书目域(根)[0].元素.textContent ?? ''
    expect(表).not.toContain('b 题名')
    expect(表).toContain('c 题名')
  })

  it('切换样式后引文与书目全部重排', () => {
    const 国标 = 建上下文()
    插入引文(国标, ['a'])
    插入书目(国标)
    const 国标引文 = 收集引文域(根)[0].元素.textContent
    const 国标书目 = 收集书目域(根)[0].元素.textContent

    刷新域(建上下文({ 样式标识: 'apa', 语言: 'en-US' }))
    const apa引文 = 收集引文域(根)[0].元素.textContent
    const apa书目 = 收集书目域(根)[0].元素.textContent
    expect(国标引文).not.toBe(apa引文)
    expect(国标书目).not.toBe(apa书目)
    expect(apa引文).toContain('2020')
  })

  it('异常域如实提示，不静默丢弃', () => {
    根.insertAdjacentHTML('beforeend', '<span data-seal-citation="bad" data-seal-citation-code="坏数据"></span>')
    刷新域(建上下文())
    expect(提示.join()).toContain('无法解析')
  })

  it('没有引文时提示刷新数为零', () => {
    const 结果 = 刷新域(建上下文())
    expect(结果).toEqual({ 引文数: 0, 书目数: 0 })
  })
})

describe('取消链接', () => {
  it('域变纯文本并保留可见文字', () => {
    const 上下文 = 建上下文()
    插入引文(上下文, ['a'])
    插入书目(上下文)
    const 数量 = 执行取消链接(上下文)
    expect(数量).toBe(2)
    expect(收集引文域(根)).toHaveLength(0)
    expect(收集书目域(根)).toHaveLength(0)
    expect(根.textContent).toContain('[1]')
    expect(根.textContent).toContain('参考文献')
    expect(根.innerHTML).not.toContain('CSL_CITATION')
  })

  it('没有域时明确提示', () => {
    expect(执行取消链接(建上下文())).toBe(0)
    expect(提示.join()).toContain('没有可取消链接的引文域')
  })
})

describe('与旧数据兼容', () => {
  it('手工构造的引文域也能参与刷新', () => {
    const 簇 = 新建引文簇([], [{ id: 'a' }])
    根.insertAdjacentHTML('beforeend', 生成引文域Html(簇, '占位'))
    刷新域(建上下文())
    expect(收集引文域(根)[0].元素.textContent).toBe('[1]')
  })
})
