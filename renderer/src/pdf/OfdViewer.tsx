import { useEffect, useRef, useState } from 'react'
import { Alert, App as AntdApp, Button, InputNumber, Spin } from 'antd'
import JSZip from 'jszip'
import { 净化OFD页面, OFD打印页面 } from './ofdPages'
import { 桥接 } from '../ipc/bridge'
import { useAppStore } from '../store'
import { 通过对话框打开文件 } from '../fileOpen'
import PrintPreview from '../components/PrintPreview'
import './ofd.css'

export async function 检查OFD文件(数据: string) {
  const 字节 = Uint8Array.from(atob(数据), c => c.charCodeAt(0))
  if (字节.byteLength > 100 * 1024 * 1024) throw new Error('OFD 文件超过 100 MiB，请拆分后打开')
  const zip = await JSZip.loadAsync(字节)
  if (!zip.file('OFD.xml')) throw new Error('文件缺少 OFD.xml，无法作为 OFD 打开')
  let 总大小 = 0
  for (const entry of Object.values(zip.files)) {
    const 内部 = entry as typeof entry & { _data?: { uncompressedSize?: number }; unsafeOriginalName?: string }
    总大小 += 内部._data?.uncompressedSize ?? 0
    if (总大小 > 256 * 1024 * 1024 || 内部.unsafeOriginalName?.split(/[\\/]/).includes('..')) throw new Error('OFD 包内容过大或包含无效资源路径')
  }
  const root = new DOMParser().parseFromString(await zip.file('OFD.xml')!.async('string'), 'application/xml')
  const 页面尺寸: Array<[number, number]> = []
  const roots = Array.from(root.getElementsByTagNameNS('*', 'DocRoot'))
  if (!roots.length) throw new Error('OFD 文档根路径无效')
  for (const node of roots) {
  const docPath = node.textContent?.trim()
  if (!docPath || !zip.file(docPath)) throw new Error('OFD 文档根路径无效')
  const doc = new DOMParser().parseFromString(await zip.file(docPath)!.async('string'), 'application/xml')
  const common = doc.getElementsByTagNameNS('*', 'CommonData')[0]?.getElementsByTagNameNS('*', 'PhysicalBox')[0]?.textContent
  const dir = docPath.slice(0, docPath.lastIndexOf('/') + 1)
  for (const page of Array.from(doc.getElementsByTagNameNS('*', 'Pages')[0]?.children ?? [])) {
    const pageFile = zip.file(dir + page.getAttribute('BaseLoc'))
    if (!pageFile) throw new Error('OFD 页面资源缺失')
    const pageXML = new DOMParser().parseFromString(await pageFile.async('string'), 'application/xml')
    const box = (pageXML.getElementsByTagNameNS('*', 'PhysicalBox')[0]?.textContent ?? common ?? '').trim().split(/\s+/).map(Number)
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('OFD 纸张尺寸无效')
    页面尺寸.push([box[2], box[3]])
  }
  }
  return { 字节, 页面尺寸 }
}

