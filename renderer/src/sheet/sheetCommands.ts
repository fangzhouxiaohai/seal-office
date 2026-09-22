// 表格命令注册表：Ribbon 按钮只派发命令标识，行为集中在此文件。
import { 生成地址, 生成区域地址, 展开区域, type 单元格位置 } from './address'
import {
  读取单元格,
  写入单元格,
  设置格式,
  清空单元格,
  切换合并,
  type CellFormat,
  type Sheet,
} from './model'
import { type 数字格式 } from './numberFormat'

export interface 选区范围 {
  起点: 单元格位置
  终点: 单元格位置
}

export interface 表格命令上下文 {
  工作表: Sheet
  选区: 选区范围
  更新工作表: (表: Sheet) => void
  notify: (文本: string) => void
  /** 撤销与重做由容器实现，命令只负责派发 */
  撤销: () => void
  重做: () => void
}

export interface 表格命令 {
  id: string
  label: string
  run: (上下文: 表格命令上下文, 参数?: string) => void
}

/** 尚未实现的功能：按钮就位，点击给出中文提示 */
export function 未实现表格命令(id: string, label: string): 表格命令 {
  return {
    id,
    label,
    run: (上下文) => 上下文.notify('该功能开发中'),
  }
}

/** 把选区裁剪到工作表范围内，避免越界写入单元格键并污染导出范围 */
function 裁剪选区(工作表: Sheet, 选区: 选区范围): 选区范围 {
  const 行上限 = Math.max(0, 工作表.行数 - 1)
  const 列上限 = Math.max(0, 工作表.列数 - 1)
  return {
    起点: {
      行: Math.max(0, Math.min(选区.起点.行, 行上限)),
      列: Math.max(0, Math.min(选区.起点.列, 列上限)),
    },
    终点: {
      行: Math.max(0, Math.min(选区.终点.行, 行上限)),
      列: Math.max(0, Math.min(选区.终点.列, 列上限)),
    },
  }
}

const 选区区域 = (上下文: 表格命令上下文): string => {
  const 裁剪后 = 裁剪选区(上下文.工作表, 上下文.选区)
  return 生成区域地址(裁剪后.起点, 裁剪后.终点)
}

const 首格格式 = (上下文: 表格命令上下文): CellFormat =>
  读取单元格(
    上下文.工作表,
    生成地址(上下文.选区.起点.行, 上下文.选区.起点.列)
  ).格式

/** 开关型格式命令：以选区左上角单元格的当前状态决定切换方向 */
function 开关格式命令(
  id: string,
  label: string,
  字段: '加粗' | '斜体' | '下划线'
): 表格命令 {
  return {
    id,
    label,
    run: (上下文) => {
      const 当前 = 首格格式(上下文)[字段] === true
      上下文.更新工作表(设置格式(上下文.工作表, 选区区域(上下文), { [字段]: !当前 }))
      上下文.notify(当前 ? `已取消${label}` : `已应用${label}`)
    },
  }
}

/** 直接设置型格式命令 */
function 设置格式命令(id: string, label: string, 格式: Partial<CellFormat>): 表格命令 {
  return {
    id,
    label,
    run: (上下文) => {
      上下文.更新工作表(设置格式(上下文.工作表, 选区区域(上下文), 格式))
      上下文.notify(`已应用${label}`)
    },
  }
}

/** 数字格式命令 */
function 数字格式命令(id: string, label: string, 格式: 数字格式): 表格命令 {
  return {
    id,
    label,
    run: (上下文) => {
      上下文.更新工作表(设置格式(上下文.工作表, 选区区域(上下文), { 数字格式: 格式 }))
      上下文.notify(`已应用${label}`)
    },
  }
}

/** 下拉选择用的数字格式映射 */
const 数字格式映射: Record<string, 数字格式> = {
  'number.plain': '常规',
  'number.percent': '百分比',
  'number.currency': '货币',
  'number.thousand': '千位分隔',
}

