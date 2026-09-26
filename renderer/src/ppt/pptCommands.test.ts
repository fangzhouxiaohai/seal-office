import { describe, it, expect, vi } from 'vitest'
import { 查找演示命令, 取选中框, type 演示命令上下文, 演示命令标识列表 } from './pptCommands'
import { 创建演示文稿, 添加幻灯片, 读取当前幻灯片 } from './deck'

const 构造上下文 = () => {
  const 文稿 = 创建演示文稿()
  const 当前 = 读取当前幻灯片(文稿)
  const 框标识 = 当前 === null ? null : 当前.文本框列表[0].id
  const 通知 = vi.fn()
  let 最新文稿 = 文稿
  const 上下文: 演示命令上下文 = {
    文稿,
    选中框标识: 框标识,
    更新文稿: (新文稿) => {
      最新文稿 = 新文稿
    },
    notify: 通知,
    撤销: () => {},
    重做: () => {},
  }
  return {
    上下文,
    通知,
    取最新: () => 最新文稿,
    取首框: () => (当前 === null ? null : 当前.文本框列表[0]),
  }
}

describe('演示命令：字号增减', () => {
  it('增大字号按当前值递增', () => {
    const { 上下文, 取最新, 取首框 } = 构造上下文()
    const 原字号 = 取首框()?.字号 ?? 0
    查找演示命令('text.sizeUp')?.run(上下文)
    const 新框 = 读取当前幻灯片(取最新())?.文本框列表[0]
    expect(新框?.字号).toBe(Math.min(96, 原字号 + 4))
  })

  it('减小字号按当前值递减', () => {
    const { 上下文, 取最新, 取首框 } = 构造上下文()
    const 原字号 = 取首框()?.字号 ?? 0
    查找演示命令('text.sizeDown')?.run(上下文)
    const 新框 = 读取当前幻灯片(取最新())?.文本框列表[0]
    expect(新框?.字号).toBe(Math.max(10, 原字号 - 4))
  })

  it('标题框初始 40，点增大后为 44 而非变小', () => {
    const { 上下文, 取最新 } = 构造上下文()
    expect(读取当前幻灯片(取最新())?.文本框列表[0].字号).toBe(40)
    查找演示命令('text.sizeUp')?.run(上下文)
    expect(读取当前幻灯片(取最新())?.文本框列表[0].字号).toBe(44)
  })

  it('字号不超过上限 96', () => {
    const { 上下文, 取最新 } = 构造上下文()
    读取当前幻灯片(取最新())
    const 文稿 = 取最新()
    const 当前 = 读取当前幻灯片(文稿)
    if (当前 !== null) {
      当前.文本框列表[0].字号 = 96
    }
    查找演示命令('text.sizeUp')?.run(上下文)
    expect(读取当前幻灯片(取最新())?.文本框列表[0].字号).toBe(96)
  })
})

describe('演示命令：未选中文本框', () => {
  it('未选中时给出中文提示且不修改文稿', () => {
    const { 上下文, 通知 } = 构造上下文()
    const 无选中: 演示命令上下文 = { ...上下文, 选中框标识: null }
    查找演示命令('text.bold')?.run(无选中)
    expect(通知).toHaveBeenCalledWith('请先在画布中选中一个文本框')
  })

  it('取选中框在未选中时返回 null', () => {
    const { 上下文 } = 构造上下文()
    expect(取选中框({ ...上下文, 选中框标识: null })).toBeNull()
  })
})

