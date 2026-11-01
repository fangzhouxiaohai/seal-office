// 完整预览引擎：仅桌面与网页版按需加载，基于 flyfish-dev/file-viewer（Apache-2.0）的选定渲染器。
// Worker、WASM 与字体资源随构建复制到页面同级的 file-viewer/ 目录，不访问外部 CDN。
import { useMemo } from 'react'
import { FileViewer } from '@file-viewer/react'
import { setDefaultFileViewerAssetBaseUrl } from '@file-viewer/core'
import textRenderer from '@file-viewer/renderer-text'
import imageRenderer from '@file-viewer/renderer-image'
import mediaRenderer from '@file-viewer/renderer-media'
import wordRenderer from '@file-viewer/renderer-word'
import spreadsheetRenderer from '@file-viewer/renderer-spreadsheet'
import presentationRenderer from '@file-viewer/renderer-presentation'
import pdfRenderer from '@file-viewer/renderer-pdf'
import ofdRenderer from '@file-viewer/renderer-ofd'
import archiveRenderer from '@file-viewer/renderer-archive'
import epubRenderer from '@file-viewer/renderer-epub'
import emailRenderer from '@file-viewer/renderer-email'

setDefaultFileViewerAssetBaseUrl(new URL('file-viewer/', document.baseURI).href)

const 渲染器 = [textRenderer, imageRenderer, mediaRenderer, wordRenderer, spreadsheetRenderer, presentationRenderer, pdfRenderer, ofdRenderer, archiveRenderer, epubRenderer, emailRenderer]

export default function FileViewerEngine({ 文件, 深色, 语言, on错误 }: { 文件: File; 深色: boolean; 语言: string; on错误: (说明: string) => void }) {
  const options = useMemo(() => ({
    theme: 深色 ? 'dark' : 'light',
    locale: 语言 === 'en-US' ? 'en-US' : 'zh-CN',
    builtinRenderers: 'none',
    autoRenderers: false,
    rendererMode: 'replace',
    renderers: 渲染器,
    watermark: false,
    ai: false,
  } as any), [深色, 语言])
  return <FileViewer className="seal-preview-engine" file={文件} filename={文件.name} size={文件.size} options={options}
    onEvent={(事件: any) => { if (事件?.type === 'error') on错误(事件.error?.message || 事件.message || '预览组件无法解析此文件') }} />
}
