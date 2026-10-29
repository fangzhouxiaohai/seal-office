// 表格导入：把主进程 xlsx 读取产出的 HTML 表格标记解析为工作表模型。
// 缺少 <table> 标记时返回 null；合法空工作表仍可打开。
import { 创建工作表, 读取单元格, 重算工作表, 默认页面设置, 添加图片, type CellFormat, type Sheet, type SheetCell, type SheetImage, type 页面设置, type 单元格数据验证 } from './model'
import { 展开区域, 生成地址, 解析地址 } from './address'
import { 压缩列宽 } from './columnLayout'

export interface Xlsx工作表元数据 {
  日期系统1904?: boolean
  公式兼容模式?: 'Excel' | 'WPS'
  单元格格式?: Record<string, CellFormat>
  单元格富文本?: Record<string, NonNullable<SheetCell['富文本']>>
  单元格验证?: Record<string, 单元格数据验证>
  超链接?: Record<string, string>
  公式来源?: Record<string, NonNullable<SheetCell['公式来源']>>
  合并区域?: string[]
  列宽?: Record<number, number>
  行高?: Record<number, number>
  列布局?: Sheet['列布局']
  默认列宽?: number
  默认行高?: number
  视图?: Sheet['视图']
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
    ...Object.keys(元数据?.超链接 ?? {}),
    ...Object.values(元数据?.公式来源 ?? {}).flatMap(source => {
      const addresses=source.数组范围?.split(':') ?? [],points=addresses.map(解析地址)
      if (!points.length || points.length>2 || points.some(point=>!point)) return []
      const first=points[0]!,last=points[1]??first
      // A tiny file may describe an enormous future/cached array. Keep its
      // source metadata, but never allocate a grid from an unbounded ref.
      return first.行<=last.行 && first.列<=last.列 && Math.max(last.行+1,10)*Math.max(last.列+1,6)<=100000 ? addresses : []
    }),
    ...(元数据?.合并区域 ?? []).flatMap((区域) => 区域.split(':')),
  ].map(解析地址).filter((位置): 位置 is { 行: number; 列: number } => 位置 !== null)
  const 元数据最大行 = Math.max(-1, ...元数据地址.map((位置) => 位置.行), ...Object.keys(元数据?.行高 ?? {}).map(Number))
  // 整列宽度是布局默认值，不代表最后一列存在数据；真实内容和合并仍决定边界。
  const 元数据最大列 = Math.max(-1, ...元数据地址.map((位置) => 位置.列), 元数据?.筛选?.列 ?? -1)
  const 图片最大行 = Math.max(-1, ...(元数据?.图片 ?? []).map((图片) => 图片.行))
  const 图片最大列 = Math.max(-1, ...(元数据?.图片 ?? []).map((图片) => 图片.列))
  // 在数据区外留出编辑余量，工作表尺寸必须覆盖全部已导入数据与布局。
  const 行数 = Math.max(行值列表.length + 5, 元数据最大行 + 1, 图片最大行 + 1, 10)
  const 列数 = Math.max(最大列数 + 3, 元数据最大列 + 1, 图片最大列 + 1, 6)
  const 工作表: Sheet = { ...创建工作表(名称, 行数, 列数), 页面设置: { ...默认页面设置, ...页面 } }
  if (元数据?.列布局) 工作表.列布局 = 元数据.列布局.map(项 => ({ ...项, ...(项.格式 ? { 格式: { ...项.格式 } } : {}) }))
  else if (元数据?.列宽 && Object.keys(元数据.列宽).length) 工作表.列布局 = 压缩列宽(元数据.列宽)
  if (元数据?.视图) 工作表.视图 = { ...元数据.视图 }
  if (Number.isFinite(元数据?.默认列宽) && 元数据!.默认列宽! > 0) {
    工作表.默认列宽 = 元数据!.默认列宽
    工作表.列宽.fill(元数据!.默认列宽!)
  }
  if (Number.isFinite(元数据?.默认行高) && 元数据!.默认行高! > 0) {
    工作表.默认行高 = 元数据!.默认行高
    工作表.行高.fill(元数据!.默认行高!)
  }
  for (const 布局 of 工作表.列布局 ?? []) {
    if (Number.isFinite(布局.宽度) && 布局.宽度! > 0) {
      for (let 列 = Math.max(0, 布局.起列); 列 <= Math.min(列数 - 1, 布局.止列); 列++) 工作表.列宽[列] = 布局.宽度!
    }
  }
  if (元数据?.日期系统1904 === true) 工作表.日期系统1904 = true
  if (元数据?.公式兼容模式) 工作表.公式兼容模式 = 元数据.公式兼容模式
  const CSV标记 = 表格.getAttribute('data-seal-csv')
  if (CSV标记) {
    const 来源 = JSON.parse(decodeURIComponent(CSV标记)) as Sheet['CSV来源']
    if (!来源 || !Array.isArray(来源.行字段数) || 来源.行字段数.length !== 行值列表.length ||
      !来源.行字段数.every((数, 行) => 数 === 行值列表[行].length) ||
      !['\r\n', '\r', '\n'].includes(来源.换行) || typeof 来源.BOM !== 'boolean' || typeof 来源.末尾换行 !== 'boolean' || (来源.分隔符 !== undefined && 来源.分隔符 !== '\t') ||
      (来源.编码 !== undefined && !['utf8', 'utf16le', 'utf16be', 'gb18030'].includes(来源.编码))) {
      throw new Error('CSV 数据边界无效，文件未打开')
    }
    工作表.CSV来源 = 来源
  }
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
  Object.entries(元数据?.单元格富文本 ?? {}).forEach(([地址, 富文本]) => {
    const 单元 = 工作表.单元格[地址]
    if (!单元 || !Array.isArray(富文本) || 富文本.some(段 => typeof 段?.文本 !== 'string') || 富文本.map(段 => 段.文本).join('') !== 单元.原始值) return
    工作表.单元格[地址] = { ...单元, 富文本, 值类型: '文本' }
  })
  Object.entries(元数据?.单元格验证 ?? {}).forEach(([地址, 规则]) => {
    const 位置 = 解析地址(地址)
    if (!位置 || 位置.行 >= 行数 || 位置.列 >= 列数) return
    工作表.单元格[地址] = { ...读取单元格(工作表, 地址), 数据验证: 规则 }
  })
  Object.entries(元数据?.超链接 ?? {}).forEach(([地址, 超链接]) => {
    const 位置 = 解析地址(地址)
    if (!位置 || 位置.行 >= 行数 || 位置.列 >= 列数 || typeof 超链接 !== 'string') return
    工作表.单元格[地址] = { ...读取单元格(工作表, 地址), 超链接 }
  })
  Object.entries(元数据?.公式来源 ?? {}).forEach(([地址, 来源]) => {
    const 单元 = 工作表.单元格[地址]
    if (!单元 || !来源 || typeof 来源.原始值 !== 'string' || 来源.原始值 !== 单元.原始值) return
    工作表.单元格[地址] = { ...单元, 公式来源: 来源 }
  })
  Object.entries(元数据?.公式来源 ?? {}).forEach(([anchor, source]) => {
    if (!source.动态数组 || !source.数组范围) return
    const endpoints = source.数组范围.split(':').map(解析地址)
    if (endpoints.some(point => !point) || endpoints.length > 2) return
    const first = endpoints[0]!, last = endpoints[1] ?? first
    if ((Math.abs(last.行 - first.行) + 1) * (Math.abs(last.列 - first.列) + 1) > 100000 || 生成地址(first.行, first.列) !== anchor) return
    for (const point of 展开区域(source.数组范围.includes(':') ? source.数组范围 : `${anchor}:${anchor}`)) {
      const address = 生成地址(point.行, point.列), cell = 工作表.单元格[address]
      if (address !== anchor && cell && !cell.原始值.startsWith('=')) {
        const cached = source.数组缓存?.[address]
        工作表.单元格[address] = { ...cell, 溢出锚点: anchor, ...(typeof cached === 'boolean' ? { 布尔结果: cached } : cached && typeof cached === 'object' ? { 计算值: cached.error, 计算错误: true } : {}) }
      }
    }
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
