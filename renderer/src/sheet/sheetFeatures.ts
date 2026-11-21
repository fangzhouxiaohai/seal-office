import { 生成地址, 解析地址, type 单元格位置 } from './address'
import { 读取单元格, type Sheet } from './model'

function 边界(范围: string) {
  const [起, 止 = 起] = 范围.split(':').map(解析地址)
  return 起 && 止 ? { 起, 止 } : null
}

function 包含(区域: ReturnType<typeof 边界>, 行: number, 列: number) {
  return 区域 && 行 >= 区域.起.行 && 行 <= 区域.止.行 && 列 >= 区域.起.列 && 列 <= 区域.止.列
}

export function 工作表显示格式(表: Sheet) {
  const 表格 = (表.结构化表格 ?? []).map(项 => ({ 区域: 边界(项.范围), 带状行: 项.带状行 }))
  const 条件 = (表.条件格式 ?? []).flatMap(规则 => {
    const 区域 = 边界(规则.范围)
    const 表达式 = /^(\$?)([A-Z]{1,3})(\$?)([1-9]\d{0,6})\s*(=|<>)\s*"((?:[^"]|"")*)"$/i.exec(规则.公式)
    if (!区域 || !表达式) return []
    const [, 固定列, 列名, 固定行, 行号, 运算, 文本] = 表达式
    const 基准 = 解析地址(`${列名}${行号}`)!
    const 目标文本 = 文本.replace(/""/g, '"').toUpperCase()
    return [{ 区域, 基准, 固定列, 固定行, 运算, 目标文本, 规则 }]
  }).sort((甲, 乙) => 甲.规则.优先级 - 乙.规则.优先级)
  return ({ 行, 列 }: 单元格位置) => {
    let 字体颜色: string | undefined, 填充颜色: string | undefined
    for (const 项 of 条件) {
      if (!包含(项.区域, 行, 列)) continue
      const 引用行 = 项.基准.行 + (项.固定行 ? 0 : 行 - 项.区域.起.行)
      const 引用列 = 项.基准.列 + (项.固定列 ? 0 : 列 - 项.区域.起.列)
      if (引用行 < 0 || 引用列 < 0 || 引用行 >= 1048576 || 引用列 >= 16384) continue
      const 单元格 = 读取单元格(表, 生成地址(引用行, 引用列))
      if (单元格.计算错误) continue
      const 相等 = String(单元格.计算值 ?? 单元格.显示值).toUpperCase() === 项.目标文本
      if (相等 !== (项.运算 === '=')) continue
      if (!字体颜色 && 项.规则.字体颜色) 字体颜色 = '#' + 项.规则.字体颜色.slice(2)
      if (!填充颜色 && 项.规则.填充颜色) 填充颜色 = '#' + 项.规则.填充颜色.slice(2)
    }
    const 当前表格 = 表格.find(项 => 包含(项.区域, 行, 列))
    const 相对行 = 当前表格?.区域 ? 行 - 当前表格.区域.起.行 : -1
    const 表格填充 = 相对行 === 0 ? '#d9d9d9' : 当前表格?.带状行 && 相对行 % 2 === 1 ? '#f2f2f2' : undefined
    return { 字体颜色, 填充颜色, 表格填充 }
  }
}
