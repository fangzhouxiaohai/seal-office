import { describe, it, expect } from 'vitest'
import { 提取大纲, 生成目录Html } from './toc'

const 示例文档 = [
  '<h1>第一章 总则</h1>',
  '<p>正文内容</p>',
  '<h2>第一节 适用范围</h2>',
  '<p>正文内容</p>',
  '<h3>一、具体情形</h3>',
  '<h1>第二章 管理规定</h1>',
].join('')

describe('目录大纲', () => {
  it('按出现顺序提取各级标题', () => {
    const 大纲 = 提取大纲(示例文档)
    expect(大纲.map((项) => 项.文本)).toEqual([
      '第一章 总则',
      '第一节 适用范围',
      '一、具体情形',
      '第二章 管理规定',
    ])
    expect(大纲.map((项) => 项.级别)).toEqual([1, 2, 3, 1])
  })

  it('序号按提取顺序递增', () => {
    const 大纲 = 提取大纲(示例文档)
    expect(大纲.map((项) => 项.序号)).toEqual([0, 1, 2, 3])
  })

  it('忽略非标题元素', () => {
    const 大纲 = 提取大纲('<p>段落</p><div>区块</div><span>文本</span>')
    expect(大纲).toEqual([])
  })

  it('忽略空标题', () => {
    const 大纲 = 提取大纲('<h1></h1><h2>有效标题</h2>')
    expect(大纲).toHaveLength(1)
    expect(大纲[0].文本).toBe('有效标题')
  })

  it('无内容时返回空数组', () => {
    expect(提取大纲('')).toEqual([])
  })
})

describe('目录生成', () => {
  it('生成包含全部条目的目录', () => {
    const 目录 = 生成目录Html(提取大纲(示例文档))
    expect(目录).toContain('目录')
    expect(目录).toContain('第一章 总则')
    expect(目录).toContain('第二章 管理规定')
  })

  it('按级别设置缩进', () => {
    const 目录 = 生成目录Html(提取大纲(示例文档))
    expect(目录).toContain('padding-left:0px')
    expect(目录).toContain('padding-left:16px')
    expect(目录).toContain('padding-left:32px')
  })

  it('无标题时返回空字符串', () => {
    expect(生成目录Html([])).toBe('')
  })

  it('目录整体不可直接编辑', () => {
    const 目录 = 生成目录Html(提取大纲(示例文档))
    expect(目录).toContain('contenteditable="false"')
  })
})
