import { describe, it, expect } from 'vitest'
import {
  RECENT_DOCS,
  filterDocs,
  sortDocs,
  formatSize,
  formatTime,
  type DocItem,
} from './recentDocs'

const 样本: DocItem[] = [
  { id: 'a', name: '乙文档.docx', type: 'word', size: 2048, updatedAt: '2026-09-20 09:00', starred: false, shared: true },
  { id: 'b', name: '甲文档.xlsx', type: 'table', size: 1048576, updatedAt: '2026-09-22 18:30', starred: true, shared: false },
  { id: 'c', name: '丙文档.pptx', type: 'ppt', size: 512, updatedAt: '2026-09-21 12:00', starred: true, shared: true },
]

describe('静态示例数据', () => {
  it('覆盖四种文档类型', () => {
    const 类型集合 = new Set(RECENT_DOCS.map((文档) => 文档.type))
    expect(类型集合).toEqual(new Set(['word', 'table', 'ppt', 'pdf']))
  })

  it('标识唯一', () => {
    const 标识集合 = new Set(RECENT_DOCS.map((文档) => 文档.id))
    expect(标识集合.size).toBe(RECENT_DOCS.length)
  })
})

describe('filterDocs', () => {
  it('首页与最近返回全部文档', () => {
    expect(filterDocs(样本, 'home')).toHaveLength(3)
    expect(filterDocs(样本, 'recent')).toHaveLength(3)
  })

  it('星标仅返回已星标文档', () => {
    expect(filterDocs(样本, 'star').map((文档) => 文档.id)).toEqual(['b', 'c'])
  })

  it('共享仅返回已共享文档', () => {
    expect(filterDocs(样本, 'shared').map((文档) => 文档.id)).toEqual(['a', 'c'])
  })

  it('未知筛选键返回全部文档而不抛出异常', () => {
    expect(filterDocs(样本, '未知')).toHaveLength(3)
  })
})

describe('sortDocs', () => {
  it('按修改时间倒序', () => {
    expect(sortDocs(样本, 'time').map((文档) => 文档.id)).toEqual(['b', 'c', 'a'])
  })

  it('按名称升序使用中文拼音排序规则', () => {
    // 丙(bing) < 甲(jia) < 乙(yi)
    expect(sortDocs(样本, 'name').map((文档) => 文档.id)).toEqual(['c', 'b', 'a'])
  })

  it('按大小降序', () => {
    expect(sortDocs(样本, 'size').map((文档) => 文档.id)).toEqual(['b', 'a', 'c'])
  })

  it('不修改传入数组', () => {
    const 副本 = [...样本]
    sortDocs(样本, 'size')
    expect(样本).toEqual(副本)
  })
})

describe('formatSize', () => {
  it('小于 1KB 显示字节', () => {
    expect(formatSize(512)).toBe('512 B')
  })

  it('按 KB 保留一位小数', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
  })

  it('按 MB 保留一位小数', () => {
    expect(formatSize(1048576)).toBe('1.0 MB')
  })
})

describe('formatTime', () => {
  const 当前 = new Date('2026-09-22 20:00')

  it('当天显示今天加时分', () => {
    expect(formatTime('2026-09-22 18:30', 当前)).toBe('今天 18:30')
  })

  it('前一天显示昨天', () => {
    expect(formatTime('2026-09-21 12:00', 当前)).toBe('昨天 12:00')
  })

  it('三天内显示天数', () => {
    expect(formatTime('2026-09-20 09:00', 当前)).toBe('2 天前')
  })

  it('超过三天显示日期', () => {
    expect(formatTime('2026-09-01 09:00', 当前)).toBe('2026-09-01')
  })
})
