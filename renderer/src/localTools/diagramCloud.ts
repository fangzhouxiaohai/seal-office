import { cloudCall } from '../cloud/CloudProvider'
import type { SharedFileBinding } from '../collaboration/fileAccess'
import type { ShareEntry, TeamEntry, TaggedNode } from '../collaboration/types'
import { readModel, Y } from '../collaboration/crdtModel'
import { 解析图数据, type 图数据, type 图类型 } from './diagramData'

export type DiagramRealtimeType = 'mindmap' | 'flowchart'
export interface DiagramCloudModel { schema: 1; type: 图类型; title: string; graph: 图数据 }
export interface DiagramCloudEntry { type: DiagramRealtimeType; title: string; name: string; binding: SharedFileBinding; teamName?: string }
export const diagramType = (type: 图类型): DiagramRealtimeType => type === '脑图' ? 'mindmap' : 'flowchart'
export const diagramExtension = (type: 图类型) => type === '脑图' ? 'sealmind' : 'sealflow'
export const diagramFileType = (name: string): 图类型 | null => /\.sealmind$/i.test(name) ? '脑图' : /\.sealflow$/i.test(name) ? '流程图' : null
export const diagramEntryKey = (entry: DiagramCloudEntry) => `${entry.binding.accountId}:${entry.binding.kind}:${entry.binding.id}:${entry.binding.nodeId || ''}`
export const diagramOpenEvent = 'seal-open-cloud-diagram'
let pending: { entry: DiagramCloudEntry; model?: DiagramCloudModel } | null = null
let pendingLocal: { type: 图类型; id: string } | null = null
export function requestLocalDiagramOpen(type: 图类型, id: string) { pendingLocal = { type, id }; window.dispatchEvent(new Event(diagramOpenEvent)) }
export function takeLocalDiagramOpen(type: 图类型) { if (pendingLocal?.type !== type) return null; const id = pendingLocal.id; pendingLocal = null; return id }
export function requestDiagramOpen(entry: DiagramCloudEntry, model?: DiagramCloudModel) { pending = { entry, model }; window.dispatchEvent(new Event(diagramOpenEvent)) }
export function takeDiagramOpen(type: 图类型, accountId: string) { if (!pending || pending.entry.type !== diagramType(type) || pending.entry.binding.accountId !== accountId) return null; const value = pending; pending = null; return value }

/** Dangling edges from a concurrent node deletion stay in CRDT history, but are
 * not rendered/exported. Undoing that deletion may legitimately reveal them. */
