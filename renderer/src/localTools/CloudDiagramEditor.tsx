import { useEffect, useRef, useState } from 'react'
import { Alert, App, Button } from 'antd'
import { useCloud } from '../cloud/CloudProvider'
import { RealtimeClient, type RealtimeState } from '../collaboration/realtimeClient'
import DiagramEditor from './DiagramEditor'
import { createDiagramProject, type DiagramProject, type DiagramProjectState } from './diagramProjects'
import { diagramCloudEdit, diagramType, parseDiagramCloud, validateDiagramCloud, type DiagramCloudEntry, type DiagramCloudModel } from './diagramCloud'

interface Props { entry: DiagramCloudEntry; model: DiagramCloudModel; onBack: () => void; onNew: () => void; onSaveLocal: (model: DiagramCloudModel) => void }
const initialStatus: RealtimeState = { status: 'connecting', connected: false, readOnly: false, pending: 0, peers: [] }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export default function CloudDiagramEditor({ entry, model, onBack, onNew, onSaveLocal }: Props) {
  const cloud = useCloud(), { modal } = App.useApp(), client = useRef<RealtimeClient<DiagramCloudModel> | null>(null)
  const current = useRef(model), bases = useRef(new Map<string, DiagramCloudModel>()), retained = useRef(new Map<string, number>()), durable = useRef(Promise.resolve()), saving = useRef(0), permissionKnown = useRef(false)
  const first = useRef(createDiagramProject(model.type, model.title, parseDiagramCloud(model).graph)), project = useRef<DiagramProjectState>({ project: first.current, baseRevision: first.current.revision })
  const [value, setValue] = useState(project.current), [status, setStatus] = useState(initialStatus), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState<{ model: DiagramCloudModel; reason: string } | null>(null), recoveryRef = useRef(recovery); recoveryRef.current = recovery
  const remember = (next: DiagramCloudModel) => { bases.current.set(JSON.stringify(parseDiagramCloud(next).graph), next); if (bases.current.size > 100) for (const key of bases.current.keys()) { if (!retained.current.has(key) && key !== JSON.stringify(parseDiagramCloud(next).graph)) { bases.current.delete(key); break } } }
  const display = (next: DiagramCloudModel) => {
    const valid = parseDiagramCloud(next, model.type); current.current = next; remember(next)
    const updated = { ...project.current.project, title: valid.title, graph: valid.graph, history: { items: [valid.graph], index: 0 }, revision: crypto.randomUUID(), updated: Date.now() }
    project.current = { project: updated, baseRevision: updated.revision }; setValue(project.current); return project.current
  }
  if (!bases.current.size) remember(model)
  const track = (task: Promise<unknown>) => { saving.current++; const operation = task.then(() => {}, reason => { setError(reason instanceof Error ? reason.message : '本机安全记录写入失败'); throw reason }).finally(() => { saving.current-- }); durable.current = Promise.all([durable.current.catch(() => {}), operation]).then(() => {}); void durable.current.catch(() => {}); return operation }
  useEffect(() => {
    if (!cloud.state.unlocked || entry.binding.accountId !== cloud.state.account?.id) return
    let alive = true; permissionKnown.current = false
    const instance = new RealtimeClient({ binding: entry.binding, type: diagramType(model.type), model,
      call: cloud.call, validate: validateDiagramCloud, onModel: next => { if (alive) display(next) }, onStatus: next => { if (alive) { if (next.connected) permissionKnown.current = true; setStatus(next) } } })
    client.current = instance
    void cloud.call('realtimeRecovery', { binding: entry.binding }).then(result => { if (alive && result) { parseDiagramCloud(result.model, model.type); setRecovery(result) } }).catch(reason => { if (alive) setError(reason.message) })
    const resume = () => { if (document.visibilityState !== 'hidden') void instance.sync().catch(() => {}) }
    window.addEventListener('online', resume); document.addEventListener('visibilitychange', resume)
    return () => { alive = false; client.current = null; window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); void instance.close() }
  }, [entry.binding.accountId, entry.binding.kind, entry.binding.id, entry.binding.nodeId, cloud.state.unlocked, cloud.state.account?.id])
  useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (!saving.current && !recoveryRef.current) return; event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave) }, [])
  const readOnly = !cloud.state.unlocked || cloud.state.account?.id !== entry.binding.accountId || (!permissionKnown.current && !entry.binding.editable) || status.readOnly || status.status === 'connecting' || status.status === 'unsupported'
  const preserve = (next: DiagramCloudModel, reason: string) => { const value = { model: parseDiagramCloud(next), reason }; setRecovery(value); recoveryRef.current = value; void track(cloud.call('realtimeRecovery', { binding: entry.binding, ...value })).catch(() => {}) }
  const commit = (next: DiagramProject, graphBase = value.project.graph): DiagramProjectState => {
    const instance = client.current; if (!instance || readOnly) return project.current
    const base = bases.current.get(JSON.stringify(graphBase))
    if (!base) { preserve({ ...current.current, graph: next.graph }, '编辑基线已过期，请把本机修改另存为独立项目'); return project.current }
    const wanted = diagramCloudEdit(base, next.graph), existingIds = new Set(current.current.graph.节点.map(node => node.id))
    if (next.graph.节点.some(node => !existingIds.has(node.id) && base.graph.节点.some(old => old.id === node.id && !same(old, node)))) preserve(wanted, '其他成员删除了正在编辑的节点；未合并输入已加密保留，可以另存本机项目')
    try {
      const operation = instance.publish(wanted, base)
      void track(operation).catch(reason => { instance.reportError(reason); preserve(wanted, '修改尚未写入安全队列，请另存本机项目') })
      return display(instance.current)
    } catch (reason) { instance.reportError(reason); preserve(wanted, '本机编辑尚未合并，请另存副本'); return project.current }
  }
  const saveLocal = (next: DiagramCloudModel) => { try { onSaveLocal(next); return true } catch (reason) { setError(reason instanceof Error ? reason.message : '本机项目保存失败，原安全记录继续保留'); return false } }
  const saveRecovery = () => { if (!recoveryRef.current || !saveLocal(recoveryRef.current.model)) return false; setRecovery(null); recoveryRef.current = null; void track(cloud.call('realtimeRecovery', { binding: entry.binding, clear: true })).catch(() => {}); return true }
  const leave = (next: () => void) => { void durable.current.then(() => { if (!recoveryRef.current) { next(); return }; modal.confirm({ title: '保留未合并输入', content: '这份输入已加密保存在当前设备，可先另存为独立本机项目再返回。', okText: '另存本机项目并返回', cancelText: '继续编辑', onOk: () => { if (!saveRecovery()) return Promise.reject(new Error('本机副本尚未保存')); next() } }) }).catch(() => setError('安全缓存尚未写入，请先另存本机项目或导出数据再离开')) }
  const back = () => leave(onBack)
  useEffect(() => { const nativeBack = (event: Event) => { event.preventDefault(); back() }; window.addEventListener('seal-before-native-back', nativeBack); return () => window.removeEventListener('seal-before-native-back', nativeBack) })
  const label = { connecting: '正在连接云端共同编辑', online: '实时共同编辑已连接', offline: '离线编辑，正在重连', readonly: '实时只读查看', revoked: '访问权限已撤销', unsupported: '服务器需要升级', error: '同步尚未完成', closed: '会话已关闭' }[status.status]
  return <div className="diagram-cloud-editor" data-diagram-cloud-editor={entry.binding.kind}>
    <div className="diagram-cloud-status" role="status" aria-live="polite"><span>{label}{status.connected ? ` · ${status.peers.length + 1} 台设备在线` : ''}{status.pending ? ` · ${status.pending} 项修改待同步` : ''}</span>{status.peers.length > 0 && <span aria-label="在线成员">{status.peers.map(peer => peer.name).join('、')}</span>}<div className="diagram-project-card__actions"><Button size="small" aria-label="立即同步" loading={busy} disabled={busy || status.status === 'connecting' || status.status === 'revoked'} onClick={() => { setBusy(true); setError(''); void client.current?.flush().catch(reason => setError(reason.message)).finally(() => setBusy(false)) }}>立即同步</Button><Button size="small" onClick={() => saveLocal(parseDiagramCloud(current.current))}>另存本机项目</Button></div></div>
    {(status.error || error) && <Alert role="alert" type="warning" showIcon message={error || status.error} description="已写入的加密队列会在重新连接后恢复。权限撤销后停止上传，仍可导出已下载的本机内容。" />}
    {recovery && <Alert role="alert" type="warning" message={recovery.reason} action={<Button onClick={saveRecovery}>另存恢复项目</Button>} />}
    <DiagramEditor 类型={model.type} initial={value} onCommit={commit} onBack={back} onNew={() => leave(onNew)} onRetry={() => { void client.current?.flush().catch(reason => setError(reason.message)) }} onSaveCopy={() => { saveLocal(parseDiagramCloud(current.current)) }}
      collaboration={{ readOnly, canUndo: client.current?.canUndo ?? false, canRedo: client.current?.canRedo ?? false,
        stopCapturing: () => client.current?.stopCapturing(), undo: () => { client.current?.stopCapturing(); client.current?.undo() }, redo: () => { client.current?.stopCapturing(); client.current?.redo() },
        retainBaseline: graph => { const key = JSON.stringify(graph), base = bases.current.get(key); if (!base || !client.current) return () => {}; client.current.stopCapturing(); const release = client.current.retainBaseline(base); retained.current.set(key, (retained.current.get(key) || 0) + 1); return () => { client.current?.stopCapturing(); release(); const count = (retained.current.get(key) || 1) - 1; if (count) retained.current.set(key, count); else retained.current.delete(key) } } }} />
  </div>
}
