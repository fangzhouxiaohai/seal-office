import { cloudCall } from '../cloud/CloudProvider'
import { 桥接, type 演示资源条目 } from '../ipc/bridge'
import { htmlToDocxModel } from '../editor/commands'
import { joinWordModel, validateWordModel, type CollaborativeWord } from '../editor/wordCollaboration'
import { 重算工作簿, type Sheet } from '../sheet/model'
import { 导出为Xlsx } from '../sheet/sheetExport'
import { 校验协作工作簿 } from '../sheet/sheetRealtimeSource'
import { 构建演示保存模型 } from '../ppt/saveModel'
import { 收集演示资源标识 } from '../ppt/model/migrations'
import { readModel, Y } from './crdtModel'
import type { SharedFileBinding } from './fileAccess'
import type { CollaborationDownload } from './types'
import { diagramExtension, encodeDiagramFile, parseDiagramCloud } from '../localTools/diagramCloud'
const bytes = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0))
const base64 = (data: Uint8Array) => { let result = ''; for (let offset = 0; offset < data.length; offset += 32768) result += String.fromCharCode(...data.subarray(offset, offset + 32768)); return btoa(result) }
export type MaterializedDownload = CollaborationDownload & { live?: { type: 'word' | 'table' | 'ppt'; content: any; page?: CollaborativeWord['页面设置']; fingerprint?: string } }
/** A readonly download consumes the CRDT log, but never creates a new room. */
export async function materializeRealtime(file: CollaborationDownload, binding: Pick<SharedFileBinding, 'kind' | 'id' | 'nodeId'>): Promise<MaterializedDownload> {
  let snapshot: any
  try { snapshot = await cloudCall('realtimeSnapshot', { binding }) } catch (reason) { if ((reason as any)?.status === 501) return file; throw reason }
  if (!snapshot.initialized) return file
  const doc = new Y.Doc(); let after = snapshot.checkpoint ? snapshot.checkpointSeq : 0
  try {
    if (snapshot.seed) Y.applyUpdate(doc, bytes(snapshot.seed))
    if (snapshot.checkpoint) Y.applyUpdate(doc, bytes(snapshot.checkpoint))
    while (true) {
      for (const update of snapshot.updates || []) { Y.applyUpdate(doc, bytes(update.update)); after = Math.max(after, update.seq) }
      if (after >= snapshot.head) break
      snapshot = await cloudCall('realtimePull', { binding, after })
    }
    const model = readModel<any>(doc), type = snapshot.type as 'word' | 'table' | 'ppt' | 'mindmap' | 'flowchart'
    if (type === 'mindmap' || type === 'flowchart') {
      const valid = parseDiagramCloud(model, type === 'mindmap' ? '脑图' : '流程图'), data = encodeDiagramFile(valid)
      const name = `${valid.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')}.${diagramExtension(valid.type)}`, path = file.path.replace(/[^\\/]+$/, name)
      const previous = path === file.path ? await 桥接.readFile(path) : null
      const written = await 桥接.saveToFile(path, data, '二进制', previous?.成功 ? previous.文件指纹 : undefined)
      if (!written.成功) throw new Error(written.错误 || '最新云图形写入本机失败')
      await cloudCall('realtimeState', { binding, state: base64(Y.encodeStateAsUpdate(doc)), after })
      return { ...file, path, name, data }
    }
    let content: any, page: CollaborativeWord['页面设置'] | undefined, result: any
    if (type === 'word') {
      const invalid = validateWordModel(model); if (invalid) throw new Error(invalid)
      content = joinWordModel(model); page = model.页面设置
      const intermediate = htmlToDocxModel(content, page)
      if (intermediate.未覆盖.length) throw new Error('实时文档含尚不能完整导出的结构，请在原编辑器中保留副本')
      result = await 桥接.office.writeDocx(intermediate)
    } else if (type === 'table') {
      const invalid = 校验协作工作簿(model); if (invalid) throw new Error(invalid)
      content = 重算工作簿(model as Sheet[]); result = await 桥接.office.writeXlsx(导出为Xlsx(content))
    } else if (type === 'ppt') {
      if (!model?.deck?.幻灯片列表) throw new Error('实时演示结构无效')
      // The seed can precede the first image edit. Its original file still owns
      // those asset bytes; combine them with later encrypted CRDT resources.
      const original = await 桥接.readFile(file.path)
      if (!original.成功 || typeof original.内容 !== 'string') throw new Error(original.错误 || '演示源文件读取失败')
      const imported = await 桥接.office.readPptx(original.内容)
      if (!imported.成功) throw new Error(imported.错误 || '演示源资源读取失败')
      const resources: 演示资源条目[] = Object.values({ ...Object.fromEntries((imported.资源条目 || []).map((item: 演示资源条目) => [item.标识, item])), ...(model.resources || {}) }), restored = resources.length ? await 桥接.presentationResources.restore(resources) : { 成功: true }
      if (!restored.成功) throw new Error(restored.错误 || '实时演示资源恢复失败')
      content = { ...model.deck, 当前索引: 0 }
      const ids = 收集演示资源标识(content), available = new Map(resources.map(item => [item.标识, item]))
      if (ids.some(id => !available.has(id))) throw new Error('实时演示含缺失资源，下载已停止；原始文件仍保留')
      result = await 桥接.office.writePptx(构建演示保存模型(content, ids.map(id => available.get(id)!)))
    } else throw new Error('实时文档类型不受支持')
    if (!result?.成功 || !result.数据) throw new Error(result?.错误 || '实时文档导出失败')
    const extension = { word: 'docx', table: 'xlsx', ppt: 'pptx' }[type], name = file.name.replace(/\.[^.\\/]+$/, '') + '.' + extension, path = file.path.replace(/[^\\/]+$/, name)
    const previous = path === file.path ? await 桥接.readFile(path) : null
    const written = await 桥接.saveToFile(path, result.数据, '二进制', previous?.成功 ? previous.文件指纹 : undefined)
    if (!written.成功) throw new Error(written.错误 || '最新实时文档写入本机失败')
    // The exact CRDT identifiers travel into the newly opened editor via its
    // safe cache; it never seeds a second document from an OOXML re-import.
    await cloudCall('realtimeState', { binding, state: base64(Y.encodeStateAsUpdate(doc)), after })
    return { ...file, path, name, data: result.数据, live: { type, content, page, fingerprint: written.文件指纹 } }
  } finally { doc.destroy() }
}
