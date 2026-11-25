import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Button, Modal } from 'antd'
import JSZip from 'jszip'
import { cloudCall } from '../CloudProvider'
import { useSettings } from '../../store/settingsStore'
import { 查找文档格式 } from '../../fileFormats'
import LoadingState from '../../components/LoadingState'
import { 预览方式, 预览最大字节, type 预览引擎 } from './previewFormats'
import { 修补OOXML命名空间 } from './ooxmlNamespaceRepair'
import { 预览错误说明, 生成预览HTML, 保存文本文件, 转Base64 } from './previewOutput'
import { 桥接 } from '../../ipc/bridge'
import './cloudPreview.css'

// 移动原生包受云打包 60 MB 限制，编译期常量使该分支连同依赖一起被剔除。
const FileViewerEngine = __SEAL_PLATFORM__ === 'android' || __SEAL_PLATFORM__ === 'harmony' || __SEAL_PLATFORM__ === 'ios' ? null : lazy(() => import('./fileViewerEngine'))

const 媒体类型: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif', apng: 'image/apng',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/ogg', weba: 'audio/webm',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', m4v: 'video/mp4',
}
const 扩展名 = (名称: string) => (名称.match(/\.([^./\\]+)$/)?.[1] ?? '').toLowerCase()
const 文本解码 = (字节: Uint8Array) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(字节) } catch { return new TextDecoder('gb18030').decode(字节) } }

interface Props {
  节点: { id: string; name: string; version?: string }
  大小?: number
  引擎: 预览引擎
  onClose: () => void
  on用编辑器打开: () => void
  on下载: () => void
}

