import { 生成地址, 解析地址 } from './address'
import { 默认列宽, 默认行高, 默认页面设置, type Sheet } from './model'
import { 转义Csv字段 } from './sheetExport'
import { 导出为Xlsx } from './sheetExport'

export function 单表数据输出(路径: string, 工作簿: Sheet[]) {
  const 格式 = 路径.match(/\.(dbf|prn|dif|slk)$/i)?.[1]?.toUpperCase()
  if (!格式) return null
  if (工作簿.length !== 1) throw new Error(`${格式} 只能保存一张数据表，请另存为 XLSX 以保留全部工作表`)
  const 损失 = 表格文本输出('data.csv', 工作簿)!.损失
  if (格式 === 'DBF') 损失.push('字段名与字段长度将按 dBASE 规则转换，请保存后核对')
  const 副本 = 工作簿.map(表 => ({ ...表, 单元格: Object.fromEntries(Object.entries(表.单元格).map(([地址, 格]) =>
    [地址, { ...格, 原始值: 格.值类型 === '文本' ? 格.原始值 : 格.显示值 }])) }))
  return { 格式, 损失, 模型: 导出为Xlsx(副本) ?? { 工作表: [{ 名称: 工作簿[0].name, 数据: [] }] } }
}

/** 手动保存与退出保存共用文本格式转换；JSON 保留完整的旧版工作簿模型。 */
export function 表格文本输出(路径: string, 工作簿: Sheet[]): { 内容: string; 损失: string[]; 编码?: import('../ipc/bridge').文本编码 } | null {
  if (/\.json$/i.test(路径)) return { 内容: JSON.stringify(工作簿), 损失: [] }
  if (!/\.(csv|tsv)$/i.test(路径)) return null
  const 格式名 = /\.tsv$/i.test(路径) ? 'TSV' : 'CSV'
  const 分隔符 = 格式名 === 'TSV' ? '\t' : ','
  if (工作簿.length !== 1) throw new Error(`${格式名} 只能保存一张工作表。请另存为 XLSX 以保留全部工作表，或单独导出当前表。`)
  const 表 = 工作簿[0]
  const 来源 = 表.CSV来源
  const 字段数 = [...(来源?.行字段数 ?? [])]
  const 损失 = new Set<string>()
  for (const [地址, 格] of Object.entries(表.单元格)) {
    if (格.原始值.startsWith('=') && 格.值类型 !== '文本') 损失.add('公式（仅保存计算结果）')
    if (Object.keys(格.格式).length) 损失.add('单元格样式')
    if (格.批注) 损失.add('批注')
    if (格.数据验证) 损失.add('数据验证')
    if (格.超链接) 损失.add('超链接目标')
    if (!格.原始值 && !格.显示值) continue
    const 位置 = 解析地址(地址)
    if (位置) 字段数[位置.行] = Math.max(字段数[位置.行] ?? 0, 位置.列 + 1)
  }
  if (表.合并区域.length) 损失.add('合并单元格')
  if (表.图片?.length) 损失.add('图片')
  if (表.冻结 || 表.筛选 || 表.保护) 损失.add('冻结、筛选或保护设置')
  if (表.列宽.some(宽 => 宽 !== 默认列宽) || 表.行高.some(高 => 高 !== 默认行高) ||
    Object.keys(默认页面设置).some(键 => 表.页面设置[键 as keyof typeof 默认页面设置] !== 默认页面设置[键 as keyof typeof 默认页面设置])) 损失.add('行列尺寸或页面设置')
  const 最大列 = 字段数.reduce((最大, 数) => Math.max(最大, 数 || 0), 1)
  const 行列表 = Array.from({ length: 字段数.length }, (_, 行) =>
    Array.from({ length: 字段数[行] ?? 最大列 }, (_, 列) => {
      const 格 = 表.单元格[生成地址(行, 列)]
      const 值 = 格?.值类型 === '文本' ? 格.原始值 : 格?.显示值 ?? ''
      return 分隔符 === ',' ? 转义Csv字段(值) : /[\t\r\n"]/.test(值) ? '"' + 值.replace(/"/g, '""') + '"' : 值
    }).join(分隔符))
  const 换行 = 来源?.换行 ?? '\r\n'
  return {
    内容: `${(来源?.BOM ?? true) ? '\uFEFF' : ''}${行列表.join(换行)}${来源?.末尾换行 && 行列表.length ? 换行 : ''}`,
    损失: [...损失], ...(来源?.编码 ? { 编码: 来源.编码 } : {}),
  }
}
