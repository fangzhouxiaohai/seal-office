import { describe, it, expect, vi } from 'vitest'
import { 表格命令表 } from './sheetCommands'

describe('表格命令不留占位', () => {
  it('没有命令以「该功能开发中」作为唯一反馈', () => {
    // 用户要求不遗留待开发功能。表格命令表里若有占位项，
    // 用户点下去只会看到「该功能开发中」，等同于假入口。
    const 占位: string[] = []
    for (const 命令 of Object.values(表格命令表)) {
      const 提示 = vi.fn()
      try {
        命令.run({ notify: 提示 } as never)
      } catch {
        // 缺少上下文导致的报错不算占位
        continue
      }
      if (提示.mock.calls.some((参数) => 参数[0] === '该功能开发中')) 占位.push(命令.id)
    }
    expect(占位).toEqual([])
  })
})
