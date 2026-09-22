// 数字格式化：按单元格格式把数值渲染为展示文本。

export type 数字格式 = '常规' | '数值' | '货币' | '百分比' | '千位分隔'

/** 为整数部分插入千位分隔符，保留符号与小数部分 */
function 加千位分隔(文本: string): string {
  const 负号 = 文本.startsWith('-') ? '-' : ''
  const 正数部分 = 负号.length > 0 ? 文本.slice(1) : 文本
  const 点位置 = 正数部分.indexOf('.')
  const 整数 = 点位置 >= 0 ? 正数部分.slice(0, 点位置) : 正数部分
  const 小数 = 点位置 >= 0 ? 正数部分.slice(点位置) : ''
  return `${负号}${整数.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${小数}`
}

/** 按格式渲染数值；非有限数值原样返回文本，避免掩盖异常 */
export function 格式化数字(值: number, 格式: 数字格式, 小数位 = 2): string {
  if (!Number.isFinite(值)) {
    return String(值)
  }
  switch (格式) {
    case '数值':
      return 值.toFixed(小数位)
    case '货币':
      return `¥${加千位分隔(值.toFixed(2))}`
    case '百分比':
      return `${(值 * 100).toFixed(2)}%`
    case '千位分隔':
      return 加千位分隔(String(Math.round(值)))
    case '常规':
    default:
      return String(值)
  }
}
