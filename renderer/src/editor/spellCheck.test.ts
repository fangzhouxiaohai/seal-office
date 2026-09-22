import { describe, it, expect } from 'vitest'
import { 检查文本 } from './spellCheck'

describe('基础拼写检查', () => {
  it('识别连续重复汉字', () => {
    const 问题 = 检查文本('我们的的团队需要确认')
    expect(问题).toHaveLength(1)
    expect(问题[0].类型).toBe('重复字符')
    expect(问题[0].片段).toBe('的的')
    expect(问题[0].位置).toBe(2)
  })

  it('识别中文语境下的半角逗号', () => {
    const 问题 = 检查文本('第一点,第二点')
    expect(问题.some((项) => 项.类型 === '半角标点')).toBe(true)
  })

  it('相邻重复标点不会被误判为半角标点', () => {
    const 问题 = 检查文本('这是英文单词 hello, world')
    expect(问题.filter((项) => 项.类型 === '半角标点')).toHaveLength(0)
  })

  it('规范文本返回空列表', () => {
    expect(检查文本('今天天气很好，适合外出。')).toEqual([])
  })

  it('空文本返回空列表', () => {
    expect(检查文本('')).toEqual([])
  })

  it('结果按出现位置升序排列', () => {
    const 问题 = 检查文本('我们,的确确需要确认,请复核')
    const 位置列表 = 问题.map((项) => 项.位置)
    expect([...位置列表].sort((甲, 乙) => 甲 - 乙)).toEqual(位置列表)
  })

  it('每个问题都给出中文修改建议', () => {
    const 问题 = 检查文本('我们的的确确需要确认,请复核')
    expect(问题.length).toBeGreaterThan(0)
    问题.forEach((项) => {
      expect(项.建议.length).toBeGreaterThan(0)
    })
  })
})
