import { applyModelChanges, createModelDocument, readModel, Y } from './crdtModel'
import type { SharedFileBinding } from './fileAccess'

export type RealtimeStatus = 'connecting' | 'online' | 'offline' | 'readonly' | 'revoked' | 'unsupported' | 'error' | 'closed'
export interface RealtimePeer { clientId: string; name: string; color?: string; cursor?: unknown; updated: number }
export interface RealtimeState { status: RealtimeStatus; connected: boolean; readOnly: boolean; pending: number; peers: RealtimePeer[]; error?: string }
export interface RealtimeOptions<T> {
  binding: Pick<SharedFileBinding, 'kind' | 'id' | 'nodeId'>
  type: 'word' | 'table' | 'ppt' | 'mindmap' | 'flowchart'
  model: T
  call: <R = any>(action: string, input?: any) => Promise<R>
  onModel: (model: T) => void
  onStatus?: (state: RealtimeState) => void
  validate?: (model: T) => string | null
  pollInterval?: number
}
const encode = (data: Uint8Array) => { let text = ''; for (let offset = 0; offset < data.length; offset += 32768) text += String.fromCharCode(...data.subarray(offset, offset + 32768)); return btoa(text) }
const decode = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const LOCAL = 'seal-local-edit', REMOTE = 'seal-remote-update'

