import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Button, Drawer, Input, Select } from 'antd'
import { useAppStore, type EditorDocument } from '../store'
import { 桥接, type 助手配置, type 思考强度 } from '../ipc/bridge'
import { 检查工作簿更新, type Sheet } from '../sheet/model'
import { type 演示文稿 } from '../ppt/deck'
import { 使用放映状态 } from '../ppt/presentationState'
import Icon from '../components/Icon'
import AiSettingsCard from './AiSettingsCard'
import { 解析助手回复, 预览文字修改, 预览表格修改, 预览演示修改, type 助手修改, type 文字修改, type 表格修改, type 演示修改 } from './proposal'
import { 生成文字上下文 } from './wordBlocks'
import { 思考选项, 思考说明, 提取流式正文 } from './reasoning'
import './assistant.css'

type 会话消息 = { 角色: 'user' | 'assistant'; 内容: string; 思考?: string; 请求标识?: string; 状态?: '执行中' | '完成' | '已停止' | '失败'; 阶段?: string }
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
    内容 = 生成文字上下文(文档.html)
  }
  const 类型 = 文档.type === 'table' ? '表格' : 文档.type === 'ppt' ? '演示' : '文字'
  const 上下文 = `文件名称：${文档.name}\n文件类型：${类型}\n文件内容：\n${typeof 内容 === 'string' ? 内容 : JSON.stringify(内容)}`
  if (上下文.length > 120000) throw new Error('当前文件内容过大，无法完整发送给模型；请先缩小文件内容范围')
  return 上下文
}

function 修改说明(项: 助手修改): { 位置: string; 原文: string; 新文: string } {
  if (项.种类 === '文字替换') return { 位置: 项.段落标识 ?? '文字文档', 原文: 项.查找, 新文: 项.替换为 }
  if (项.种类 === '段落排版') return { 位置: `${项.段落标识} · 排版`, 原文: 项.原文, 新文: Object.entries(项.格式).map(([键, 值]) => {
    if (键 === '对齐') return `对齐：${({ left: '左对齐', center: '居中', right: '右对齐', justify: '两端对齐' } as Record<string, string>)[String(值)]}`
    if (键 === '字号') return `字号：${值} 磅`
    if (键 === '标题级别') return 值 === 0 ? '段落类型：正文' : `段落类型：标题 ${值}`
    return `${键}：${值 === true ? '是' : 值 === false ? '否' : 值}`
  }).join('；') }
  if (项.种类 === '单元格写入') return { 位置: `${项.工作表} ${项.地址}`, 原文: 项.原值, 新文: 项.新值 }
  return { 位置: `第 ${项.页码} 页文本框`, 原文: 项.查找, 新文: 项.替换为 }
}

