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
import './localTools.css'
import './diagramEnhancements.css'

interface Props { 类型: 图类型 }
export default function DiagramPage({ 类型 }: Props) {
  const cloud = useCloud(), { message } = AntdApp.useApp(), [location, setLocation] = useState<'local' | 'cloud'>('local')
  const [upload, setUpload] = useState<DiagramCloudModel | null>(null), [request, setRequest] = useState<DiagramOpenRequest | null>(null), [localRequest, setLocalRequest] = useState<string | null>(null)
  const account = cloud.state.account?.id || '', enabled = Boolean(cloud.state.account?.enabled && cloud.state.unlocked)
  useEffect(() => { setUpload(null); setRequest(null) }, [account])
  useEffect(() => { const open = () => { const local = takeLocalDiagramOpen(类型); if (local) { setLocalRequest(local); setLocation('local') }; const value = takeDiagramOpen(类型, account); if (value) { setRequest(value); setLocation('cloud') } }; open(); window.addEventListener(diagramOpenEvent, open); return () => window.removeEventListener(diagramOpenEvent, open) }, [类型, account])
  const saveLocal = (model: DiagramCloudModel) => {
    const store = new DiagramProjectStore(类型), names = new Set(store.load().items.map(item => item.project.title)), base = model.title.slice(0, 110) + ' 本机副本'; let title = base, number = 2
    while (names.has(title)) title = base + ' ' + number++
    const saved = store.write(createDiagramProject(类型, title, model.graph), null)
    if (saved.pending) throw new Error('本机项目未能完整保存，云端恢复记录仍保留，请导出数据后重试')
    message.success('已保存为独立本机项目，原云项目继续保留')
  }
  return <><nav className="diagram-location-tabs" aria-label="图形项目位置"><Button aria-pressed={location === 'local'} onClick={() => { setLocation('local'); setRequest(null); setLocalRequest(null) }}>本机项目</Button><Button aria-pressed={location === 'cloud'} onClick={() => { setLocation('cloud'); setRequest(null) }}>云端与协作</Button></nav>
    {location === 'local' ? <ProjectLibrary key={类型} 类型={类型} requestedLocalId={localRequest} onSync={project => { if (!enabled) { cloud.configure(); return }; setUpload({ schema: 1, type: 类型, title: project.title, graph: project.graph }) }} /> : !enabled ? <CloudGate title={`云端${类型}`} /> : <DiagramCloudLibrary key={`${类型}:${account}`} 类型={类型} requested={request} onRequestHandled={() => setRequest(null)} onSaveLocal={saveLocal} />}
    <DiagramCloudCreateDialog type={类型} model={upload} onClose={() => setUpload(null)} onCreated={(entry, model) => { setUpload(null); setRequest({ entry, model }); setLocation('cloud') }} />
  </>
}
function ProjectLibrary({ 类型, onSync, requestedLocalId }: Props & { onSync: (project: DiagramProject) => void; requestedLocalId?: string | null }) {
  const { modal } = AntdApp.useApp(), store = useMemo(() => new DiagramProjectStore(类型), [类型])
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
  useEffect(() => { refresh(); const listener = (event: StorageEvent) => { if (event.key !== null && !event.key.startsWith(diagramProjectPrefix(类型))) return; if (activeRef.current) setExternalWarning('另一窗口的项目列表已更新；当前画布保留本机内容，保存时会检查版本。'); refresh(true) }; window.addEventListener('storage', listener); return () => window.removeEventListener('storage', listener) }, [store, 类型])
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
  const newProject = () => { setTitle(uniqueTitle(`未命名${类型}`)); setNameError(''); setDialog({ mode: 'create' }) }
  const rename = (state: DiagramProjectState) => { setTitle(state.project.title); setNameError(''); setDialog({ mode: 'rename', project: state }) }
  const confirmName = () => {
    try { if (dialog?.mode === 'create') add(createDiagramProject(类型, title), true); else if (dialog?.project) commit({ ...dialog.project.project, title }); setDialog(null) }
    catch (error) { setNameError(error instanceof Error ? error.message : '项目名称无效') }
  }
  const copy = (state: DiagramProjectState, open = false) => { try { add(createDiagramProject(类型, uniqueTitle(state.project.title.slice(0, 115) + ' 副本'), state.project.graph), open) } catch (error) { modal.error({ title: '复制项目失败', content: error instanceof Error ? error.message : '图形数据无效' }) } }
  const remove = (state: DiagramProjectState) => modal.confirm({ title: '删除项目', content: `将「${state.project.title}」移入回收站？内容和撤销历史会保留，可以恢复。`, okText: '移入回收站', okType: 'danger', cancelText: '取消', onOk: () => { commit({ ...state.project, trashedAt: Date.now() }) } })
  const permanent = (state: DiagramProjectState) => modal.confirm({ title: '永久删除项目', content: `永久删除「${state.project.title}」及其撤销历史？此操作无法恢复，请先导出需要的备份。`, okText: '永久删除', okType: 'danger', cancelText: '取消', onOk: () => { try { store.permanentlyDelete(state); refresh() } catch (error) { modal.error({ title: '永久删除失败', content: error instanceof Error ? error.message : '本机存储不可写' }) } } })
  const exportBackup = () => { try { 下载本地内容(`${类型}项目原始备份.json`, store.backup(), 'application/json;charset=utf-8') } catch (error) { modal.error({ title: '导出原始备份失败', content: error instanceof Error ? error.message : '无法读取存储' }) } }
  const active = items.find(s => s.project.id === activeId), filtered = items.filter(s => (s.project.trashedAt !== undefined) === trash && s.project.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => sort === 'name' ? a.project.title.localeCompare(b.project.title, 'zh-CN') || a.project.id.localeCompare(b.project.id) : (sort === 'created' ? b.project.created - a.project.created : b.project.updated - a.project.updated) || a.project.id.localeCompare(b.project.id))
  const count = items.filter(s => s.project.trashedAt === undefined).length, trashCount = items.length - count
  return <>
    {active ? <><div className="diagram-external-warning" role={externalWarning ? 'status' : undefined}>{externalWarning}</div><DiagramEditor key={active.project.id} 类型={类型} initial={active} onCommit={commit} onBack={() => { select(null); refresh() }} onNew={newProject} onRetry={() => commit(active.project)} onSaveCopy={() => copy(active, true)} /></> : <div className="local-page diagram-page diagram-projects" data-diagram-projects={类型}>
      <header className="local-page__header"><div><h1 ref={heading} tabIndex={-1}>{类型}</h1><p>每个项目独立保存内容和撤销历史。数据存放于本机，可导出 JSON、SVG 或转为演示。</p></div><div className="local-page__actions"><Button type="primary" aria-label={`新建${类型}项目`} onClick={newProject}>新建{类型}项目</Button><Button onClick={exportBackup}>导出项目备份</Button></div></header>
      {!!issues.length && <div role="alert" className="diagram-project-warning"><strong>部分本机数据未能读取，原数据已保留</strong>{issues.map(issue => <p key={issue.key}>{issue.message}</p>)}<Button onClick={exportBackup}>导出原始备份</Button><Button onClick={() => refresh()}>重试读取</Button></div>}
      <div className="diagram-project-filters"><div className="diagram-project-tabs"><Button aria-pressed={!trash} onClick={() => { setTrash(false); setQuery('') }}>项目列表<span aria-hidden="true"> ({count})</span></Button><Button aria-pressed={trash} onClick={() => { setTrash(true); setQuery('') }} aria-label="回收站">回收站 ({trashCount})</Button></div><label>搜索项目<Input aria-label="搜索项目" value={query} allowClear onChange={event => setQuery(event.target.value)} /></label><label>项目排序<select aria-label="项目排序" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">最近修改</option><option value="created">最近创建</option><option value="name">名称</option></select></label></div>
      <p className="diagram-project-count" role="status">{trash ? '回收站' : '项目列表'} · {filtered.length} 个项目</p>
      {filtered.length ? <ul className="diagram-project-grid" role="list">{filtered.map(state => { const project = state.project; return <li key={project.id} data-project-id={project.id} data-project-title={project.title} data-project-pending={state.pending ? 'true' : 'false'} className="diagram-project-card">
        <button className="diagram-project-preview" aria-label={`打开项目：${project.title}`} disabled={trash} onClick={() => select(project.id)}><img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(生成图形文件(project.graph, 类型))}`} loading="lazy" /></button>
        <div className="diagram-project-card__body"><h2>{project.title}</h2><p>{project.graph.节点.length} 个节点 · <time dateTime={new Date(project.updated).toISOString()}>{new Date(project.updated).toLocaleString()}</time></p>{state.pending && <p className="diagram-project-draft" role="alert">未保存草稿：{state.pending.error}</p>}<div className="diagram-project-card__actions">{trash ? <><Button aria-label={`恢复项目：${project.title}`} onClick={() => commit({ ...project, trashedAt: undefined })}>恢复</Button><Button danger aria-label={`永久删除项目：${project.title}`} onClick={() => permanent(state)}>永久删除</Button></> : <><Button aria-label={`重命名项目：${project.title}`} onClick={() => rename(state)}>重命名</Button><Button aria-label={`同步到云端：${project.title}`} onClick={() => onSync(project)}>同步到云端</Button><Button aria-label={`复制项目：${project.title}`} onClick={() => copy(state)}>复制</Button><Button danger aria-label={`删除项目：${project.title}`} onClick={() => remove(state)}>删除</Button></>}</div></div>
      </li> })}</ul> : <div className="diagram-project-empty"><h2>{query.trim() ? '没有匹配的项目' : trash ? '回收站为空' : `还没有${类型}项目`}</h2><p>{query.trim() ? '可更换搜索词或清空搜索。' : trash ? '删除的项目会保留在这里，直到你确认永久删除。' : '新建项目开始绘制，已有旧版单图会安全迁移到此列表。'}</p>{!trash && !query.trim() && <Button onClick={newProject}>新建项目</Button>}</div>}
    </div>}
    <Modal open={!!dialog} title={dialog?.mode === 'rename' ? '重命名项目' : `新建${类型}项目`} okText={dialog?.mode === 'rename' ? '保存名称' : '创建项目'} cancelText="取消" onOk={confirmName} onCancel={() => setDialog(null)} destroyOnHidden afterOpenChange={open => { if (open && document.activeElement !== titleInput.current) { titleInput.current?.focus(); titleInput.current?.select() } }}><label className="diagram-project-name" htmlFor="diagram-project-name">项目名称<input ref={titleInput} autoFocus id="diagram-project-name" value={title} maxLength={120} required aria-invalid={!!nameError} aria-describedby={nameError ? 'diagram-project-name-error' : undefined} onChange={event => { setTitle(event.target.value); setNameError('') }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) confirmName() }} /></label>{nameError && <p id="diagram-project-name-error" role="alert">{nameError}</p>}</Modal>
  </>
}
