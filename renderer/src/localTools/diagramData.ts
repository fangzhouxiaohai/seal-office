export const 图形形状 = ['矩形', '圆角矩形', '椭圆', '菱形'] as const
export interface 图节点 { id: string; 文本: string; x: number; y: number; 形状?: typeof 图形形状[number]; 填充?: string; 线条?: string; 文字颜色?: string; 备注?: string }
export interface 图连线 { id: string; 起点: string; 终点: string; 标签?: string; 颜色?: string }
export interface 图数据 { 节点: 图节点[]; 连线: 图连线[] }
export type 图类型 = '脑图' | '流程图'
export const 节点宽 = 180, 节点高 = 72, 画布上限 = 30000
export const 图形配色 = [{ 名称: '海蓝', 填充: '#EAF2FF', 线条: '#2B6CF6', 文字颜色: '#173B78' }, { 名称: '青绿', 填充: '#E4F6EE', 线条: '#26865C', 文字颜色: '#174A35' }, { 名称: '暖橙', 填充: '#FFF1DF', 线条: '#BB7227', 文字颜色: '#6B3B11' }, { 名称: '紫色', 填充: '#F3EBFF', 线条: '#8553B5', 文字颜色: '#4D276F' }]

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
    if (!项 || typeof 项.id !== 'string' || !项.id || 项.id.length > 200 || typeof 项.文本 !== 'string' || !项.文本.trim() || 项.文本.length > 200 || !Number.isFinite(项.x) || !Number.isFinite(项.y) || 项.x < 0 || 项.y < 0 || 项.x > 画布上限 || 项.y > 画布上限) throw new Error('图形节点内容或位置无效')
    if (项.形状 !== undefined && !图形形状.includes(项.形状) || 项.备注 !== undefined && (typeof 项.备注 !== 'string' || 项.备注.length > 2000)) throw new Error('节点形状或备注无效')
    for (const key of ['填充', '线条', '文字颜色'] as const) if (项[key] !== undefined && (typeof 项[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(项[key]!))) throw new Error('节点配色无效')
    return { id: 项.id, 文本: 项.文本, x: 项.x, y: 项.y, ...(项.形状 !== undefined ? { 形状: 项.形状 } : {}), ...(项.备注 !== undefined ? { 备注: 项.备注 } : {}), ...Object.fromEntries(['填充', '线条', '文字颜色'].filter(key => (项 as any)[key] !== undefined).map(key => [key, (项 as any)[key]])) }
  })
  const 标识 = new Set(节点.map((项) => 项.id))
  if (标识.size !== 节点.length) throw new Error('图形节点标识重复')
  const 连线: 图连线[] = 图.连线.map((项) => {
    if (!项 || typeof 项.id !== 'string' || !项.id || typeof 项.起点 !== 'string' || typeof 项.终点 !== 'string' || 项.起点 === 项.终点 || !标识.has(项.起点) || !标识.has(项.终点)) throw new Error('图形连线无效')
    if (项.标签 !== undefined && (typeof 项.标签 !== 'string' || 项.标签.length > 200) || 项.颜色 !== undefined && !/^#[0-9a-f]{6}$/i.test(项.颜色)) throw new Error('连线标签或颜色无效')
    return { id: 项.id, 起点: 项.起点, 终点: 项.终点, ...(项.标签 !== undefined ? { 标签: 项.标签 } : {}), ...(项.颜色 !== undefined ? { 颜色: 项.颜色 } : {}) }
  })
  if (new Set(连线.map((项) => 项.id)).size !== 连线.length) throw new Error('图形连线标识重复')
  return { 节点, 连线 }
}

/** Only our explicit editable metadata is imported from SVG. Arbitrary SVG
 * drawing/script markup is never inserted into the application DOM. */
export function 解析图文件(原文: string): 图数据 {
  if (!原文.trimStart().startsWith('<')) { let value: any; try { value = JSON.parse(原文) } catch { return 解析图数据(原文) }; return 解析图数据(value?.format === 'seal-diagram' && value.schema === 1 && ['脑图', '流程图'].includes(value.type) ? JSON.stringify(value.graph) : 原文) }
  if (/<!DOCTYPE|<!ENTITY|<(?:[\w.-]+:)?(?:script|foreignObject)\b/i.test(原文)) throw new Error('SVG包含不允许的活动内容')
  const doc = new DOMParser().parseFromString(原文, 'image/svg+xml'), metadata = doc.querySelector('metadata#seal-diagram-data')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg' || !metadata) throw new Error('SVG不含海豹办公可编辑图形数据，请导入原始JSON')
  let record: unknown; try { record = JSON.parse(metadata.textContent ?? '') } catch { throw new Error('SVG中的可编辑图形数据无效') }
  return 解析图数据(JSON.stringify((record as { 图?: unknown } | null)?.图))
}

