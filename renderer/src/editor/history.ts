// 撤销重做：以「内容快照 + 选区」的形式维护历史，栈上限 100 条。
// 不使用浏览器原生 undo，避免自研格式化命令与原生撤销栈互相干扰。

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

export class HistoryStack {
  private 列表: 快照[] = []

  private 指针 = -1

  /** 记录新快照；记录后重做分支被清空 */
  record(快照: 快照): void {
    this.列表 = this.列表.slice(0, this.指针 + 1)
    this.列表.push(快照)
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

  undo(): 快照 | null {
    if (!this.canUndo()) {
      return null
    }
    this.指针 -= 1
    return this.列表[this.指针]
  }

  redo(): 快照 | null {
    if (!this.canRedo()) {
      return null
    }
    this.指针 += 1
    return this.列表[this.指针]
  }

  current(): 快照 | null {
    return this.指针 >= 0 ? this.列表[this.指针] : null
  }

  size(): number {
    return this.列表.length
  }
}
