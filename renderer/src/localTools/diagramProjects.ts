import { 新建图, 解析图数据, type 图数据, type 图类型 } from './diagramData'

export interface DiagramProject {
  schema: 2; id: string; type: 图类型; title: string; created: number; updated: number; revision: string
  resolvedDraftRevision?: string
  trashedAt?: number; graph: 图数据; history: { items: 图数据[]; index: number }
}
export interface DiagramProjectState {
  project: DiagramProject; baseRevision: string | null
  pending?: { error: string; durable: boolean }
}
export interface DiagramProjectIssue { key: string; message: string }
interface DraftRecord { schema: 1; project: DiagramProject; baseRevision: string | null; error: string }
const memoryDrafts = new Map<string, DraftRecord>()
// Storage access itself can throw in disabled/private/opaque browser contexts; defer it to guarded operations.
const browserStorage = (name: 'localStorage' | 'sessionStorage'): Storage => ({
  get length() { return globalThis[name].length }, key: index => globalThis[name].key(index), getItem: key => globalThis[name].getItem(key),
  setItem: (key, value) => globalThis[name].setItem(key, value), removeItem: key => globalThis[name].removeItem(key), clear: () => globalThis[name].clear()
})
const kind = (type: 图类型) => type === '脑图' ? 'mindmap' : 'flow'
export const legacyDiagramKey = (type: 图类型) => `seal-local-${kind(type)}-v1`
export const diagramProjectPrefix = (type: 图类型) => `seal-diagram-project-v2:${kind(type)}:`
const draftPrefix = (type: 图类型) => `seal-diagram-draft-v2:${kind(type)}:`
const newId = () => globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`
const reason = (error: unknown) => error instanceof Error ? error.message : '本机存储不可写'
const MAX_BYTES = 2 * 1024 * 1024
const validTitle = (title: string) => { if (typeof title !== 'string' || !title.trim() || title.trim().length > 120 || /[\u0000-\u001f]/.test(title)) throw Error('项目名称须为1至120个字符'); return title.trim() }
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function parseDiagramProject(raw: string, type: 图类型): DiagramProject {
  if (raw.length > MAX_BYTES) throw Error('项目数据超过2 MiB，请先导出原始备份')
  const value = JSON.parse(raw)
  if (!value || value.schema !== 2 || value.type !== type || typeof value.id !== 'string' || !/^[\w-]{1,160}$/.test(value.id) || typeof value.revision !== 'string' || !value.revision || value.revision.length > 200) throw Error('项目格式或类型无效')
  for (const time of [value.created, value.updated, ...(value.trashedAt === undefined ? [] : [value.trashedAt])]) if (!Number.isSafeInteger(time) || time < 0) throw Error('项目时间无效')
  const graph = 解析图数据(JSON.stringify(value.graph)), history = value.history
  if (!history || !Array.isArray(history.items) || history.items.length < 1 || history.items.length > 100 || !Number.isInteger(history.index) || history.index < 0 || history.index >= history.items.length) throw Error('项目撤销历史无效')
  const items = history.items.map((item: unknown) => 解析图数据(JSON.stringify(item)))
  if (!jsonEqual(graph, items[history.index])) throw Error('项目正文与撤销历史不一致')
  if (value.resolvedDraftRevision !== undefined && (typeof value.resolvedDraftRevision !== 'string' || value.resolvedDraftRevision.length > 200)) throw Error('项目草稿回执无效')
  return { schema: 2, id: value.id, type, title: validTitle(value.title), created: value.created, updated: value.updated, revision: value.revision, ...(value.resolvedDraftRevision === undefined ? {} : { resolvedDraftRevision: value.resolvedDraftRevision }), ...(value.trashedAt === undefined ? {} : { trashedAt: value.trashedAt }), graph, history: { items, index: history.index } }
}

export function createDiagramProject(type: 图类型, title: string, graph = 新建图(type)): DiagramProject {
  const valid = 解析图数据(JSON.stringify(graph)), now = Date.now()
  return { schema: 2, id: newId(), type, title: validTitle(title), created: now, updated: now, revision: newId(), graph: valid, history: { items: [valid], index: 0 } }
}
export function editDiagramProject(project: DiagramProject, next: 图数据): DiagramProject {
  const graph = 解析图数据(JSON.stringify(next)); if (jsonEqual(graph, project.graph)) return project
  const items = [...project.history.items.slice(0, project.history.index + 1), graph].slice(-100)
  // Keep the newest complete steps within one atomic storage record; never truncate the current graph.
  while (items.length > 1 && JSON.stringify({ ...project, graph, history: { items, index: items.length - 1 } }).length > MAX_BYTES - 1024) items.shift()
  return { ...project, graph, history: { items, index: items.length - 1 } }
}
export function moveDiagramHistory(project: DiagramProject, delta: number): DiagramProject | null {
  const index = project.history.index + delta, graph = project.history.items[index]; return graph ? { ...project, graph, history: { ...project.history, index } } : null
}

/** Each project is a single atomic localStorage record. No shared manifest can erase another project. */
export class DiagramProjectStore {
  constructor(readonly type: 图类型, private disk: Storage = browserStorage('localStorage'), private drafts: Storage = browserStorage('sessionStorage'), private memory: Map<string, DraftRecord> = memoryDrafts) {}
  private key(id: string) { return diagramProjectPrefix(this.type) + id }
  private draftKey(id: string) { return draftPrefix(this.type) + id }
  private parseDraft(raw: string): DraftRecord {
    const value = JSON.parse(raw)
    if (value?.schema !== 1 || (value.baseRevision !== null && typeof value.baseRevision !== 'string') || typeof value.error !== 'string') throw Error('项目草稿格式无效')
    return { schema: 1, project: parseDiagramProject(JSON.stringify(value.project), this.type), baseRevision: value.baseRevision, error: value.error }
  }
  private migrate() {
    const key = legacyDiagramKey(this.type), marker = `seal-diagram-migration-v2:${kind(this.type)}`
    const migrated = this.disk.getItem(marker)
    if (migrated !== null) { const value = JSON.parse(migrated); if (value?.schema !== 2 || value.legacyKey !== key) throw Error('旧图迁移记录无效，原数据已保留'); return }
    const raw = this.disk.getItem(key); if (raw === null) return
    const graph = 解析图数据(raw), backup = this.disk.getItem(key + ':backup-v2')
    if (backup !== null && backup !== raw) throw Error('旧图与已有迁移备份不同，已保留两份数据，请导出备份后处理')
    if (backup === null) this.disk.setItem(key + ':backup-v2', raw)
    const id = 'legacy-v1', existing = this.disk.getItem(this.key(id))
    // A failed marker write may leave a completed project; never replay the old graph over later edits.
    if (existing === null) this.disk.setItem(this.key(id), JSON.stringify({ ...createDiagramProject(this.type, `我的${this.type}`, graph), id }))
    else parseDiagramProject(existing, this.type)
    this.disk.setItem(marker, JSON.stringify({ schema: 2, legacyKey: key, projectId: id, migratedAt: Date.now() }))
  }
  load(): { items: DiagramProjectState[]; issues: DiagramProjectIssue[] } {
    const items = new Map<string, DiagramProjectState>(), issues: DiagramProjectIssue[] = []
    try { this.migrate() } catch (error) { issues.push({ key: legacyDiagramKey(this.type), message: `旧图迁移未完成：${reason(error)}` }) }
    try {
      for (let i = 0; i < this.disk.length; i++) {
        const key = this.disk.key(i); if (!key?.startsWith(diagramProjectPrefix(this.type))) continue
        try { const project = parseDiagramProject(this.disk.getItem(key)!, this.type); if (key !== this.key(project.id)) throw Error('项目标识与存储键不一致'); items.set(project.id, { project, baseRevision: project.revision }) }
        catch (error) { issues.push({ key, message: reason(error) }) }
      }
    } catch (error) { issues.push({ key: diagramProjectPrefix(this.type), message: reason(error) }) }
    const recovered = new Map<string, DraftRecord>()
    try {
      for (let i = 0; i < this.drafts.length; i++) { const key = this.drafts.key(i); if (!key?.startsWith(draftPrefix(this.type))) continue; try { const value = this.parseDraft(this.drafts.getItem(key)!); if (key !== this.draftKey(value.project.id)) throw Error('草稿标识不匹配'); recovered.set(key, value) } catch (error) { issues.push({ key, message: reason(error) }) } }
    } catch (error) { /* Memory drafts remain usable when sessionStorage is unavailable. */ }
    for (const [key, value] of this.memory) if (key.startsWith(draftPrefix(this.type))) recovered.set(key, value)
    for (const [key, value] of recovered) {
      // A successful commit remains authoritative even if sessionStorage cleanup was denied.
      if (items.get(value.project.id)?.project.resolvedDraftRevision === value.project.revision) { this.memory.delete(key); try { this.drafts.removeItem(key) } catch {}; continue }
      let durable = false; try { durable = this.drafts.getItem(key) === JSON.stringify(value) } catch {}
      items.set(value.project.id, { project: value.project, baseRevision: value.baseRevision, pending: { error: value.error, durable } })
    }
    return { items: [...items.values()], issues }
  }
  write(input: DiagramProject, expectedRevision: string | null): DiagramProjectState {
    const candidate = parseDiagramProject(JSON.stringify({ ...input, revision: newId(), updated: Math.max(Date.now(), input.updated + 1) }), this.type)
    const draftKey = this.draftKey(candidate.id)
    try {
      const raw = this.disk.getItem(this.key(candidate.id)), current = raw === null ? null : parseDiagramProject(raw, this.type)
      if ((current?.revision ?? null) !== expectedRevision) throw Error('另一窗口已修改或删除此项目；本机草稿已保留，请导出或另存为新项目')
      let pending = this.memory.get(draftKey); if (!pending) try { const rawDraft = this.drafts.getItem(draftKey); if (rawDraft) pending = this.parseDraft(rawDraft) } catch {}
      const project = { ...candidate, ...(pending?.project.revision === input.revision ? { resolvedDraftRevision: input.revision } : {}) }; this.disk.setItem(this.key(project.id), JSON.stringify(project))
      this.memory.delete(draftKey); try { this.drafts.removeItem(draftKey) } catch { /* Old draft is rejected on load by the committed revision below. */ }
      return { project, baseRevision: project.revision }
    } catch (error) {
      const draft: DraftRecord = { schema: 1, project: candidate, baseRevision: expectedRevision, error: reason(error) }; this.memory.set(draftKey, draft)
      let durable = false; try { this.drafts.setItem(draftKey, JSON.stringify(draft)); durable = true } catch {}
      return { project: candidate, baseRevision: expectedRevision, pending: { error: draft.error, durable } }
    }
  }
  permanentlyDelete(state: DiagramProjectState) {
    if (state.pending) throw Error('项目仍有未保存草稿，请先重试保存或导出备份')
    if (state.project.trashedAt === undefined) throw Error('请先将项目移入回收站')
    if (state.project.id === 'legacy-v1') this.migrate()
    const raw = this.disk.getItem(this.key(state.project.id)); if (raw === null || parseDiagramProject(raw, this.type).revision !== state.baseRevision) throw Error('项目已在另一窗口改变，请刷新列表')
    this.disk.removeItem(this.key(state.project.id)); this.memory.delete(this.draftKey(state.project.id)); try { this.drafts.removeItem(this.draftKey(state.project.id)) } catch {}
  }
  backup(): string {
    const entries: Record<string, string> = {}; for (let i = 0; i < this.disk.length; i++) { const key = this.disk.key(i); if (key && (key.startsWith(diagramProjectPrefix(this.type)) || key.startsWith(legacyDiagramKey(this.type)) || key === `seal-diagram-migration-v2:${kind(this.type)}`)) entries[key] = this.disk.getItem(key)! }
    return JSON.stringify({ schema: 2, type: this.type, entries, drafts: this.load().items.filter(s => s.pending).map(s => s.project) }, null, 2)
  }
}
