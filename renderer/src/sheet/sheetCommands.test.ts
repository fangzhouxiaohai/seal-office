import { describe, it, expect, vi } from 'vitest'
import { 查找表格命令, type 表格命令上下文 } from './sheetCommands'
import { 创建工作表, 写入单元格, 读取单元格, type Sheet } from './model'
import { 解析地址 } from './address'

/** 构造一个 4 行 2 列、含数据的表 */
const 构造表 = (): Sheet => {
  let 表 = 创建工作表('测试', 4, 2)
  表 = 写入单元格(表, 'A1', '3')
  表 = 写入单元格(表, 'B1', '丙')
  表 = 写入单元格(表, 'A2', '1')
  表 = 写入单元格(表, 'B2', '甲')
  表 = 写入单元格(表, 'A3', '2')
  表 = 写入单元格(表, 'B3', '乙')
  return 表
}

const 构造上下文 = (选区 = { 起点: { 行: 0, 列: 0 }, 终点: { 行: 2, 列: 1 } }) => {
  const 通知 = vi.fn()
  const 撤销 = vi.fn()
  const 重做 = vi.fn()
  let 最新表 = 构造表()
  const 上下文: 表格命令上下文 = {
    工作表: 最新表,
    选区,
    更新工作表: (新表) => {
      最新表 = 新表
    },
    notify: 通知,
    撤销,
    重做,
  }
  return { 上下文, 通知, 撤销, 重做, 取最新: () => 最新表 }
}

describe('表格命令：撤销与重做', () => {
  it('撤销命令派发到上下文的撤销', () => {
    const { 上下文, 撤销 } = 构造上下文()
    查找表格命令('edit.undo')?.run(上下文)
    expect(撤销).toHaveBeenCalledTimes(1)
  })

  it('重做命令派发到上下文的重做', () => {
    const { 上下文, 重做 } = 构造上下文()
    查找表格命令('edit.redo')?.run(上下文)
    expect(重做).toHaveBeenCalledTimes(1)
  })
})

describe('表格命令：排序', () => {
  it('升序按首列重排整行且不丢失数据', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('data.sortAsc')?.run(上下文)
    const 表 = 取最新()
    expect(读取单元格(表, 'A1').显示值).toBe('1')
    expect(读取单元格(表, 'A2').显示值).toBe('2')
    expect(读取单元格(表, 'A3').显示值).toBe('3')
    // 每行的第二列随行移动，未发生串位
    expect(读取单元格(表, 'B1').显示值).toBe('甲')
    expect(读取单元格(表, 'B2').显示值).toBe('乙')
    expect(读取单元格(表, 'B3').显示值).toBe('丙')
  })

  it('降序按首列重排整行', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('data.sortDesc')?.run(上下文)
    const 表 = 取最新()
    expect(读取单元格(表, 'A1').显示值).toBe('3')
    expect(读取单元格(表, 'A3').显示值).toBe('1')
  })

  it('仅选中一行时给出中文提示', () => {
    const { 上下文, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 1 } })
    查找表格命令('data.sortAsc')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('请先选择两行以上的区域再排序')
  })

  it('选区超出工作表范围时被裁剪，不写出越界单元格键', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 6, 列: 3 } })
    查找表格命令('data.sortAsc')?.run(上下文)
    const 表 = 取最新()
    Object.keys(表.单元格).forEach((地址) => {
      const 位置 = 解析地址(地址)
      expect(位置).not.toBeNull()
      expect(位置!.行).toBeLessThan(表.行数)
      expect(位置!.列).toBeLessThan(表.列数)
    })
  })
})

describe('表格命令：删除重复项', () => {
  it('清除完全重复的行', () => {
    let 表 = 创建工作表('测试', 4, 2)
    表 = 写入单元格(表, 'A1', '甲')
    表 = 写入单元格(表, 'B1', '1')
    表 = 写入单元格(表, 'A2', '甲')
    表 = 写入单元格(表, 'B2', '1')
    const 通知 = vi.fn()
    let 最新 = 表
    const 上下文: 表格命令上下文 = {
      工作表: 表,
      选区: { 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 1 } },
      更新工作表: (新表) => {
        最新 = 新表
      },
      notify: 通知,
      撤销: vi.fn(),
      重做: vi.fn(),
    }
    查找表格命令('data.removeDuplicates')?.run(上下文)
    expect(读取单元格(最新, 'A2').显示值).toBe('')
    expect(通知).toHaveBeenCalled()
  })

  it('无重复项时给出中文提示', () => {
    const { 上下文, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 2, 列: 1 } })
    查找表格命令('data.removeDuplicates')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('未发现重复项')
  })
})

describe('表格命令：自动求和', () => {
  it('在选区下方写入求和公式', () => {
    const { 上下文, 取最新, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 2, 列: 0 } })
    查找表格命令('edit.sum')?.run(上下文)
    const 表 = 取最新()
    expect(读取单元格(表, 'A4').原始值).toBe('=SUM(A1:A3)')
    expect(读取单元格(表, 'A4').显示值).toBe('6')
    expect(通知).toHaveBeenCalled()
  })

  it('选区已在最后一行时给出中文提示且不写入', () => {
    const { 上下文, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 3, 列: 0 } })
    查找表格命令('edit.sum')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('所选区域已在最后一行，无法在下方写入求和结果')
  })
})

describe('表格命令：格式与清除', () => {
  it('加粗命令切换选区格式', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.bold')?.run(上下文)
    expect(读取单元格(取最新(), 'A1').格式.加粗).toBe(true)
    查找表格命令('cell.bold')?.run({
      ...上下文,
      工作表: 取最新(),
    })
    expect(读取单元格(取最新(), 'A1').格式.加粗).toBe(false)
  })

  it('清除内容保留格式', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.bold')?.run(上下文)
    查找表格命令('edit.clear')?.run({ ...上下文, 工作表: 取最新() })
    const 表 = 取最新()
    expect(读取单元格(表, 'A1').原始值).toBe('')
    expect(读取单元格(表, 'A1').格式.加粗).toBe(true)
  })

  it('未实现的表格命令给出中文提示', () => {
    const { 上下文, 通知 } = 构造上下文()
    查找表格命令('data.filter')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('该功能开发中')
  })
})
