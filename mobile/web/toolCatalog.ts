import type { DocType } from '../../renderer/src/mock/recentDocs'
import { NAV_GROUPS, navigationAvailable } from '../../renderer/src/navConfig'
import type { 扫描模式 } from '../../renderer/src/scan/scanModes'
import type { MobileUtilityId } from './MobileUtilityPage'

type Action =
  | { kind: 'scan'; mode: 扫描模式 }
  | { kind: 'utility'; tool: MobileUtilityId }
  | { kind: 'document'; type: DocType }
  | { kind: 'navigate'; key: string }
  | { kind: 'assistant'; task: '智能文档' | '智能表格' | '智能演示' | '助手' }
  | { kind: 'templates' | 'resume' }

export type ToolEntry = { id: string; label: string; icon: string; aliases: string; action: Action }
export type CatalogGroup = { title: string; ids: string[] }
const item = (id: string, label: string, icon: string, aliases: string, action: Action): ToolEntry => ({ id, label, icon, aliases, action })
const scan = (mode: 扫描模式, label: string, icon: string, aliases: string) => item(mode, label, icon, aliases, {kind:'scan', mode})
const utility = (id: MobileUtilityId, label: string, icon: string, aliases = '') => item(id, label, icon, aliases, {kind:'utility', tool:id})
const doc = (type: DocType, label: string, icon: string, aliases: string) => item(type, label, icon, aliases, {kind:'document', type})
const assistant = (id: string, task: '智能文档' | '智能表格' | '智能演示' | '助手', icon: string, aliases: string) => item(id, task === '助手' ? '对话与文档助手' : task, icon, aliases, {kind:'assistant', task})
const entries = [
  scan('文件扫描','拍照扫描','scan','文档 扫描仪 相机 相册'),
  scan('照片转PDF','图片转 PDF','doc-pdf','照片转PDF 合成 多张'),
  scan('拍照转Word','拍照转 Word','doc-word','图片转Word 扫描文字 文档'),
  scan('拍照转Excel','拍照转 Excel','doc-table','图片转Excel 拍照转表格 单据'),
  scan('提取文字','拍照提取文字','find-text','OCR 文字识别 图片转文字'),
  scan('图片翻译','图片翻译','language','拍照翻译 外文'),
  scan('证件扫描','证件扫描','device','身份证 户口本 护照'),
  scan('去除手写','去除手写字迹','replace-text','去字迹 擦除手写 试卷'),
  scan('拍书籍','拍书籍','read-view','书本 双页 书籍扫描'),
  doc('word','文字','doc-word','Word DOCX 新建文档'),
  doc('ppt','演示','doc-ppt','PPT PPTX 新建幻灯片'),
  doc('table','表格','doc-table','Excel XLSX 新建工作簿'),
  doc('pdf','PDF','doc-pdf','新建 编辑阅读PDF'),
  utility('audio-text','录音转文字','headset','音频转文字 语音转写 会议 录音'),
  utility('id-photo','证件照','image','一寸 两寸 换底色'),
  utility('paper-check','论文查重','compare','比对 重合 重复 段落'),
  utility('professional-check','职称版查重','find-text','职称论文 重复 比对'),
  utility('paper-rewrite','论文降重','paragraph-mark','改写 学术 论文润色'),
  utility('translate-text','全文翻译','language','文档 文本 翻译'),
  utility('pdf-ppt','PDF 转 PPT','doc-ppt','PDF转演示 PDF转幻灯片'),
  utility('pdf-excel','PDF 转 Excel','doc-table','PDF转XLSX PDF转表格'),
  utility('pdf-word','PDF 转 Word','doc-word','PDF转DOCX 文档转换'),
  utility('pdf-table','PDF 提取表格','table','提取数据 表格识别'),
  utility('image-compress','图片压缩','image','减小照片 文件大小'),
  utility('cutout','一键抠图','shape','去背景 透明底'),
  utility('image-erase','图片涂抹消除','format-painter','图片擦除 橡皮'),
  utility('image-deshadow','图片去阴影','sun','去除阴影 增强'),
  utility('handwriting','手写字迹','draft-view','手写签名 笔迹 导出'),
  utility('generate-image','一键出图','image','图片 海报 生成图片'),
  utility('make-chart','图表制作','chart','柱状图 折线图 数据'),
  utility('video-compress','视频压缩','device','MP4 WebM 压缩视频'),
  utility('cad-edit','CAD 编辑','ruler','DXF 图纸 绘图'),
  utility('cad-pdf','CAD 转 PDF','doc-pdf','DXF 图纸 转换'),
  utility('collect-form','收集表','list','表单 记录 填写'),
  item('templates','从模板新建','page-view','模板库 模板文档',{kind:'templates'}),
  item('resume','写简历','doc-word','个人简历 求职 简历模板',{kind:'resume'}),
  item('pdf-edit','PDF 编辑','pdf','PDF编辑 阅读 注释',{kind:'navigate',key:'pdf'}),
  assistant('smart-word','智能文档','doc-word','AI文档 智能写作'),
  assistant('smart-sheet','智能表格','doc-table','AI表格 智能工作簿'),
  assistant('smart-ppt','智能演示','aippt','AIPPT AI演示 超级PPT'),
  assistant('assistant','助手','ai','AI 智能助手'),
  ...NAV_GROUPS.flat().filter(nav => nav.implemented && !['pdf','scan','database'].includes(nav.key)).map(nav =>
    item(nav.key, ({document:'应用文档空间', design:'平面设计', mindmap:'思维导图'} as Record<string,string>)[nav.key] || nav.label,
      nav.key==='design'?'image':nav.icon, nav.label+' '+nav.key, {kind:'navigate',key:nav.key})),
]
const byId = new Map(entries.map(entry => [entry.id, entry]))
export function lookupEntry(id: string): ToolEntry {
  const entry = byId.get(id)
  if (!entry) throw new Error('找不到所选的办公服务')
  return entry
}

