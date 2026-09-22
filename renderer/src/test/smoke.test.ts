import { describe, it, expect } from 'vitest'

describe('测试基础设施', () => {
  it('提供 jsdom 文档环境', () => {
    expect(typeof document.createElement('div').appendChild).toBe('function')
  })

  it('补齐了 matchMedia 补桩', () => {
    expect(typeof window.matchMedia).toBe('function')
  })
})