export class RealtimeClient<T> {
  readonly clientId = crypto.randomUUID()
  readonly ready: Promise<void>
  private doc = createModelDocument()
  private serverDoc = new Y.Doc()
  private serverAfter = 0
  private serverInitialized = false
  private undoManager = new Y.UndoManager(this.doc.getMap('document'), { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 })
  private model: T
  private snapshots: Array<{ json: string; state: Uint8Array }> = []
  private retained = new Map<string, { state: Uint8Array; count: number }>()
  private durable = Promise.resolve()
  private timer: ReturnType<typeof setTimeout> | undefined
  private syncing: Promise<void> | undefined
  private initialized = false
  private stopped = false
  private terminal = false
  private after = 0
  private head = 0
  private lastPresence = 0
  private cursor: unknown = null
  private stageTail = Promise.resolve()
  private stageRevision = 0
  private stageVersion = 0
  private appliedLocal = new Map<string, string>()
  private queuedError: Error | undefined
  private undurable: Array<{ operationId: string; update: string; state: string; stageVersion?: number }> = []
  private revision = 0
  private persistedRevision = -1
  private persistedAfter = -1
  private state: RealtimeState = { status: 'connecting', connected: false, readOnly: false, pending: 0, peers: [] }
  constructor(private options: RealtimeOptions<T>) {
    this.model = clone(options.model)
    this.listen()
    this.ready = this.start()
    // A caller can await ready; UI consumers also receive an explicit status.
    void this.ready.catch(() => {})
  }
  get current(): T { return clone(this.model) }
  get status(): RealtimeState { return { ...this.state, peers: [...this.state.peers] } }
  get canUndo() { return this.initialized && !this.state.readOnly && this.undoManager.canUndo() }
  get canRedo() { return this.initialized && !this.state.readOnly && this.undoManager.canRedo() }
  reportError(reason: unknown) { this.failure(reason) }
  stopCapturing() { this.undoManager.stopCapturing() }
  retainBaseline(model: T = this.model) { const json = JSON.stringify(model), old = this.retained.get(json), snapshot = this.snapshots.find(item => item.json === json); if (!old && !snapshot && JSON.stringify(this.model) !== json) throw new Error('无法保留已过期的编辑基线'); this.retained.set(json, { state: old?.state || snapshot?.state || Y.encodeStateAsUpdate(this.doc), count: (old?.count || 0) + 1 }); return () => { const entry = this.retained.get(json); if (entry && --entry.count <= 0) this.retained.delete(json) } }
  private emit(update: Partial<RealtimeState>) { if (this.stopped) return; const next = { ...this.state, ...update }; if (JSON.stringify(next) === JSON.stringify(this.state)) return; this.state = next; this.options.onStatus?.(this.status) }
  private call<R = any>(action: string, input: any = {}) { return this.options.call<R>(action, { ...input, binding: this.options.binding }) }
  private remember() { const json = JSON.stringify(this.model); if (this.snapshots[this.snapshots.length - 1]?.json === json) return; this.snapshots.push({ json, state: Y.encodeStateAsUpdate(this.doc) }); while (this.snapshots.length > 3) this.snapshots.shift() }
  private notify() {
    const next = readModel<T>(this.doc), invalid = this.options.validate?.(next)
    if (invalid) throw Object.assign(new Error(`并发内容结构需要人工确认：${invalid}。本机原文已保留，可以另存副本`), { code: 'CONTENT_CONFLICT' })
    const changed = JSON.stringify(this.model) !== JSON.stringify(next)
    this.model = next; this.remember(); if (changed) this.options.onModel(clone(next))
  }
  private makeDurable() {
    // Retry the original receipts in order after a recoverable storage failure.
    // A rejected promise must not permanently poison an otherwise valid queue.
    this.durable = this.durable.catch(() => {}).then(async () => {
      while (this.undurable.length) { await this.call('realtimeQueue', this.undurable[0]); this.undurable.shift() }
      this.queuedError = undefined
    }).catch(reason => { this.queuedError = reason instanceof Error ? reason : new Error(String(reason)); this.emit({ status: 'error', error: this.queuedError.message }); throw this.queuedError })
    void this.durable.catch(() => {})
    return this.durable
  }
  private listen() {
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      this.revision++
      if (origin !== LOCAL && origin !== this.undoManager) return
      const state = encode(Y.encodeStateAsUpdate(this.doc)), operationId = crypto.randomUUID()
      this.emit({ pending: this.state.pending + 1 })
      // Serial durability preserves both edit order and the latest complete local state.
      this.undurable.push({ operationId, update: encode(update), state, ...(this.stageVersion ? { stageVersion: this.stageVersion } : {}) })
      void this.makeDurable().catch(() => {})
      if (origin === this.undoManager) this.notify()
      this.schedule(30)
    })
  }
  private replaceDoc(state: Uint8Array) {
    this.undoManager.destroy(); this.doc.destroy(); this.doc = createModelDocument(); Y.applyUpdate(this.doc, state, REMOTE)
    this.revision++
    this.undoManager = new Y.UndoManager(this.doc.getMap('document'), { trackedOrigins: new Set([LOCAL]), captureTimeout: 400 }); this.listen()
  }
  private async start(synchronize = true) {
    let restored: any
    try { restored = await this.call('realtimeRestore'); if (restored?.state) { this.replaceDoc(decode(restored.state)); this.after = restored.after; this.initialized = true; this.state.pending = restored.pending; this.model = readModel<T>(this.doc); this.remember(); if (restored.draft) { this.stageVersion = restored.draft.version; await this.publish(restored.draft.next, restored.draft.base); await this.persist(); this.stageVersion = 0 } this.notify() } } catch (reason) { this.failure(reason) }
    try {
      const seed = createModelDocument(restored?.draft?.base ?? this.options.model), serialized = encode(Y.encodeStateAsUpdate(seed)); seed.destroy()
      const result = await this.call('realtimeOpen', { type: this.options.type, seed: serialized })
      if (this.stopped) return
      if (result.initialized) {
        if (result.seed) { Y.applyUpdate(this.serverDoc, decode(result.seed)); this.serverInitialized = true }
        if (!restored?.state) this.replaceDoc(decode(result.seed))
        else if (result.seed) Y.applyUpdate(this.doc, decode(result.seed), REMOTE)
        if (result.seed) { const baseline = new Y.Doc(); Y.applyUpdate(baseline, decode(result.seed)); this.snapshots.push({ json: JSON.stringify(readModel(baseline)), state: Y.encodeStateAsUpdate(baseline) }); baseline.destroy() }
        let staged: any, revision: number
        do { revision = this.stageRevision; await this.stageTail; staged = await this.call('realtimeRestore') } while (revision !== this.stageRevision)
        this.initialized = true
        this.apply(result, false)
        this.model = readModel<T>(this.doc); this.remember()
        if (staged?.draft) {
          this.stageVersion = staged.draft.version
          try { await this.publish(staged.draft.next, staged.draft.base); await this.persist() } catch (reason) { throw Object.assign(reason instanceof Error ? reason : new Error(String(reason)), { code: 'CONTENT_CONFLICT' }) }
          finally { this.stageVersion = 0 }
        }
        this.notify()
        await this.persist()
      }
      this.emit({ status: result.editable ? 'online' : 'readonly', connected: true, readOnly: !result.editable, error: undefined, pending: result.cached?.pending ?? this.state.pending })
      if (synchronize) await this.sync()
    } catch (reason) { this.failure(reason); if (!this.initialized && this.terminal) throw reason }
    finally { this.schedule() }
  }
  private apply(result: any, notify = true) {
    if (!result.initialized) return
    if (result.type !== this.options.type) throw new Error('远端实时文档类型不匹配，已保留本机内容')
    if (result.seed) { Y.applyUpdate(this.serverDoc, decode(result.seed)); this.serverInitialized = true }
    if (result.checkpoint) { Y.applyUpdate(this.doc, decode(result.checkpoint), REMOTE); Y.applyUpdate(this.serverDoc, decode(result.checkpoint)); this.after = Math.max(this.after, result.checkpointSeq); this.serverAfter = Math.max(this.serverAfter, result.checkpointSeq) }
    for (const item of result.updates || []) { Y.applyUpdate(this.doc, decode(item.update), REMOTE); Y.applyUpdate(this.serverDoc, decode(item.update)); this.after = Math.max(this.after, item.seq); this.serverAfter = Math.max(this.serverAfter, item.seq) }
    this.head = result.head
    this.emit({ peers: (result.peers || []).filter((peer: RealtimePeer) => peer.clientId !== this.clientId), readOnly: !result.editable })
    if (notify) this.notify()
  }
  private async persist() { await this.durable; if (this.initialized && (this.stageVersion || this.revision !== this.persistedRevision || this.after !== this.persistedAfter)) { const revision = this.revision, after = this.after; await this.call('realtimeState', { state: encode(Y.encodeStateAsUpdate(this.doc)), after, stageVersion: this.stageVersion }); this.persistedRevision = revision; this.persistedAfter = after } }
  private failure(reason: any) {
    const status = reason?.status, error = reason instanceof Error ? reason.message : '实时协作连接失败'
    if (reason?.code === 'CONTENT_CONFLICT') { this.terminal = true; this.emit({ status: 'error', connected: false, readOnly: true, peers: [], error }) }
    else if ([401, 403, 404].includes(status)) { this.terminal = true; this.emit({ status: 'revoked', connected: false, readOnly: true, peers: [], error: `${error}；本机修改仍保留，可另存为` }) }
    else if (status === 501) { this.terminal = true; this.emit({ status: 'unsupported', connected: false, error }) }
    else this.emit({ status: status ? 'error' : 'offline', connected: false, peers: [], error })
  }
  private schedule(delay = this.options.pollInterval ?? 750) {
    if (this.stopped || this.terminal) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = undefined; void this.sync().catch(() => {}).finally(() => this.schedule(this.state.connected ? undefined : 2500)) }, delay)
  }
  async publish(next: T, base: T = this.model): Promise<void> {
    if (this.stopped) return
    if (this.state.readOnly) throw new Error('当前没有实时编辑权限；可另存本机副本')
    if (!this.initialized) { this.stageRevision++; this.model = clone(next); this.stageTail = this.stageTail.catch(() => {}).then(() => this.call('realtimeStage', { type: this.options.type, base, next })).then(() => {}); await this.stageTail; return }
    const beforeJson = JSON.stringify(base), nextJson = JSON.stringify(next)
    if (nextJson === JSON.stringify(this.model) || this.appliedLocal.get(beforeJson) === nextJson) { if (this.undurable.length) await this.makeDurable(); await this.durable; return }
    const invalid = this.options.validate?.(next); if (invalid) throw new Error(invalid)
    const found = this.retained.get(JSON.stringify(base)) || this.snapshots.find(snapshot => snapshot.json === JSON.stringify(base)), baseline = found ? new Y.Doc() : undefined
    if (baseline && found) Y.applyUpdate(baseline, found.state)
    try { applyModelChanges(this.doc, base, next, baseline, LOCAL); this.model = readModel<T>(this.doc); this.remember(); this.appliedLocal.set(beforeJson, nextJson); while (this.appliedLocal.size > 3) this.appliedLocal.delete(this.appliedLocal.keys().next().value!) } finally { baseline?.destroy() }
    await this.durable
  }
  undo() { if (!this.initialized || this.state.readOnly || !this.undoManager.canUndo()) return false; this.appliedLocal.clear(); this.undoManager.undo(); return true }
  redo() { if (!this.initialized || this.state.readOnly || !this.undoManager.canRedo()) return false; this.appliedLocal.clear(); this.undoManager.redo(); return true }
  setCursor(cursor: unknown) { this.cursor = cursor; this.lastPresence = 0; this.schedule(100) }
  async sync(): Promise<void> {
    if (this.stopped || this.terminal) return
    if (this.syncing) return this.syncing
    const operation = (async () => {
      if (!this.initialized) { await this.start(false); return }
      if (this.undurable.length) await this.makeDurable()
      await this.durable
      if (this.queuedError) throw this.queuedError
      try {
        if (!this.serverInitialized) this.apply(await this.call('realtimeSnapshot'))
        // Pull first so a nearly full log can be compacted before an offline queue is sent.
        let result = await this.call('realtimePull', { after: Math.min(this.after, this.serverAfter) })
        this.apply(result); await this.persist()
        if (!result.editable) {
          if (Date.now() - this.lastPresence > 12000) { await this.call('realtimePresence', { clientId: this.clientId, color: '#2463eb', cursor: this.cursor }); this.lastPresence = Date.now() }
          this.emit({ status: 'readonly', connected: true }); return
        }
        while (this.serverAfter < result.head) { result = await this.call('realtimePull', { after: this.serverAfter }); this.apply(result); await this.persist() }
        if (this.serverAfter === this.head && this.serverAfter - (result.checkpointSeq || 0) >= 128) await this.call('realtimeCheckpoint', { state: encode(Y.encodeStateAsUpdate(this.serverDoc)), after: this.serverAfter })
        const sent = await this.call('realtimePush'); this.emit({ pending: sent.pending })
        do { result = await this.call('realtimePull', { after: Math.min(this.after, this.serverAfter) }); this.apply(result); await this.persist() } while (Math.min(this.after, this.serverAfter) < result.head)
        if (Date.now() - this.lastPresence > 12000) { await this.call('realtimePresence', { clientId: this.clientId, color: '#2463eb', cursor: this.cursor }); this.lastPresence = Date.now() }
        this.emit({ status: 'online', connected: true, error: undefined })
      } catch (reason) { this.failure(reason); throw reason }
    })()
    this.syncing = operation
    try { await operation } finally { if (this.syncing === operation) this.syncing = undefined }
  }
  async flush() { await this.ready; if (this.undurable.length) await this.makeDurable(); await this.durable; await this.sync(); if (!this.state.connected || this.state.pending) throw new Error(this.state.error || '实时修改尚未同步，已保留本机；可以保存副本') }
  async close() { if (this.stopped) return; if (this.timer) clearTimeout(this.timer); this.stopped = true; try { await this.stageTail; await this.durable; if (this.initialized) await this.call('realtimeLeave', { clientId: this.clientId }) } catch { /* Local encrypted queue remains available on the next open. */ } this.undoManager.destroy(); this.doc.destroy(); this.serverDoc.destroy() }
}
export const createRealtimeClient = <T>(options: RealtimeOptions<T>) => new RealtimeClient(options)
