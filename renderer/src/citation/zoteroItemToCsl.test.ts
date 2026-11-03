import { describe, it, expect } from 'vitest'
import { zoteroItemToCsl, 解析日期, 批量转换, type Zotero条目数据 } from './zoteroItemToCsl'

const 造 = (data: Record<string, unknown>): Zotero条目数据 => ({ key: String(data.key ?? 'K1'), version: 1, data: { key: String(data.key ?? 'K1'), ...data } })

describe('Zotero 条目转 CSL', () => {
  it('期刊文章映射题录、作者与出版信息', () => {
    const 结果 = zoteroItemToCsl(造({
      itemType: 'journalArticle',
      title: '办公自动化系统设计',
      creators: [
        { creatorType: 'author', firstName: '三', lastName: '张三' },
        { creatorType: 'author', firstName: '四', lastName: '李四' },
        { creatorType: 'editor', firstName: '五', lastName: '王五' },
      ],
      date: '2024-03-01 2024年3月',
      publicationTitle: '计算机工程与应用',
      volume: '60',
      issue: '3',
      pages: '10-20',
      DOI: '10.1000/abc',
      language: 'zh-CN',
    }))
    expect(结果.type).toBe('article-journal')
    expect(结果.title).toBe('办公自动化系统设计')
    expect(结果.author).toEqual([
      { family: '张三', given: '三' },
      { family: '李四', given: '四' },
    ])
    expect(结果.editor).toEqual([{ family: '王五', given: '五' }])
    expect(结果['container-title']).toBe('计算机工程与应用')
    expect(结果.volume).toBe('60')
    expect(结果.page).toBe('10-20')
    expect(结果.issued).toEqual({ 'date-parts': [[2024, 3, 1]], raw: '2024-03-01 2024年3月' })
    expect(结果.zoteroItemKey).toBe('K1')
  })

  it('书籍使用书名与出版者，并把机构名补进出版社', () => {
    const 结果 = zoteroItemToCsl(造({
      itemType: 'book',
      title: '文献管理实务',
      creators: [{ creatorType: 'author', name: '编写组' }],
      date: '2019',
      publisher: '科学出版社',
      place: '北京',
      edition: '2',
      ISBN: '978-7-0000-0000-0',
    }))
    expect(结果.type).toBe('book')
    expect(结果.author).toEqual([{ literal: '编写组' }])
    expect(结果.publisher).toBe('科学出版社')
    expect(结果['publisher-place']).toBe('北京')
    expect(结果.edition).toBe('2')
    expect(结果.issued).toEqual({ 'date-parts': [[2019]] })
  })

  it('学位论文把大学名补为出版者，类型映射为 thesis', () => {
    const 结果 = zoteroItemToCsl(造({ itemType: 'thesis', title: '博士论文', university: '某大学', date: '2021', thesisType: '博士学位论文' }))
    expect(结果.type).toBe('thesis')
    expect(结果.publisher).toBe('某大学')
  })

  it('会议论文取会议名称与论文集名', () => {
    const 结果 = zoteroItemToCsl(造({
      itemType: 'conferencePaper',
      title: '会议报告',
      proceedingsTitle: '第某届年会论文集',
      conferenceName: '第某届年会',
      date: '2022-10',
    }))
    expect(结果.type).toBe('paper-conference')
    expect(结果['container-title']).toBe('第某届年会论文集')
    expect(结果['event-title']).toBe('第某届年会')
    expect(结果.issued).toEqual({ 'date-parts': [[2022, 10]] })
  })

  it('网页保留网址与访问日期', () => {
    const 结果 = zoteroItemToCsl(造({
      itemType: 'webpage',
      title: 'Zotero 快速开始',
      websiteTitle: 'Zotero 中文社区',
      url: 'https://zotero-chinese.com/user-guidequick-start.html',
      accessDate: '2026-05-12',
    }))
    expect(结果.type).toBe('webpage')
    expect(结果.URL).toBe('https://zotero-chinese.com/user-guidequick-start.html')
    expect(结果.accessed).toEqual({ 'date-parts': [[2026, 5, 12]] })
  })

  it('报告映射类型并从 extra 读取附加字段', () => {
    const 结果 = zoteroItemToCsl(造({
      itemType: 'report',
      title: '年度报告',
      institution: '某研究院',
      extra: 'note: 内部资料\nnumber: R-2024-01',
    }))
    expect(结果.type).toBe('report')
    expect(结果.publisher).toBe('某研究院')
    expect(结果.note).toBe('内部资料')
    expect(结果.number).toBe('R-2024-01')
  })

  it('缺少标题时不编造字段', () => {
    const 结果 = zoteroItemToCsl(造({ itemType: 'journalArticle' }))
    expect(结果.title).toBeUndefined()
    expect(结果['container-title']).toBeUndefined()
  })

  it('缺少条目键时明确报错，不用占位值掩盖', () => {
    expect(() => zoteroItemToCsl({ data: { itemType: 'book' } })).toThrow('缺少条目键')
  })

  it('未知条目类型按原文小写保留，便于后续补映射', () => {
    const 结果 = zoteroItemToCsl(造({ itemType: 'customThing', title: '未知类型' }))
    expect(结果.type).toBe('customthing')
  })

  it('文库编号写入回链字段', () => {
    const 结果 = zoteroItemToCsl({ key: 'K9', libraryID: 3, data: { key: 'K9', itemType: 'book', title: 'T' } })
    expect(结果.zoteroLibraryID).toBe(3)
  })
})

describe('Zotero 日期解析', () => {
  it('只取可识别的年月日部分', () => {
    expect(解析日期('2020')).toEqual({ 'date-parts': [[2020]] })
    expect(解析日期('2020-05')).toEqual({ 'date-parts': [[2020, 5]] })
    expect(解析日期('2020-05-06')).toEqual({ 'date-parts': [[2020, 5, 6]] })
    expect(解析日期('2020-05-06 2020年5月6日')).toEqual({ 'date-parts': [[2020, 5, 6]], raw: '2020-05-06 2020年5月6日' })
  })

  it('无法识别的写法保留原文，不猜年份', () => {
    expect(解析日期('待刊')).toEqual({ literal: '待刊', raw: '待刊' })
  })

  it('空值返回 undefined', () => {
    expect(解析日期('')).toBeUndefined()
    expect(解析日期(undefined)).toBeUndefined()
  })

  it('非法月份不进入 date-parts', () => {
    expect(解析日期('2020-77')).toEqual({ 'date-parts': [[2020]], raw: '2020-77' })
  })
})

describe('批量转换', () => {
  it('跳过无法转换的条目并如实列出键', () => {
    const 结果 = 批量转换([
      造({ key: 'A', itemType: 'book', title: '好书' }),
      { data: { itemType: 'book' } },
    ])
    expect(结果.条目).toHaveLength(1)
    expect(结果.跳过).toEqual(['未知条目'])
  })
})