/** 排序命令：按选区首列对整行重排 */
function 排序命令(方向: '升序' | '降序'): 表格命令 {
  return {
    id: 方向 === '升序' ? 'data.sortAsc' : 'data.sortDesc',
    label: 方向,
    run: (上下文) => {
      const 裁剪后 = 裁剪选区(上下文.工作表, 上下文.选区)
      const 起点行 = 裁剪后.起点.行
      const 终点行 = 裁剪后.终点.行
      const 起点列 = 裁剪后.起点.列
      const 终点列 = 裁剪后.终点.列
      if (终点行 - 起点行 < 1) {
        上下文.notify('请先选择两行以上的区域再排序')
        return
      }

      // 先快照原始值，避免边写边读造成数据串位
      const 快照 = new Map<string, string>()
      for (let 行 = 起点行; 行 <= 终点行; 行 += 1) {
        for (let 列 = 起点列; 列 <= 终点列; 列 += 1) {
          快照.set(`${行}-${列}`, 读取单元格(上下文.工作表, 生成地址(行, 列)).原始值)
        }
      }

      const 各行 = Array.from({ length: 终点行 - 起点行 + 1 }, (_, 下标) => 起点行 + 下标)
      const 比较行 = (甲: number, 乙: number): number => {
        const 甲值 = 快照.get(`${甲}-${起点列}`) ?? ''
        const 乙值 = 快照.get(`${乙}-${起点列}`) ?? ''
        const 甲数 = Number(甲值)
        const 乙数 = Number(乙值)
        const 基础 =
          Number.isFinite(甲数) && Number.isFinite(乙数) && 甲值.length > 0 && 乙值.length > 0
            ? 甲数 - 乙数
            : 甲值.localeCompare(乙值, 'zh-Hans-CN')
        return 方向 === '升序' ? 基础 : -基础
      }

      const 排序后 = [...各行].sort(比较行)
      let 新表 = 上下文.工作表
      排序后.forEach((源行, 下标) => {
        const 目标行 = 起点行 + 下标
        for (let 列 = 起点列; 列 <= 终点列; 列 += 1) {
          新表 = 写入单元格(新表, 生成地址(目标行, 列), 快照.get(`${源行}-${列}`) ?? '')
        }
      })
      上下文.更新工作表(新表)
      上下文.notify(`已按首列${方向}排列`)
    },
  }
}

