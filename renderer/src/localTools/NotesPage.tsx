import { useEffect, useRef, useState } from 'react'
import { App, Button, Input, Select } from 'antd'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { exportToolFile, useToolDocument } from './useToolDocument'
import { parseNotes, toolId, type LocalNote } from './workspaceTools'
import ToolRecovery from './ToolRecovery'
import './workspaceTools.css'
export default function NotesPage() {
  const { modal } = App.useApp(), store = useToolDocument('seal-notes-v1', () => ({ schema: 1 as const, notes: [] }), parseNotes)
  const [id, setId] = useState(''), [search, setSearch] = useState(''), [notebook, setNotebook] = useState('全部笔记'), [preview, setPreview] = useState(false), [draft, setDraft] = useState<LocalNote | null>(null), [saveError, setSaveError] = useState('')
  const importRef = useRef<HTMLInputElement>(null), imageRef = useRef<HTMLInputElement>(null), data = store.data
  const active = data?.notes.find(n => n.id === id)
  useEffect(() => { setDraft(active ? { ...active, tags: [...active.tags] } : null) }, [id])
  const error = (reason: unknown) => modal.error({ title: '笔记操作未完成', content: reason instanceof Error ? reason.message : String(reason) })
  const write = (note: LocalNote) => { if (!data) return; setDraft(note); const failure = store.commit({ ...data, notes: data.notes.map(n => n.id === note.id ? note : n) }); setSaveError(failure ?? '') }
  const update = (values: Partial<LocalNote>) => { if (draft) write({ ...draft, ...values, updated: Date.now() }) }
  const create = (title = '新笔记', text = '') => { if (!data || data.notes.length >= 500) return; const note: LocalNote = { id: toolId(), title, text, notebook: notebook === '全部笔记' || notebook === '回收站' ? '默认笔记本' : notebook, tags: [], pinned: false, trashed: false, updated: Date.now() }, failure = store.commit({ ...data, notes: [note, ...data.notes] }); if (failure) { error(failure); return }; setNotebook(note.notebook); setId(note.id); setDraft(note); setPreview(false) }
  const changeNote = (noteId: string) => { if (saveError) { error('当前草稿尚未保存，请先导出当前笔记或恢复本机存储，再切换笔记'); return }; setId(noteId) }
  const runExport = async (backup = false) => { try { if (backup) await exportToolFile('笔记备份.json', data ? JSON.stringify({ ...data, notes: data.notes.map(n => draft?.id === n.id ? draft : n) }, null, 2) : store.raw()); else if (draft) await exportToolFile(`${(draft.title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_')}.md`, draft.text) } catch (reason) { error(reason) } }
  const insertImage = async (file: File) => {
    try {
      if (!draft) return
      if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type) || file.size > 500_000) throw new Error('请选择500 KB以内的PNG、JPEG、WebP或GIF图片')
      const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('图片读取失败')); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file) })
      const image = new Image(); image.src = source; await image.decode()
      const next = `${draft.text}\n\n![${file.name.replace(/[\[\]\\\r\n]/g, '_')}](${source})\n`
      if (next.length > 1_000_000) throw new Error('插入后单篇笔记将超过1 MB，请压缩图片')
      update({ text: next }); setPreview(true)
    } catch (reason) { error(reason) }
  }
  if (!data) return <ToolRecovery title="笔记" reason={store.error} raw={store.raw} restore={raw => { try { return store.commit(parseNotes(raw)) } catch (reason) { return reason instanceof Error ? reason.message : String(reason) } }}/>
  const notebooks = [...new Set(data.notes.filter(n => !n.trashed).map(n => n.notebook || '默认笔记本'))]
  const notes = data.notes.filter(n => (notebook === '回收站' ? n.trashed : !n.trashed && (notebook === '全部笔记' || (n.notebook || '默认笔记本') === notebook)) && `${n.title}\n${n.text}\n${n.tags.join(' ')}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.updated - a.updated)
  return <div className="local-page workspace-tool" data-tool="notes" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (draft) write(draft) } }}>
    <header className="local-page__header"><div><h1>笔记</h1><p>Markdown、笔记本和标签；编辑后自动保存到本机。</p></div><div className="local-page__actions"><Button disabled={!!saveError} onClick={() => importRef.current?.click()}>导入</Button><Button onClick={() => void runExport(true)}>导出备份</Button><Button type="primary" disabled={data.notes.length >= 500 || !!saveError} onClick={() => create()}>新建笔记</Button></div></header>
    <input hidden ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void insertImage(file) }}/>
    <input hidden ref={importRef} type="file" accept=".md,.txt,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 5_000_000) throw new Error('文件超过5 MB'); const raw = await file.text(); if (/\.json$/i.test(file.name)) { const next = parseNotes(raw); modal.confirm({ title: '恢复笔记备份', content: '会替换当前本机笔记，请先导出备份。', onOk: () => { const failure = store.commit(next); if (failure) error(failure); else { setId(''); setDraft(null); setSaveError('') } } }) } else { if (raw.length > 1_000_000) throw new Error('单篇笔记超过1 MB'); create(file.name.replace(/\.[^.]+$/, '').slice(0,200), raw) } } catch (reason) { error(reason) } }}/>
    <div className="notes-workspace"><aside className="tool-card notes-list"><Input aria-label="搜索笔记" placeholder="搜索标题、正文或标签" value={search} onChange={e => setSearch(e.target.value)} allowClear/><Select aria-label="笔记本筛选" value={notebook} options={['全部笔记',...notebooks,'回收站'].map(name => ({ value: name, label: name }))} onChange={value => { if (saveError) error('请先导出尚未保存的草稿'); else setNotebook(value) }}/><div className="notes-list__items">{notes.map(n => <button key={n.id} type="button" aria-pressed={n.id === id} onClick={() => changeNote(n.id)}><strong>{n.pinned ? '★ ' : ''}{n.title || '未命名笔记'}</strong><span>{n.text.slice(0,100) || '空白笔记'}</span><small>{new Date(n.updated).toLocaleDateString()} · {n.tags.join(' / ')}</small></button>)}{!notes.length && <p className="local-page__muted">没有符合条件的笔记</p>}</div></aside>
      <section className="tool-card notes-editor">{draft ? <><div className="tool-toolbar"><Button aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? '继续编辑' : '预览'}</Button><Button onClick={() => update({ pinned: !draft.pinned })}>{draft.pinned ? '取消置顶' : '置顶'}</Button><Button onClick={() => imageRef.current?.click()}>插入图片</Button><Button onClick={() => void runExport()}>导出 Markdown</Button>{draft.trashed ? <><Button onClick={() => update({ trashed: false })}>恢复</Button><Button danger onClick={() => modal.confirm({ title: '永久删除笔记', content: '此操作无法恢复。', okType: 'danger', onOk: () => { const failure = store.commit({ ...data, notes: data.notes.filter(n => n.id !== draft.id) }); if (failure) error(failure); else { setId(''); setDraft(null) } } })}>永久删除</Button></> : <Button danger onClick={() => update({ trashed: true })}>移到回收站</Button>}</div>
      <Input aria-label="笔记标题" className="notes-title" value={draft.title} maxLength={200} onChange={e => update({ title: e.target.value })}/><div className="notes-metadata"><label>笔记本<Input aria-label="所属笔记本" value={draft.notebook} maxLength={80} onChange={e => update({ notebook: e.target.value })}/></label><label>标签（逗号分隔）<Input key={draft.id} aria-label="笔记标签" defaultValue={draft.tags.join('，')} onBlur={e => update({ tags: [...new Set(e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean))] })}/></label></div>
      {preview ? <article className="notes-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(url, key) => key === 'src' && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) && url.length < 700000 ? url : defaultUrlTransform(url)} components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>, img: ({ alt, src }) => <img alt={alt || '笔记图片'} src={src} loading="lazy" referrerPolicy="no-referrer"/> }}>{draft.text}</ReactMarkdown></article> : <Input.TextArea aria-label="笔记正文" className="notes-textarea" value={draft.text} maxLength={1_000_000} onChange={e => update({ text: e.target.value })}/>}<div role="status" className={saveError ? 'tool-save-error' : 'tool-save-status'}>{saveError ? `保存失败：${saveError}。当前草稿仍保留，可导出。` : '已保存到本机'} · {draft.text.length} 字符</div></> : <div className="tool-form-preview"><h2>记录想法与工作进展</h2><p>选择笔记，或新建一篇开始编辑。</p><Button type="primary" onClick={() => create()}>新建第一篇笔记</Button></div>}</section>
    </div>
  </div>
}