export function parseDiagramCloud(value: unknown, expected?: 图类型): DiagramCloudModel {
  const model = value as DiagramCloudModel
  if (!model || model.schema !== 1 || !['脑图', '流程图'].includes(model.type) || expected && model.type !== expected || typeof model.title !== 'string' || !model.title.trim() || model.title.length > 120 || /[\u0000-\u001f]/.test(model.title)) throw new Error('云端图形类型或名称无效')
  if (JSON.stringify(value).length > 2 * 1024 * 1024 || !Array.isArray(model.graph?.节点) || !Array.isArray(model.graph?.连线)) throw new Error('云端图形数据无效或超过2 MiB')
  const ids = new Set(model.graph.节点.map(node => node.id))
  // Validate edge payloads even when their endpoints were concurrently removed.
  for (const edge of model.graph.连线) if (!edge || typeof edge.id !== 'string' || !edge.id || edge.id.length > 200 || typeof edge.起点 !== 'string' || typeof edge.终点 !== 'string' || edge.起点 === edge.终点 || edge.标签 !== undefined && (typeof edge.标签 !== 'string' || edge.标签.length > 200) || edge.颜色 !== undefined && !/^#[0-9a-f]{6}$/i.test(edge.颜色)) throw new Error('云端图形连线无效')
  if (model.graph.连线.length > 300 || new Set(model.graph.连线.map(edge => edge.id)).size !== model.graph.连线.length) throw new Error('云端图形连线数量或标识无效')
  const graph = 解析图数据(JSON.stringify({ 节点: model.graph.节点, 连线: model.graph.连线.filter(edge => ids.has(edge.起点) && ids.has(edge.终点)) }))
  return { schema: 1, type: model.type, title: model.title.trim(), graph }
}
/** Preserve CRDT edges hidden by concurrent node removal during unrelated UI
 * edits. Only explicit deletion of a currently visible endpoint removes them. */
export function diagramCloudEdit(base: DiagramCloudModel, graph: 图数据): DiagramCloudModel {
  const visible = new Set(parseDiagramCloud(base).graph.连线.map(edge => edge.id)), nextEdges = new Set(graph.连线.map(edge => edge.id)), nextNodes = new Set(graph.节点.map(node => node.id))
  const removed = new Set(base.graph.节点.filter(node => !nextNodes.has(node.id)).map(node => node.id))
  const hidden = base.graph.连线.filter(edge => !visible.has(edge.id) && !nextEdges.has(edge.id) && !removed.has(edge.起点) && !removed.has(edge.终点))
  return { ...base, graph: { ...graph, 连线: [...graph.连线, ...hidden] } }
}
export const validateDiagramCloud = (value: unknown) => { try { parseDiagramCloud(value); return null } catch (error) { return error instanceof Error ? error.message : '图形结构无效' } }
const base64 = (bytes: Uint8Array) => { let value = ''; for (let offset = 0; offset < bytes.length; offset += 32768) value += String.fromCharCode(...bytes.subarray(offset, offset + 32768)); return btoa(value) }
const bytes = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0))
export const encodeDiagramFile = (model: DiagramCloudModel) => base64(new TextEncoder().encode(JSON.stringify({ format: 'seal-diagram', ...parseDiagramCloud(model) })))
export function decodeDiagramFile(data: string, expected?: 图类型) { const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(data))); if (value.format !== 'seal-diagram') throw new Error('不是海豹办公云图形文件'); return parseDiagramCloud(value, expected) }
const cachedModel = (state: string): DiagramCloudModel => { const doc = new Y.Doc(); try { Y.applyUpdate(doc, bytes(state)); return readModel<DiagramCloudModel>(doc) } finally { doc.destroy() } }

export async function loadDiagramCloudEntries(type: 图类型, accountId: string): Promise<{ items: DiagramCloudEntry[]; offline: boolean; warning?: string }> {
  const scope = diagramType(type)
  try {
    const caps = await cloudCall('realtimeCapabilities')
    if (caps.diagramRealtime !== 1) throw Object.assign(new Error('当前服务器尚未开通脑图和流程图实时协作，请升级服务'), { status: 501 })
    const [nodes, shares, teams] = await Promise.all([cloudCall<TaggedNode[]>('list'), cloudCall<{ items: ShareEntry[] }>('shareList'), cloudCall<{ items: TeamEntry[] }>('teamList')])
    const items: DiagramCloudEntry[] = nodes.filter(node => !node.deleted && node.kind === 'file' && node.version > 0 && diagramFileType(node.meta.filename || node.meta.name) === type).map(node => ({ type: scope, title: node.meta.name.replace(/\.(sealmind|sealflow)$/i, ''), name: node.meta.filename || node.meta.name, binding: { kind: 'node', id: node.id, name: node.meta.filename || node.meta.name, version: node.version, editable: true, accountId } }))
    for (const share of shares.items) if (share.direction === 'received' && share.accepted && !share.revoked && (!share.expiresAt || share.expiresAt > Date.now()) && diagramFileType(share.filename || share.name) === type) items.push({ type: scope, title: share.name.replace(/\.(sealmind|sealflow)$/i, ''), name: share.filename || share.name, binding: { kind: 'share', id: share.id, name: share.filename || share.name, version: share.version, editable: share.permission === 'edit', accountId } })
    const teamNodes = await Promise.all(teams.items.map(async team => ({ team, result: await cloudCall<{ items: TaggedNode[] }>('teamNodes', { id: team.id }) })))
    for (const { team, result } of teamNodes) for (const node of result.items) if (node.kind === 'file' && node.version > 0 && diagramFileType(node.meta.filename || node.meta.name) === type) items.push({ type: scope, title: node.meta.name.replace(/\.(sealmind|sealflow)$/i, ''), name: node.meta.filename || node.meta.name, teamName: team.name, binding: { kind: 'team', id: team.id, nodeId: node.id, name: node.meta.filename || node.meta.name, version: node.version, editable: team.role !== 'viewer', accountId } })
    await cloudCall('realtimeCatalog', { scope, items })
    return { items, offline: false }
  } catch (error) {
    const status = (error as any)?.status
    if (status && status < 500 || status === 501) throw error
    const cached = await cloudCall<{ items: DiagramCloudEntry[] }>('realtimeCatalog', { scope })
    return { items: cached.items.filter(item => item.binding.accountId === accountId), offline: true, warning: error instanceof Error ? error.message : '暂时无法连接云端' }
  }
}

