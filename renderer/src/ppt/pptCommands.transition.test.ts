import { describe, expect, it, vi } from 'vitest'
import { 查找演示命令, type 演示命令上下文 } from './pptCommands'
import { 创建演示文稿, 读取当前幻灯片 } from './deck'
import { 全部切换 } from './model/transitions'

const 构造上下文 = () => {
  const 文稿 = 创建演示文稿()
  const 通知 = vi.fn()
  let 最新文稿 = 文稿
  const 上下文: 演示命令上下文 = {
    文稿,
    选中框标识: null,
    更新文稿: (新文稿) => { 最新文稿 = 新文稿 },
    notify: 通知,
    撤销: () => {},
    重做: () => {},
  }
  return { 上下文, 通知, 取最新: () => 最新文稿 }
}

describe('演示命令：切换效果', () => {
  it('按参数设置每一种登记效果，并清空旧的过渡效果字段', () => {
    for (const 效果 of 全部切换) {
      const { 上下文, 取最新 } = 构造上下文()
      查找演示命令('transition.effect')?.run(上下文, 效果)
      const 页 = 读取当前幻灯片(取最新())!
      expect(页.切换?.效果, `${效果} 应写入切换设置`).toBe(效果)
      expect(页.过渡效果).toBeUndefined()
    }
  })

  it('选择轮辐时补齐默认辐条根数', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找演示命令('transition.effect')?.run(上下文, '轮辐')
    expect(读取当前幻灯片(取最新())!.切换?.辐条).toBe(4)
  })

  it('未登记的效果给出明确原因且不修改文稿', () => {
    const { 上下文, 取最新, 通知 } = 构造上下文()
    查找演示命令('transition.effect')?.run(上下文, '翻页')
    expect(读取当前幻灯片(取最新())!.切换).toBeUndefined()
    expect(String(通知.mock.calls[0][0])).toContain('切换效果无效')
  })

  it('缺少参数时不写入任何切换设置', () => {
    const { 上下文, 取最新, 通知 } = 构造上下文()
    查找演示命令('transition.effect')?.run(上下文)
    expect(读取当前幻灯片(取最新())!.切换).toBeUndefined()
    expect(String(通知.mock.calls[0][0])).toContain('切换效果无效')
  })
})
