import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Button, Input, Modal } from 'antd'
import DiagramEditor from './DiagramEditor'
import { DiagramProjectStore, createDiagramProject, diagramProjectPrefix, type DiagramProject, type DiagramProjectState, type DiagramProjectIssue } from './diagramProjects'
import { type 图类型, 生成图形文件 } from './diagramData'
import { 下载本地内容 } from './download'
import { useCloud } from '../cloud/CloudProvider'
import { CloudGate } from '../collaboration/common'
import DiagramCloudLibrary, { DiagramCloudCreateDialog, type DiagramOpenRequest } from './DiagramCloudLibrary'
import { diagramOpenEvent, takeDiagramOpen, takeLocalDiagramOpen, type DiagramCloudModel } from './diagramCloud'
import IconAction from '../components/IconAction'
import Icon from '../components/Icon'
import { useT } from '../i18n/t'
import { use界面语言 } from '../store/settingsStore'
import './localTools.css'
import './diagramEnhancements.css'

interface Props { 类型: 图类型 }
// 2.8.1：项目库整句交给台账消息，类型与数量用具名参数；项目名作为用户内容原样显示并排除在旧适配器之外。
const 类型键 = { 脑图: 'mindmap', 流程图: 'flowchart' } as const
function use类型文案(类型: 图类型) {
  const t = useT(), 键 = 类型键[类型]
  return { t, kind: t(`diagram.kind.${键}`), title: t(`diagram.kind.${键}.title`) }
}
export default function DiagramPage({ 类型 }: Props) {
  const cloud = useCloud(), { message } = AntdApp.useApp(), [location, setLocation] = useState<'local' | 'cloud'>('local'), { t, kind } = use类型文案(类型)
  const [upload, setUpload] = useState<DiagramCloudModel | null>(null), [request, setRequest] = useState<DiagramOpenRequest | null>(null), [localRequest, setLocalRequest] = useState<string | null>(null)
  const account = cloud.state.account?.id || '', enabled = Boolean(cloud.state.account?.enabled && cloud.state.unlocked)
  useEffect(() => { setUpload(null); setRequest(null) }, [account])
  useEffect(() => { const open = () => { const local = takeLocalDiagramOpen(类型); if (local) { setLocalRequest(local); setLocation('local') }; const value = takeDiagramOpen(类型, account); if (value) { setRequest(value); setLocation('cloud') } }; open(); window.addEventListener(diagramOpenEvent, open); return () => window.removeEventListener(diagramOpenEvent, open) }, [类型, account])
  const saveLocal = (model: DiagramCloudModel) => {
    const store = new DiagramProjectStore(类型), names = new Set(store.load().items.map(item => item.project.title)), base = t('diagram.cloud.localcopy.suffix', { name: model.title.slice(0, 100) }); let title = base, number = 2
    while (names.has(title)) title = base + ' ' + number++
    const saved = store.write(createDiagramProject(类型, title, model.graph), null)
    if (saved.pending) throw new Error(t('diagram.cloud.localcopy.failed'))
    message.success(t('diagram.cloud.localcopy.saved'))
  }
  return <><nav className="diagram-location-tabs" aria-label={t('diagram.location.label')}><Button aria-pressed={location === 'local'} onClick={() => { setLocation('local'); setRequest(null); setLocalRequest(null) }}>{t('diagram.location.local')}</Button><Button aria-pressed={location === 'cloud'} onClick={() => { setLocation('cloud'); setRequest(null) }}>{t('diagram.location.cloud')}</Button></nav>
    {location === 'local' ? <ProjectLibrary key={类型} 类型={类型} requestedLocalId={localRequest} onSync={project => { if (!enabled) { cloud.configure(); return }; setUpload({ schema: 1, type: 类型, title: project.title, graph: project.graph }) }} /> : !enabled ? <CloudGate title={t('diagram.location.cloud.gate', { kind })} /> : <DiagramCloudLibrary key={`${类型}:${account}`} 类型={类型} requested={request} onRequestHandled={() => setRequest(null)} onSaveLocal={saveLocal} />}
    <DiagramCloudCreateDialog type={类型} model={upload} onClose={() => setUpload(null)} onCreated={(entry, model) => { setUpload(null); setRequest({ entry, model }); setLocation('cloud') }} />
  </>
}
function ProjectLibrary({ 类型, onSync, requestedLocalId }: Props & { onSync: (project: DiagramProject) => void; requestedLocalId?: string | null }) {
  const { modal } = AntdApp.useApp(), store = useMemo(() => new DiagramProjectStore(类型), [类型]), { t, kind, title: 类型标题 } = use类型文案(类型), 语言 = use界面语言()
  const [items, setItems] = useState<DiagramProjectState[]>([]), itemRef = useRef(items), [issues, setIssues] = useState<DiagramProjectIssue[]>([])
  const [activeId, setActiveId] = useState<string | null>(null), activeRef = useRef(activeId), [trash, setTrash] = useState(false), [query, setQuery] = useState(''), [sort, setSort] = useState('updated')
  const [dialog, setDialog] = useState<{ mode: 'create' | 'rename'; project?: DiagramProjectState } | null>(null), [title, setTitle] = useState(''), [nameError, setNameError] = useState('')
  const [externalWarning, setExternalWarning] = useState(''), heading = useRef<HTMLHeadingElement>(null), titleInput = useRef<HTMLInputElement>(null)
  const replaceItems = (next: DiagramProjectState[]) => { itemRef.current = next; setItems(next) }
  const select = (id: string | null) => { activeRef.current = id; setActiveId(id); setExternalWarning(''); requestAnimationFrame(() => heading.current?.focus()) }
  const refresh = (preserveActive = false) => {
    const result = store.load(), current = itemRef.current.find(s => s.project.id === activeRef.current)
    if (preserveActive && current) { const index = result.items.findIndex(s => s.project.id === current.project.id); if (index >= 0) result.items[index] = current; else result.items.push(current) }
    replaceItems(result.items); setIssues(result.issues)
  }
  useEffect(() => { refresh(); const listener = (event: StorageEvent) => { if (event.key !== null && !event.key.startsWith(diagramProjectPrefix(类型))) return; if (activeRef.current) setExternalWarning(t('diagram.projects.external')); refresh(true) }; window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener) }, [store, 类型])
  useEffect(() => { if (requestedLocalId) { refresh(); select(requestedLocalId) } }, [requestedLocalId])
  useEffect(() => { const listener = (event: BeforeUnloadEvent) => { if (!itemRef.current.some(s => s.pending)) return; event.preventDefault(); event.returnValue = '' }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener) }, [])
  useEffect(() => { if (dialog) requestAnimationFrame(() => { if (document.activeElement !== titleInput.current) { titleInput.current?.focus(); titleInput.current?.select() } }) }, [dialog])
  const commit = (project: DiagramProject): DiagramProjectState => {
    const state = itemRef.current.find(s => s.project.id === project.id)
    const base = state?.project.revision === project.revision ? state.baseRevision : project.revision
    const result = store.write(project, base ?? null); replaceItems([...itemRef.current.filter(s => s.project.id !== project.id), result]); return result
  }
  const add = (project: DiagramProject, open = false) => { const result = store.write(project, null); replaceItems([...itemRef.current, result]); if (open) select(project.id); return result }
  const uniqueTitle = (base: string) => { let title = base.slice(0, 120), number = 2; const names = new Set(itemRef.current.map(s => s.project.title)); while (names.has(title)) { const suffix = ` ${number++}`; title = base.slice(0, 120 - suffix.length) + suffix }; return title }
  const newProject = () => { setTitle(uniqueTitle(t('diagram.projects.untitled', { kind }))); setNameError(''); setDialog({ mode: 'create' }) }
  const rename = (state: DiagramProjectState) => { setTitle(state.project.title); setNameError(''); setDialog({ mode: 'rename', project: state }) }
  const confirmName = () => {
    try { if (dialog?.mode === 'create') add(createDiagramProject(类型, title), true); else if (dialog?.project) commit({ ...dialog.project.project, title }); setDialog(null) }
    catch (error) { setNameError(error instanceof Error ? error.message : t('diagram.projects.name.invalid')) }
  }
  const copy = (state: DiagramProjectState, open = false) => { try { add(createDiagramProject(类型, uniqueTitle(t('diagram.projects.copy.suffix', { name: state.project.title.slice(0, 115) })), state.project.graph), open) } catch (error) { modal.error({ title: t('diagram.projects.copy.failed'), content: error instanceof Error ? error.message : t('diagram.projects.copy.invalid') }) } }
  const remove = (state: DiagramProjectState) => modal.confirm({ title: t('diagram.projects.delete.title'), content: t('diagram.projects.delete.content', { name: state.project.title }), okText: t('diagram.projects.delete.ok'), okType: 'danger', cancelText: t('diagram.projects.cancel'), onOk: () => { commit({ ...state.project, trashedAt: Date.now() }) } })
  const permanent = (state: DiagramProjectState) => modal.confirm({ title: t('diagram.projects.destroy.title'), content: t('diagram.projects.destroy.content', { name: state.project.title }), okText: t('diagram.projects.destroy.ok'), okType: 'danger', cancelText: t('diagram.projects.cancel'), onOk: () => { try { store.permanentlyDelete(state); refresh() } catch (error) { modal.error({ title: t('diagram.projects.destroy.failed'), content: error instanceof Error ? error.message : t('diagram.projects.storage.readonly') }) } } })
  const exportBackup = () => { try { 下载本地内容(t('diagram.projects.backup.filename', { kind: 类型标题 }), store.backup(), 'application/json;charset=utf-8') } catch (error) { modal.error({ title: t('diagram.projects.backup.failed'), content: error instanceof Error ? error.message : t('diagram.projects.backup.unreadable') }) } }
  const 区域 = 语言 === 'en-US' ? 'en-US' : 'zh-CN'
  const active = items.find(s => s.project.id === activeId), filtered = items.filter(s => (s.project.trashedAt !== undefined) === trash && s.project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === 'name' ? a.project.title.localeCompare(b.project.title, 'zh-CN') || a.project.id.localeCompare(b.project.id) : (sort === 'created' ? b.project.created - a.project.created : b.project.updated - a.project.updated) || a.project.id.localeCompare(b.project.id))
  const count = items.filter(s => s.project.trashedAt === undefined).length, trashCount = items.length - count
  return <>
    {active ? <><div className="diagram-external-warning" role={externalWarning ? 'status' : undefined}>{externalWarning}</div><DiagramEditor key={active.project.id} 类型={类型} initial={active} onCommit={commit} onBack={() => { select(null); refresh() }} onNew={newProject} onRetry={() => commit(active.project)} onSaveCopy={() => copy(active, true)} /></> : <div className="local-page diagram-page diagram-projects" data-diagram-projects={类型}>
      <header className="local-page__header"><div><h1 ref={heading} tabIndex={-1}>{类型标题}</h1><p>{t('diagram.projects.description')}</p></div><div className="local-page__actions"><Button type="primary" icon={<Icon name="plus" size={16} />} onClick={newProject}>{t('diagram.projects.create', { kind })}</Button><Button onClick={exportBackup}>{t('diagram.projects.backup.export')}</Button></div></header>
      {!!issues.length && <div role="alert" className="diagram-project-warning"><strong>{t('diagram.projects.issues.title')}</strong>{issues.map(issue => <p key={issue.key}>{issue.message}</p>)}<Button onClick={exportBackup}>{t('diagram.projects.backup.raw')}</Button><Button onClick={() => refresh()}>{t('diagram.projects.issues.retry')}</Button></div>}
      {/* 可见文字与读屏名称为同一条带计数的消息，切换语言后二者一致 */}
      <div className="diagram-project-filters"><div className="diagram-project-tabs"><Button aria-pressed={!trash} onClick={() => { setTrash(false); setQuery('') }}>{t('diagram.projects.tab.list', { count })}</Button><Button aria-pressed={trash} onClick={() => { setTrash(true); setQuery('') }}>{t('diagram.projects.tab.trash', { count: trashCount })}</Button></div><label>{t('diagram.projects.search')}<Input aria-label={t('diagram.projects.search')} value={query} allowClear onChange={event => setQuery(event.target.value)} /></label><label>{t('diagram.projects.sort')}<select aria-label={t('diagram.projects.sort')} value={sort} onChange={event => setSort(event.target.value)}><option value="updated">{t('diagram.projects.sort.updated')}</option><option value="created">{t('diagram.projects.sort.created')}</option><option value="name">{t('diagram.projects.sort.name')}</option></select></label></div>
      <p className="diagram-project-count" role="status">{t(trash ? 'diagram.projects.count.trash' : 'diagram.projects.count.list', { count: filtered.length })}</p>
      {filtered.length ? <ul className="diagram-project-grid" role="list">{filtered.map(state => { const project = state.project; return <li key={project.id} data-project-id={project.id} data-project-title={project.title} data-project-pending={state.pending ? 'true' : 'false'} className="diagram-project-card">
        <button className="diagram-project-preview" aria-label={t('diagram.projects.open', { name: project.title })} data-ui-language-ignore="true" disabled={trash} onClick={() => select(project.id)}><img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(生成图形文件(project.graph, 类型))}`} loading="lazy" /></button>
        <div className="diagram-project-card__body"><h2 translate="no" data-ui-language-ignore="true">{project.title}</h2><p>{t('diagram.projects.nodes', { count: project.graph.节点.length })} · <time dateTime={new Date(project.updated).toISOString()}>{new Date(project.updated).toLocaleString(区域)}</time></p>{state.pending && <p className="diagram-project-draft" role="alert">{t('diagram.projects.draft', { error: state.pending.error })}</p>}
          {/* 四个图标按钮固定一行：重命名、同步到云端、复制、删除；回收站中为恢复与永久删除 */}
          <div className="diagram-project-card__actions seal-icon-actions">{trash ? <><IconAction icon="restore" label={t('diagram.projects.restore', { name: project.title })} onClick={() => commit({ ...project, trashedAt: undefined })} /><IconAction icon="delete-forever" danger label={t('diagram.projects.destroy', { name: project.title })} onClick={() => permanent(state)} /></> : <><IconAction icon="rename" label={t('diagram.projects.rename', { name: project.title })} onClick={() => rename(state)} /><IconAction icon="cloud-upload" label={t('diagram.projects.sync', { name: project.title })} onClick={() => onSync(project)} /><IconAction icon="copy" label={t('diagram.projects.copy', { name: project.title })} onClick={() => copy(state)} /><IconAction icon="trash" danger label={t('diagram.projects.delete', { name: project.title })} onClick={() => remove(state)} /></>}</div></div>
      </li> })}</ul> : <div className="diagram-project-empty"><h2>{query.trim() ? t('diagram.projects.empty.search') : trash ? t('diagram.projects.empty.trash') : t('diagram.projects.empty.list', { kind })}</h2><p>{query.trim() ? t('diagram.projects.empty.search.hint') : trash ? t('diagram.projects.empty.trash.hint') : t('diagram.projects.empty.list.hint')}</p>{!trash && !query.trim() && <Button onClick={newProject}>{t('diagram.projects.create.short')}</Button>}</div>}
    </div>}
    <Modal open={!!dialog} title={dialog?.mode === 'rename' ? t('diagram.projects.name.rename.title') : t('diagram.projects.create', { kind })} okText={dialog?.mode === 'rename' ? t('diagram.projects.name.save') : t('diagram.projects.name.create')} cancelText={t('diagram.projects.cancel')} onOk={confirmName} onCancel={() => setDialog(null)} destroyOnHidden afterOpenChange={open => { if (open && document.activeElement !== titleInput.current) { titleInput.current?.focus(); titleInput.current?.select() } }}><label className="diagram-project-name" htmlFor="diagram-project-name">{t('diagram.projects.name.label')}<input ref={titleInput} autoFocus id="diagram-project-name" value={title} maxLength={120} required aria-invalid={!!nameError} aria-describedby={nameError ? 'diagram-project-name-error' : undefined} onChange={event => { setTitle(event.target.value); setNameError('') }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) confirmName() }} /></label>{nameError && <p id="diagram-project-name-error" role="alert">{nameError}</p>}</Modal>
  </>
}
