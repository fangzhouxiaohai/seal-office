// 归一化的行为测试。
// 关键用例来自真实 Zotero 10.0.7 的实测响应，不是推测。
import { describe, it, expect } from 'vitest'
import { 提取条目键, 归一Zotero条目 } from './zoteroNormalize'

describe('从 CSL-JSON 的 id 取条目键', () => {
  it('标准 URI 取出末尾键', () => {
    expect(提取条目键('http://zotero.org/users/local/Vfc7LwfJ/items/JUQ7C9NY')).toBe('JUQ7C9NY')
  })

  it('群组库 URI 同样可用', () => {
    expect(提取条目键('http://zotero.org/groups/12345/items/ABCD2345')).toBe('ABCD2345')
  })

  it('带查询串或片段的 URI 也能取到', () => {
    expect(提取条目键('http://zotero.org/users/0/items/XY12Z345?format=json')).toBe('XY12Z345')
  })

  it('已经是纯键时原样返回', () => {
    expect(提取条目键('JUQ7C9NY')).toBe('JUQ7C9NY')
  })

  it('空值与非法值返回空串，不编造', () => {
    expect(提取条目键(undefined)).toBe('')
    expect(提取条目键('')).toBe('')
    expect(提取条目键('https://example.com/no-key-here')).toBe('')
  })
})

describe('csljson 归一化', () => {
  const 真实响应 = {
    格式: 'csljson' as const,
    会话: { 版本: '3', 实例: 'Sg0IvdWgosYV' },
    条目: [{
      id: 'http://zotero.org/users/local/Vfc7LwfJ/items/JUQ7C9NY',
      type: 'entry-encyclopedia',
    }],
  }

  it('把 URI 型 id 换成真实条目键', () => {
    const { 条目, 跳过 } = 归一Zotero条目(真实响应)
    expect(跳过).toHaveLength(0)
    expect(条目).toHaveLength(1)
    expect(条目[0].id).toBe('JUQ7C9NY')
    expect(条目[0].zoteroItemKey).toBe('JUQ7C9NY')
  })

  it('题录为空时不伪造题名', () => {
    const { 条目 } = 归一Zotero条目(真实响应)
    expect(条目[0].title).toBeUndefined()
    expect(条目[0].author).toBeUndefined()
  })

  it('同一批次内重复条目只保留一次', () => {
    const 重复 = { ...真实响应, 条目: [真实响应.条目[0], { ...真实响应.条目[0] }] }
    expect(归一Zotero条目(重复).条目).toHaveLength(1)
  })

  it('无法识别 id 的条目进跳过清单并说明原因', () => {
    const 坏 = { ...真实响应, 条目: [{ id: 'https://example.com/nothing', type: 'book' }] }
    const { 条目, 跳过 } = 归一Zotero条目(坏)
    expect(条目).toHaveLength(0)
    expect(跳过).toHaveLength(1)
    expect(跳过[0].原因).toContain('条目键')
  })

  it('非对象条目被跳过而不是抛错', () => {
    const 坏 = { ...真实响应, 条目: [null as unknown as Record<string, unknown>] }
    expect(归一Zotero条目(坏).跳过).toHaveLength(1)
  })
})

describe('json 格式归一化', () => {
  it('走本地映射，保留条目键与回链', () => {
    const { 条目, 跳过 } = 归一Zotero条目({
      格式: 'json',
      会话: { 版本: '3', 实例: 'S1' },
      条目: [{
        key: 'ABCD2345',
        data: {
          key: 'ABCD2345',
          itemType: 'journalArticle',
          title: '真实题名',
          creators: [{ creatorType: 'author', lastName: '张三', firstName: '三' }],
          date: '2024',
          publicationTitle: '某期刊',
        },
      }],
    })
    expect(跳过).toHaveLength(0)
    expect(条目[0].id).toBe('ABCD2345')
    expect(条目[0].title).toBe('真实题名')
    expect(条目[0].zoteroItemKey).toBe('ABCD2345')
    expect(条目[0]['container-title']).toBe('某期刊')
  })

  it('两种格式对同一文献产生同一个 id，便于去重', () => {
    const csl = 归一Zotero条目({
      格式: 'csljson', 会话: { 版本: '3', 实例: 'S1' },
      条目: [{ id: 'http://zotero.org/users/local/X/items/ABCD2345', type: 'book', title: 'T' }],
    }).条目[0]
    const json = 归一Zotero条目({
      格式: 'json', 会话: { 版本: '3', 实例: 'S1' },
      条目: [{ key: 'ABCD2345', data: { key: 'ABCD2345', itemType: 'book', title: 'T' } }],
    }).条目[0]
    expect(csl.id).toBe(json.id)
    expect(csl.zoteroItemKey).toBe(json.zoteroItemKey)
  })
})
