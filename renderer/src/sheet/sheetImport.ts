// 表格导入：把主进程 xlsx 读取产出的 HTML 表格标记解析为工作表模型。
// 缺少 <table> 标记时返回 null；合法空工作表仍可打开。
import { 创建工作表, 读取单元格, 重算工作表, 默认页面设置, 添加图片, type CellFormat, type Sheet, type SheetImage, type 页面设置, type 单元格数据验证 } from './model'
import { 生成地址, 解析地址 } from './address'

export interface Xlsx工作表元数据 {
  单元格格式?: Record<string, CellFormat>
  单元格验证?: Record<string, 单元格数据验证>
  合并区域?: string[]
  列宽?: Record<number, number>
  行高?: Record<number, number>
  冻结?: { 行: number; 列: number }
  筛选?: { 列: number; 值: string }
  保护?: '本机' | '外部'
  图片?: Array<Omit<SheetImage, 'id'> & { id?: string }>
}

/** 从 HTML 表格标记构建工作表；内容写入后统一重算公式 */
export function 从Html表格构建工作表(html: string, 名称 = 'Sheet1', 页面?: Partial<页面设置>, 元数据?: Xlsx工作表元数据): Sheet | null {
  const 解析器 = new DOMParser()
  const 文档 = 解析器.parseFromString(html, 'text/html')
  const 表格 = 文档.querySelector('table')
  if (表格 === null) {
    return null
  }
  const 行集合 = Array.from(表格.querySelectorAll('tr'))
  const 行值列表 = 行集合.map((行) => Array.from(行.querySelectorAll('th, td')).map((格) => {
    const 显示值 = 格.textContent ?? ''
    const 公式 = 格.getAttribute('data-formula')
    const 批注 = 格.getAttribute('data-comment')
    const 值类型 = 格.getAttribute('data-value-type') === 'text' ? '文本' as const : undefined
    return { 原始值: 公式 ? (公式.startsWith('=') ? 公式 : `=${公式}`) : 显示值, 显示值, 批注, 值类型 }
  }))
  const 最大列数 = 行值列表.reduce((最大, 行) => Math.max(最大, 行.length), 0)
  const 元数据地址 = [
    ...Object.keys(元数据?.单元格格式 ?? {}),
    ...Object.keys(元数据?.单元格验证 ?? {}),
    ...(元数据?.合并区域 ?? []).flatMap((区域) => 区域.split(':')),
  ].map(解析地址).filter((位置): 位置 is { 行: number; 列: number } => 位置 !== null)
  const 元数据最大行 = Math.max(-1, ...元数据地址.map((位置) => 位置.行), ...Object.keys(元数据?.行高 ?? {}).map(Number))
  const 元数据最大列 = Math.max(-1, ...元数据地址.map((位置) => 位置.列), ...Object.keys(元数据?.列宽 ?? {}).map(Number), 元数据?.筛选?.列 ?? -1)
  const 图片最大行 = Math.max(-1, ...(元数据?.图片 ?? []).map((图片) => 图片.行))
  const 图片最大列 = Math.max(-1, ...(元数据?.图片 ?? []).map((图片) => 图片.列))
  // 在数据区外留出编辑余量，工作表尺寸必须覆盖全部已导入数据与布局。
  const 行数 = Math.max(行值列表.length + 5, 元数据最大行 + 1, 图片最大行 + 1, 10)
  const 列数 = Math.max(最大列数 + 3, 元数据最大列 + 1, 图片最大列 + 1, 6)
  const 工作表: Sheet = { ...创建工作表(名称, 行数, 列数), 页面设置: { ...默认页面设置, ...页面 } }
  行值列表.forEach((行值, 行) => {
    行值.forEach((单元, 列) => {
      if (单元.原始值 !== '' || 单元.批注) {
        工作表.单元格[生成地址(行, 列)] = {
          原始值: 单元.原始值, 显示值: 单元.显示值, 格式: {},
          ...(单元.批注 ? { 批注: 单元.批注 } : {}),
          ...(单元.值类型 ? { 值类型: 单元.值类型 } : {}),
        }
      }
    })
  })
  Object.entries(元数据?.单元格格式 ?? {}).forEach(([地址, 格式]) => {
    const 位置 = 解析地址(地址)
    if (!位置 || 位置.行 >= 行数 || 位置.列 >= 列数) return
    工作表.单元格[地址] = { ...读取单元格(工作表, 地址), 格式 }
  })
  Object.entries(元数据?.单元格验证 ?? {}).forEach(([地址, 规则]) => {
    const 位置 = 解析地址(地址)
    if (!位置 || 位置.行 >= 行数 || 位置.列 >= 列数) return
    工作表.单元格[地址] = { ...读取单元格(工作表, 地址), 数据验证: 规则 }
  })
  Object.entries(元数据?.列宽 ?? {}).forEach(([列, 宽]) => {
    if (Number.isInteger(Number(列)) && Number(列) >= 0 && Number(列) < 列数 && Number.isFinite(宽)) 工作表.列宽[Number(列)] = 宽
  })
  Object.entries(元数据?.行高 ?? {}).forEach(([行, 高]) => {
    if (Number.isInteger(Number(行)) && Number(行) >= 0 && Number(行) < 行数 && Number.isFinite(高)) 工作表.行高[Number(行)] = 高
  })
  工作表.合并区域 = [...(元数据?.合并区域 ?? [])]
  if (元数据?.冻结) 工作表.冻结 = 元数据.冻结
  if (元数据?.筛选) 工作表.筛选 = 元数据.筛选
  if (元数据?.保护) 工作表.保护 = 元数据.保护
  let 含图片工作表 = 工作表
  ;(元数据?.图片 ?? []).forEach((图片, 索引) => {
    含图片工作表 = 添加图片(含图片工作表, {
      ...图片,
      id: 图片.id || `imported-image-${索引}-${图片.行}-${图片.列}`,
    })
  })
  return 重算工作表(含图片工作表)
}
