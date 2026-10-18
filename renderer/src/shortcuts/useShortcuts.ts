import { useEffect, useRef, useState } from 'react'
import { dispatchShortcut, getShortcutBindings, readShortcutOverrides, shortcutDefinitions, SHORTCUT_CHANGED_EVENT, SHORTCUT_STORAGE_KEY, type ShortcutScope } from './shortcuts'

/** 使用最新命令闭包；仍使用冒泡阶段，让输入控件与放映视图先处理按键。 */
export function useShortcuts(scope: ShortcutScope, execute: (command: string, argument?: string) => boolean | void, enabled = true): void {
  const latest = useRef(execute)
  latest.current = execute
  useEffect(() => {
    if (!enabled) return
    const handle = (event: KeyboardEvent) => { dispatchShortcut(event, scope, (command, argument) => argument === undefined ? latest.current(command) : latest.current(command, argument)) }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [scope, enabled])
}

export function useShortcutLabel(scope: ShortcutScope) {
  const read=()=>{try{return readShortcutOverrides()}catch{return {}}}
  const [overrides,setOverrides]=useState(read)
  useEffect(()=>{
    const changed=()=>setOverrides(read()),storage=(event:StorageEvent)=>{if(event.key===null||event.key===SHORTCUT_STORAGE_KEY)changed()}
    window.addEventListener(SHORTCUT_CHANGED_EVENT,changed);window.addEventListener('storage',storage)
    return()=>{window.removeEventListener(SHORTCUT_CHANGED_EVENT,changed);window.removeEventListener('storage',storage)}
  },[])
  return (command:string)=>{const definition=shortcutDefinitions.find(item=>item.scope===scope&&item.command===command);const keys=definition?getShortcutBindings(definition,overrides):[];return keys.length?`（${keys.join(' / ')}）`:''}
}
