import { describe, it, expect, vi } from 'vitest'
import { 表格命令表 } from './sheetCommands'
import { 表格标签 } from './ribbonSpecs'

describe('表格命令不留占位', () => {
  it('全部可见功能区按钮都有注册命令或编辑器直接处理路径', () => {
    const 编辑器直达 = new Set(['file.open', 'file.save', 'file.saveAs', 'file.print', 'file.exportCsv', 'file.exportHtml', 'file.exportXlsx', 'formula.calculate', 'view.gridlines', 'view.zoomIn', 'view.zoomOut', 'view.zoomReset'])
    const 可见 = 表格标签.flatMap(标签 => 标签.groups.flatMap(组 => 组.items.map(项 => 项.commandId)))
    expect(可见).toHaveLength(59)
    expect(可见.filter(标识 => !编辑器直达.has(标识) && !表格命令表[标识])).toEqual([])
    expect(可见).not.toContain('insert.pivot')
  })
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
