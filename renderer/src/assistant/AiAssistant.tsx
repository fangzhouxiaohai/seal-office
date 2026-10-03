import { useEffect, useMemo, useState } from 'react'
import { App as AntdApp, Button, Drawer, Input } from 'antd'
import { useAppStore, type EditorDocument } from '../store'
import { 桥接, type 助手配置 } from '../ipc/bridge'
import { 检查工作簿更新, type Sheet } from '../sheet/model'
import { type 演示文稿 } from '../ppt/deck'
import Icon from '../components/Icon'
import AiSettingsCard from './AiSettingsCard'
import { 解析助手回复, 预览文字修改, 预览表格修改, 预览演示修改, type 助手修改, type 文字修改, type 表格修改, type 演示修改 } from './proposal'
import './assistant.css'

type 会话消息 = { 角色: 'user' | 'assistant'; 内容: string }
type 文档类型 = 'word' | 'table' | 'ppt'
type 待确认修改 = { 标识: string; 类型: 文档类型; 原内容: string; 候选: string | Sheet[] | 演示文稿; 修改: 助手修改[] }

function 原始快照(文档: EditorDocument, 表格: Record<string, Sheet[]>, 演示: Record<string, 演示文稿>): string {
  if (文档.type === 'table') {
    if (!表格[文档.id]) throw new Error('当前表格模型缺失，无法交给助手处理')
    return JSON.stringify(表格[文档.id])
  }
  if (文档.type === 'ppt') {
    if (!演示[文档.id]) throw new Error('当前演示模型缺失，无法交给助手处理')
    return JSON.stringify(演示[文档.id])
  }
  return 文档.html
}

/** 仅发送当前打开文件中处理请求所需的文本和位置，不发送磁盘路径。 */
function 生成文件上下文(文档: EditorDocument | null, 表格: Record<string, Sheet[]>, 演示: Record<string, 演示文稿>): string {
  if (!文档) return ''
  let 内容: unknown
  if (文档.type === 'table') {
    const 列表 = 表格[文档.id]
    if (!列表) throw new Error('当前表格模型缺失，无法读取文件内容')
    内容 = 列表.map((表) => ({ 工作表: 表.name, 行数: 表.行数, 列数: 表.列数, 单元格: Object.entries(表.单元格).map(([地址, 单元]) => ({ 地址, 原值: 单元.原始值 })).filter((项) => 项.原值 !== '') }))
  } else if (文档.type === 'ppt') {
    const 文稿 = 演示[文档.id]
    if (!文稿) throw new Error('当前演示模型缺失，无法读取文件内容')
    内容 = 文稿.幻灯片列表.map((页, 索引) => ({ 页码: 索引 + 1, 标题: 页.title, 文本框: 页.文本框列表.map((框) => ({ 标识: 框.id, 文本: 框.text })) }))
  } else {
    const 容器 = document.createElement('div')
    容器.innerHTML = 文档.html
    内容 = 容器.textContent ?? ''
  }
  const 类型 = 文档.type === 'table' ? '表格' : 文档.type === 'ppt' ? '演示' : '文字'
  const 上下文 = `文件名称：${文档.name}\n文件类型：${类型}\n文件内容：\n${typeof 内容 === 'string' ? 内容 : JSON.stringify(内容)}`
  if (上下文.length > 120000) throw new Error('当前文件内容过大，无法完整发送给模型；请先缩小文件内容范围')
  return 上下文
}

function 修改说明(项: 助手修改): { 位置: string; 原文: string; 新文: string } {
  if (项.种类 === '文字替换') return { 位置: '文字文档', 原文: 项.查找, 新文: 项.替换为 }
  if (项.种类 === '单元格写入') return { 位置: `${项.工作表} ${项.地址}`, 原文: 项.原值, 新文: 项.新值 }
  return { 位置: `第 ${项.页码} 页文本框`, 原文: 项.查找, 新文: 项.替换为 }
}