export async function openDiagramCloud(entry: DiagramCloudEntry): Promise<DiagramCloudModel> {
  const expected: 图类型 = entry.type === 'mindmap' ? '脑图' : '流程图'
  const local = await cloudCall('realtimeRestore', { binding: entry.binding })
  if (local?.state) { const model = cachedModel(local.state); parseDiagramCloud(model, expected); return model }
  if (local?.draft?.next) { parseDiagramCloud(local.draft.next, expected); return local.draft.next }
  if (local?.sourceModel) { parseDiagramCloud(local.sourceModel, expected); return local.sourceModel }
  const binding = entry.binding
  const file = await cloudCall(binding.kind === 'node' ? 'rawDownload' : binding.kind === 'team' ? 'teamDownload' : 'shareDownload', binding.kind === 'node' ? { id: binding.id } : binding.kind === 'team' ? { id: binding.id, nodeId: binding.nodeId } : { id: binding.id })
  const model = decodeDiagramFile(file.data, expected)
  await cloudCall('realtimeSource', { binding, model })
  const snapshot = await cloudCall('realtimeSnapshot', { binding })
  if (!snapshot.initialized) return model
  const doc = new Y.Doc(); let result = snapshot, after = result.checkpoint ? result.checkpointSeq : 0
  try {
    if (result.seed) Y.applyUpdate(doc, bytes(result.seed))
    if (result.checkpoint) Y.applyUpdate(doc, bytes(result.checkpoint))
    do { for (const update of result.updates || []) { Y.applyUpdate(doc, bytes(update.update)); after = Math.max(after, update.seq) }; if (after >= result.head) break; result = await cloudCall('realtimePull', { binding, after }) } while (true)
    const current = readModel<DiagramCloudModel>(doc); parseDiagramCloud(current, expected)
    await cloudCall('realtimeState', { binding, state: base64(Y.encodeStateAsUpdate(doc)), after }); return current
  } finally { doc.destroy() }
}

export async function createCloudDiagram(model: DiagramCloudModel, accountId: string, teamId?: string): Promise<DiagramCloudEntry> {
  const valid = parseDiagramCloud(model), name = `${valid.title}.${diagramExtension(valid.type)}`, data = encodeDiagramFile(valid)
  const saved = await cloudCall(teamId ? 'teamSave' : 'save', teamId ? { id: teamId, name: valid.title, filename: name, data } : { linkId: crypto.randomUUID(), name: valid.title, filename: name, data })
  if (!teamId) { const nodes = await cloudCall<TaggedNode[]>('list'); if (!nodes.some(node => node.id === saved.id && node.version > 0)) throw new Error('图形已保留在本机加密待同步队列，尚未上传完成；联网后刷新云空间查看') }
  const entry: DiagramCloudEntry = { type: diagramType(valid.type), title: valid.title, name, binding: { kind: teamId ? 'team' : 'node', id: teamId || saved.id, ...(teamId ? { nodeId: saved.id } : {}), name, version: saved.version || 1, editable: true, accountId } }
  await cloudCall('realtimeSource', { binding: entry.binding, model: valid })
  const catalog = await cloudCall<{ items: DiagramCloudEntry[] }>('realtimeCatalog', { scope: entry.type })
  await cloudCall('realtimeCatalog', { scope: entry.type, items: [...catalog.items.filter(item => diagramEntryKey(item) !== diagramEntryKey(entry)), entry] })
  return entry
}