function 转义Xml(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function 图形边界(图: 图数据) { return { 左: Math.min(0, ...图.节点.map(n => n.x)), 上: Math.min(0, ...图.节点.map(n => n.y)), 右: Math.max(960, ...图.节点.map(n => n.x + 节点宽 + 40)), 下: Math.max(540, ...图.节点.map(n => n.y + 节点高 + 40)) } }
export function 图连线端点(起: 图节点, 终: 图节点) {
  const dx = 终.x - 起.x, dy = 终.y - 起.y, 横向 = Math.abs(dx) >= Math.abs(dy)
  return { 起: { x: 起.x + (横向 ? dx >= 0 ? 节点宽 : 0 : 节点宽 / 2), y: 起.y + (横向 ? 节点高 / 2 : dy >= 0 ? 节点高 : 0) }, 终: { x: 终.x + (横向 ? dx >= 0 ? 0 : 节点宽 : 节点宽 / 2), y: 终.y + (横向 ? 节点高 / 2 : dy >= 0 ? 0 : 节点高) }, 起边: 横向 ? dx >= 0 ? '右' : '左' : dy >= 0 ? '下' : '上', 终边: 横向 ? dx >= 0 ? '左' : '右' : dy >= 0 ? '上' : '下' } as const
}
/** A deterministic spanning forest is used for trees; cross/cycle edges stay
 * intact. Flow layout uses breadth levels and starts disconnected/cyclic roots
 * explicitly, so malformed graph topology cannot hang layout. */
export function 自动布局(图: 图数据, 类型: 图类型): 图数据 {
  const valid = 解析图数据(JSON.stringify(图)), children = new Map(valid.节点.map(n => [n.id, [] as string[]])), incoming = new Set(valid.连线.map(e => e.终点))
  for (const edge of valid.连线) children.get(edge.起点)!.push(edge.终点)
  const visited = new Set<string>(), levels = new Map<string, number>(), tree = new Map<string, string[]>(), roots: string[] = []
  for (const candidate of [...valid.节点.filter(n => !incoming.has(n.id)), ...valid.节点]) {
    if (visited.has(candidate.id)) continue
    roots.push(candidate.id); visited.add(candidate.id); levels.set(candidate.id, 0)
    const queue = [candidate.id]
    for (let i = 0; i < queue.length; i++) { const id = queue[i], next: string[] = []; for (const child of children.get(id)!) if (!visited.has(child)) { visited.add(child); levels.set(child, levels.get(id)! + 1); next.push(child); queue.push(child) } tree.set(id, next) }
  }
  const positions = new Map<string, { x: number; y: number }>(); let row = 80
  if (类型 === '脑图') {
    const place = (id: string): number => { const next = tree.get(id)!; const y = next.length ? next.map(place).reduce((a, b) => a + b, 0) / next.length : (row += 104) - 104; positions.set(id, { x: 80 + levels.get(id)! * 280, y }); return y }
    roots.forEach(place)
  } else {
    const used = new Map<number, number>(); for (const node of valid.节点) { const level = levels.get(node.id)!, index = used.get(level) ?? 0; positions.set(node.id, { x: 80 + level * 280, y: 80 + index * 104 }); used.set(level, index + 1) }
  }
  return { ...valid, 节点: valid.节点.map(n => ({ ...n, ...positions.get(n.id)! })) }
}

export function 图节点Svg(节点: 图节点): string {
  const { x, y } = 节点, attrs = `fill="${节点.填充 ?? '#FFFFFF'}" stroke="${节点.线条 ?? '#2B6CF6'}" stroke-width="2"`
  const shape = 节点.形状 === '菱形' ? `<polygon points="${x + 90},${y} ${x + 180},${y + 36} ${x + 90},${y + 72} ${x},${y + 36}" ${attrs}/>` : 节点.形状 === '椭圆' ? `<ellipse cx="${x + 90}" cy="${y + 36}" rx="90" ry="36" ${attrs}/>` : `<rect x="${x}" y="${y}" width="180" height="72" rx="${节点.形状 === '矩形' ? 0 : 8}" ${attrs}/>`
  const chars = Array.from(节点.文本), lines = Array.from({ length: Math.min(3, Math.ceil(chars.length / 13)) }, (_, i) => chars.slice(i * 13, (i + 1) * 13).join('') + (i === 2 && chars.length > 39 ? '…' : ''))
  return `<g data-node-id="${转义Xml(节点.id)}"><title>${转义Xml(节点.文本)}</title>${节点.备注 ? `<desc>${转义Xml(节点.备注)}</desc>` : ''}${shape}<text x="${x + 90}" y="${y + 40 - (lines.length - 1) * 9}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${节点.文字颜色 ?? '#1A1D24'}">${lines.map((line, i) => `<tspan x="${x + 90}" dy="${i ? 18 : 0}">${转义Xml(line)}</tspan>`).join('')}</text></g>`
}

export function 生成图形文件(图: 图数据, 类型: 图类型): string {
  const 有效 = 解析图数据(JSON.stringify(图))
  const { 右: 宽, 下: 高 } = 图形边界(有效)
  const 节点映射 = new Map(有效.节点.map((项) => [项.id, 项]))
  const 连线 = 有效.连线.map((项) => {
    const 起点 = 节点映射.get(项.起点)!
    const 终点 = 节点映射.get(项.终点)!
    const p = 图连线端点(起点, 终点), x = (p.起.x + p.终.x) / 2, y = (p.起.y + p.终.y) / 2
    return `<line x1="${p.起.x}" y1="${p.起.y}" x2="${p.终.x}" y2="${p.终.y}" stroke="${项.颜色 ?? '#5c6472'}" stroke-width="2" ${类型 === '流程图' ? 'marker-end="url(#arrow)"' : ''}/>${项.标签 ? `<text x="${x}" y="${y - 5}" text-anchor="middle" font-size="13" fill="${项.颜色 ?? '#5c6472'}" stroke="#fff" stroke-width="4" paint-order="stroke">${转义Xml(项.标签)}</text>` : ''}`
  }).join('')
  const 节点 = 有效.节点.map(图节点Svg).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${宽}" height="${高}" viewBox="0 0 ${宽} ${高}"><metadata id="seal-diagram-data">${转义Xml(JSON.stringify({ 类型, 图: 有效 }))}</metadata><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0 L8 3 L0 6" fill="none" stroke="#5c6472" stroke-width="1.5"/></marker></defs><rect width="100%" height="100%" fill="#ffffff"/>${连线}${节点}</svg>`
}
