import { useEffect, useRef } from 'react'
import { 桥接, type 演示资源条目 } from '../ipc/bridge'
import type { 演示文稿 } from '../ppt/deck'
import { 收集演示资源标识 } from '../ppt/model/migrations'
import { useRealtimeDocument } from './useRealtimeDocument'

interface PresentationState { deck: 演示文稿; resources: Record<string, 演示资源条目> }
const source = (model: 演示文稿): 演示文稿 => ({ ...model, 当前索引: 0 })
export function useRealtimePresentation(documentId: string | null, model: 演示文稿, onRemote: (model: 演示文稿) => void) {
  const latest = useRef({ model, onRemote }); latest.current = { model, onRemote }
  const assets = useRef<{ id: string | null; values: Record<string, 演示资源条目>; restored: Set<string> }>({ id: documentId, values: {}, restored: new Set() })
  if (assets.current.id !== documentId) assets.current = { id: documentId, values: {}, restored: new Set() }
  const generation = useRef(0), composing = useRef(false), deferred = useRef<PresentationState | null>(null), observed = useRef(source(model)), draftBase = useRef<PresentationState | null>(null), release = useRef<(() => void) | null>(null)
  const resourceOwner = 'realtime:' + documentId
  useEffect(() => () => { release.current?.(); void 桥接.presentationResources.release(resourceOwner) }, [resourceOwner])
  const applyRemote = (state: PresentationState) => {
    if (composing.current) { deferred.current = state; return }
    const currentGeneration = ++generation.current
    assets.current.values = { ...assets.current.values, ...state.resources }
    const missing = Object.values(state.resources).filter(item => !assets.current.restored.has(item.标识))
    const apply = () => { if (currentGeneration !== generation.current) return; const next = { ...state.deck, 当前索引: Math.min(latest.current.model.当前索引, Math.max(0, state.deck.幻灯片列表.length - 1)) }; observed.current = source(next); latest.current.onRemote(next) }
    if (!missing.length) apply()
    else void 桥接.presentationResources.restore(missing).then(async result => { if (!result.成功) throw new Error(result.错误 || '远端演示资源恢复失败'); missing.forEach(item => assets.current.restored.add(item.标识)); const kept = await 桥接.presentationResources.sync(resourceOwner, Object.keys(assets.current.values)); if (!kept.成功) throw new Error(kept.错误 || '协作资源保留失败'); apply() }).catch(error => realtime.reportError(error))
  }
  const realtime = useRealtimeDocument<PresentationState>({ documentId, type: 'ppt', model: { deck: source(model), resources: assets.current.values }, onRemote: applyRemote,
    validate: state => {
      if (!state?.deck || !Array.isArray(state.deck.幻灯片列表)) return '演示内容结构无效'
      for (const page of state.deck.幻灯片列表) for (const box of page.文本框列表 || []) if (box.片段列表?.length && box.片段列表.map(run => run.文本).join('') !== box.text) return '同一文本框的文字和格式片段发生冲突'
      return null
    } })
  const publish = (next: 演示文稿, base: 演示文稿 = observed.current): Promise<void> => {
    observed.current = source(next)
    if (!realtime.active) return Promise.resolve()
    const before: PresentationState = draftBase.current || { deck: source(base), resources: { ...assets.current.values } }, missing = 收集演示资源标识(next).filter(id => !assets.current.values[id])
    const submit = () => realtime.publish({ deck: source(next), resources: { ...assets.current.values } }, before)
    if (!missing.length) return submit().catch(error => { realtime.reportError(error); throw error })
    const preserve = realtime.retainBaseline(before)
    return 桥接.presentationResources.export(missing).then(async result => { if (!result.成功 || !result.条目) throw new Error(result.错误 || '协作资源准备失败'); for (const item of result.条目) { assets.current.values[item.标识] = item; assets.current.restored.add(item.标识) } const kept = await 桥接.presentationResources.sync(resourceOwner, Object.keys(assets.current.values)); if (!kept.成功) throw new Error(kept.错误 || '协作资源保留失败'); return submit() }).catch(error => { realtime.reportError(error); throw error }).finally(preserve)
  }
  useEffect(() => {
    const next = source(model), before = observed.current
    if (JSON.stringify(next) !== JSON.stringify(before)) { observed.current = next; if (realtime.active && !composing.current) void publish(next, before).catch(() => {}) }
  }, [model, realtime.active])
  return { ...realtime, publish,
    getSnapshot: () => ({ ...realtime.getSnapshot().deck, 当前索引: latest.current.model.当前索引 }),
    beginComposition: () => { composing.current = true; draftBase.current = realtime.getSnapshot(); release.current?.(); release.current = realtime.retainBaseline(draftBase.current) },
    endComposition: async (draft: 演示文稿) => { try { await publish(draft, draftBase.current?.deck); composing.current = false; deferred.current = null; applyRemote(realtime.getSnapshot()) } finally { composing.current = false; draftBase.current = null; release.current?.(); release.current = null } },
    isComposing: () => composing.current }
}
