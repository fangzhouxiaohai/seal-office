import type { 菜单节点, 菜单项 } from '../components/ContextMenu'
import { getShortcutBindings, readShortcutOverrides, shortcutDefinitions, type ShortcutScope } from './shortcuts'

/** 菜单显示实际生效的键位，禁用或改绑后不继续提示旧键。 */
export function withShortcutLabels(items: 菜单节点[], scope: ShortcutScope): 菜单节点[] {
  let overrides = {}
  try { overrides = readShortcutOverrides() } catch { /* 编辑器与菜单同时回退默认。 */ }
  const item = (value: 菜单项): 菜单项 => {
    const definition = shortcutDefinitions.find(entry => entry.scope === scope && entry.command === value.commandId)
    return definition ? { ...value, shortcut: getShortcutBindings(definition, overrides).join(' / ') || undefined } : value
  }
  return items.map(value => value.type === 'group' ? { ...value, 子项: value.子项.map(child => child.type === 'item' ? item(child) : child) } : value.type === 'item' ? item(value) : value)
}
