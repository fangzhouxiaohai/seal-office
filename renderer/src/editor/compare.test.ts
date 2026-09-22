import { describe, it, expect } from 'vitest'
import { 比较文本, 生成修订Html, 统计差异 } from './compare'

describe('文本比较', () => {
  it('完全相同时全部为相同项', () => {
    const 结果 = 比较文本('第一行\n第二行', '第一行\n第二行')
    expect(结果).toHaveLength(2)
    expect(结果.every((项) => 项.类型 === '相同')).toBe(true)
  })

  it('识别新增行', () => {
    const 结果 = 比较文本('第一行', '第一行\n新增行')
    expect(结果.map((项) => 项.类型)).toEqual(['相同', '新增'])
    expect(结果[1].文本).toBe('新增行')
  })

  it('识别删除行', () => {
    const 结果 = 比较文本('第一行\n待删行', '第一行')
    expect(结果.map((项) => 项.类型)).toEqual(['相同', '删除'])
    expect(结果[1].文本).toBe('待删行')
  })

  it('修改行表现为删除加新增', () => {
    const 结果 = 比较文本('原始内容', '修改后内容')
    const 类型集合 = 结果.map((项) => 项.类型).sort()
    expect(类型集合).toEqual(['删除', '新增'])
  })

  it('保留中间相同行，仅标记差异', () => {
    const 结果 = 比较文本('标题\n旧正文\n结尾', '标题\n新正文\n结尾')
    expect(结果.filter((项) => 项.类型 === '相同')).toHaveLength(2)
    expect(结果.filter((项) => 项.类型 === '新增')).toHaveLength(1)
    expect(结果.filter((项) => 项.类型 === '删除')).toHaveLength(1)
  })

  it('原文为空时全部为新增', () => {
    const 结果 = 比较文本('', '内容')
    expect(结果.every((项) => 项.类型 === '新增')).toBe(true)
  })

  it('新文本为空时全部为删除', () => {
    const 结果 = 比较文本('内容', '')
    expect(结果.every((项) => 项.类型 === '删除')).toBe(true)
  })

  it('两侧均为空时无差异项', () => {
    expect(比较文本('', '')).toEqual([])
  })
})

describe('差异统计', () => {
  it('统计新增与删除处数', () => {
    const 统计 = 统计差异(比较文本('甲\n乙', '甲\n丙'))
    expect(统计.新增).toBe(1)
    expect(统计.删除).toBe(1)
  })

  it('无差异时统计为零', () => {
    expect(统计差异(比较文本('相同', '相同'))).toEqual({ 新增: 0, 删除: 0 })
  })
})

describe('修订标记生成', () => {
  it('相同行生成普通段落', () => {
    const html = 生成修订Html(比较文本('相同行', '相同行'))
    expect(html).toBe('<p>相同行</p>')
  })

  it('新增行包裹插入标记', () => {
    const html = 生成修订Html(比较文本('', '新增'))
    expect(html).toContain('wps-insert')
  })

  it('删除行包裹删除标记', () => {
    const html = 生成修订Html(比较文本('删除', ''))
    expect(html).toContain('wps-delete')
  })

  it('空差异列表返回空字符串', () => {
    expect(生成修订Html([])).toBe('')
  })
})
