// 表格选择器 - 支持拖拽选择单元格范围

export class 表格选择器 {
  private 表格: HTMLTableElement | null = null
  private 起始单元格: HTMLTableCellElement | null = null
  private 结束单元格: HTMLTableCellElement | null = null

  开始选择(单元格: HTMLTableCellElement) {
    this.表格 = 单元格.closest('table') as HTMLTableElement
    this.起始单元格 = 单元格
    this.结束单元格 = 单元格
    this.高亮选区()
  }

  继续选择(单元格: HTMLTableCellElement) {
    this.结束单元格 = 单元格
    this.高亮选区()
  }

  结束选择() {
    this.清除高亮()
    this.起始单元格 = null
    this.结束单元格 = null
  }

  private 高亮选区() {
    if (!this.表格 || !this.起始单元格 || !this.结束单元格) return
    
    // 清除之前的高亮
    this.清除高亮()
    
    // 计算选区范围
    const 起始行 = this.起始单元格.parentElement as HTMLTableRowElement
    const 结束行 = this.结束单元格.parentElement as HTMLTableRowElement
    if (!起始行 || !结束行) return

    const 起始行索引 = Array.from(this.表格.rows).indexOf(起始行)
    const 结束行索引 = Array.from(this.表格.rows).indexOf(结束行)
    const 起始列索引 = Array.from(起始行.cells).indexOf(this.起始单元格)
    const 结束列索引 = Array.from(结束行.cells).indexOf(this.结束单元格)

    const 最小行 = Math.min(起始行索引, 结束行索引)
    const 最大行 = Math.max(起始行索引, 结束行索引)
    const 最小列 = Math.min(起始列索引, 结束列索引)
    const 最大列 = Math.max(起始列索引, 结束列索引)

    // 高亮选中的单元格
    for (let r = 最小行; r <= 最大行; r++) {
      for (let c = 最小列; c <= 最大列; c++) {
        this.表格.rows[r].cells[c].style.backgroundColor = '#B3D9FF'
      }
    }
  }

  private 清除高亮() {
    if (!this.表格) return
    const 所有单元格 = this.表格.querySelectorAll('td')
    所有单元格.forEach((单元格: Element) => {
      (单元格 as HTMLTableCellElement).style.backgroundColor = ''
    })
  }
}
