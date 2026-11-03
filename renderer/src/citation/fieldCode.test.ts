import { describe, it, expect } from 'vitest'
import { 识别域类别, 解析域代码, 序列化引文域, 序列化书目域, 提取可见文字 } from './fieldCode'
import type { 引文簇引用 } from './types'

const 簇: 引文簇引用 = {
  citationID: 'c1',
  citationItems: [{ id: 'ITEM1', locator: '12', label: 'page' }],
  properties: { noteIndex: 0 },
}

describe('域代码序列化', () => {
  it('引文域使用 Zotero 的 ITEM CSL_CITATION 前缀', () => {
    const 代码 = 序列化引文域(簇)
    expect(代码.startsWith('ITEM CSL_CITATION {')).toBe(true)
    const 数据 = JSON.parse(代码.slice(代码.indexOf('{')))
    expect(数据.citationID).toBe('c1')
    expect(数据.citationItems).toEqual([{ id: 'ITEM1', locator: '12', label: 'page' }])
    expect(数据.properties).toEqual({ noteIndex: 0 })
  })

  it('书目域使用 BIBL 前缀与 CSL_BIBLIOGRAPHY 后缀', () => {
    const 代码 = 序列化书目域({ omitted: [{ id: 'X' }] })
    expect(代码.startsWith('BIBL {')).toBe(true)
    expect(代码.endsWith('} CSL_BIBLIOGRAPHY')).toBe(true)
    expect(JSON.parse(代码.slice(5, 代码.lastIndexOf('}') + 1))).toEqual({ omitted: [{ id: 'X' }] })
  })

  it('空引用无法生成引文域', () => {
    expect(() => 序列化引文域({ citationID: 'x', citationItems: [], properties: { noteIndex: 0 } })).toThrow('至少需要一条引用')
  })
})

describe('域代码解析', () => {
  it('识别三类域', () => {
    expect(识别域类别('ITEM CSL_CITATION {"x":1}')).toBe('引文')
    expect(识别域类别('BIBL {} CSL_BIBLIOGRAPHY')).toBe('书目')
    expect(识别域类别('PAGE')).toBe('未知')
  })

  it('完整往返', () => {
    const 解析 = 解析域代码(序列化引文域(簇))
    expect(解析.类别).toBe('引文')
    if (解析.类别 !== '引文') throw new Error('应为引文域')
    expect(解析.簇.citationID).toBe('c1')
    expect(解析.簇.citationItems).toEqual(簇.citationItems)
  })

  it('书目域往返保留 uncited 与 omitted', () => {
    const 解析 = 解析域代码(序列化书目域({ uncited: [{ id: 'U' }], omitted: [{ id: 'O' }] }))
    expect(解析.类别).toBe('书目')
    if (解析.类别 !== '书目') throw new Error('应为书目域')
    expect(解析.数据.uncited).toEqual([{ id: 'U' }])
    expect(解析.数据.omitted).toEqual([{ id: 'O' }])
  })

  it('大写键名与 Zotero 2.x 写法一律判为未知并说明原因', () => {
    const 代码 = 'ITEM CSL_CITATION {"citationID":"old","CITATIONITEMS":[{"ITEMID":"A"}]}'
    const 解析 = 解析域代码(代码)
    expect(解析.类别).toBe('未知')
    if (解析.类别 !== '未知') throw new Error('应为未知域')
    expect(解析.原因).toContain('全部大写')
  })

  it('兼容 2.1b1 的多余花括号', () => {
    const 代码 = 'ITEM CSL_CITATION {"citationID":"c9","citationItems":[{"id":"A"}],"properties":{{"unsorted":true}}}'
    const 解析 = 解析域代码(代码)
    expect(解析.类别).toBe('引文')
  })

  it('大写破坏的域给出明确中文原因，不猜题录', () => {
    const 代码 = 'ITEM CSL_CITATION {"CITATIONID":"X","CITATIONITEMS":[{"ID":"A"}]}'
    const 解析 = 解析域代码(代码)
    expect(解析).toEqual({ 类别: '未知', 原因: '域代码曾被「全部大写」格式破坏，无法还原题录信息' })
  })

  it('空代码与非法 JSON 分别提示', () => {
    expect(解析域代码('')).toEqual({ 类别: '未知', 原因: '域代码为空' })
    expect(解析域代码('ITEM CSL_CITATION {坏数据}')).toEqual({ 类别: '未知', 原因: '域代码中的数据不是合法 JSON' })
  })

  it('缺少数据段时提示缺少数据部分', () => {
    expect(解析域代码('ITEM CSL_CITATION')).toEqual({ 类别: '未知', 原因: '域代码缺少数据部分' })
  })

  it('没有引用条目的引文域判为未知', () => {
    expect(解析域代码('ITEM CSL_CITATION {"citationItems":[]}')).toEqual({ 类别: '未知', 原因: '域代码中没有可用的引用条目' })
  })

  it('规范化 locatorType 与 suppressAuthor 旧字段', () => {
    const 解析 = 解析域代码('ITEM CSL_CITATION {"citationID":"c","citationItems":[{"id":"A","locatorType":"page","suppressAuthor":true}]}')
    expect(解析.类别).toBe('引文')
    if (解析.类别 !== '引文') throw new Error('应为引文域')
    expect(解析.簇.citationItems[0]).toEqual({ id: 'A', label: 'page', 'suppress-author': true })
  })
})

describe('可见文字提取', () => {
  it('去标签并还原常见实体', () => {
    expect(提取可见文字('<sup>[1]</sup>')).toBe('[1]')
    expect(提取可见文字('A&amp;B&nbsp;C')).toBe('A&B C')
  })
})
