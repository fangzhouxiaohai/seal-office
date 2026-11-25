// 云文件信息（2.8.0）：文件大小、文件夹递归大小与按当前语言格式化。
// 文件大小优先取加密索引中的 meta.size，缺失时取服务端返回的当前版本存储字节数；文件夹为其下全部未删除文件之和。

export interface 信息节点 { id: string; parent: string | null; kind: string; deleted: number; bytes?: number | null; meta: { size?: unknown; [key: string]: unknown } }

const 是文件夹 = (节点: 信息节点) => 节点.kind === 'folder' || 节点.kind === 'library'

export function 文件字节(节点: 信息节点): number | null {
  if (typeof 节点.meta.size === 'number' && Number.isFinite(节点.meta.size) && 节点.meta.size >= 0) return 节点.meta.size
  return typeof 节点.bytes === 'number' ? 节点.bytes : null
}

/** 一次遍历计算全部节点大小：文件取自身，文件夹递归汇总（不含回收站项）；未知大小的文件按 0 计入并标记不完整。 */
export function 计算大小(节点表: 信息节点[]): Map<string, { 字节: number | null; 不完整: boolean }> {
  const 子项 = new Map<string | null, 信息节点[]>()
  for (const 节点 of 节点表) if (!节点.deleted) { const 列 = 子项.get(节点.parent) || []; 列.push(节点); 子项.set(节点.parent, 列) }
  const 结果 = new Map<string, { 字节: number | null; 不完整: boolean }>()
  const 访问中 = new Set<string>()
  const 求 = (节点: 信息节点): { 字节: number | null; 不完整: boolean } => {
    const 已有 = 结果.get(节点.id)
    if (已有) return 已有
    if (!是文件夹(节点)) { const 字节 = 文件字节(节点); const 值 = { 字节, 不完整: 字节 === null }; 结果.set(节点.id, 值); return 值 }
    if (访问中.has(节点.id)) return { 字节: 0, 不完整: true }
    访问中.add(节点.id)
    let 总 = 0, 不完整 = false
    for (const 子 of 子项.get(节点.id) || []) { const 值 = 求(子); 总 += 值.字节 ?? 0; 不完整 ||= 值.不完整 }
    访问中.delete(节点.id)
    const 值 = { 字节: 总, 不完整 }
    结果.set(节点.id, 值)
    return 值
  }
  for (const 节点 of 节点表) 求(节点)
  return 结果
}

/** 按当前语言格式化容量：B、KB、MB、GB 保留一位小数（1024 进位）。 */
export function 格式化大小(字节: number | null | undefined, 语言 = 'zh-CN'): string {
  if (字节 === null || 字节 === undefined || !Number.isFinite(字节)) return '—'
  const 单位 = ['B', 'KB', 'MB', 'GB', 'TB']
  let 值 = 字节, 序 = 0
  while (值 >= 1024 && 序 < 单位.length - 1) { 值 /= 1024; 序++ }
  const 数 = new Intl.NumberFormat(语言, { maximumFractionDigits: 序 === 0 ? 0 : 1, minimumFractionDigits: 序 === 0 ? 0 : 1 }).format(值)
  return `${数} ${单位[序]}`
}

export function 格式化时间(时间: number | null | undefined, 语言 = 'zh-CN'): string {
  if (!时间) return '—'
  return new Date(时间).toLocaleString(语言, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 悬停卡定位：优先放在锚点下方，越界时翻到上方，并始终夹在可视区域内。 */
export function 卡片位置(锚点: { left: number; top: number; bottom: number; width: number }, 卡片: { width: number; height: number }, 视口: { width: number; height: number }, 间距 = 8) {
  const 边距 = 8
  let top = 锚点.bottom + 间距
  if (top + 卡片.height > 视口.height - 边距) top = 锚点.top - 间距 - 卡片.height
  top = Math.max(边距, Math.min(top, 视口.height - 边距 - 卡片.height))
  let left = 锚点.left + 锚点.width / 2 - 卡片.width / 2
  left = Math.max(边距, Math.min(left, 视口.width - 边距 - 卡片.width))
  return { left: Math.round(left), top: Math.round(top) }
}
