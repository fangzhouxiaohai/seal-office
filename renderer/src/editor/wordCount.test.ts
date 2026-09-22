import { describe, it, expect } from 'vitest'
import { countWords } from './wordCount'

describe('字数统计', () => {
  it('纯中文按字计数', () => {
    const 结果 = countWords('今天天气很好')
    expect(结果.字符数).toBe(6)
    expect(结果.词数).toBe(6)
  })

  it('纯英文按词计数', () => {
    const 结果 = countWords('hello world foo')
    expect(结果.词数).toBe(3)
    expect(结果.字符数).toBe(13)
  })

  it('中英混排分别计数', () => {
    const 结果 = countWords('使用 React 开发界面')
    // 使用(2 词) + React(1 词) + 开发界面(4 词) = 7 词
    expect(结果.词数).toBe(7)
    // 2 个汉字 + 5 个字母 + 4 个汉字 = 11 个字符，空格不计
    expect(结果.字符数).toBe(11)
  })

  it('标点与空白不计入', () => {
    const 结果 = countWords('你好，世界！')
    expect(结果.词数).toBe(4)
    expect(结果.字符数).toBe(4)
  })

  it('按换行统计段落数，忽略空行', () => {
    const 结果 = countWords('第一段\n第二段\n\n第三段')
    expect(结果.段落数).toBe(3)
  })

  it('空字符串各项为零', () => {
    const 结果 = countWords('')
    expect(结果.字符数).toBe(0)
    expect(结果.词数).toBe(0)
    expect(结果.段落数).toBe(0)
  })

  it('仅含空白与标点时计数为零', () => {
    const 结果 = countWords('  ，。！  ')
    expect(结果.字符数).toBe(0)
    expect(结果.词数).toBe(0)
    expect(结果.段落数).toBe(0)
  })

  it('数字与英文视为同一个词', () => {
    const 结果 = countWords('abc123 def')
    expect(结果.词数).toBe(2)
    expect(结果.字符数).toBe(9)
  })
})
