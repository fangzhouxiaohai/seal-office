import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import TemplateLibrary from '../../renderer/src/components/TemplateLibrary'
import PresentationMarketPage from '../../renderer/src/cloud/PresentationMarketPage'
import { PresentationTemplatePreview, TemplateSlidePreview } from '../../renderer/src/components/templatePreviews/PresentationTemplatePreview'
import { PPT_TEMPLATES, 生成演示模板文稿 } from '../../renderer/src/data/templates'
import { templatePhotoEntries } from '../../renderer/src/data/presentationTemplates/photos'
import { 构建演示保存模型 } from '../../renderer/src/ppt/saveModel'
import { AppProvider, useAppStore, type AppState } from '../../renderer/src/store'
import '../../renderer/src/styles.css'
import '../../renderer/src/cloud/drive.css'
import '../../renderer/src/cloud/cloud.css'
import '../../mobile/web/mobile.css'

const resources = new Map<string, { 标识: string; 类型: string; 数据: string }>(), restored: Array<{ id: string; bytes: number }> = []
let lastStore: AppState | undefined, lastSelected: string | undefined
// Only OS persistence is adapted: original asset bytes are SHA-256 checked and
// decoded by the browser before a real selection is allowed to complete.
Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
  backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }), reportUnsavedCount: async () => ({ 成功: true }),
  presentationResources: {
    sync: async (_owner: string, ids: string[]) => { if (ids.some(id => !resources.has(id))) return { 成功: false, 错误: '未恢复的模板图片不能建立正文引用' }; return { 成功: true } },
    release: async () => ({ 成功: true }),
    export: async (ids: string[]) => ids.some(id => !resources.has(id)) ? { 成功: false, 错误: '自动备份缺少原始模板图片' } : { 成功: true, 条目: [...new Set(ids)].map(id => resources.get(id)!) },
    restore: async (entries: Array<{ 标识: string; 类型: string; 数据: string }>) => {
      for (const entry of entries) { const bytes = Uint8Array.from(atob(entry.数据), char => char.charCodeAt(0)), digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), char => char.toString(16).padStart(2, '0')).join(''); if (digest !== entry.标识) throw new Error('模板图片指纹不一致'); const image = new Image(); image.src = `data:${entry.类型};base64,${entry.数据}`; await image.decode(); resources.set(entry.标识, entry); restored.push({ id: entry.标识, bytes: bytes.length }) }
      return { 成功: true }
    },
    read: async (id: string) => resources.has(id) ? { 成功: true, 数据: resources.get(id)!.数据 } : { 成功: false, 错误: '图片资源缺失' },
  },
} })
function StoreInspector() { lastStore = useAppStore(); return null }
const root = createRoot(document.getElementById('root')!)
function render(node: React.ReactNode) { flushSync(() => root.render(<ConfigProvider theme={{ token: { colorPrimary: '#2B6CF6', fontFamily: 'Microsoft YaHei, sans-serif' } }}><AntdApp><AppProvider><StoreInspector />{node}</AppProvider></AntdApp></ConfigProvider>)) }
const qa = {
  templates: PPT_TEMPLATES.map(item => ({ id: item.id, name: item.名称 })),
  gallery() { render(<main style={{ padding: 24, maxWidth: 1400, margin: 'auto' }}><h1>十二套完整主题演示</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,350px),1fr))', gap: 24 }}>{PPT_TEMPLATES.map(template => <section key={template.id}><PresentationTemplatePreview template={template} /><h2 style={{ fontSize: 16 }}>{template.名称} / 9 页</h2></section>)}</div></main>) },
  page(deck: any, index: number) { render(<main style={{ width: 960, margin: 0 }}><TemplateSlidePreview slide={deck.幻灯片列表[index]} label={`PPTX重新读取第${index + 1}页`} /></main>) },
  model(id: string) { const deck = 生成演示模板文稿(PPT_TEMPLATES.find(item => item.id === id)!); return 构建演示保存模型(deck, templatePhotoEntries(deck)) },
  library() { render(<TemplateLibrary 打开 onSelect={template => { lastSelected = template.id; lastStore!.createDoc('ppt', 生成演示模板文稿(template), { 名称: template.名称 + '.pptx' }) }} />) },
  market() { render(<PresentationMarketPage />) },
  selection() { const id = lastStore?.activeDocumentId; return { id: lastSelected, documentId: id, restored, deck: id ? lastStore?.演示文档模型[id] : undefined } },
  layout() { return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, boxes: [...document.querySelectorAll<HTMLElement>('.wps-slideshow__box,[data-对象标识] > div')].filter(element => element.textContent?.trim()).map(element => ({ text: element.textContent, width: element.clientWidth, height: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, overflow: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1 })), images: [...document.images].map(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight })) } },
}
;(window as any).templateQa = qa
qa.gallery()
