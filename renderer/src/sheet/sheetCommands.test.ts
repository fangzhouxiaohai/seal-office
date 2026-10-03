import { afterEach, describe, it, expect, vi } from 'vitest'
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

const 设置测试剪贴板 = (文本 = '') => {
  const 读取 = vi.fn().mockResolvedValue(文本)
  const 写入 = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { readText: 读取, writeText: 写入 } })
  return { 读取, 写入 }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('表格命令：剪贴板二维区域', () => {
  it('复制多行选区时按行列生成制表符分隔文本', async () => {
    const { 写入 } = 设置测试剪贴板()
    const { 上下文, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 1 } })
    查找表格命令('clipboard.copy')?.run(上下文)
    expect(写入).toHaveBeenCalledWith('3\t丙\n1\t甲')
    await vi.waitFor(() => expect(通知).toHaveBeenCalledWith('已复制 4 个单元格'))
  })

  it('剪切多行选区时保留二维结构并在写入剪贴板成功后清空原区域', async () => {
    const { 写入 } = 设置测试剪贴板()
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 1 } })
    查找表格命令('clipboard.cut')?.run(上下文)
    expect(写入).toHaveBeenCalledWith('3\t丙\n1\t甲')
    await vi.waitFor(() => expect(读取单元格(取最新(), 'B2').原始值).toBe(''))
    expect(读取单元格(取最新(), 'A1').原始值).toBe('')
    expect(读取单元格(取最新(), 'B1').原始值).toBe('')
    expect(读取单元格(取最新(), 'A2').原始值).toBe('')
  })

  it('以单个目标格为左上角粘贴完整二维区域', async () => {
    设置测试剪贴板('新甲\t新乙\n新丙\t新丁')
    const { 上下文, 取最新, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } })
    查找表格命令('clipboard.paste')?.run(上下文)
    await vi.waitFor(() => expect(通知).toHaveBeenCalledWith('已粘贴 4 个单元格'))
    expect(读取单元格(取最新(), 'A1').原始值).toBe('新甲')
    expect(读取单元格(取最新(), 'B1').原始值).toBe('新乙')
    expect(读取单元格(取最新(), 'A2').原始值).toBe('新丙')
    expect(读取单元格(取最新(), 'B2').原始值).toBe('新丁')
  })

  it('粘贴保留中间空白行并兼容回车换行和末尾换行', async () => {
    设置测试剪贴板('第一\t首行\r\n\r\n第三\t末行\r\n')
    const { 上下文, 取最新, 通知 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } })
    查找表格命令('clipboard.paste')?.run(上下文)
    await vi.waitFor(() => expect(通知).toHaveBeenCalledWith('已粘贴 6 个单元格'))
    expect(读取单元格(取最新(), 'A1').原始值).toBe('第一')
    expect(读取单元格(取最新(), 'B1').原始值).toBe('首行')
    expect(读取单元格(取最新(), 'A2').原始值).toBe('')
    expect(读取单元格(取最新(), 'B2').原始值).toBe('')
    expect(读取单元格(取最新(), 'A3').原始值).toBe('第三')
    expect(读取单元格(取最新(), 'B3').原始值).toBe('末行')
  })

  it('反向选区以左上格粘贴并将超出工作表的部分裁剪', async () => {
    设置测试剪贴板('甲\t乙\t丙\n丁\t戊\t己')
    const { 上下文, 取最新, 通知 } = 构造上下文({ 起点: { 行: 3, 列: 1 }, 终点: { 行: 2, 列: 0 } })
    查找表格命令('clipboard.paste')?.run(上下文)
    await vi.waitFor(() => expect(通知).toHaveBeenCalledWith('已粘贴 4 个单元格'))
    expect(读取单元格(取最新(), 'A3').原始值).toBe('甲')
    expect(读取单元格(取最新(), 'B3').原始值).toBe('乙')
    expect(读取单元格(取最新(), 'A4').原始值).toBe('丁')
    expect(读取单元格(取最新(), 'B4').原始值).toBe('戊')
    expect(Object.keys(取最新().单元格)).not.toContain('C3')
    expect(Object.keys(取最新().单元格)).not.toContain('C4')
  })
})

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

})

