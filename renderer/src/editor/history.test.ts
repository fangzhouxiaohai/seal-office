import { describe, it, expect } from 'vitest'
import { HistoryStack } from './history'

describe('撤销重做历史栈', () => {
  it('资源持有列表包含重做分支，分支清空与上限淘汰后移除对应快照', () => {
    const 栈 = new HistoryStack<string>()
    栈.record('初始资源')
    栈.record('重做资源')
    栈.undo()
    expect(栈.snapshots()).toEqual(['初始资源', '重做资源'])
    栈.record('新分支')
    expect(栈.snapshots()).toEqual(['初始资源', '新分支'])
    for (let 序号 = 0; 序号 < 100; 序号++) 栈.record(`新资源${序号}`)
    expect(栈.snapshots()).toHaveLength(100)
    expect(栈.snapshots()).not.toContain('初始资源')
    expect(栈.snapshots()).not.toContain('新分支')
    const 导出 = 栈.snapshots() as string[]
    导出.length = 0
    expect(栈.size()).toBe(100)
  })
  it('初始状态既不可撤销也不可重做', () => {
    const 栈 = new HistoryStack()
    expect(栈.canUndo()).toBe(false)
    expect(栈.canRedo()).toBe(false)
    expect(栈.current()).toBeNull()
    expect(栈.size()).toBe(0)
  })

  it('记录两次后可撤销并回到上一次内容', () => {
    const 栈 = new HistoryStack()
    栈.record({ html: '<p>一</p>', selection: null })
    栈.record({ html: '<p>二</p>', selection: null })
    expect(栈.canUndo()).toBe(true)
    expect(栈.undo()?.html).toBe('<p>一</p>')
  })

  it('撤销后可重做', () => {
    const 栈 = new HistoryStack()
    栈.record({ html: '<p>一</p>', selection: null })
    栈.record({ html: '<p>二</p>', selection: null })
    栈.undo()
    expect(栈.canRedo()).toBe(true)
    expect(栈.redo()?.html).toBe('<p>二</p>')
  })

  it('撤销到最初时不可再撤销', () => {
    const 栈 = new HistoryStack()
    栈.record({ html: '<p>一</p>', selection: null })
    栈.record({ html: '<p>二</p>', selection: null })
    栈.undo()
    expect(栈.canUndo()).toBe(false)
    expect(栈.undo()).toBeNull()
  })

  it('重做到最新时不可再重做', () => {
    const 栈 = new HistoryStack()
    栈.record({ html: '<p>一</p>', selection: null })
    栈.record({ html: '<p>二</p>', selection: null })
    栈.undo()
    栈.redo()
    expect(栈.canRedo()).toBe(false)
    expect(栈.redo()).toBeNull()
  })

  it('撤销后产生新记录会清空重做分支', () => {
    const 栈 = new HistoryStack()
    栈.record({ html: '<p>一</p>', selection: null })
    栈.record({ html: '<p>二</p>', selection: null })
    栈.undo()
    栈.record({ html: '<p>三</p>', selection: null })
    expect(栈.canRedo()).toBe(false)
    expect(栈.current()?.html).toBe('<p>三</p>')
  })

  it('栈上限为 100，超出后丢弃最早记录', () => {
    const 栈 = new HistoryStack()
    for (let 序号 = 0; 序号 < 120; 序号 += 1) {
      栈.record({ html: `<p>${序号}</p>`, selection: null })
    }
    expect(栈.size()).toBe(100)
    expect(栈.current()?.html).toBe('<p>119</p>')
  })

  it('可保存并原样取回选区信息', () => {
    const 栈 = new HistoryStack()
    const 选区 = { 起点路径: [0, 0], 起点偏移: 2, 终点路径: [0, 0], 终点偏移: 5 }
    栈.record({ html: '<p>内容</p>', selection: 选区 })
    expect(栈.current()?.selection).toEqual(选区)
  })
})
