import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { useCloud } from '../cloud/CloudProvider'
import { bindingEvent, getFileBinding, restoreFileBinding } from './fileAccess'
import { createRealtimeClient, type RealtimeClient, type RealtimeState } from './realtimeClient'

export const realtimeEvent = 'seal-realtime-status'
const clients = new Map<string, RealtimeClient<any>>()
export const getRealtimeClient = (documentId: string) => clients.get(documentId)
const idle: RealtimeState = { status: 'closed', connected: false, readOnly: false, pending: 0, peers: [] }
export interface RealtimeDocumentOptions<T> { documentId: string | null; type: 'word' | 'table' | 'ppt'; model: T; onRemote: (model: T) => void; readOnly?: boolean; validate?: (model: T) => string | null }
export function useRealtimeDocument<T>(options: RealtimeDocumentOptions<T>) {
  const store = useAppStore(), cloud = useCloud(), latest = useRef(options), client = useRef<RealtimeClient<T> | null>(null)
  latest.current = options
  const [state, setState] = useState<RealtimeState>(idle), [bindingVersion, setBindingVersion] = useState(0)
  useEffect(() => { const update = () => setBindingVersion(version => version + 1); window.addEventListener(bindingEvent, update); return () => window.removeEventListener(bindingEvent, update) }, [])
  const documentId = options.documentId, path = documentId ? store.文档路径[documentId] || store.documents.find(item => item.id === documentId)?.来源路径 : undefined
  const binding = path ? getFileBinding(path) : undefined
  useEffect(() => {
    if (!path || binding || !cloud.state.unlocked || !cloud.state.account) return
    let canceled = false
    void cloud.call('realtimeFileBinding', { path }).then(value => { if (!canceled && value) restoreFileBinding(path, value) }).catch(() => {})
    return () => { canceled = true }
  }, [path, binding, bindingVersion, cloud.state.unlocked, cloud.state.account?.id])
  const active = Boolean(binding && documentId && cloud.state.unlocked && binding.accountId === cloud.state.account?.id)
  const key = active ? `${documentId}:${cloud.state.account?.id}:${binding?.kind}:${binding?.id}:${binding?.nodeId || ''}` : ''
  useEffect(() => {
    setState(idle)
    if (!key || !documentId || !binding) return
    const instance = createRealtimeClient<T>({ binding, type: latest.current.type, model: latest.current.model, call: cloud.call,
      onModel: model => latest.current.onRemote(model), validate: model => latest.current.validate?.(model) ?? null,
      onStatus: value => { setState(value); window.dispatchEvent(new Event(realtimeEvent)) } })
    client.current = instance; clients.set(documentId, instance); window.dispatchEvent(new Event(realtimeEvent))
    return () => { client.current = null; clients.delete(documentId); void instance.close(); window.dispatchEvent(new Event(realtimeEvent)) }
    // The identity, rather than a callback or a newly allocated model, owns the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { ...state, active: active && state.status !== 'unsupported', readOnly: active && (state.readOnly || Boolean(options.readOnly) || binding?.editable === false),
    publish: (next: T, base?: T) => client.current ? client.current.publish(next, base) : Promise.resolve(),
    flush: () => client.current ? client.current.flush() : Promise.resolve(),
    undo: () => client.current?.undo() ?? false, redo: () => client.current?.redo() ?? false,
    getSnapshot: () => client.current?.current ?? latest.current.model,
    retainBaseline: (model?: T) => client.current?.retainBaseline(model) ?? (() => {}),
    reportError: (reason: unknown) => client.current?.reportError(reason),
    stopCapturing: () => client.current?.stopCapturing(),
    setCursor: (cursor: unknown) => client.current?.setCursor(cursor) }
}