describe('表格命令：本地工具入口', () => {
  it('查找命令打开已有查找栏', () => {
    const { 上下文 } = 构造上下文()
    const 打开查找 = vi.fn()
    查找表格命令('edit.find')?.run({ ...上下文, 打开查找 })
    expect(打开查找).toHaveBeenCalledTimes(1)
  })

  it('函数库命令在当前单元格开始编辑可执行的函数', () => {
    const { 上下文 } = 构造上下文()
    const 开始编辑公式 = vi.fn()
    查找表格命令('formula.lookup')?.run({ ...上下文, 开始编辑公式 })
    查找表格命令('formula.financial')?.run({ ...上下文, 开始编辑公式 })
    expect(开始编辑公式).toHaveBeenNthCalledWith(1, '=XLOOKUP(')
    expect(开始编辑公式).toHaveBeenNthCalledWith(2, '=PMT(')
  })

  it('冻结和拆分命令派发到当前视图', () => {
    const { 上下文 } = 构造上下文()
    const 切换冻结 = vi.fn()
    const 切换拆分 = vi.fn()
    查找表格命令('view.freeze')?.run({ ...上下文, 切换冻结, 切换拆分 })
    查找表格命令('view.split')?.run({ ...上下文, 切换冻结, 切换拆分 })
    expect(切换冻结).toHaveBeenCalledTimes(1)
    expect(切换拆分).toHaveBeenCalledTimes(1)
  })

  it('批注命令打开当前单元格批注编辑', () => {
    const { 上下文 } = 构造上下文()
    const 编辑批注 = vi.fn()
    查找表格命令('review.comment')?.run({ ...上下文, 编辑批注 })
    expect(编辑批注).toHaveBeenCalledTimes(1)
  })

  it('筛选命令打开筛选设置', () => {
    const { 上下文 } = 构造上下文()
    const 切换筛选 = vi.fn()
    查找表格命令('data.filter')?.run({ ...上下文, 切换筛选 })
    expect(切换筛选).toHaveBeenCalledTimes(1)
  })

  it('符号命令打开本地符号选择', () => {
    const { 上下文 } = 构造上下文()
    const 选择符号 = vi.fn()
    查找表格命令('symbol.insert')?.run({ ...上下文, 选择符号 })
    expect(选择符号).toHaveBeenCalledTimes(1)
  })

  it('页面设置命令将选项写入工作表', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('layout.margin')?.run(上下文, '窄')
    查找表格命令('layout.orientation')?.run({ ...上下文, 工作表: 取最新() }, '横向')
    查找表格命令('layout.paperSize')?.run({ ...上下文, 工作表: 取最新() }, 'A5')
    expect(取最新().页面设置).toEqual({ 页边距: '窄', 方向: '横向', 纸张大小: 'A5' })
  })

  it('工作簿视图命令切换普通与页面布局', () => {
    const { 上下文 } = 构造上下文()
    const 切换视图 = vi.fn()
    查找表格命令('view.pageLayout')?.run({ ...上下文, 切换视图 })
    查找表格命令('view.normal')?.run({ ...上下文, 切换视图 })
    expect(切换视图).toHaveBeenNthCalledWith(1, '页面布局')
    expect(切换视图).toHaveBeenNthCalledWith(2, '普通')
  })
})

describe('表格命令：插入与删除行列', () => {
  it('插入行在选区起点上方插入空行', () => {
    const { 上下文, 取最新, 通知 } = 构造上下文({ 起点: { 行: 1, 列: 0 }, 终点: { 行: 1, 列: 0 } })
    查找表格命令('row.insert')?.run(上下文)
    const 表 = 取最新()
    expect(表.行数).toBe(5)
    expect(读取单元格(表, 'A2').显示值).toBe('')
    expect(读取单元格(表, 'A3').显示值).toBe('1')
    expect(通知).toHaveBeenCalled()
  })

  it('删除行移除选中行并上移后续行', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 1, 列: 0 }, 终点: { 行: 1, 列: 0 } })
    查找表格命令('row.delete')?.run(上下文)
    const 表 = 取最新()
    expect(表.行数).toBe(3)
    expect(读取单元格(表, 'A1').显示值).toBe('3')
    expect(读取单元格(表, 'A2').显示值).toBe('2')
    expect(读取单元格(表, 'A3').显示值).toBe('')
  })

  it('删除行在仅剩一行时给出中文提示且不删除', () => {
    const 通知 = vi.fn()
    let 表 = 创建工作表('测试', 1, 2)
    表 = 写入单元格(表, 'A1', '唯一')
    let 最新 = 表
    const 上下文: 表格命令上下文 = {
      工作表: 表,
      选区: { 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } },
      更新工作表: (新表) => {
        最新 = 新表
      },
      notify: 通知,
      撤销: vi.fn(),
      重做: vi.fn(),
    }
    查找表格命令('row.delete')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('工作表至少需要保留一行，无法删除')
    expect(最新.行数).toBe(1)
  })

  it('插入列在选区起点左侧插入空列', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 1 }, 终点: { 行: 0, 列: 1 } })
    查找表格命令('col.insert')?.run(上下文)
    const 表 = 取最新()
    expect(表.列数).toBe(3)
    expect(读取单元格(表, 'B1').显示值).toBe('')
    expect(读取单元格(表, 'C1').显示值).toBe('丙')
  })

  it('删除列移除选中列并左移后续列', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 1 }, 终点: { 行: 0, 列: 1 } })
    查找表格命令('col.delete')?.run(上下文)
    const 表 = 取最新()
    expect(表.列数).toBe(1)
    expect(读取单元格(表, 'A1').显示值).toBe('3')
  })

  it('单元格插入与删除行命令等效', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } })
    查找表格命令('cell.insert')?.run(上下文)
    expect(取最新().行数).toBe(5)
    查找表格命令('cell.delete')?.run({
      ...上下文,
      工作表: 取最新(),
    })
    expect(取最新().行数).toBe(4)
  })
})

