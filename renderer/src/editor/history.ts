// 撤销重做：以快照形式维护历史，栈上限 100 条。
// 快照类型泛型化，文字编辑器使用默认的 HTML 快照，表格使用工作表快照。

const 栈上限 = 100

export interface 保存的选区 {
  起点路径: number[]
  起点偏移: number
  终点路径: number[]
  终点偏移: number
}

export interface 快照 {
  html: string
  /** 选区以路径与偏移保存，避免持有活动 Range 导致失效 */
  selection: 保存的选区 | null
}

export class HistoryStack<T = 快照> {
  private 列表: T[] = []

  private 指针 = -1

  /** 记录新快照；记录后重做分支被清空 */
  record(项: T): void {
    this.列表 = this.列表.slice(0, this.指针 + 1)
    this.列表.push(项)
    if (this.列表.length > 栈上限) {
      this.列表.shift()
    }
    this.指针 = this.列表.length - 1
  }

  canUndo(): boolean {
    return this.指针 > 0
  }

  canRedo(): boolean {
    return this.指针 < this.列表.length - 1
  }

  undo(): T | null {
    if (!this.canUndo()) {
      return null
    }
    this.指针 -= 1
    return this.列表[this.指针]
  }

  redo(): T | null {
    if (!this.canRedo()) {
      return null
    }
    this.指针 += 1
    return this.列表[this.指针]
  }

  current(): T | null {
    return this.指针 >= 0 ? this.列表[this.指针] : null
  }

  size(): number {
    return this.列表.length
  }

  /** 返回实际保留的撤销与重做快照，供资源所有权随历史淘汰而释放。 */
  snapshots(): readonly T[] {
    return this.列表.slice()
  }
}
