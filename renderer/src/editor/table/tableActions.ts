// 表格操作工具函数

/**
 * 删除表格中的指定行
 * @param 表格元素 - HTMLTableElement
 * @param 行索引 - 要删除的行索引
 * @returns 是否删除成功
 */
export function 删除表格行(表格元素: HTMLTableElement, 行索引: number): boolean {
  if (行索引 < 0 || 行索引 >= 表格元素.rows.length) {
    return false
  }
  if (表格元素.rows.length <= 1) {
    return false // 至少保留一行
  }
  表格元素.deleteRow(行索引)
  return true
}

/**
 * 删除表格中的指定列
 * @param 表格元素 - HTMLTableElement
 * @param 列索引 - 要删除的列索引
 * @returns 是否删除成功
 */
export function 删除表格列(表格元素: HTMLTableElement, 列索引: number): boolean {
  if (列索引 < 0 || 列索引 >= 表格元素.rows[0].cells.length) {
    return false
  }
  if (表格元素.rows[0].cells.length <= 1) {
    return false // 至少保留一列
  }
  for (let i = 0; i < 表格元素.rows.length; i++) {
    表格元素.rows[i].deleteCell(列索引)
  }
  return true
}

/**
 * 在表格中插入新行
 * @param 表格元素 - HTMLTableElement
 * @param 行索引 - 插入位置的行索引
 * @param 上方 - 是否在指定行上方插入
 */
export function 插入表格行(表格元素: HTMLTableElement, 行索引: number, 上方: boolean = false): void {
  const 新行 = 表格元素.insertRow(上方 ? 行索引 : 行索引 + 1)
  const 单元格数 = 表格元素.rows[0].cells.length
  for (let i = 0; i < 单元格数; i++) {
    const 新单元格 = 新行.insertCell()
    新单元格.innerHTML = '&nbsp;'
    新单元格.style.border = '1px solid #E8EBF0'
    新单元格.style.padding = '6px 8px'
  }
}

/**
 * 在表格中插入新列
 * @param 表格元素 - HTMLTableElement
 * @param 列索引 - 插入位置的列索引
 * @param 左侧 - 是否在指定列左侧插入
 */
export function 插入表格列(表格元素: HTMLTableElement, 列索引: number, 左侧: boolean = false): void {
  const 列索引位置 = 左侧 ? 列索引 : 列索引 + 1
  for (let i = 0; i < 表格元素.rows.length; i++) {
    const 新单元格 = 表格元素.rows[i].insertCell(列索引位置)
    新单元格.innerHTML = '&nbsp;'
    新单元格.style.border = '1px solid #E8EBF0'
    新单元格.style.padding = '6px 8px'
  }
}
