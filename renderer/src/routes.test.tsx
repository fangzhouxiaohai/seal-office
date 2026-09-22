import { describe, it, expect } from 'vitest'
import {
  NAV_GROUPS,
  MODULES,
  DOC_TYPE_TO_MODULE,
  NEW_DOC_ENTRIES,
  type ModuleKey,
} from './routes'

describe('导航分组', () => {
  it('包含四个分组', () => {
    expect(NAV_GROUPS).toHaveLength(4)
  })

  it('第一组为首页、最近、星标、共享', () => {
    expect(NAV_GROUPS[0].map((项) => 项.key)).toEqual(['home', 'recent', 'star', 'shared'])
  })

  it('每个导航项都有中文名称与图标键', () => {
    NAV_GROUPS.flat().forEach((项) => {
      expect(项.label.length).toBeGreaterThan(0)
      expect(项.icon.length).toBeGreaterThan(0)
    })
  })
})

describe('模块注册表', () => {
  it('覆盖首页与三个编辑器模块', () => {
    const 键集合 = Object.keys(MODULES).sort()
    expect(键集合).toEqual(['home', 'ppt', 'table', 'word'])
  })

  it('每个模块都有中文名称', () => {
    ;(Object.keys(MODULES) as ModuleKey[]).forEach((键) => {
      expect(MODULES[键].label.length).toBeGreaterThan(0)
    })
  })
})

describe('文档类型到模块的映射', () => {
  it('四种类型均有目标模块', () => {
    expect(DOC_TYPE_TO_MODULE.word).toBe('word')
    expect(DOC_TYPE_TO_MODULE.table).toBe('table')
    expect(DOC_TYPE_TO_MODULE.ppt).toBe('ppt')
    expect(DOC_TYPE_TO_MODULE.pdf).toBe('home')
  })
})

describe('新建入口', () => {
  it('包含文字、表格、演示、PDF 四项', () => {
    expect(NEW_DOC_ENTRIES.map((项) => 项.key)).toEqual(['word', 'table', 'ppt', 'pdf'])
  })

  it('前三项可跳转，PDF 标记为未实现', () => {
    expect(NEW_DOC_ENTRIES.filter((项) => 项.implemented)).toHaveLength(3)
    expect(NEW_DOC_ENTRIES.find((项) => 项.key === 'pdf')?.implemented).toBe(false)
  })
})