export default function AiAssistant() {
  const 放映中 = 使用放映状态()
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
  const [强度, set强度] = useState<思考强度>('high')
  const 进行中 = useRef<{ 标识: string; 范围: string; 文件名: string; 原始正文: string; 思考: string; 已停止: boolean } | null>(null)
  const 消息容器 = useRef<HTMLDivElement>(null)
  const 跟随输出 = useRef(true)
  const 组件有效 = useRef(true)
  const [待确认按文件, set待确认按文件] = useState<Record<string, 待确认修改 | undefined>>({})
  const 当前待确认 = 当前文档 ? 待确认按文件[当前文档.id] ?? null : null

  const 更新任务消息 = (范围: string, 标识: string, 更新: Partial<会话消息>) => {
    if (!组件有效.current) return
    set会话按范围((当前) => ({ ...当前, [范围]: (当前[范围] ?? []).map((项) => 项.请求标识 === 标识 ? { ...项, ...更新 } : 项) }))
  }

  useEffect(() => {
    组件有效.current = true
    const 释放 = 桥接.ai.onStream((片段) => {
      const 任务 = 进行中.current
      if (!任务 || 任务.标识 !== 片段.请求标识 || 任务.已停止) return
      if (片段.类型 === '思考') {
        任务.思考 += 片段.内容
        更新任务消息(任务.范围, 任务.标识, { 思考: 任务.思考, 阶段: '正在思考' })
      } else if (片段.类型 === '正文') {
        任务.原始正文 += 片段.内容
        更新任务消息(任务.范围, 任务.标识, { 内容: 提取流式正文(任务.原始正文), 阶段: '正在输出' })
      } else 更新任务消息(任务.范围, 任务.标识, { 阶段: 片段.内容 })
    })
    return () => {
      组件有效.current = false; 释放()
      if (进行中.current) void 桥接.ai.cancel(进行中.current.标识)
    }
  }, [])

  useEffect(() => { 跟随输出.current = true }, [当前范围标识])
  useEffect(() => {
    const 元素 = 消息容器.current
    if (元素 && 跟随输出.current) 元素.scrollTop = 元素.scrollHeight
  }, [会话, 打开])

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
        if (!进行中.current) set强度(结果.数据.思考强度 ?? 'high')
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
    if (!文本 || 进行中.current) return
    if (!配置?.地址 || !配置.模型) {
      set配置展开(true)
      modal.info({ title: '请先配置模型服务', content: '填写模型服务商、接口地址和模型名称后再开始对话。' })
      return
    }
    const 标识 = crypto.randomUUID()
    const 文档 = 当前文档
    const 范围标识 = 当前范围标识
    const 任务 = { 标识, 范围: 范围标识, 文件名: 文档?.name ?? '一般对话', 原始正文: '', 思考: '', 已停止: false }
    进行中.current = 任务
    set发送中(true)
    try {
      const 上下文 = 生成文件上下文(文档, 表格文档模型, 演示文档模型)
      const 原内容 = 文档 ? 原始快照(文档, 表格文档模型, 演示文档模型) : ''
      const 消息列表 = [...会话.filter((项) => 项.内容.trim() && (!项.状态 || 项.状态 === '完成')).slice(-18).map((项) => ({ 角色: 项.角色, 内容: 项.内容 })), { 角色: 'user' as const, 内容: 文本 }]
      set会话按范围((当前) => ({ ...当前, [范围标识]: [...(当前[范围标识] ?? []), { 角色: 'user', 内容: 文本 }, { 角色: 'assistant', 内容: '', 思考: '', 请求标识: 标识, 状态: '执行中', 阶段: '正在准备文件上下文' }] }))
      跟随输出.current = true
      const 结果 = await 桥接.ai.chat({ 消息: 消息列表, 文档上下文: 上下文, 请求标识: 标识, 思考强度: 强度 })
      if (!组件有效.current) return
      if (任务.已停止 || 结果.数据?.已停止) {
        更新任务消息(范围标识, 标识, { 状态: '已停止', 阶段: '已停止，未应用修改' })
        return
      }
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '模型服务未返回回复')
      const 回复 = 解析助手回复(结果.数据.内容)
      更新任务消息(范围标识, 标识, { 内容: 回复.回复, 思考: 结果.数据.思考 || 任务.思考, 阶段: '正在校验修改' })
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
          if (回复.修改.some((项) => !['文字替换', '段落排版'].includes(项.种类))) throw new Error('模型提出了与当前文字文档不符的修改')
          候选 = 预览文字修改(文档.html, 回复.修改 as 文字修改[])
        }
        set待确认按文件((当前) => ({ ...当前, [文档.id]: { 标识: 文档.id, 类型: 文档.type ?? 'word', 原内容, 候选, 修改: 回复.修改 } }))
      }
      更新任务消息(范围标识, 标识, { 状态: '完成', 阶段: 回复.修改.length ? '修改已校验，等待确认' : '已完成' })
      set输入按范围((当前) => ({ ...当前, [范围标识]: '' }))
    } catch (错误) {
      if (!组件有效.current) return
      if (任务.已停止) { 更新任务消息(范围标识, 标识, { 状态: '已停止', 阶段: '已停止，未应用修改' }); return }
      更新任务消息(范围标识, 标识, { 状态: '失败', 阶段: '处理失败，未应用修改' })
      modal.error({ title: '智能助手处理失败', content: 错误 instanceof Error ? 错误.message : '请检查模型设置与当前文件内容' })
    } finally { 进行中.current = null; if (组件有效.current) set发送中(false) }
  }

  const 停止任务 = async () => {
    const 任务 = 进行中.current
    if (!任务 || 任务.已停止) return
    任务.已停止 = true
    更新任务消息(任务.范围, 任务.标识, { 阶段: '正在停止' })
    const 结果 = await 桥接.ai.cancel(任务.标识)
    if (!结果.成功 && 进行中.current === 任务) {
      任务.已停止 = false
      modal.error({ title: '停止任务失败', content: 结果.错误 || '请稍后重试' })
    }
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
    {放映中 ? null : <button type="button" className="assistant-launcher" onClick={() => set打开(true)} aria-label="打开智能助手" disabled={!桥接.ai.可用} title={桥接.ai.可用 ? undefined : '请在 Windows 桌面版使用智能助手'}><Icon name="ai" size={16} /><span>智能助手</span></button>}
    <Drawer className="assistant-drawer" title="智能助手" placement="right" width="min(430px, 100vw)" mask={false} open={打开 && !放映中} onClose={() => set打开(false)} destroyOnClose={false}>
      <div className={`assistant-drawer__layout${配置展开 ? ' assistant-drawer__layout--settings' : ''}`}>
        <div className="assistant-drawer__header"><strong>文件对话</strong><Button type="link" onClick={() => set配置展开((值) => !值)}>{配置展开 ? '收起模型设置' : '模型设置'}</Button></div>
        {配置展开 ? <AiSettingsCard compact onSaved={(新配置) => { set配置(新配置); set强度(新配置.思考强度 ?? 'high'); set配置展开(false) }} /> : null}
        <div className="assistant-drawer__scope"><strong>当前范围：</strong>{当前文档 ? 当前文档.name : '未选择文件'}。{当前文档 ? '发送消息时会提供该文件内容；修改仅在审阅并应用后进入编辑区。' : '可以咨询一般问题；请打开文件后再请求修改。'}</div>
        {发送中 && 进行中.current?.范围 !== 当前范围标识 ? <div className="assistant-drawer__background-task">正在处理：{进行中.current?.文件名}<Button size="small" onClick={() => void 停止任务()}>停止</Button></div> : null}
        <div ref={消息容器} className="assistant-drawer__messages" role="log" aria-label="助手对话" onScroll={() => { const 元素 = 消息容器.current; if (元素) 跟随输出.current = 元素.scrollHeight - 元素.scrollTop - 元素.clientHeight < 64 }}>
          {会话.length === 0 ? <div className="assistant-drawer__empty">可以询问当前文件的内容、请助手改写文字、更新表格单元格或调整演示文本。修改会先显示预览。</div> : null}
          {会话.map((项, 索引) => <div className={`assistant-message${项.角色 === 'user' ? ' assistant-message--user' : ''}`} key={`${索引}-${项.角色}`}>
            <span className="assistant-message__role">{项.角色 === 'user' ? '我' : '助手'}</span>
            {项.思考 ? <details className="assistant-thinking" open={项.状态 === '执行中' ? true : undefined}><summary>思考内容{项.状态 === '执行中' && 项.阶段 === '正在思考' ? ' · 接收中' : ''}</summary><div>{项.思考}</div></details> : null}
            {项.内容 ? <div className={`assistant-message__body${项.状态 === '执行中' && 项.阶段 === '正在输出' ? ' assistant-message__body--streaming' : ''}`}>{项.内容}</div> : null}
            {项.状态 ? <div className="assistant-task" role="status">{项.状态 === '执行中' ? <span className="assistant-task__spinner" aria-hidden="true" /> : null}<span>{项.阶段}</span></div> : null}
          </div>)}
        </div>
        {当前待确认 ? <section className="assistant-preview" aria-label="待确认修改"><strong>待确认修改，共 {当前待确认.修改.length} 处</strong><div className="assistant-preview__list">{当前待确认.修改.map((项, 索引) => { const 说明 = 修改说明(项); return <div className="assistant-preview__item" key={索引}><div>{说明.位置}</div><div className="assistant-preview__old">原文：{说明.原文 || '空白'}</div><div className="assistant-preview__new">修改后：{说明.新文 || '空白'}</div></div> })}</div><div className="assistant-preview__actions"><Button type="primary" onClick={应用修改}>应用修改</Button><Button onClick={() => set待确认按文件((当前) => ({ ...当前, [当前待确认.标识]: undefined }))}>放弃修改</Button></div></section> : null}
        <div className="assistant-drawer__composer">
          <div className="assistant-drawer__reasoning"><label>思考强度</label><Select aria-label="思考强度" value={强度} options={思考选项} disabled={发送中} onChange={set强度} /></div>
          <p className="assistant-drawer__reasoning-note">{思考说明(配置?.参数模式, 强度)}</p>
          <Input.TextArea aria-label="发送给智能助手的消息" value={输入} maxLength={12000} rows={3} disabled={发送中} placeholder="输入问题或说明希望修改的内容" onChange={(事件) => set输入按范围((当前) => ({ ...当前, [当前范围标识]: 事件.target.value }))} onPressEnter={(事件) => { if (事件.ctrlKey) { 事件.preventDefault(); void 发送() } }} />
          <div className="assistant-drawer__composer-actions"><span>按 Ctrl+Enter 发送</span>{发送中 ? <Button onClick={() => void 停止任务()} disabled={进行中.current?.已停止}>停止生成</Button> : <Button type="primary" disabled={!输入.trim()} onClick={() => void 发送()}>发送</Button>}</div>
        </div>
      </div>
    </Drawer>
  </>
}