/** 云文件预览：在本机解密后显示，文件内容不发送给任何第三方服务。 */
export default function CloudPreview({ 节点, 大小, 引擎, onClose, on用编辑器打开, on下载 }: Props) {
  const { 主题, 语言 } = useSettings()
  const 判定 = useMemo(() => 预览方式(节点.name, 引擎), [节点.name, 引擎])
  const 超限 = (大小 ?? 0) > 预览最大字节
  const 需要读取 = !超限 && !['unsupported', 'editor'].includes(判定.方式)
  const [文件, set文件] = useState<File | null>(null), [错误, set错误] = useState(''), [次数, set次数] = useState(0)
  const [文本, set文本] = useState(''), [目录, set目录] = useState<{ 名称: string; 大小: number }[]>([])
  const 原始字节 = useRef<Uint8Array | null>(null), 预览区 = useRef<HTMLDivElement>(null), [输出中, set输出中] = useState(false)
  const { message } = AntdApp.useApp()
  const 地址 = useMemo(() => 文件 && ['image', 'audio', 'video'].includes(判定.方式) ? URL.createObjectURL(文件) : '', [文件, 判定.方式])
  useEffect(() => () => { if (地址) URL.revokeObjectURL(地址) }, [地址])

  useEffect(() => {
    if (!需要读取) return
    let 有效 = true
    set文件(null); set错误('')
    void (async () => {
      try {
        const 结果 = await cloudCall<{ name: string; data: string }>('rawDownload', { id: 节点.id, version: 节点.version })
        const 字节 = Uint8Array.from(atob(结果.data), 字符 => 字符.charCodeAt(0))
        if (字节.length > 预览最大字节) throw new Error('文件超过 100 MB，无法在线预览，请下载后查看')
        // 预览副本补全 OOXML 缺失的命名空间声明（如 w15），原文件与下载内容不变
        const 预览字节 = 判定.方式 === 'viewer' ? (await 修补OOXML命名空间(节点.name, 字节)).字节 : 字节
        原始字节.current = 字节
        const 新文件 = new File([预览字节 as BlobPart], 节点.name, { type: 媒体类型[扩展名(节点.name)] || '' })
        if (判定.方式 === 'text') set文本(文本解码(字节))
        if (判定.方式 === 'zip') {
          const 包 = await JSZip.loadAsync(字节)
          set目录(Object.values(包.files).filter(项 => !项.dir).slice(0, 2000).map(项 => ({ 名称: 项.name, 大小: (项 as any)._data?.uncompressedSize ?? 0 })))
        }
        if (有效) set文件(新文件)
      } catch (原因) {
        if (有效) set错误(预览错误说明(原因 instanceof Error ? 原因.message : '文件读取失败'))
      }
    })()
    return () => { 有效 = false }
  }, [节点.id, 节点.version, 节点.name, 需要读取, 判定.方式, 次数])

  const 可编辑 = 判定.方式 === 'editor' || Boolean(查找文档格式(节点.name))
  const 内容 = 超限 ? <div className="seal-preview-notice"><p>文件超过 100 MB，无法在线预览，请下载后查看。</p></div>
    : 判定.方式 === 'unsupported' || 判定.方式 === 'editor' ? <div className="seal-preview-notice"><p>{判定.说明}</p></div>
    : 错误 ? <div className="seal-preview-notice" role="alert"><p>预览失败：{错误}</p><div className="seal-preview-notice__actions"><Button aria-label="重试" onClick={() => set次数(次数 + 1)}>重试</Button><Button onClick={on下载}>下载文件</Button>{可编辑 ? <Button type="primary" onClick={on用编辑器打开}>用海豹办公打开</Button> : null}</div></div>
    : !文件 ? <LoadingState 文字="正在解密并读取文件…" />
    : 判定.方式 === 'image' ? <div className="seal-preview-media"><img src={地址} alt={节点.name} /></div>
    : 判定.方式 === 'audio' ? <div className="seal-preview-media"><audio src={地址} controls aria-label={节点.name} /></div>
    : 判定.方式 === 'video' ? <div className="seal-preview-media"><video src={地址} controls aria-label={节点.name} /></div>
    : 判定.方式 === 'text' ? <pre className="seal-preview-text" aria-label="文本内容">{文本}</pre>
    : 判定.方式 === 'zip' ? <div className="seal-preview-zip"><p>共 {目录.length} 个文件</p><ul aria-label="压缩包目录">{目录.map(项 => <li key={项.名称}><span>{项.名称}</span><small>{(项.大小 / 1024).toFixed(1)} KB</small></li>)}</ul></div>
    : !FileViewerEngine ? <div className="seal-preview-notice"><p>当前安装包未内置此格式的预览组件，请下载后查看。</p></div>
    : <Suspense fallback={<LoadingState 文字="正在加载预览组件…" />}><FileViewerEngine 文件={文件} 深色={主题 === '深色'} 语言={语言} on错误={说明 => set错误(预览错误说明(说明))} /></Suspense>

  const 是PDF = 扩展名(节点.name) === 'pdf'
  const 可输出 = Boolean(文件) && !错误 && !超限 && ['viewer', 'image', 'text'].includes(判定.方式)
  const 基础名 = 节点.name.replace(/\.[^./\\]+$/, '') || 节点.name
  const 打印 = async () => {
    if (输出中) return
    set输出中(true)
    try {
      const 结果 = 是PDF && 原始字节.current ? await 桥接.printDocument(转Base64(原始字节.current), 'pdf')
        : 预览区.current ? await 桥接.printDocument(生成预览HTML(预览区.current, 节点.name), 'html') : { 成功: false, 错误: '预览尚未完成' }
      if (!结果.成功 && !结果.已取消) message.error('打印失败：' + (结果.错误 || '请稍后重试'))
    } finally { set输出中(false) }
  }
  const 导出HTML = () => {
    if (!预览区.current) return
    保存文本文件(基础名 + '.html', 生成预览HTML(预览区.current, 节点.name))
  }
  return <Modal open centered width="min(1100px, 96vw)" className="seal-preview-modal" title={<span className="seal-preview-title" title={节点.name}>{节点.name}</span>} onCancel={onClose}
    footer={[<Button key="download" aria-label="下载文件" onClick={on下载}>下载文件</Button>,
      可输出 ? <Button key="print" loading={输出中} onClick={() => void 打印()}>打印</Button> : null,
      可输出 && !是PDF ? <Button key="html" onClick={导出HTML}>导出 HTML</Button> : null,
      可编辑 ? <Button key="open" type="primary" onClick={on用编辑器打开}>用海豹办公打开</Button> : null, <Button key="close" aria-label="关闭预览" onClick={onClose}>关闭</Button>]}>
    <div className="seal-preview-body" ref={预览区}>{内容}</div>
  </Modal>
}