export const quickCreateGroups: CatalogGroup[] = [
  {title:'快捷工具', ids:['audio-text','文件扫描','templates','resume']},
  {title:'办公文档', ids:['word','ppt','table','pdf']},
  {title:'智能文档', ids:['smart-word','smart-sheet','collect-form']},
  {title:'应用服务', ids:['multitable','mindmap','design','smart-ppt']},
]
export const catalogGroups: CatalogGroup[] = [
  {title:'效率工具', ids:['resume','id-photo','smart-ppt','mindmap']},
  {title:'拍照扫描', ids:['文件扫描','拍照转Word','拍照转Excel','提取文字','图片翻译','证件扫描','去除手写','拍书籍','照片转PDF']},
  {title:'论文助手', ids:['paper-check','professional-check','paper-rewrite','translate-text']},
  {title:'文档处理', ids:['audio-text','pdf-edit','pdf-ppt','pdf-excel','pdf-word','pdf-table','receipt']},
  {title:'图片处理', ids:['image-compress','cutout','image-erase','image-deshadow']},
  {title:'内容与设计', ids:['design','handwriting','generate-image','make-chart']},
  {title:'快速创建', ids:['文件扫描','video-compress','audio-text','cad-edit','cad-pdf','pdf-table','templates','collect-form']},
  {title:'新建文档', ids:['word','ppt','table','pdf']},
  {title:'个人工作区', ids:['multitable','flow','notes','calendar','market','skins','document','settings','help','assistant']},
  {title:'团队服务', ids:['shared','my-cloud','device','tag','team','knowledge','trash']},
]
const normalize = (text:string) => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'')
export function searchCatalog(query: string, teamOnly: boolean) {
  const terms = query.normalize('NFKC').trim().split(/\s+/).filter(Boolean).map(normalize)
  const seen = new Set<string>()
  return catalogGroups.filter(group => terms.length > 0 || !teamOnly || group.title === '团队服务').map(group => ({
    title:group.title,
    items:group.ids.map(lookupEntry).filter(entry => {
      if (entry.action.kind === 'navigate' && !navigationAvailable(entry.action.key)) return false
      if (!terms.length) return true
      const text = normalize([entry.label, entry.id, entry.aliases, group.title].join(' '))
      if (seen.has(entry.id) || !terms.every(term => text.includes(term))) return false
      seen.add(entry.id)
      return true
    }),
  })).filter(group => group.items.length > 0)
}

export function routeForEntry(entry: ToolEntry): string {
  const action = entry.action
  if (action.kind === 'scan') return 'scan:'+action.mode
  if (action.kind === 'utility') return 'mobile-tool:'+action.tool
  if (action.kind === 'assistant') return 'mobile-ai:'+entry.id
  if (action.kind === 'templates') return 'mobile-templates'
  throw new Error('所选服务使用编辑器入口')
}
export function decodeToolRoute(key:string): Extract<Action,{kind:'scan'|'utility'|'assistant'|'templates'}> | {kind:'templates'} | null {
  const [prefix,id] = key.split(':')
  const entry = byId.get(id)
  if (entry && ['scan','mobile-tool','mobile-ai'].includes(prefix) && ['scan','utility','assistant'].includes(entry.action.kind) && routeForEntry(entry) === key) {
    return entry.action as Extract<Action,{kind:'scan'|'utility'|'assistant'}>
  }
  return key === 'mobile-templates' ? {kind:'templates'} : null
}