export default function OfdViewer({ 名称, 数据 }: { 名称: string; 数据: string }) {
  const { message, modal } = AntdApp.useApp()
  const { createDoc, 查找保存路径占用 } = useAppStore()
  const 容器 = useRef<HTMLDivElement>(null)
  const [缩放, set缩放] = useState(150)
  const [页数, set页数] = useState(0)
  const [加载中, set加载中] = useState(true)
  const [错误, set错误] = useState('')
  const [处理中, set处理中] = useState(false)
  const [打印内容, set打印内容] = useState<string | null>(null)
  const 打印HTML = useRef('')
  useEffect(() => {
    let 取消 = false
    set加载中(true); set错误(''); set页数(0); 打印HTML.current = ''
    void (async () => {
      const { 字节, 页面尺寸 } = await 检查OFD文件(数据)
      const { parseOfdDocument, renderOfd } = await import('@ycsx/ofdjs')
      const 解析结果 = await new Promise<import('@ycsx/ofdjs').OFDDocument | import('@ycsx/ofdjs').OFDDocument[]>((resolve, reject) =>
        parseOfdDocument({ ofd: 字节.buffer as ArrayBuffer, success: resolve, fail: reject }))
      // The distributed parser returns an array of DocBody documents although its declaration describes one object.
      const 文档列表 = Array.isArray(解析结果) ? 解析结果 : [解析结果]
      const 总页数 = 文档列表.reduce((总, 文档) => 总 + (文档.pages?.length ?? 0), 0)
      if (!总页数 || 总页数 > 500) throw new Error('OFD 没有有效页面或超过 500 页，请拆分后打开')
      const 图片源 = new Set<string>()
      const 收集 = (值: unknown) => {
        if (typeof 值 === 'string' && /^data:image\//i.test(值)) 图片源.add(值)
        else if (Array.isArray(值)) 值.forEach(收集)
        else if (值 && typeof 值 === 'object') Object.values(值).forEach(收集)
      }
      文档列表.forEach(文档 => { 收集(文档.multiMediaResObj); 收集((文档 as unknown as { stampAnnot: unknown }).stampAnnot) })
      await Promise.all([...图片源].map(async src => { const img = new Image(); img.src = src; await img.decode() }))
      if (取消) return
      const 页面 = 文档列表.flatMap(文档 => renderOfd(794 * 缩放 / 100, 文档))
      if (!页面.length) throw new Error('OFD 页面渲染失败')
      await document.fonts?.ready
      await Promise.all(页面.flatMap(page => Array.from(page.querySelectorAll('img'))).map(img => img.decode()))
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const 安全页面 = 净化OFD页面(页面)
      if (取消 || !容器.current) return
      容器.current.innerHTML = 安全页面.join('')
      set页数(页面.length)
      打印HTML.current = OFD打印页面(页面, 安全页面, 页面尺寸, 缩放)
    })().catch(err => { if (!取消) set错误(err instanceof Error ? err.message : 'OFD 解析失败') }).finally(() => { if (!取消) set加载中(false) })
    return () => { 取消 = true }
  }, [数据, 缩放])
  const 执行保存 = async (导出PDF: boolean) => {
    set处理中(true)
    try {
      const 默认名 = 名称.replace(/\.ofd$/i, 导出PDF ? '.pdf' : ' 副本.ofd')
      const 原路径 = await 桥接.showSaveDialog(默认名, 导出PDF ? 'pdf' : 'ofd')
      if (!原路径) return
      const 扩展 = 导出PDF ? '.pdf' : '.ofd'
      const 路径 = /\.[^\\/]+$/.test(原路径) ? 原路径 : 原路径 + 扩展
      if (!路径.toLowerCase().endsWith(扩展)) throw new Error(`请选择 ${扩展.toUpperCase()} 文件路径`)
      if (查找保存路径占用(null, 路径)) throw new Error('目标路径已被打开的标签占用，请选择其他名称')
      const 结果 = 导出PDF ? await 桥接.pdf.exportToPath(打印HTML.current, 路径) :
        await 桥接.saveToFile(路径, Uint8Array.from(atob(数据), c => c.charCodeAt(0)), '二进制')
      if (!结果.成功) throw new Error(结果.错误 || '文件写入失败')
      message.success(导出PDF ? 'PDF 已导出；原 OFD 文件与签章未修改' : 'OFD 副本已保存，完整保留原文件字节')
    } catch (err) { modal.error({ title: 'OFD 保存失败', content: err instanceof Error ? err.message : '保存失败' }) }
    finally { set处理中(false) }
  }
  return <section className="ofd-viewer">
    <div className="ofd-viewer__toolbar">
      <Button onClick={() => void 通过对话框打开文件(message, modal, (类型, 内容, 路径, 警告, 页面设置, 文件指纹) => createDoc(类型, 内容, { 路径, 警告, 页面设置, 文件指纹 }))}>打开文档</Button>
      <Button disabled={加载中 || Boolean(错误)} loading={处理中} onClick={() => void 执行保存(false)}>保存 OFD 副本</Button>
      <Button disabled={加载中 || Boolean(错误)} loading={处理中} onClick={() => void 执行保存(true)}>导出 PDF</Button>
      <Button disabled={加载中 || Boolean(错误)} onClick={() => set打印内容(打印HTML.current)}>打印预览</Button>
      <label>缩放 <InputNumber aria-label="OFD 缩放" min={50} max={250} step={25} value={缩放} onChange={值 => 值 !== null && set缩放(值)} /> %</label>
      <span>{页数} 页</span>
    </div>
    <Alert type="info" showIcon message="OFD 版式阅读：支持预览、打印和保存完整副本；导出 PDF 用于后续编辑，签章的证书有效性需在专用验签软件核验。" />
    {错误 && <Alert type="error" showIcon message="OFD 打开失败" description={错误} />}
    {加载中 && <Spin tip="正在加载 OFD 页面" />}
    <div className="ofd-viewer__pages" ref={容器} hidden={加载中 || Boolean(错误)} />
    {打印内容 && <PrintPreview 内容={打印内容} 格式="html" 标题={名称} onClose={() => set打印内容(null)} />}
  </section>
}