export default function AiAssistant() {
  const { message, modal } = AntdApp.useApp()
  const { documents, activeDocumentId, activeWorkspaceTabId, 表格文档模型, 演示文档模型, updateEditorHtml, 更新表格文档模型, 更新演示文档模型 } = useAppStore()
  const 当前文档 = useMemo(() => activeWorkspaceTabId === activeDocumentId
    ? documents.find((项) => 项.id === activeWorkspaceTabId) ?? null
    : null, [documents, activeDocumentId, activeWorkspaceTabId])
  const [打开, set打开] = useState(false)
  const [配置展开, set配置展开] = useState(false)
  const [配置, set配置] = useState<助手配置 | null>(null)
  const [会话按范围, set会话按范围] = useState<Record<string, 会话消息[]>>({})
  const 当前范围标识 = 当前文档?.id ?? '无文件'
  const 会话 = 会话按范围[当前范围标识] ?? []
  const [输入按范围, set输入按范围] = useState<Record<string, string>>({})
  const 输入 = 输入按范围[当前范围标识] ?? ''
  const [发送中, set发送中] = useState(false)
  const [待确认按文件, set待确认按文件] = useState<Record<string, 待确认修改 | undefined>>({})
  const 当前待确认 = 当前文档 ? 待确认按文件[当前文档.id] ?? null : null

  useEffect(() => {
    const 打开助手 = () => set打开(true)
    window.addEventListener('seal-open-assistant', 打开助手)
    return () => window.removeEventListener('seal-open-assistant', 打开助手)
  }, [])

  useEffect(() => {
    if (!桥接.ai.可用) return
    const 读取配置 = () => {
      void 桥接.ai.getConfig().then((结果) => {
        if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '模型设置读取失败')
        set配置(结果.数据)
      }).catch((错误: unknown) => {
        modal.error({ title: '读取模型设置失败', content: 错误 instanceof Error ? 错误.message : '请检查本机安全存储' })
      })
    }
    if (打开) 读取配置()
    window.addEventListener('seal-ai-setting-changed', 读取配置)
    return () => window.removeEventListener('seal-ai-setting-changed', 读取配置)
  }, [打开, modal])

  const 发送 = async () => {
    const 文本 = 输入.trim()
    if (!文本 || 发送中) return
    if (!配置?.地址 || !配置.模型) {
      set配置展开(true)
      modal.info({ title: '请先配置模型服务', content: '填写模型服务商、接口地址和模型名称后再开始对话。' })
      return
    }
    set发送中(true)
    try {
      const 文档 = 当前文档
      const 范围标识 = 当前范围标识
      const 上下文 = 生成文件上下文(文档, 表格文档模型, 演示文档模型)
      const 原内容 = 文档 ? 原始快照(文档, 表格文档模型, 演示文档模型) : ''
      const 消息列表: 会话消息[] = [...会话.slice(-18), { 角色: 'user', 内容: 文本 }]
      const 结果 = await 桥接.ai.chat({ 消息: 消息列表, 文档上下文: 上下文 })
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '模型服务未返回回复')
      const 回复 = 解析助手回复(结果.数据.内容)
      if (回复.修改.length > 0) {
        if (!文档) throw new Error('当前没有打开的可编辑文件，无法预览模型提出的修改')
        let 候选: string | Sheet[] | 演示文稿
        if (文档.type === 'table') {
          if (回复.修改.some((项) => 项.种类 !== '单元格写入')) throw new Error('模型提出了与当前表格不符的修改')
          候选 = 预览表格修改(表格文档模型[文档.id], 回复.修改 as 表格修改[])
        } else if (文档.type === 'ppt') {
          if (回复.修改.some((项) => 项.种类 !== '演示文本替换')) throw new Error('模型提出了与当前演示不符的修改')
          候选 = 预览演示修改(演示文档模型[文档.id], 回复.修改 as 演示修改[])
        } else {
          if (回复.修改.some((项) => 项.种类 !== '文字替换')) throw new Error('模型提出了与当前文字文档不符的修改')
          候选 = 预览文字修改(文档.html, 回复.修改 as 文字修改[])
        }
        set待确认按文件((当前) => ({ ...当前, [文档.id]: { 标识: 文档.id, 类型: 文档.type ?? 'word', 原内容, 候选, 修改: 回复.修改 } }))
      }
      set会话按范围((当前) => ({ ...当前, [范围标识]: [...消息列表, { 角色: 'assistant', 内容: 回复.回复 }] }))
      set输入按范围((当前) => ({ ...当前, [范围标识]: '' }))
    } catch (错误) {
      modal.error({ title: '智能助手处理失败', content: 错误 instanceof Error ? 错误.message : '请检查模型设置与当前文件内容' })
    } finally { set发送中(false) }
  }

  const 应用修改 = () => {
    const 待确认 = 当前待确认
    if (!待确认) return
    try {
      const 文档 = documents.find((项) => 项.id === 待确认.标识)
      if (!文档 || 当前文档?.id !== 待确认.标识) throw new Error('当前文件已切换，请返回原文件后重新请求修改')
      if (原始快照(文档, 表格文档模型, 演示文档模型) !== 待确认.原内容) throw new Error('文件内容已变化，请重新向助手发送请求')
      if (待确认.类型 === 'table') {
        const 原表 = 表格文档模型[文档.id]
        if (!原表) throw new Error('当前表格模型缺失，无法应用修改')
        const 候选 = 待确认.候选 as Sheet[]
        const 错误 = 检查工作簿更新(原表, 候选)
        if (错误) throw new Error(错误)
        更新表格文档模型(文档.id, 候选)
      }
      else if (待确认.类型 === 'ppt') 更新演示文档模型(文档.id, 待确认.候选 as 演示文稿)
      else updateEditorHtml(文档.id, 待确认.候选 as string)
      set待确认按文件((当前) => ({ ...当前, [待确认.标识]: undefined }))
      message.success('修改已应用到当前编辑内容，请保存文件')
    } catch (错误) {
      modal.error({ title: '应用修改失败', content: 错误 instanceof Error ? 错误.message : '当前文件无法应用修改' })
    }
  }

  return <>
    <button type="button" className="assistant-launcher" onClick={() => set打开(true)} aria-label="打开智能助手" disabled={!桥接.ai.可用} title={桥接.ai.可用 ? undefined : '请在 Windows 桌面版使用智能助手'}><Icon name="ai" size={16} /><span>智能助手</span></button>
    <Drawer className="assistant-drawer" title="智能助手" placement="right" width="min(430px, 100vw)" open={打开} onClose={() => set打开(false)} destroyOnClose={false}>
      <div className="assistant-drawer__layout">
        <div className="assistant-drawer__header"><strong>文件对话</strong><Button type="link" onClick={() => set配置展开((值) => !值)}>{配置展开 ? '收起模型设置' : '模型设置'}</Button></div>
        {配置展开 ? <AiSettingsCard compact onSaved={(新配置) => { set配置(新配置); set配置展开(false) }} /> : null}
        <div className="assistant-drawer__scope"><strong>当前范围：</strong>{当前文档 ? 当前文档.name : '未选择文件'}。{当前文档 ? '发送消息时会提供该文件内容；修改仅在审阅并应用后进入编辑区。' : '可以咨询一般问题；请打开文件后再请求修改。'}</div>
        <div className="assistant-drawer__messages" role="log" aria-label="助手对话">
          {会话.length === 0 ? <div className="assistant-drawer__empty">可以询问当前文件的内容、请助手改写文字、更新表格单元格或调整演示文本。修改会先显示预览。</div> : null}
          {会话.map((项, 索引) => <div className={`assistant-message${项.角色 === 'user' ? ' assistant-message--user' : ''}`} key={`${索引}-${项.角色}`}><span className="assistant-message__role">{项.角色 === 'user' ? '我' : '助手'}</span>{项.内容}</div>)}
        </div>
        {当前待确认 ? <section className="assistant-preview" aria-label="待确认修改"><strong>待确认修改，共 {当前待确认.修改.length} 处</strong><div className="assistant-preview__list">{当前待确认.修改.map((项, 索引) => { const 说明 = 修改说明(项); return <div className="assistant-preview__item" key={索引}><div>{说明.位置}</div><div className="assistant-preview__old">原文：{说明.原文 || '空白'}</div><div className="assistant-preview__new">修改后：{说明.新文 || '空白'}</div></div> })}</div><div className="assistant-preview__actions"><Button type="primary" onClick={应用修改}>应用修改</Button><Button onClick={() => set待确认按文件((当前) => ({ ...当前, [当前待确认.标识]: undefined }))}>放弃修改</Button></div></section> : null}
        <div className="assistant-drawer__composer"><Input.TextArea aria-label="发送给智能助手的消息" value={输入} maxLength={12000} rows={3} disabled={发送中} placeholder="输入问题或说明希望修改的内容" onChange={(事件) => set输入按范围((当前) => ({ ...当前, [当前范围标识]: 事件.target.value }))} onPressEnter={(事件) => { if (事件.ctrlKey) { 事件.preventDefault(); void 发送() } }} /><div className="assistant-drawer__composer-actions"><span>按 Ctrl+Enter 发送</span><Button type="primary" loading={发送中} disabled={!输入.trim()} onClick={() => void 发送()}>发送</Button></div></div>
      </div>
    </Drawer>
  </>
}