const 命令列表: 表格命令[] = [
  {
    id: 'edit.undo',
    label: '撤销',
    run: (上下文) => 上下文.撤销(),
  },
  {
    id: 'edit.redo',
    label: '重做',
    run: (上下文) => 上下文.重做(),
  },
  开关格式命令('cell.bold', '加粗', '加粗'),
  开关格式命令('cell.italic', '斜体', '斜体'),
  开关格式命令('cell.underline', '下划线', '下划线'),
  设置格式命令('cell.alignLeft', '左对齐', { 水平对齐: 'left' }),
  设置格式命令('cell.alignCenter', '居中', { 水平对齐: 'center' }),
  设置格式命令('cell.alignRight', '右对齐', { 水平对齐: 'right' }),
  设置格式命令('cell.fill', '填充颜色', { 填充颜色: '#EBF1FE' }),
  设置格式命令('cell.fontColor', '字体颜色', { 字体颜色: '#E34D59' }),
  设置格式命令('cell.wrap', '自动换行', { 自动换行: true }),
  {
    id: 'cell.mergeCenter',
    label: '合并后居中',
    run: (上下文) => {
      const 区域 = 选区区域(上下文)
      const 已合并 = 上下文.工作表.合并区域.includes(区域)
      const 居中后 = 设置格式(上下文.工作表, 区域, { 水平对齐: 'center' })
      上下文.更新工作表(切换合并(居中后, 区域))
      上下文.notify(已合并 ? '已取消合并' : '已合并并居中')
    },
  },
  数字格式命令('number.plain', '常规', '常规'),
  数字格式命令('number.percent', '百分比', '百分比'),
  数字格式命令('number.currency', '货币', '货币'),
  数字格式命令('number.thousand', '千位分隔', '千位分隔'),
  {
    id: 'number.format',
    label: '数字格式',
    run: (上下文, 参数) => {
      const 格式 = 数字格式映射[参数 ?? ''] ?? '常规'
      上下文.更新工作表(设置格式(上下文.工作表, 选区区域(上下文), { 数字格式: 格式 }))
      上下文.notify(`已应用${格式}格式`)
    },
  },
  {
    id: 'edit.clear',
    label: '清除内容',
    run: (上下文) => {
      const 地址列表 = 展开区域(选区区域(上下文)).map((位置) =>
        生成地址(位置.行, 位置.列)
      )
      上下文.更新工作表(清空单元格(上下文.工作表, 地址列表))
      上下文.notify(`已清除 ${地址列表.length} 个单元格的内容`)
    },
  },
  {
    id: 'edit.sum',
    label: '自动求和',
    run: (上下文) => {
      const { 起点, 终点 } = 裁剪选区(上下文.工作表, 上下文.选区)
      if (终点.行 - 起点.行 < 1) {
        上下文.notify('请先选择两行以上的数值区域')
        return
      }
      if (终点.行 + 1 >= 上下文.工作表.行数) {
        上下文.notify('所选区域已在最后一行，无法在下方写入求和结果')
        return
      }
      const 区域地址 = 生成区域地址({ 行: 起点.行, 列: 起点.列 }, { 行: 终点.行, 列: 起点.列 })
      const 目标地址 = 生成地址(终点.行 + 1, 起点.列)
      const 新表 = 写入单元格(上下文.工作表, 目标地址, `=SUM(${区域地址})`)
      上下文.更新工作表(新表)
      上下文.notify(`已在 ${目标地址} 写入求和公式`)
    },
  },
  {
    id: 'data.removeDuplicates',
    label: '删除重复项',
    run: (上下文) => {
      const { 起点, 终点 } = 裁剪选区(上下文.工作表, 上下文.选区)
      const 已见 = new Set<string>()
      const 要清空: string[] = []
      for (let 行 = 起点.行; 行 <= 终点.行; 行 += 1) {
        const 键 = Array.from({ length: 终点.列 - 起点.列 + 1 }, (_, 偏移) =>
          读取单元格(上下文.工作表, 生成地址(行, 起点.列 + 偏移)).显示值
        ).join('\u0001')
        if (键.trim().length === 0) {
          continue
        }
        if (已见.has(键)) {
          for (let 列 = 起点.列; 列 <= 终点.列; 列 += 1) {
            要清空.push(生成地址(行, 列))
          }
        } else {
          已见.add(键)
        }
      }
      if (要清空.length === 0) {
        上下文.notify('未发现重复项')
        return
      }
      上下文.更新工作表(清空单元格(上下文.工作表, 要清空))
      上下文.notify(`已清除 ${要清空.length / Math.max(1, 终点.列 - 起点.列 + 1)} 行重复数据`)
    },
  },
  排序命令('升序'),
  排序命令('降序'),
]

export const 表格命令表: Record<string, 表格命令> = 命令列表.reduce<Record<string, 表格命令>>(
  (累计, 命令) => {
    累计[命令.id] = 命令
    return 累计
  },
  {}
)

/** 尚未实现的表格命令，按钮仍会渲染并给出中文提示 */
export const 表格未实现清单: Array<[string, string]> = [
  ['insert.pivot', '数据透视表'],
  ['insert.chart', '图表'],
  ['insert.picture', '图片'],
  ['formula.financial', '财务函数'],
  ['formula.logical', '逻辑函数'],
  ['formula.lookup', '查找与引用'],
  ['data.filter', '筛选'],
  ['data.textToColumns', '分列'],
  ['data.validation', '数据验证'],
  ['review.comment', '批注'],
  ['review.protect', '保护工作表'],
  ['view.freeze', '冻结窗格'],
  ['view.split', '拆分'],
]

表格未实现清单.forEach(([id, label]) => {
  表格命令表[id] = 未实现表格命令(id, label)
})

export const 表格命令标识列表: string[] = Object.keys(表格命令表)

export function 查找表格命令(id: string): 表格命令 | undefined {
  return 表格命令表[id]
}
