import { useEffect, useRef, useState } from 'react'
import { Alert, App as AntdApp, Button, Input, Select } from 'antd'
import { findShortcutConflicts, getShortcutBindings, readShortcutOverrides, resetShortcutOverrides, saveShortcutOverrides, shortcutDefinitions, shortcutFromEvent, shortcutId, shortcutScopeNames, SHORTCUT_CHANGED_EVENT, SHORTCUT_STORAGE_KEY, type ShortcutOverrides, type ShortcutScope } from './shortcuts'
import './shortcuts.css'

/** 复用设置中心卡片和控件；改绑先在草稿中检查冲突，明确应用后持久化。 */
export default function ShortcutSettingsCard() {
  const { message } = AntdApp.useApp()
  const [scope, setScope] = useState<ShortcutScope>('word')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [overrides, setOverrides] = useState<ShortcutOverrides>({})
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const load = () => {
    try { setOverrides(readShortcutOverrides()); setError(''); setDirty(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法读取快捷键设置'); setDirty(false) }
  }
  useEffect(() => {
    load()
    // 本窗口的应用/整体恢复默认立即同步；另一窗口写入时保留当前未应用的草稿。
    const changed = () => load()
    const storage = (event: StorageEvent) => { if (!dirtyRef.current && (event.key === SHORTCUT_STORAGE_KEY || event.key === null)) load() }
    window.addEventListener(SHORTCUT_CHANGED_EVENT, changed)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(SHORTCUT_CHANGED_EVENT, changed); window.removeEventListener('storage', storage) }
  }, [])
  const conflicts = findShortcutConflicts(overrides)
  const visible = shortcutDefinitions.filter(definition => definition.scope === scope && `${definition.label} ${definition.command} ${getShortcutBindings(definition, overrides).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))
  const pageSize = 24, pages = Math.max(1, Math.ceil(visible.length / pageSize)), currentPage = Math.min(page, pages)
  const change = (id: string, shortcuts: string[] | null) => {
    setOverrides(current => {
      const next = { ...current }
      if (shortcuts === null) delete next[id]
      else next[id] = shortcuts
      return next
    })
    setDirty(true)
  }
  const save = () => {
    try {
      saveShortcutOverrides(overrides)
      setDirty(false)
      message.success('快捷键已保存并立即生效')
    } catch (reason) { message.error(reason instanceof Error ? reason.message : '快捷键保存失败，请检查本机存储空间和权限') }
  }
  const restoreAll = () => {
    try { resetShortcutOverrides(); setOverrides({}); setDirty(false); setError(''); message.success('已恢复所有默认快捷键') }
    catch (reason) { message.error(reason instanceof Error ? reason.message : '快捷键恢复失败，请检查本机存储空间和权限') }
  }
  return <>
    <h2 className="settings-group__title">快捷键</h2>
    <div className="settings-wps-card seal-shortcut-settings">
      <div className="settings-wps-row">
        <div className="settings-wps-row__text">
          <div className="settings-wps-row__title">自定义办公快捷键</div>
          <div className="settings-wps-row__desc" id="seal-shortcut-help">点击键位框后按下组合键；同一文档类型不能重复。Tab 切换控件，清除可禁用命令的快捷键。外接 Mac 键盘的 ⌘ 与 Ctrl 等效。</div>
        </div>
        <Button size="small" onClick={restoreAll}>恢复全部默认键位</Button>
      </div>
      {error ? <div className="seal-shortcut-settings__notice"><Alert type="error" showIcon message="快捷键设置读取失败" description={`${error} 当前编辑器使用默认键位；恢复全部默认键位后可重新配置。`} /></div> : null}
      <div className="settings-wps-row seal-shortcut-settings__filters">
        <Select<ShortcutScope> aria-label="快捷键文档类型" value={scope} onChange={value => { setScope(value); setPage(1) }} options={(Object.keys(shortcutScopeNames) as ShortcutScope[]).map(value => ({ value, label: shortcutScopeNames[value] }))} />
        <Input type="search" aria-label="搜索快捷键" placeholder="搜索命令或键位" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
      </div>
      <div className="seal-shortcut-settings__list" aria-label={`${shortcutScopeNames[scope]}快捷键列表`}>
        {visible.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(definition => {
          const id = shortcutId(definition)
          const bindings = getShortcutBindings(definition, overrides)
          const conflict = conflicts.find(item => item.scope === scope && item.commands.includes(definition.command))
          return <div className="settings-wps-row" key={id}>
            <div className="settings-wps-row__text">
              <label className="settings-wps-row__title" htmlFor={`shortcut-${id}`}>{definition.label}</label>
              <div className="settings-wps-row__desc">默认：{definition.defaults.join(' / ') || '未分配'}{overrides[id] ? ' · 已自定义' : ''}</div>
              {conflict ? <div className="seal-shortcut-settings__error" id={`conflict-${id}`}>{conflict.shortcut} 与「{shortcutDefinitions.find(item => item.scope === scope && item.command === conflict.commands.find(command => command !== definition.command))?.label}」冲突</div> : null}
            </div>
            <div className="seal-shortcut-settings__binding">
              <Input id={`shortcut-${id}`} aria-label={`${definition.label}快捷键`} aria-describedby={conflict ? `conflict-${id}` : 'seal-shortcut-help'} aria-invalid={Boolean(conflict)} status={conflict ? 'error' : undefined} readOnly data-shortcut-recorder="true" disabled={Boolean(error)} value={bindings.join(' / ')} placeholder="未分配，按组合键设置" onKeyDown={event => {
                if (event.key === 'Tab' || event.key === 'Escape' && scope !== 'slideshow') return
                // 输入法转换、修饰键本身不构成可记录的快捷键。
                event.preventDefault()
                event.stopPropagation()
                const shortcut = shortcutFromEvent(event,scope)
                if (shortcut) change(id, [shortcut])
              }} />
              <Button size="small" disabled={Boolean(error) || !bindings.length} aria-label={`清除${definition.label}快捷键`} onClick={() => change(id, [])}>清除</Button>
              <Button size="small" disabled={Boolean(error) || !overrides[id]} aria-label={`恢复${definition.label}默认快捷键`} onClick={() => change(id, null)}>默认</Button>
            </div>
          </div>
        })}
        {!visible.length ? <div className="settings-wps-row">没有匹配的快捷键</div> : null}
      </div>
      {pages > 1 ? <div className="settings-wps-row seal-shortcut-settings__footer" aria-label="快捷键分页">
        <span className="settings-wps-row__desc">共 {visible.length} 个命令 · 第 {currentPage} / {pages} 页</span>
        <div><Button size="small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</Button> <Button size="small" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>下一页</Button></div>
      </div> : null}
      <div className="settings-wps-row seal-shortcut-settings__footer">
        <span role="status" className={conflicts.length ? 'seal-shortcut-settings__error' : 'settings-wps-row__desc'}>{conflicts.length ? `有 ${conflicts.length} 组键位冲突，请修改或恢复默认后再应用` : dirty ? '有未应用的修改' : '使用已保存的快捷键；输入框和输入法保持原有行为'}</span>
        <Button type="primary" size="small" disabled={!dirty || Boolean(error) || conflicts.length > 0} onClick={save}>应用快捷键</Button>
      </div>
    </div>
  </>
}
