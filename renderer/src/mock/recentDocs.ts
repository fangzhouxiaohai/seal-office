// 文档数据层：类型定义、静态示例数据与筛选排序纯函数。
// 本轮不接入真实文件系统，示例数据仅用于界面演示，不代表任何真实用户文件。

export type DocType = 'word' | 'table' | 'ppt' | 'pdf'

export type SortKey = 'time' | 'name' | 'size'

export interface DocItem {
  id: string
  name: string
  type: DocType
  /** 文件字节数 */
  size: number
  /** 修改时间，格式 YYYY-MM-DD HH:mm */
  updatedAt: string
  starred: boolean
  shared: boolean
  /** 真实文件路径：来自最近文档持久化记录时可据此打开本地文件 */
  路径?: string
}

/** 导航筛选键，与 routes.tsx 中的导航项 key 对应 */
export type NavKey = 'home' | 'recent' | 'star' | 'shared'

export const RECENT_DOCS: DocItem[] = [
  { id: 'd01', name: '2026 年第三季度经营分析报告.docx', type: 'word', size: 2438144, updatedAt: '2026-09-22 18:30', starred: true, shared: true },
  { id: 'd02', name: '部门预算执行明细表.xlsx', type: 'table', size: 856064, updatedAt: '2026-09-22 15:12', starred: true, shared: false },
  { id: 'd03', name: '产品发布方案汇报.pptx', type: 'ppt', size: 15728640, updatedAt: '2026-09-22 11:05', starred: false, shared: true },
  { id: 'd04', name: '员工入职流程说明.pdf', type: 'pdf', size: 1048576, updatedAt: '2026-09-21 17:40', starred: false, shared: true },
  { id: 'd05', name: '项目验收交付清单.docx', type: 'word', size: 327680, updatedAt: '2026-09-21 09:26', starred: false, shared: false },
  { id: 'd06', name: '客户回访记录汇总表.xlsx', type: 'table', size: 512000, updatedAt: '2026-09-20 16:55', starred: true, shared: true },
  { id: 'd07', name: '年度述职报告演示.pptx', type: 'ppt', size: 8388608, updatedAt: '2026-09-20 10:18', starred: false, shared: false },
  { id: 'd08', name: '制度汇编修订稿.docx', type: 'word', size: 1572864, updatedAt: '2026-09-19 14:02', starred: false, shared: true },
  { id: 'd09', name: '供应商报价对比表.xlsx', type: 'table', size: 409600, updatedAt: '2026-09-18 11:47', starred: true, shared: false },
  { id: 'd10', name: '安全生产培训材料.pdf', type: 'pdf', size: 5242880, updatedAt: '2026-09-17 09:30', starred: false, shared: false },
  { id: 'd11', name: '市场推广执行计划.pptx', type: 'ppt', size: 6291456, updatedAt: '2026-09-15 15:20', starred: false, shared: true },
  { id: 'd12', name: '会议纪要模板.docx', type: 'word', size: 71680, updatedAt: '2026-09-12 08:45', starred: true, shared: false },
]

/**
 * 按导航项筛选文档；未知筛选键返回全部文档，避免界面因未知状态出现空白。
 */
export function filterDocs(docs: DocItem[], navKey: string): DocItem[] {
  switch (navKey) {
    case 'star':
      return docs.filter((文档) => 文档.starred)
    case 'shared':
      return docs.filter((文档) => 文档.shared)
    case 'home':
    case 'recent':
    default:
      return [...docs]
  }
}

/**
 * 按指定维度排序；返回新数组，不修改入参。
 */
export function sortDocs(docs: DocItem[], key: SortKey): DocItem[] {
  const 结果 = [...docs]
  switch (key) {
    case 'name':
      结果.sort((甲, 乙) => 甲.name.localeCompare(乙.name, 'zh-Hans-CN'))
      break
    case 'size':
      结果.sort((甲, 乙) => 乙.size - 甲.size)
      break
    case 'time':
    default:
      结果.sort((甲, 乙) => 乙.updatedAt.localeCompare(甲.updatedAt))
      break
  }
  return 结果
}

/**
 * 将字节数格式化为中文可读大小。
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * 将修改时间格式化为中文相对时间。
 * 传入 now 便于测试获得确定性结果。
 * 未来时间与超过三天的历史时间一律输出具体日期，避免以「今天」掩盖真实时间。
 */
export function formatTime(value: string, now: Date = new Date()): string {
  const 目标 = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(目标.getTime())) {
    return value
  }

  const 当天零点 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const 目标零点 = new Date(目标.getFullYear(), 目标.getMonth(), 目标.getDate())
  const 相差天数 = Math.round((当天零点.getTime() - 目标零点.getTime()) / 86400000)
  const 时分 = `${String(目标.getHours()).padStart(2, '0')}:${String(目标.getMinutes()).padStart(2, '0')}`

  if (相差天数 === 0) {
    return `今天 ${时分}`
  }
  if (相差天数 === 1) {
    return `昨天 ${时分}`
  }
  if (相差天数 >= 2 && 相差天数 <= 3) {
    return `${相差天数} 天前`
  }
  return `${目标.getFullYear()}-${String(目标.getMonth() + 1).padStart(2, '0')}-${String(目标.getDate()).padStart(2, '0')}`
}
