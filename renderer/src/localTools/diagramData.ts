export interface 图节点 { id: string; 文本: string; x: number; y: number }
export interface 图连线 { id: string; 起点: string; 终点: string }
export interface 图数据 { 节点: 图节点[]; 连线: 图连线[] }
export type 图类型 = '脑图' | '流程图'

export function 新建图(类型: 图类型): 图数据 {
  return { 节点: [{ id: `node-${Date.now()}`, 文本: 类型 === '脑图' ? '中心主题' : '开始', x: 360, y: 180 }], 连线: [] }
}

export function 解析图数据(原文: string): 图数据 {
  let 数据: unknown
  try { 数据 = JSON.parse(原文) } catch { throw new Error('图形文件格式无效') }
  if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) throw new Error('图形数据格式无效')
  const 图 = 数据 as Partial<图数据>
  if (!Array.isArray(图.节点) || !Array.isArray(图.连线) || 图.节点.length > 100 || 图.连线.length > 300) throw new Error('图形节点或连线数量无效')
  const 节点: 图节点[] = 图.节点.map((项) => {
    if (!项 || typeof 项.id !== 'string' || !项.id || typeof 项.文本 !== 'string' || !项.文本.trim() || 项.文本.length > 200 || !Number.isFinite(项.x) || !Number.isFinite(项.y) || 项.x < 0 || 项.y < 0 || 项.x > 3000 || 项.y > 3000) throw new Error('图形节点内容或位置无效')
    return { id: 项.id, 文本: 项.文本, x: 项.x, y: 项.y }
  })
  const 标识 = new Set(节点.map((项) => 项.id))
  if (标识.size !== 节点.length) throw new Error('图形节点标识重复')
  const 连线: 图连线[] = 图.连线.map((项) => {
    if (!项 || typeof 项.id !== 'string' || !项.id || typeof 项.起点 !== 'string' || typeof 项.终点 !== 'string' || 项.起点 === 项.终点 || !标识.has(项.起点) || !标识.has(项.终点)) throw new Error('图形连线无效')
    return { id: 项.id, 起点: 项.起点, 终点: 项.终点 }
  })
  if (new Set(连线.map((项) => 项.id)).size !== 连线.length) throw new Error('图形连线标识重复')
  return { 节点, 连线 }
}

function 转义Xml(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function 生成图形文件(图: 图数据, 类型: 图类型): string {
  const 有效 = 解析图数据(JSON.stringify(图))
  const 宽 = Math.max(960, ...有效.节点.map((项) => 项.x + 220))
  const 高 = Math.max(540, ...有效.节点.map((项) => 项.y + 100))
  const 节点映射 = new Map(有效.节点.map((项) => [项.id, 项]))
  const 连线 = 有效.连线.map((项) => {
    const 起点 = 节点映射.get(项.起点)!
    const 终点 = 节点映射.get(项.终点)!
    return `<line x1="${起点.x + 90}" y1="${起点.y + 26}" x2="${终点.x + 90}" y2="${终点.y + 26}" stroke="#5c6472" stroke-width="2" ${类型 === '流程图' ? 'marker-end="url(#arrow)"' : ''}/>`
  }).join('')
  const 节点 = 有效.节点.map((项) => `<g><rect x="${项.x}" y="${项.y}" width="180" height="52" rx="6" fill="#ffffff" stroke="#2b6cf6" stroke-width="2"/><text x="${项.x + 90}" y="${项.y + 31}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#1a1d24">${转义Xml(项.文本)}</text></g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${宽}" height="${高}" viewBox="0 0 ${宽} ${高}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0 L8 3 L0 6" fill="none" stroke="#5c6472" stroke-width="1.5"/></marker></defs><rect width="100%" height="100%" fill="#ffffff"/>${连线}${节点}</svg>`
}
