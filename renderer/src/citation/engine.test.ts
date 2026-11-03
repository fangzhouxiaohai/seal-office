import { describe, it, expect } from 'vitest'
import { 创建引文引擎 } from './engine'
import { 内置样式, 取内置样式, 内置语言包 } from './styles'
import type { Csl条目, 引文簇引用 } from './types'

const 条目 = (id: string, 覆盖: Partial<Csl条目> = {}): Csl条目 => ({
  id,
  type: 'article-journal',
  title: `${id} 的题名`,
  author: [{ family: 'Zhang', given: 'San' }],
  issued: { 'date-parts': [[2020]] },
  'container-title': 'Journal of Testing',
  volume: '1',
  issue: '1',
  page: '1-10',
  ...覆盖,
})

const 表 = (...列表: Csl条目[]) => Object.fromEntries(列表.map((项) => [项.id, 项]))

const 簇 = (citationID: string, ids: string[], 属性: Partial<引文簇引用['citationItems'][number]> = {}): 引文簇引用 => ({
  citationID,
  citationItems: ids.map((id) => ({ id, ...属性 })),
  properties: { noteIndex: 0 },
})

describe('内置样式与语言包', () => {
  it('六套样式齐全且都带内容', () => {
    expect(内置样式.map((样式) => 样式.标识)).toEqual([
      'gb-t-7714-2015-numeric',
      'gb-t-7714-2015-author-date',
      'apa',
      'ieee',
      'nature',
      'vancouver',
    ])
    for (const 样式 of 内置样式) {
      expect(样式.内容).toContain('<style')
      expect(样式.许可).toBe('CC BY-SA 3.0')
    }
  })

  it('中文与英文语言包可用', () => {
    expect(内置语言包['zh-CN']).toContain('<locale')
    expect(内置语言包['en-US']).toContain('<locale')
  })

  it('未知样式回退国标顺序编码制', () => {
    expect(取内置样式('不存在').标识).toBe('gb-t-7714-2015-numeric')
  })
})

describe('CSL 引擎排版', () => {
  const 引擎 = () => 创建引文引擎({ 样式: 取内置样式('gb-t-7714-2015-numeric'), 语言: 'zh-CN', 条目: 表(条目('a'), 条目('b'), 条目('c')) })

  it('按文档顺序编号', () => {
    const 结果 = 引擎().渲染([簇('c1', ['b']), 簇('c2', ['a']), 簇('c3', ['c'])])
    expect(结果.引文.map((项) => 项.文字)).toEqual(['<sup>[1]</sup>', '<sup>[2]</sup>', '<sup>[3]</sup>'])
    expect(结果.书目.map((项) => 项.标识)).toEqual(['b', 'a', 'c'])
  })

  it('删除中间引文后编号与书目自动重排', () => {
    const 结果 = 引擎().渲染([簇('c2', ['a']), 簇('c3', ['c'])])
    expect(结果.引文.map((项) => 项.文字)).toEqual(['<sup>[1]</sup>', '<sup>[2]</sup>'])
    expect(结果.书目.map((项) => 项.标识)).toEqual(['a', 'c'])
  })

  it('同一位置多条文献合并为一个编号组', () => {
    const 结果 = 引擎().渲染([簇('c1', ['a', 'b'])])
    expect(结果.引文[0].文字).toBe('<sup>[1,2]</sup>')
  })

  it('重复引用同一文献复用同一编号，书目不重复', () => {
    const 结果 = 引擎().渲染([簇('c1', ['a']), 簇('c2', ['b']), 簇('c3', ['a'])])
    expect(结果.引文[0].文字).toBe('<sup>[1]</sup>')
    expect(结果.引文[2].文字).toBe('<sup>[1]</sup>')
    expect(结果.书目).toHaveLength(2)
  })

  it('定位符只在样式支持时出现在引文中，不会静默丢失', () => {
    // GB/T 7714 两套样式的引文都不带页码（国标要求页码进参考文献表），
    // APA 的引文会输出页码，用它验证定位符确实被传给引擎。
    const apa = 创建引文引擎({ 样式: 取内置样式('apa'), 语言: 'en-US', 条目: 表(条目('a')) })
    const 无定位 = apa.渲染([簇('c1', ['a'])]).引文[0].文字
    const 有定位 = apa.渲染([簇('c1', ['a'], { locator: '12', label: 'page' })]).引文[0].文字
    expect(有定位).not.toBe(无定位)
    expect(有定位).toContain('12')
  })

  it('缺省作者选项生效', () => {
    const 作者年代 = 创建引文引擎({ 样式: 取内置样式('gb-t-7714-2015-author-date'), 语言: 'zh-CN', 条目: 表(条目('a')) })
    const 正常 = 作者年代.渲染([簇('c1', ['a'])]).引文[0].文字
    const 省略 = 作者年代.渲染([簇('c1', ['a'], { 'suppress-author': true })]).引文[0].文字
    expect(正常).not.toBe(省略)
    expect(正常.replace(/[\s\p{P}]/gu, '')).toContain('Zhang')
  })

  it('切换样式后引文与书目全部重排', () => {
    const 数据 = 表(条目('a'), 条目('b'))
    const 国标 = 创建引文引擎({ 样式: 取内置样式('gb-t-7714-2015-numeric'), 语言: 'zh-CN', 条目: 数据 }).渲染([簇('c1', ['b']), 簇('c2', ['a'])])
    const apa = 创建引文引擎({ 样式: 取内置样式('apa'), 语言: 'en-US', 条目: 数据 }).渲染([簇('c1', ['b']), 簇('c2', ['a'])])
    expect(国标.引文[0].文字).toContain('[1]')
    expect(apa.引文[0].文字).not.toContain('[1]')
    expect(apa.引文[0].文字).toContain('2020')
    expect(国标.书目[0].文字).not.toBe(apa.书目[0].文字)
  })

  it('书目条目带左侧编号时编号单独给出', () => {
    const 结果 = 引擎().渲染([簇('c1', ['a'])])
    expect(结果.书目[0].编号文字).toBe('[1]')
    expect(结果.书目[0].文字).not.toContain('csl-left-margin')
    expect(结果.书目[0].序号).toBe(1)
  })

  it('无引文时返回空结果，不生成书目', () => {
    expect(引擎().渲染([])).toEqual({ 引文: [], 书目: [] })
  })

  it('引用文档中不存在的文献时给出中文错误', () => {
    expect(() => 创建引文引擎({ 样式: 取内置样式('apa'), 语言: 'en-US', 条目: {} }).渲染([簇('c1', ['缺失'])])).toThrow('引文排版失败')
  })

  it('预览只渲染单个簇，不影响书目状态', () => {
    const 实例 = 引擎()
    expect(实例.预览(簇('p1', ['a']))).toBe('<sup>[1]</sup>')
    expect(实例.预览(簇('p2', ['b']))).toBe('<sup>[1]</sup>')
  })
})
