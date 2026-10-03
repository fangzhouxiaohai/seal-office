// 表格命令注册表：Ribbon 按钮只派发命令标识，行为集中在此文件。
import { 生成地址, 生成区域地址, 展开区域, type 单元格位置 } from './address'
import {
  读取单元格,
  写入单元格,
  设置格式,
  设置页面设置,
  清空单元格,
  切换合并,
  插入行,
  插入列,
  删除行,
  删除列,
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
  /** 可选：由容器提供的选区更新能力，用于全选等命令 */
  更新选区?: (选区: 选区范围) => void
  打开查找?: () => void
  开始编辑公式?: (模板: string) => void
  切换冻结?: () => void
  切换拆分?: () => void
  编辑批注?: () => void
  切换筛选?: () => void
  选择符号?: () => void
  切换视图?: (视图: '普通' | '页面布局') => void
  编辑数据验证?: () => void
  切换保护?: () => void
  检查拼写?: () => void
  选择图片?: () => void
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

/** 需要高级功能、给出明确中文指引的命令：按钮就位，点击提示后续支持计划 */
export function 指引命令(id: string, label: string, 提示: string): 表格命令 {
  return {
    id,
    label,
    run: (上下文) => 上下文.notify(提示),
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
function 设置格式命令(
  id: string,
  label: string,
  格式: Partial<CellFormat>,
  /** 下拉命令的可覆盖字段：下拉选中的值作为参数传入时覆盖该字段 */
  参数字段?: keyof CellFormat
): 表格命令 {
  return {
    id,
    label,
    run: (上下文, 参数) => {
      const 最终格式 =
        参数字段 !== undefined && typeof 参数 === 'string' && 参数.trim() !== ''
          ? { ...格式, [参数字段]: 参数 }
          : 格式
      上下文.更新工作表(设置格式(上下文.工作表, 选区区域(上下文), 最终格式))
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

/** 插入/删除行列命令的通用构造 */
function 行列命令(
  id: string,
  label: string,
  操作: (上下文: 表格命令上下文) => { 新表: Sheet; 提示: string }
): 表格命令 {
  return {
    id,
    label,
    run: (上下文) => {
      const { 新表, 提示 } = 操作(上下文)
      上下文.更新工作表(新表)
      上下文.notify(提示)
    },
  }
}

/** 将选区编码为可与其他表格软件互通的二维制表符文本。 */
function 选区剪贴板内容(上下文: 表格命令上下文): { 地址列表: string[]; 文本: string } {
  const 位置列表 = 展开区域(选区区域(上下文))
  const 地址列表: string[] = []
  const 各行: string[][] = []
  let 当前行 = -1
  位置列表.forEach((位置) => {
    if (位置.行 !== 当前行) {
      各行.push([])
      当前行 = 位置.行
    }
    const 地址 = 生成地址(位置.行, 位置.列)
    地址列表.push(地址)
    各行[各行.length - 1].push(读取单元格(上下文.工作表, 地址).原始值)
  })
  return { 地址列表, 文本: 各行.map((行) => 行.join('\t')).join('\n') }
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
  {
    id: 'clipboard.cut',
    label: '剪切',
    run: (上下文) => {
      const { 地址列表, 文本 } = 选区剪贴板内容(上下文)
      if (地址列表.length === 0) {
        上下文.notify('所选区域为空')
        return
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(文本).then(() => {
          上下文.更新工作表(清空单元格(上下文.工作表, 地址列表))
          上下文.notify(`已剪切 ${地址列表.length} 个单元格`)
        }).catch(() => {
          上下文.notify('剪切功能需要浏览器剪贴板权限')
        })
      } else {
        上下文.notify('当前环境不支持剪切功能')
      }
    },
  },
  {
    id: 'clipboard.copy',
    label: '复制',
    run: (上下文) => {
      const { 地址列表, 文本 } = 选区剪贴板内容(上下文)
      if (地址列表.length === 0) {
        上下文.notify('所选区域为空')
        return
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(文本).then(() => {
          上下文.notify(`已复制 ${地址列表.length} 个单元格`)
        }).catch(() => {
          上下文.notify('复制功能需要浏览器剪贴板权限')
        })
      } else {
        上下文.notify('当前环境不支持复制功能')
      }
    },
  },
  {
    id: 'clipboard.paste',
    label: '粘贴',
    run: (上下文) => {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        上下文.notify('当前环境不支持读取剪贴板')
        return
      }
      navigator.clipboard.readText().then((文本) => {
        if (文本.length === 0) {
          上下文.notify('剪贴板为空')
          return
        }
        const 行数据 = 文本.replace(/\r\n?/g, '\n').split('\n')
        if (行数据[行数据.length - 1] === '') 行数据.pop()
        const 列数 = 行数据.reduce((最大, 行) => Math.max(最大, 行.split('\t').length), 0)
        const 目标地址: string[] = []
        const 值列表: string[] = []
        const 起点 = 展开区域(选区区域(上下文))[0]
        if (!起点) {
          上下文.notify('粘贴位置无效')
          return
        }
        for (let 行 = 起点.行; 行 < 起点.行 + 行数据.length && 行 < 上下文.工作表.行数; 行 += 1) {
          const 列数据 = 行数据[行 - 起点.行].split('\t')
          for (let 列 = 起点.列; 列 < 起点.列 + 列数 && 列 < 上下文.工作表.列数; 列 += 1) {
            const 值 = 列数据[列 - 起点.列] ?? ''
            目标地址.push(生成地址(行, 列))
            值列表.push(值)
          }
        }
        if (目标地址.length > 0) {
          上下文.更新工作表(
            目标地址.reduce((表, 地址, 下标) =>
              写入单元格(表, 地址, 值列表[下标] ?? ''), 上下文.工作表
            )
          )
          上下文.notify(`已粘贴 ${目标地址.length} 个单元格`)
        }
      }).catch(() => {
        上下文.notify('读取剪贴板失败，请检查权限设置')
      })
    },
  },
  开关格式命令('cell.bold', '加粗', '加粗'),
  开关格式命令('cell.italic', '斜体', '斜体'),
  开关格式命令('cell.underline', '下划线', '下划线'),
  设置格式命令('cell.alignLeft', '左对齐', { 水平对齐: 'left' }),
  设置格式命令('cell.alignCenter', '居中', { 水平对齐: 'center' }),
  设置格式命令('cell.alignRight', '右对齐', { 水平对齐: 'right' }),
  设置格式命令('cell.fill', '填充颜色', { 填充颜色: '#EBF1FE' }, '填充颜色'),
  设置格式命令('cell.fontColor', '字体颜色', { 字体颜色: '#E34D59' }, '字体颜色'),
  设置格式命令('cell.wrap', '自动换行', { 自动换行: true }),
  {
    id: 'cell.border',
    label: '边框',
    run: (上下文, 参数) => {
      // all=所有框线 outer=外侧框线 top/bottom/left/right=单边 none=清除；逐格写边框配置
      const 样式 = 参数 ?? 'all'
      const 裁剪后 = 裁剪选区(上下文.工作表, 上下文.选区)
      const 位置列表 = 展开区域(生成区域地址(裁剪后.起点, 裁剪后.终点))
      if (位置列表.length === 0) {
        return
      }
      const 最小行 = Math.min(...位置列表.map((位置) => 位置.行))
      const 最大行 = Math.max(...位置列表.map((位置) => 位置.行))
      const 最小列 = Math.min(...位置列表.map((位置) => 位置.列))
      const 最大列 = Math.max(...位置列表.map((位置) => 位置.列))
      let 表 = 上下文.工作表
      位置列表.forEach((位置) => {
        let 边框: CellFormat['边框']
        switch (样式) {
          case 'none':
            边框 = { 上: false, 下: false, 左: false, 右: false }
            break
          case 'top':
            边框 = { 上: true, 下: false, 左: false, 右: false }
            break
          case 'bottom':
            边框 = { 上: false, 下: true, 左: false, 右: false }
            break
          case 'left':
            边框 = { 上: false, 下: false, 左: true, 右: false }
            break
          case 'right':
            边框 = { 上: false, 下: false, 左: false, 右: true }
            break
          case 'outer':
            边框 = {
              上: 位置.行 === 最小行,
              下: 位置.行 === 最大行,
              左: 位置.列 === 最小列,
              右: 位置.列 === 最大列,
            }
            break
          default:
            边框 = { 上: true, 下: true, 左: true, 右: true }
        }
        表 = 设置格式(表, 生成地址(位置.行, 位置.列), { 边框 })
      })
      上下文.更新工作表(表)
      上下文.notify('边框已更新')
    },
  },
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
      // 选区仅一个单元格时，自动向上查找连续数值区域作为求和范围
      let 求和起点: number
      let 求和终点: number
      if (终点.行 - 起点.行 < 1) {
        // 向上查找连续有数据的行
        求和终点 = 起点.行 - 1
        求和起点 = 求和终点
        while (求和起点 >= 0) {
          const 值 = 读取单元格(上下文.工作表, 生成地址(求和起点, 起点.列)).原始值
          if (值.length === 0) break
          求和起点 -= 1
        }
        求和起点 += 1
        if (求和终点 - 求和起点 < 1) {
          上下文.notify('上方未找到连续数值区域，无法求和')
          return
        }
      } else {
        求和起点 = 起点.行
        求和终点 = 终点.行
      }
      if (求和终点 + 1 >= 上下文.工作表.行数) {
        上下文.notify('所选区域已在最后一行，无法在下方写入求和结果')
        return
      }
      const 区域地址 = 生成区域地址({ 行: 求和起点, 列: 起点.列 }, { 行: 求和终点, 列: 起点.列 })
      const 目标地址 = 生成地址(求和终点 + 1, 起点.列)
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
  // ---- 插入 / 删除 行、列 ----
  行列命令('row.insert', '插入行', (上下文) => {
    const 新表 = 插入行(上下文.工作表, 上下文.选区.起点.行)
    return { 新表, 提示: `已在第 ${上下文.选区.起点.行 + 1} 行上方插入一行` }
  }),
  行列命令('row.delete', '删除行', (上下文) => {
    if (上下文.工作表.行数 <= 1) {
      上下文.notify('工作表至少需要保留一行，无法删除')
      return { 新表: 上下文.工作表, 提示: '' }
    }
    const 新表 = 删除行(上下文.工作表, 上下文.选区.起点.行)
    return { 新表, 提示: `已删除第 ${上下文.选区.起点.行 + 1} 行` }
  }),
  行列命令('col.insert', '插入列', (上下文) => {
    const 新表 = 插入列(上下文.工作表, 上下文.选区.起点.列)
    return { 新表, 提示: `已在第 ${上下文.选区.起点.列 + 1} 列左侧插入一列` }
  }),
  行列命令('col.delete', '删除列', (上下文) => {
    if (上下文.工作表.列数 <= 1) {
      上下文.notify('工作表至少需要保留一列，无法删除')
      return { 新表: 上下文.工作表, 提示: '' }
    }
    const 新表 = 删除列(上下文.工作表, 上下文.选区.起点.列)
    return { 新表, 提示: `已删除第 ${上下文.选区.起点.列 + 1} 列` }
  }),
  行列命令('cell.insert', '插入单元格', (上下文) => {
    const 新表 = 插入行(上下文.工作表, 上下文.选区.起点.行)
    return { 新表, 提示: `已在第 ${上下文.选区.起点.行 + 1} 行上方插入空行` }
  }),
  行列命令('cell.delete', '删除单元格', (上下文) => {
    if (上下文.工作表.行数 <= 1) {
      上下文.notify('工作表至少需要保留一行，无法删除')
      return { 新表: 上下文.工作表, 提示: '' }
    }
    const 新表 = 删除行(上下文.工作表, 上下文.选区.起点.行)
    return { 新表, 提示: `已删除第 ${上下文.选区.起点.行 + 1} 行` }
  }),
  {
    id: 'cell.format',
    label: '设置单元格格式',
    run: (上下文) => {
      上下文.notify('设置单元格格式请使用开始标签下的字体、对齐方式与数字格式命令')
    },
  },
  {
    id: 'edit.find',
    label: '查找',
    run: (上下文) => {
      if (上下文.打开查找) 上下文.打开查找()
      else 上下文.notify('当前界面无法打开查找栏')
    },
  },
  {
    id: 'edit.selectAll',
    label: '全选',
    run: (上下文) => {
      if (上下文.更新选区 === undefined) {
        上下文.notify('当前环境不支持全选操作')
        return
      }
      上下文.更新选区({
        起点: { 行: 0, 列: 0 },
        终点: { 行: 上下文.工作表.行数 - 1, 列: 上下文.工作表.列数 - 1 },
      })
      上下文.notify('已全选工作表')
    },
  },
  {
    id: 'data.textToColumns',
    label: '分列',
    run: (上下文, 参数) => {
      const 分隔符 = 参数 && 参数.length > 0 ? 参数 : ''
      const { 起点, 终点 } = 裁剪选区(上下文.工作表, 上下文.选区)
      let 已拆分 = 0
      let 新表 = 上下文.工作表
      for (let 行 = 起点.行; 行 <= 终点.行; 行 += 1) {
        const 原值 = 读取单元格(上下文.工作表, 生成地址(行, 起点.列)).原始值
        if (原值.length === 0) {
          continue
        }
        const 候选分隔 = 分隔符.length > 0 ? 分隔符 : (原值.includes(',') ? ',' : ' ')
        const 分段 = 原值.split(候选分隔)
        if (分段.length <= 1) {
          continue
        }
        const 可写列数 = Math.max(0, 上下文.工作表.列数 - 起点.列)
        分段.slice(0, 可写列数).forEach((段, 偏移) => {
          const 目标地址 = 生成地址(行, 起点.列 + 偏移)
          新表 = 写入单元格(新表, 目标地址, 段)
        })
        已拆分 += 1
      }
      if (已拆分 === 0) {
        上下文.notify('所选区域内没有可拆分的数据')
        return
      }
      上下文.更新工作表(新表)
      上下文.notify(`已按${分隔符.length > 0 ? '指定分隔符' : '逗号或空格'}拆分 ${已拆分} 行数据`)
    },
  },
  {
    id: 'symbol.insert',
    label: '插入符号',
    run: (上下文) => {
      if (上下文.选择符号) 上下文.选择符号()
      else 上下文.notify('当前界面无法打开符号选择')
    },
  },
  指引命令('insert.pivot', '数据透视表', '数据透视表需要高级聚合功能，将在后续版本提供'),
  指引命令('insert.chart', '图表', '图表需要基于数据绘制图形，将在后续版本提供'),
  {
    id: 'insert.picture',
    label: '图片',
    run: (上下文) => {
      if (上下文.选择图片) 上下文.选择图片()
      else 上下文.notify('当前界面无法选择图片文件')
    },
  },
  {
    id: 'formula.logical', label: '逻辑函数',
    run: (上下文) => 上下文.开始编辑公式?.('=IF('),
  },
  {
    id: 'formula.lookup', label: '查找与引用',
    run: (上下文) => 上下文.开始编辑公式?.('=XLOOKUP('),
  },
  {
    id: 'formula.financial', label: '财务函数',
    run: (上下文) => 上下文.开始编辑公式?.('=PMT('),
  },
  {
    id: 'data.validation', label: '数据验证',
    run: (上下文) => 上下文.编辑数据验证?.(),
  },
  {
    id: 'data.filter', label: '筛选',
    run: (上下文) => {
      if (上下文.切换筛选) 上下文.切换筛选()
      else 上下文.notify('当前界面无法设置筛选')
    },
  },
  {
    id: 'review.comment', label: '批注',
    run: (上下文) => {
      if (上下文.编辑批注) 上下文.编辑批注()
      else 上下文.notify('当前界面无法编辑批注')
    },
  },
  {
    id: 'review.protect', label: '保护工作表',
    run: (上下文) => 上下文.切换保护?.(),
  },
  {
    id: 'view.freeze', label: '冻结窗格',
    run: (上下文) => {
      if (上下文.切换冻结) 上下文.切换冻结()
      else 上下文.notify('当前界面无法设置冻结窗格')
    },
  },
  {
    id: 'view.split', label: '拆分',
    run: (上下文) => {
      if (上下文.切换拆分) 上下文.切换拆分()
      else 上下文.notify('当前界面无法拆分窗格')
    },
  },
  {
    id: 'view.normal', label: '普通视图',
    run: (上下文) => 上下文.切换视图?.('普通'),
  },
  {
    id: 'view.pageLayout', label: '页面布局视图',
    run: (上下文) => 上下文.切换视图?.('页面布局'),
  },
  {
    id: 'spell.check', label: '拼写检查',
    run: (上下文) => 上下文.检查拼写?.(),
  },
  {
    id: 'layout.margin',
    label: '页边距',
    run: (上下文, 参数) => {
      if (参数 !== '常规' && 参数 !== '窄' && 参数 !== '适中' && 参数 !== '宽') {
        上下文.notify('请选择有效的页边距方案')
        return
      }
      上下文.更新工作表(设置页面设置(上下文.工作表, { 页边距: 参数 }))
      上下文.notify(`已设置页边距：${参数}`)
    },
  },
  {
    id: 'layout.orientation',
    label: '纸张方向',
    run: (上下文, 参数) => {
      if (参数 !== '纵向' && 参数 !== '横向') {
        上下文.notify('请选择有效的纸张方向')
        return
      }
      上下文.更新工作表(设置页面设置(上下文.工作表, { 方向: 参数 }))
      上下文.notify(`已设置纸张方向：${参数}`)
    },
  },
  {
    id: 'layout.paperSize',
    label: '纸张大小',
    run: (上下文, 参数) => {
      if (参数 !== '跟随打印机' && 参数 !== 'A4' && 参数 !== 'A5' && 参数 !== 'B5' && 参数 !== 'Letter') {
        上下文.notify('请选择有效的纸张大小')
        return
      }
      上下文.更新工作表(设置页面设置(上下文.工作表, { 纸张大小: 参数 }))
      上下文.notify(`已设置纸张大小：${参数}`)
    },
  },
]

export const 表格命令表: Record<string, 表格命令> = 命令列表.reduce<Record<string, 表格命令>>(
  (累计, 命令) => {
    累计[命令.id] = 命令
    return 累计
  },
  {}
)

/** 尚未实现的表格命令，按钮仍会渲染并给出中文提示 */
export const 表格未实现清单: Array<[string, string]> = []

表格未实现清单.forEach(([id, label]) => {
  表格命令表[id] = 未实现表格命令(id, label)
})

export const 表格命令标识列表: string[] = Object.keys(表格命令表)

export function 查找表格命令(id: string): 表格命令 | undefined {
  return 表格命令表[id]
}
