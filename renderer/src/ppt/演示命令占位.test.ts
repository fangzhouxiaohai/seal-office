import { describe, it, expect, vi } from 'vitest'
import { 演示命令表 } from './pptCommands'

describe('演示命令不留占位', () => {
  it('没有命令以「该功能开发中」作为唯一反馈', () => {
    const 占位: string[] = []
    for (const 命令 of Object.values(演示命令表)) {
      const 提示 = vi.fn()
      try {
        命令.run({ notify: 提示 } as never)
      } catch {
        continue
      }
      if (提示.mock.calls.some((参数) => 参数[0] === '该功能开发中')) 占位.push(命令.id)
    }
    expect(占位).toEqual([])
  })
})