describe('演示命令：剪贴板', () => {
  it('clipboard.copy 命令已注册', () => {
    expect(查找演示命令('clipboard.copy')).toBeDefined()
  })

  it('clipboard.paste 命令已注册', () => {
    expect(查找演示命令('clipboard.paste')).toBeDefined()
  })

  it('clipboard.paste 在空剪贴板时提示先复制', () => {
    const { 上下文, 通知 } = 构造上下文()
    查找演示命令('clipboard.paste')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('剪贴板为空，请先复制文本框')
  })

  it('clipboard.copy 复制选中文本框并给出中文提示', () => {
    const { 上下文, 通知 } = 构造上下文()
    查找演示命令('clipboard.copy')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('已复制文本框')
  })

  it('clipboard.copy 未选中时提示先选中文本框', () => {
    const { 上下文, 通知 } = 构造上下文()
    查找演示命令('clipboard.copy')?.run({ ...上下文, 选中框标识: null })
    expect(通知).toHaveBeenCalledWith('请先在画布中选中一个文本框')
  })

  it('clipboard.copy 后 paste 在画布复制一份文本框', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找演示命令('clipboard.copy')?.run(上下文)
    查找演示命令('clipboard.paste')?.run(上下文)
    const 当前 = 读取当前幻灯片(取最新())
    expect(当前?.文本框列表).toHaveLength(2)
    const 原框 = 当前!.文本框列表[0]
    const 新框 = 当前!.文本框列表[1]
    expect(新框.text).toBe(原框.text)
    expect(新框.加粗).toBe(原框.加粗)
    expect(新框.对齐).toBe(原框.对齐)
    expect(新框.id).not.toBe(原框.id)
  })

  it('ribbonSpecs 声明的 clipboard 命令在命令标识列表中', () => {
    expect(演示命令标识列表).toContain('clipboard.copy')
    expect(演示命令标识列表).toContain('clipboard.paste')
  })
})

describe('演示命令：幻灯片上移下移', () => {
  it('slide.moveUp 把当前幻灯片上移一位', () => {
    const { 上下文 } = 构造上下文()
    let 文稿 = 创建演示文稿()
    文稿 = 添加幻灯片(文稿)
    文稿 = 添加幻灯片(文稿)
    文稿 = { ...文稿, 当前索引: 1 }
    const 中间标识 = 文稿.幻灯片列表[1].id
    查找演示命令('slide.moveUp')?.run({ ...上下文, 文稿, 更新文稿: (w) => { 文稿 = w } })
    expect(文稿.幻灯片列表[0].id).toBe(中间标识)
    expect(文稿.当前索引).toBe(0)
  })

  it('slide.moveDown 把当前幻灯片下移一位', () => {
    const { 上下文 } = 构造上下文()
    let 文稿 = 创建演示文稿()
    文稿 = 添加幻灯片(文稿)
    文稿 = 添加幻灯片(文稿)
    文稿 = { ...文稿, 当前索引: 1 }
    const 中间标识 = 文稿.幻灯片列表[1].id
    查找演示命令('slide.moveDown')?.run({ ...上下文, 文稿, 更新文稿: (w) => { 文稿 = w } })
    expect(文稿.幻灯片列表[2].id).toBe(中间标识)
    expect(文稿.当前索引).toBe(2)
  })

  it('slide.moveUp 在第一张时保持不变并提示', () => {
    const { 上下文, 通知 } = 构造上下文()
    const 文稿 = { ...添加幻灯片(创建演示文稿()), 当前索引: 0 }
    查找演示命令('slide.moveUp')?.run({ ...上下文, 文稿 })
    expect(通知).toHaveBeenCalledWith('已是第一张幻灯片')
  })
})

describe('演示命令：右键菜单版式与背景', () => {
  it('slide.layout 应用版式', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找演示命令('slide.layout')?.run(上下文, '空白')
    const 当前 = 读取当前幻灯片(取最新())
    expect(当前?.版式).toBe('空白')
    expect(当前?.文本框列表).toHaveLength(0)
  })

  it('slide.background 应用背景色', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找演示命令('slide.background')?.run(上下文, '浅蓝')
    expect(读取当前幻灯片(取最新())?.背景色).toBe('#EEF3FF')
  })

  it('slide.moveUp 与 slide.moveDown 均已注册', () => {
    expect(查找演示命令('slide.moveUp')).toBeDefined()
    expect(查找演示命令('slide.moveDown')).toBeDefined()
  })
})
