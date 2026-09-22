import { describe, it, expect, vi } from 'vitest'
import { 命令表, 查找命令, 未实现命令, 命令标识列表, type CommandContext } from './commands'

/** 构造一个最小上下文，仅提供被测命令会用到的字段 */
const 构造上下文 = (部分: Partial<CommandContext> = {}): CommandContext =>
  ({
    root: document.createElement('div'),
    history: { record: vi.fn(), canUndo: () => false, canRedo: () => false } as never,
    refresh: vi.fn(),
    notify: vi.fn(),
    view: { 缩放: 1, 标尺: true, 网格线: false, 段落标记: false, 视图模式: '页面视图' },
    setView: vi.fn(),
    执行格式化: vi.fn(),
    读取内容: () => '<p>内容</p>',
    插入内容: vi.fn(),
    下载: vi.fn(),
    打开查找: vi.fn(),
    导出: vi.fn(),
    检查拼写: vi.fn(),
    切换全选: vi.fn(),
    ...部分,
  }) as CommandContext

describe('命令注册表', () => {
  it('未实现命令执行后给出中文提示', () => {
    const 提示 = vi.fn()
    const 命令 = 未实现命令('chart.insert', '图表')
    命令.run(构造上下文({ notify: 提示 }))
    expect(提示).toHaveBeenCalledWith('该功能开发中')
  })

  it('未实现命令保留传入的标识与名称', () => {
    const 命令 = 未实现命令('formula.insert', '公式')
    expect(命令.id).toBe('formula.insert')
    expect(命令.label).toBe('公式')
  })

  it('命令表内标识唯一', () => {
    const 标识 = Object.keys(命令表)
    expect(new Set(标识).size).toBe(标识.length)
  })

  it('每条命令的 id 与其注册键一致', () => {
    Object.entries(命令表).forEach(([键, 命令]) => {
      expect(命令.id).toBe(键)
    })
  })

  it('每条命令均提供中文名称', () => {
    Object.values(命令表).forEach((命令) => {
      expect(命令.label.length).toBeGreaterThan(0)
    })
  })

  it('命令标识列表与命令表键一致', () => {
    expect([...命令标识列表].sort()).toEqual(Object.keys(命令表).sort())
  })

  it('查找已注册命令返回该命令', () => {
    const 标识 = 命令标识列表[0]
    expect(查找命令(标识)?.id).toBe(标识)
  })

  it('查找未注册命令返回 undefined', () => {
    expect(查找命令('不存在的命令')).toBeUndefined()
  })

  it('包含规格要求的未实现命令', () => {
    ;['chart.insert', 'formula.insert', 'smartart.insert', 'mailmerge.start'].forEach((标识) => {
      expect(查找命令(标识), `缺少命令 ${标识}`).toBeDefined()
    })
  })
})

describe('格式化命令', () => {
  it('加粗命令在执行前记录历史并调用格式化执行器', () => {
    const 记录 = vi.fn()
    const 执行 = vi.fn()
    const 刷新 = vi.fn()
    命令表['font.bold'].run(
      构造上下文({ history: { record: 记录 } as never, 执行格式化: 执行, refresh: 刷新 })
    )
    expect(记录).toHaveBeenCalledTimes(1)
    expect(执行).toHaveBeenCalledWith('bold', undefined)
    expect(刷新).toHaveBeenCalled()
  })

  it('字体颜色命令把颜色值传给执行器', () => {
    const 执行 = vi.fn()
    命令表['font.color'].run(构造上下文({ 执行格式化: 执行 }), '#E34D59')
    expect(执行).toHaveBeenCalledWith('foreColor', '#E34D59')
  })

  it('对齐命令映射到对应的格式化指令', () => {
    const 执行 = vi.fn()
    命令表['para.alignCenter'].run(构造上下文({ 执行格式化: 执行 }))
    expect(执行).toHaveBeenCalledWith('justifyCenter', undefined)
  })

  it('撤销命令在可撤销时取回上一条快照', () => {
    const 撤销 = vi.fn(() => ({ html: '<p>上一步</p>', selection: null }))
    const 应用 = vi.fn()
    命令表['edit.undo'].run(
      构造上下文({
        history: { canUndo: () => true, undo: 撤销 } as never,
        应用内容: 应用,
      })
    )
    expect(撤销).toHaveBeenCalledTimes(1)
    expect(应用).toHaveBeenCalledWith('<p>上一步</p>', null)
  })

  it('无可撤销内容时撤销命令给出中文提示', () => {
    const 提示 = vi.fn()
    命令表['edit.undo'].run(
      构造上下文({ history: { canUndo: () => false } as never, notify: 提示 })
    )
    expect(提示).toHaveBeenCalledWith('没有可撤销的操作')
  })
})
