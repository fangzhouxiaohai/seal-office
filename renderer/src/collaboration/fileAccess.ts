import { App } from 'antd'
import { useAppStore } from '../store'
import { 通过路径打开文件, 记录最近文档 } from '../fileOpen'
import { cloudCall } from '../cloud/CloudProvider'
import { 桥接 } from '../ipc/bridge'
import type { CollaborationDownload } from './types'
import { materializeRealtime, type MaterializedDownload } from './materializeRealtime'
import { decodeDiagramFile, diagramFileType, diagramType, openDiagramCloud, requestDiagramOpen, requestLocalDiagramOpen, type DiagramCloudEntry } from '../localTools/diagramCloud'
import { createDiagramProject, DiagramProjectStore } from '../localTools/diagramProjects'

export interface SharedFileBinding { kind: 'share' | 'team' | 'node'; id: string; nodeId?: string; version: number; name: string; editable: boolean; accountId: string }
const bindings = new Map<string, SharedFileBinding>()
export const bindingEvent = 'seal-collaboration-binding'
export const getFileBinding = (path: string) => bindings.get(path)
export function restoreFileBinding(path: string, binding: SharedFileBinding) { bindings.set(path, binding); window.dispatchEvent(new Event(bindingEvent)) }

export function useCollaborationFiles(accountId: string) {
  const store = useAppStore(), { message, modal } = App.useApp()
  const open = async (download: () => Promise<CollaborationDownload>, binding?: Omit<SharedFileBinding, 'version' | 'name' | 'accountId'>) => {
    const original = await download(), diagram = diagramFileType(original.name)
    if (diagram) {
      if (binding) {
        const entry: DiagramCloudEntry = { type: diagramType(diagram), title: original.name.replace(/\.(sealmind|sealflow)$/i, ''), name: original.name, binding: { ...binding, version: original.version, name: original.name, accountId } }
        const model = await openDiagramCloud(entry)
        requestDiagramOpen(entry, model)
      } else {
        let data = original.data
        if (!data) { const file = await 桥接.readFile(original.path); if (!file.成功 || typeof file.内容 !== 'string') throw new Error(file.错误 || '图形文件读取失败'); data = file.二进制 ? file.内容 : btoa(Array.from(new TextEncoder().encode(file.内容), byte => String.fromCharCode(byte)).join('')) }
        const model = decodeDiagramFile(data, diagram), local = new DiagramProjectStore(diagram), saved = local.write(createDiagramProject(diagram, model.title, model.graph), null)
        if (saved.pending) throw new Error(saved.pending.error)
        requestLocalDiagramOpen(diagram, saved.project.id)
      }
      store.setModule('home'); store.setNavKey(diagram === '脑图' ? 'mindmap' : 'flow'); return
    }
    const result: MaterializedDownload = binding ? await materializeRealtime(original, binding) : original
    if (!result.path) throw new Error('云端未返回本机副本路径，请更新云服务后重试')
    let opened: boolean
    if (result.live) {
      const live = result.live
      store.createDoc(live.type, live.content, { 路径: result.path, 页面设置: live.page, 文件指纹: live.fingerprint, 警告: live.warnings })
      await 记录最近文档(result.path, result.name, live.type); opened = true
    } else opened = await 通过路径打开文件(result.path, message, modal, (type, content, path, warnings, page, fingerprint) => store.createDoc(type, content, { 路径: path, 警告: warnings, 页面设置: page, 文件指纹: fingerprint }))
    if (!opened) throw new Error('无法打开下载的副本，请检查文件格式')
    if (binding) {
      const details = { ...binding, version: result.version, name: result.name, accountId }
      restoreFileBinding(result.path, details)
      await cloudCall('realtimeBindFile', { path: result.path, binding: details })
    }
    store.refreshRecents()
  }
  const download = async (get: () => Promise<CollaborationDownload>, binding?: Pick<SharedFileBinding, 'kind' | 'id' | 'nodeId'>) => {
    const original = await get(), result = binding ? await materializeRealtime(original, binding) : original
    if (!result.path) throw new Error('下载未返回文件路径')
    const reveal = await 桥接.revealInFolder(result.path)
    if (!reveal.成功) throw new Error(reveal.错误 || '文件已下载，但无法打开本机位置')
  }
  return { open, download }
}

export async function synchronizeBinding(path: string, binding: SharedFileBinding) {
  if (binding.kind === 'node') throw new Error('云端图形请使用实时同步入口；不能用整文件覆盖实时内容')
  const file = await 桥接.readFile(path)
  if (!file.成功 || typeof file.内容 !== 'string') throw new Error(file.错误 || '无法读取已保存的本机副本')
  const bytes = file.二进制 ? file.内容 : btoa(Array.from(new TextEncoder().encode(file.内容), byte => String.fromCharCode(byte)).join(''))
  const result = await cloudCall<{ version: number }>(binding.kind === 'share' ? 'shareSave' : 'teamSave', binding.kind === 'share'
    ? { id: binding.id, data: bytes, expectedVersion: binding.version }
    : { id: binding.id, nodeId: binding.nodeId, name: binding.name, data: bytes, expectedVersion: binding.version })
  bindings.set(path, { ...binding, version: result.version })
  window.dispatchEvent(new Event(bindingEvent))
}
