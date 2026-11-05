import { describe, expect, it } from 'vitest'
import { 处于受保护查看 } from './fileWarnings'

describe('有损导入的受保护查看状态', () => {
  it('有来源警告且仍在原路径时只读，另存副本后可编辑', () => {
    expect(处于受保护查看('C:\\资料\\报表.xls', 'c:/资料/报表.xls', ['网页样式未导入'])).toBe(true)
    expect(处于受保护查看('C:\\资料\\报表.xls', 'C:\\资料\\报表.slxls', ['网页样式未导入'])).toBe(false)
    expect(处于受保护查看('C:\\资料\\报表.xls', 'C:\\资料\\报表.xls', [])).toBe(false)
    expect(处于受保护查看('C:\\资料\\手册.docx', 'C:\\资料\\手册.docx', ['域代码未完整导入，已保留可读取的缓存结果'])).toBe(false)
  })
})
