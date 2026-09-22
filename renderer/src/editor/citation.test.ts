import { describe, it, expect } from 'vitest'
import {
  提取引文序号,
  格式化文献,
  生成书目Html,
  生成文献标识,
  生成引文标记,
  type 文献,
} from './citation'

const 示例文献: 文献 = {
  id: 'ref-1',
  作者: '张三, 李四',
  标题: '办公自动化系统设计',
  年份: '2024',
  来源: '计算机工程与应用',
}

describe('引文标记', () => {
  it('生成带序号的引文标记', () => {
    const 标记 = 生成引文标记(1)
    expect(标记).toContain('class="wps-citation"')
    expect(标记).toContain('data-序号="1"')
    expect(标记).toContain('[1]')
  })

  it('按出现顺序提取去重后的序号', () => {
    const 文档 = `<p>甲${生成引文标记(2)}乙${生成引文标记(1)}丙${生成引文标记(2)}</p>`
    expect(提取引文序号(文档)).toEqual([1, 2])
  })

  it('无引文时返回空数组', () => {
    expect(提取引文序号('<p>正文</p>')).toEqual([])
    expect(提取引文序号('')).toEqual([])
  })
})

describe('文献格式化', () => {
  it('按作者、标题、来源、年份顺序拼接', () => {
    expect(格式化文献(示例文献)).toBe('张三, 李四. 办公自动化系统设计. 计算机工程与应用. 2024.')
  })

  it('缺失要素时不留多余分隔符', () => {
    const 简略: 文献 = { id: 'ref-2', 作者: '王五', 标题: '测试', 年份: '', 来源: '' }
    expect(格式化文献(简略)).toBe('王五. 测试.')
  })

  it('全部要素为空时仅返回句点', () => {
    const 空文献: 文献 = { id: 'ref-3', 作者: '', 标题: '', 年份: '', 来源: '' }
    expect(格式化文献(空文献)).toBe('.')
  })
})

describe('书目列表', () => {
  it('生成带编号的书目', () => {
    const html = 生成书目Html([示例文献])
    expect(html).toContain('参考文献')
    expect(html).toContain('[1]')
    expect(html).toContain('办公自动化系统设计')
  })

  it('多篇文献按顺序编号', () => {
    const 第二篇: 文献 = { id: 'ref-2', 作者: '王五', 标题: '第二篇', 年份: '2023', 来源: '期刊' }
    const html = 生成书目Html([示例文献, 第二篇])
    expect(html).toContain('[1]')
    expect(html).toContain('[2]')
    expect(html.indexOf('[1]')).toBeLessThan(html.indexOf('[2]'))
  })

  it('书目整体不可直接编辑', () => {
    expect(生成书目Html([示例文献])).toContain('contenteditable="false"')
  })

  it('无文献时返回空字符串', () => {
    expect(生成书目Html([])).toBe('')
  })
})

describe('文献标识', () => {
  it('按现有数量递增生成标识', () => {
    expect(生成文献标识([])).toBe('ref-1')
    expect(生成文献标识([示例文献])).toBe('ref-2')
  })
})