describe('表格命令：分列', () => {
  it('按逗号把选中列拆分为多列', () => {
    let 表 = 创建工作表('测试', 2, 3)
    表 = 写入单元格(表, 'A1', '甲,乙,丙')
    表 = 写入单元格(表, 'A2', '丁')
    const 通知 = vi.fn()
    let 最新 = 表
    const 上下文: 表格命令上下文 = {
      工作表: 表,
      选区: { 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 0 } },
      更新工作表: (新表) => {
        最新 = 新表
      },
      notify: 通知,
      撤销: vi.fn(),
      重做: vi.fn(),
    }
    查找表格命令('data.textToColumns')?.run(上下文)
    expect(读取单元格(最新, 'A1').显示值).toBe('甲')
    expect(读取单元格(最新, 'B1').显示值).toBe('乙')
    expect(读取单元格(最新, 'C1').显示值).toBe('丙')
    expect(读取单元格(最新, 'A2').显示值).toBe('丁')
    expect(通知).toHaveBeenCalled()
  })

  it('区域内无可拆分数据时给出中文提示', () => {
    let 表 = 创建工作表('测试', 2, 2)
    表 = 写入单元格(表, 'A1', '单个')
    const 通知 = vi.fn()
    const 上下文: 表格命令上下文 = {
      工作表: 表,
      选区: { 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } },
      更新工作表: (新表) => {
        表 = 新表
      },
      notify: 通知,
      撤销: vi.fn(),
      重做: vi.fn(),
    }
    查找表格命令('data.textToColumns')?.run(上下文)
    expect(通知).toHaveBeenCalledWith('所选区域内没有可拆分的数据')
  })
})

describe('表格命令：全选', () => {
  it('调用上下文更新选区选中全部单元格', () => {
    const { 上下文 } = 构造上下文()
    const 更新选区 = vi.fn()
    查找表格命令('edit.selectAll')?.run({ ...上下文, 更新选区 })
    expect(更新选区).toHaveBeenCalledWith({
      起点: { 行: 0, 列: 0 },
      终点: { 行: 3, 列: 1 },
    })
  })
})

describe('表格命令：颜色下拉参数', () => {
  it('字体颜色下拉选中的颜色值作为参数生效，而非固定默认色', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.fontColor')?.run(上下文, '#2B6CF6')
    expect(读取单元格(取最新(), 'A1').格式.字体颜色).toBe('#2B6CF6')
  })

  it('填充颜色下拉选中的颜色值作为参数生效', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.fill')?.run(上下文, '#E8F7F1')
    expect(读取单元格(取最新(), 'A1').格式.填充颜色).toBe('#E8F7F1')
  })

  it('不带参数时回落到默认颜色', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.fontColor')?.run(上下文)
    expect(读取单元格(取最新(), 'A1').格式.字体颜色).toBe('#E34D59')
  })
})

describe('表格命令：边框', () => {
  it('所有框线为四边全开', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 1 } })
    查找表格命令('cell.border')?.run(上下文, 'all')
    const 表 = 取最新()
    expect(读取单元格(表, 'A1').格式.边框).toEqual({ 上: true, 下: true, 左: true, 右: true })
    expect(读取单元格(表, 'B2').格式.边框).toEqual({ 上: true, 下: true, 左: true, 右: true })
  })

  it('外侧框线只在区域周圈，内部格无边框', () => {
    const { 上下文, 取最新 } = 构造上下文({ 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 1 } })
    查找表格命令('cell.border')?.run(上下文, 'outer')
    const 表 = 取最新()
    expect(读取单元格(表, 'A1').格式.边框).toEqual({ 上: true, 下: false, 左: true, 右: false })
    expect(读取单元格(表, 'B2').格式.边框).toEqual({ 上: false, 下: true, 左: false, 右: true })
    expect(读取单元格(表, 'A2').格式.边框).toEqual({ 上: false, 下: true, 左: true, 右: false })
    expect(读取单元格(表, 'B1').格式.边框).toEqual({ 上: true, 下: false, 左: false, 右: true })
  })

  it('单边与清除', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.border')?.run(上下文, 'top')
    expect(读取单元格(取最新(), 'A1').格式.边框).toEqual({ 上: true, 下: false, 左: false, 右: false })
    查找表格命令('cell.border')?.run(上下文, 'none')
    expect(读取单元格(取最新(), 'A1').格式.边框).toEqual({ 上: false, 下: false, 左: false, 右: false })
  })

  it('不带参数时默认所有框线', () => {
    const { 上下文, 取最新 } = 构造上下文()
    查找表格命令('cell.border')?.run(上下文)
    expect(读取单元格(取最新(), 'A1').格式.边框).toEqual({ 上: true, 下: true, 左: true, 右: true })
  })
})
