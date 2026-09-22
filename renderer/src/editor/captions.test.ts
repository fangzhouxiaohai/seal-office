import { describe, it, expect } from 'vitest'
import { 生成题注, 生成图表目录Html, 提取题注, 统计题注 } from './captions'

const 含题注文档 = [
  '<p class="wps-caption">表 1 季度经营数据</p>',
  '<table><tbody><tr><td>1</td></tr></tbody></table>',
  '<p class="wps-caption">图 1 组织架构</p>',
  '<img src="a.png" alt="架构" />',
  '<p class="wps-caption">表 2 预算明细</p>',
].join('')

describe('题注生成', () => {
  it('生成带编号的表题注', () => {
    expect(生成题注('表', 1)).toBe('<p class="wps-caption">表 1</p>')
  })

  it('生成带说明文字的题注', () => {
    expect(生成题注('图', 2, '系统流程')).toBe('<p class="wps-caption">图 2 系统流程</p>')
  })

  it('说明为空时不产生多余空格', () => {
    expect(生成题注('表', 3, '')).toBe('<p class="wps-caption">表 3</p>')
  })
})

describe('题注提取', () => {
  it('按出现顺序提取全部题注', () => {
    const 条目 = 提取题注(含题注文档)
    expect(条目.map((项) => 项.文本)).toEqual(['表 1 季度经营数据', '图 1 组织架构', '表 2 预算明细'])
  })

  it('解析题注类型与编号', () => {
    const 条目 = 提取题注(含题注文档)
    expect(条目.map((项) => 项.类型)).toEqual(['表', '图', '表'])
    expect(条目.map((项) => 项.序号)).toEqual([1, 1, 2])
  })

  it('无题注时返回空数组', () => {
    expect(提取题注('<p>普通段落</p>')).toEqual([])
    expect(提取题注('')).toEqual([])
  })

  it('统计指定类型的题注数量', () => {
    expect(统计题注(含题注文档, '表')).toBe(2)
    expect(统计题注(含题注文档, '图')).toBe(1)
  })
})

describe('图表目录', () => {
  it('生成包含全部题注的目录', () => {
    const 目录 = 生成图表目录Html(提取题注(含题注文档))
    expect(目录).toContain('图表目录')
    expect(目录).toContain('表 1 季度经营数据')
    expect(目录).toContain('图 1 组织架构')
  })

  it('目录整体不可直接编辑', () => {
    expect(生成图表目录Html(提取题注(含题注文档))).toContain('contenteditable="false"')
  })

  it('无题注时返回空字符串', () => {
    expect(生成图表目录Html([])).toBe('')
  })
})
