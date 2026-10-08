import { useEffect, useMemo, useRef, useState } from 'react'
import { App as AntdApp, Button, Checkbox, Drawer, Input, Select } from 'antd'
import { useAppStore, type EditorDocument } from '../store'
import { 桥接, type 助手配置, type 思考强度 } from '../ipc/bridge'
import { 检查工作簿更新, type Sheet } from '../sheet/model'
import { type 演示文稿 } from '../ppt/deck'
import { 使用放映状态 } from '../ppt/presentationState'
import Icon from '../components/Icon'
import AiSettingsCard from './AiSettingsCard'
import { 解析助手回复, 预览文字修改, 预览表格修改, 预览演示修改, type 助手修改, type 文字修改, type 表格修改, type 演示修改 } from './proposal'
import { 构建新文件, type 新文件候选, type 创建文件 } from './createDocument'
import { 生成文字上下文 } from './wordBlocks'
import { 思考选项, 思考说明, 提取流式正文 } from './reasoning'
import './assistant.css'

type 会话消息 = { 角色: 'user' | 'assistant'; 内容: string; 思考?: string; 请求标识?: string; 状态?: '执行中' | '完成' | '已停止' | '失败'; 阶段?: string }
type 文档类型 = 'word' | 'table' | 'ppt'
type 计划项 = { id: string; title: string; status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_confirmation' }
type 会话记忆 = { 摘要: string; 压缩次数: number; 计划: 计划项[] }
type 待确认修改 = { 标识: string; 类型: 文档类型 | 'create'; 原内容: string; 候选: string | Sheet[] | 演示文稿 | 新文件候选[]; 修改: 助手修改[]; 范围: string; 会话标识: string }
type 执行任务 = {
  标识: string; 范围: string; 会话标识: string; 文件名: string; 原始正文: string; 思考: string; 已停止: boolean
  文档: EditorDocument | null; 原内容: string; 表格?: Sheet[]; 演示?: 演示文稿; 修改: 助手修改[]
  待刷新: Partial<会话消息>; 计时器?: ReturnType<typeof setTimeout>; 正文已刷新: boolean; 思考已刷新: boolean; 正文待刷新?: boolean; 思考待刷新?: boolean
}
type 排队任务 = { id: string; 文本: string; 范围: string; 文件名: string; 会话标识: string; 强度: 思考强度; 自动执行: boolean; 状态: '等待' | '执行中' | '完成' | '失败' | '取消' | '已引导'; 错误?: string }
const 每页修改数 = 20
const 计划状态: Record<计划项['status'], string> = { pending: '待执行', in_progress: '执行中', completed: '已完成', failed: '失败', awaiting_confirmation: '待确认修改' }

function 校验计划(输入: unknown): 计划项[] {
  if (!Array.isArray(输入) || 输入.some((项) => !项 || typeof 项.id !== 'string' || typeof 项.title !== 'string' || !Object.prototype.hasOwnProperty.call(计划状态, 项.status))) throw new Error('模型计划格式无效')
  return 输入 as 计划项[]
}

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
    内容 = 文稿.幻灯片列表.map((页, 索引) => ({ 页码: 索引 + 1, 标题: 页.title, 文本框: 页.文本框列表.map((框) => ({ 标识: 框.id, 文本: 框.text })), 对象: (页.对象列表 ?? []).map((项) => ({ 标识: 项.id, 类型: 项.类型, 表格: 项.表格?.单元格.map((行) => 行.map((格) => 格.文本)) })), 切换: 页.切换, 动画: 页.动画序列 }))
  } else {
    内容 = 生成文字上下文(文档.html)
  }
  const 类型 = 文档.type === 'table' ? '表格' : 文档.type === 'ppt' ? '演示' : '文字'
  const 上下文 = `文件名称：${文档.name}\n文件类型：${类型}\n文件内容：\n${typeof 内容 === 'string' ? 内容 : JSON.stringify(内容)}`
  return 上下文
}

function 修改说明(项: 助手修改): { 位置: string; 原文: string; 新文: string } {
  if (项.种类 === '创建文件') return { 位置: `新建 ${项.名称}`, 原文: '新文件', 新文: 项.内容 }
  if (项.种类 === '文字插入') return { 位置: `插入文字 · ${项.位置}`, 原文: 项.原文 ?? '', 新文: 项.内容 }
  if (项.种类 === '演示切换') return { 位置: `第 ${项.页码} 页切换`, 原文: '现有切换', 新文: `${项.效果} · ${项.持续毫秒}毫秒` }
  if (项.种类 === '演示对象动画') return { 位置: `第 ${项.页码} 页对象 ${项.对象标识}`, 原文: '现有对象动画', 新文: `${项.效果} · ${项.触发} · ${项.持续毫秒}毫秒` }
  if (项.种类 === '演示表格写入') return { 位置: `第 ${项.页码} 页表格 ${项.行}行${项.列}列`, 原文: 项.原值, 新文: 项.新值 }
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
  const { documents, activeDocumentId, activeWorkspaceTabId, 文档路径, 表格文档模型, 演示文档模型, updateEditorHtml, 更新表格文档模型, 更新演示文档模型, createDoc, setActiveDocumentId } = useAppStore()
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
  const [清除中, set清除中] = useState(false)
  const [处理候选中, set处理候选中] = useState(false)
  const [仅规划, set仅规划] = useState(false)
  const [强度, set强度] = useState<思考强度>('high')
  const 进行中 = useRef<执行任务 | null>(null)
  const [队列, set队列] = useState<排队任务[]>([])
  const 队列引用 = useRef<排队任务[]>([])
  const [队列暂停, set队列暂停] = useState(false)
  const [引导中, set引导中] = useState<string | null>(null)
  const 变更队列 = (变更: (旧: 排队任务[]) => 排队任务[]) => { 队列引用.current = 变更(队列引用.current); set队列(队列引用.current) }
  const 会话引用 = useRef(会话按范围)
  会话引用.current = 会话按范围
  /** 选区浮窗的 AI 快捷动作经此调用最新的发送函数 */
  const 发送引用 = useRef<(文本: string) => void>(() => {})
  const 消息容器 = useRef<HTMLDivElement>(null)
  const 跟随输出 = useRef(true)
  const 组件有效 = useRef(true)
  const [待确认按文件, set待确认按文件] = useState<Record<string, 待确认修改 | undefined>>({})
  const 当前待确认 = 待确认按文件[当前范围标识] ?? null
  const [修改页, set修改页] = useState(0)
  const [记忆按范围, set记忆按范围] = useState<Record<string, 会话记忆>>({})
  const [恢复提示按范围, set恢复提示按范围] = useState<Record<string, string>>({})
  const 当前记忆 = 记忆按范围[当前范围标识]
  const 会话标识按文档 = useRef(new Map<string, string>())
  if (当前文档 && !会话标识按文档.current.has(当前文档.id)) {
    const 路径 = 文档路径[当前文档.id] ?? 当前文档.来源路径
    会话标识按文档.current.set(当前文档.id, 路径 ? `file:${路径.replace(/\\/g, '/').toLowerCase()}` : `document:${当前文档.id}`)
  }
  const 当前会话标识 = 当前文档 ? 会话标识按文档.current.get(当前文档.id)! : 'general'
  const 已恢复 = useRef(new Set<string>())
  const [恢复中范围, set恢复中范围] = useState<Record<string, boolean>>({})
  const 恢复中 = 恢复中范围[当前范围标识] === true
  const [绑定中范围, set绑定中范围] = useState<Record<string, boolean>>({})
  const 绑定中 = Object.values(绑定中范围).some(Boolean)
  const 正在绑定 = useRef(new Set<string>())
  const 绑定失败 = useRef(new Set<string>())
  const 最新文件 = useRef({ documents, 表格文档模型, 演示文档模型 })
  最新文件.current = { documents, 表格文档模型, 演示文档模型 }
  const 新版可用 = typeof window.electronAPI?.ai?.onToolCall === 'function'
  const 交互禁用 = 发送中 || 恢复中 || 清除中 || 绑定中 || 处理候选中

  const 更新任务消息 = (范围: string, 标识: string, 更新: Partial<会话消息>) => {
    if (!组件有效.current) return
    set会话按范围((当前) => ({ ...当前, [范围]: (当前[范围] ?? []).map((项) => 项.请求标识 === 标识 ? { ...项, ...更新 } : 项) }))
  }

  const 刷新任务消息 = (任务: 执行任务) => {
    if (任务.计时器) clearTimeout(任务.计时器)
    任务.计时器 = undefined
    if (任务.正文待刷新) 任务.待刷新.内容 = 提取流式正文(任务.原始正文)
    if (任务.思考待刷新) 任务.待刷新.思考 = 任务.思考
    if (Object.keys(任务.待刷新).length) 更新任务消息(任务.范围, 任务.标识, 任务.待刷新)
    任务.待刷新 = {}
    任务.正文待刷新 = false; 任务.思考待刷新 = false
  }

  const 合并任务消息 = (任务: 执行任务, 更新: Partial<会话消息>, 即时 = false) => {
    任务.待刷新 = { ...任务.待刷新, ...更新 }
    if (即时) 刷新任务消息(任务)
    else if (!任务.计时器) 任务.计时器 = setTimeout(() => 刷新任务消息(任务), 50)
  }

  const 生成候选 = (任务: 执行任务, 修改: 助手修改[]) => {
    const 文档 = 任务.文档
    if (修改.some((项) => 项.种类 === '创建文件')) {
      if (修改.some((项) => 项.种类 !== '创建文件') || 修改.length > 10) throw new Error('新建文件须独立提交，一次最多10个，不能与现有文件修改混合')
      const 候选 = (修改 as 创建文件[]).map(构建新文件)
      if (new Set(候选.map((项) => 项.名称.toLowerCase())).size !== 候选.length) throw new Error('新文件名称重复')
      任务.修改 = 修改
      set待确认按文件((当前) => ({ ...当前, [任务.范围]: { 标识: 任务.范围, 类型: 'create', 原内容: 任务.原内容, 候选, 修改, 范围: 任务.范围, 会话标识: 任务.会话标识 } }))
      return
    }
    if (!文档) throw new Error('当前没有打开的可编辑文件，请使用创建文件指令')
    const 现文档 = 最新文件.current.documents.find((项) => 项.id === 文档.id)
    if (!现文档) throw new Error('原文件已关闭，无法生成修改候选')
    if (原始快照(现文档, 最新文件.current.表格文档模型, 最新文件.current.演示文档模型) !== 任务.原内容) throw new Error('文件内容已变化，请重新向助手发送请求')
    let 候选: string | Sheet[] | 演示文稿
    if (文档.type === 'table') {
      if (修改.some((项) => 项.种类 !== '单元格写入')) throw new Error('模型提出了与当前表格不符的修改')
      候选 = 预览表格修改(任务.表格!, 修改 as 表格修改[])
    } else if (文档.type === 'ppt') {
      if (修改.some((项) => !['演示文本替换', '演示切换', '演示对象动画', '演示表格写入'].includes(项.种类))) throw new Error('模型提出了与当前演示不符的修改')
      候选 = 预览演示修改(任务.演示!, 修改 as 演示修改[])
    } else {
      if (修改.some((项) => !['文字替换', '段落排版', '文字插入'].includes(项.种类))) throw new Error('模型提出了与当前文字文档不符的修改')
      候选 = 预览文字修改(文档.html, 修改 as 文字修改[])
    }
    任务.修改 = 修改
    set恢复提示按范围((当前) => ({ ...当前, [任务.范围]: '' }))
    set待确认按文件((当前) => ({ ...当前, [文档.id]: { 标识: 文档.id, 类型: 文档.type ?? 'word', 原内容: 任务.原内容, 候选, 修改, 范围: 任务.范围, 会话标识: 任务.会话标识 } }))
    set记忆按范围((当前) => {
      const 记忆 = 当前[任务.范围]
      return 记忆 ? { ...当前, [任务.范围]: { ...记忆, 计划: 记忆.计划.map((项) => 项.status === 'in_progress' ? { ...项, status: 'awaiting_confirmation' } : 项) } } : 当前
    })
  }

  useEffect(() => {
    组件有效.current = true
    const 释放 = 桥接.ai.onStream((片段) => {
      const 任务 = 进行中.current
      if (!任务 || 任务.标识 !== 片段.请求标识 || 任务.已停止) return
      if (片段.类型 === '思考') {
        任务.思考 += 片段.内容
        任务.思考待刷新 = true
        合并任务消息(任务, { 阶段: '正在思考' }, !任务.思考已刷新)
        任务.思考已刷新 = true
      } else if (片段.类型 === '正文') {
        任务.原始正文 += 片段.内容
        任务.正文待刷新 = true
        合并任务消息(任务, { 阶段: '正在输出' }, !任务.正文已刷新)
        任务.正文已刷新 = true
      } else if (片段.类型 === '计划') {
        try {
          const 计划 = 校验计划(JSON.parse(片段.内容))
          set记忆按范围((当前) => ({ ...当前, [任务.范围]: { 摘要: 当前[任务.范围]?.摘要 ?? '', 压缩次数: 当前[任务.范围]?.压缩次数 ?? 0, 计划 } }))
        } catch (错误) { modal.error({ title: '计划读取失败', content: 错误 instanceof Error ? 错误.message : '模型计划格式无效' }) }
      } else 合并任务消息(任务, { 阶段: 片段.内容 }, true)
    })
    const 释放工具 = 新版可用 ? 桥接.ai.onToolCall((调用) => {
      const 任务 = 进行中.current
      void (async () => {
        try {
          if (!任务 || 任务.标识 !== 调用.请求标识 || 任务.已停止) throw new Error('工具调用不属于当前执行任务')
          if (调用.工具 !== 'propose_changes') throw new Error('不支持的助手工具，未执行任何操作')
          const 回复 = 解析助手回复(JSON.stringify(调用.参数))
          if (!回复.修改.length) throw new Error('修改候选不能为空')
          生成候选(任务, 回复.修改)
          合并任务消息(任务, { 阶段: '修改已校验，等待确认' }, true)
          const 结果 = await 桥接.ai.submitToolResult({ 请求标识: 调用.请求标识, 调用标识: 调用.调用标识, 成功: true, 数据: { 候选已生成: true, 修改数量: 回复.修改.length } })
          if (!结果.成功) throw new Error(结果.错误 || '无法回传修改候选结果')
        } catch (错误) {
          const 原因 = 错误 instanceof Error ? 错误.message : '生成修改候选失败'
          const 结果 = await 桥接.ai.submitToolResult({ 请求标识: 调用.请求标识, 调用标识: 调用.调用标识, 成功: false, 错误: 原因 })
          if (!结果.成功 && 组件有效.current) modal.error({ title: '助手工具处理失败', content: 结果.错误 || 原因 })
        }
      })().catch((错误: unknown) => { if (组件有效.current) modal.error({ title: '助手工具结果回传失败', content: 错误 instanceof Error ? 错误.message : '无法回传助手工具结果' }) })
    }) : () => {}
    return () => {
      组件有效.current = false; 释放(); 释放工具()
      if (进行中.current) { if (进行中.current.计时器) clearTimeout(进行中.current.计时器); void 桥接.ai.cancel(进行中.current.标识) }
    }
  }, [])

  useEffect(() => { set修改页(0) }, [当前待确认])
  useEffect(() => {
    if (!新版可用 || typeof window.electronAPI?.ai?.bindSession !== 'function' || 发送中 || 清除中 || 处理候选中 || Object.values(恢复中范围).some(Boolean)) return
    const 需要绑定 = documents.find((文档) => {
      const 路径 = 文档路径[文档.id] ?? 文档.来源路径
      const 来源 = 会话标识按文档.current.get(文档.id)
      return 路径 && 来源 && 来源 !== `file:${路径.replace(/\\/g, '/').toLowerCase()}` && !正在绑定.current.has(文档.id) && !绑定失败.current.has(`${文档.id}:${路径}`)
    })
    if (!需要绑定 || 正在绑定.current.size > 0) return
    const 文件标识 = 需要绑定.id
    const 路径 = (文档路径[文件标识] ?? 需要绑定.来源路径)!
    const 来源 = 会话标识按文档.current.get(文件标识)!
    const 目标 = `file:${路径.replace(/\\/g, '/').toLowerCase()}`
    正在绑定.current.add(文件标识)
    set绑定中范围((当前) => ({ ...当前, [文件标识]: true }))
    void 桥接.ai.bindSession(来源, 目标).then((结果) => {
      if (!结果.成功) throw new Error(结果.错误 || '无法绑定已保存文件的会话记忆')
      if (!组件有效.current) return
      会话标识按文档.current.set(文件标识, 目标)
      set待确认按文件((当前) => 当前[文件标识] ? { ...当前, [文件标识]: { ...当前[文件标识]!, 会话标识: 目标 } } : 当前)
    }).catch((错误: unknown) => {
      绑定失败.current.add(`${文件标识}:${路径}`)
      if (组件有效.current) modal.error({ title: '绑定文件会话失败', content: 错误 instanceof Error ? 错误.message : '无法绑定已保存文件的会话记忆' })
    }).finally(() => {
      正在绑定.current.delete(文件标识)
      if (组件有效.current) set绑定中范围((当前) => ({ ...当前, [文件标识]: false }))
    })
  }, [documents, 文档路径, 当前会话标识, 新版可用, 发送中, 清除中, 处理候选中, 恢复中范围, 绑定中范围, modal])
  useEffect(() => {
    if (!打开 || !新版可用 || typeof window.electronAPI?.ai?.getSession !== 'function' || 已恢复.current.has(当前范围标识)) return
    const 范围 = 当前范围标识
    已恢复.current.add(范围)
    set恢复中范围((当前) => ({ ...当前, [范围]: true }))
    void 桥接.ai.getSession(当前会话标识).then((结果) => {
      if (!结果.成功) throw new Error(结果.错误 || '无法读取会话记忆')
      if (!组件有效.current || 进行中.current?.范围 === 范围) return
      const 数据 = 结果.数据
      if (数据) {
        const 计划 = 校验计划(数据.计划)
        set会话按范围((当前) => ({ ...当前, [范围]: 数据.显示消息 }))
        set记忆按范围((当前) => ({ ...当前, [范围]: { 摘要: 数据.摘要, 压缩次数: 数据.压缩次数, 计划 } }))
        const 已保存候选 = 数据.待确认候选
        if (已保存候选) {
          const 文档 = 最新文件.current.documents.find((项) => 项.id === 范围)
          if (Array.isArray(已保存候选.修改) && 已保存候选.修改.length && 已保存候选.修改.every((项: unknown) => !!项 && typeof 项 === 'object' && (项 as { 种类?: string }).种类 === '创建文件')) {
            const 回复 = 解析助手回复(JSON.stringify({ 回复: 已保存候选.回复, 修改: 已保存候选.修改 }))
            生成候选({ 标识: '', 范围, 会话标识: 当前会话标识, 文件名: 文档?.name ?? '新建文件', 原始正文: '', 思考: '', 已停止: false, 文档: 文档 ?? null, 原内容: 已保存候选.文件快照 ?? '', 修改: [], 待刷新: {}, 正文已刷新: false, 思考已刷新: false }, 回复.修改)
          } else if (typeof 已保存候选.文件快照 !== 'string') set恢复提示按范围((当前) => ({ ...当前, [范围]: '旧修改候选缺少文件快照，请重新发送修改请求。' }))
          else if (!文档 || 原始快照(文档, 最新文件.current.表格文档模型, 最新文件.current.演示文档模型) !== 已保存候选.文件快照) {
            set恢复提示按范围((当前) => ({ ...当前, [范围]: '已保存的修改候选已过期，请重新发送修改请求。' }))
          } else {
            const 回复 = 解析助手回复(JSON.stringify({ 回复: 已保存候选.回复, 修改: 已保存候选.修改 }))
            if (回复.修改.length) 生成候选({ 标识: '', 范围, 会话标识: 当前会话标识, 文件名: 文档.name, 原始正文: '', 思考: '', 已停止: false, 文档, 原内容: 已保存候选.文件快照, 表格: 最新文件.current.表格文档模型[文档.id], 演示: 最新文件.current.演示文档模型[文档.id], 修改: [], 待刷新: {}, 正文已刷新: false, 思考已刷新: false }, 回复.修改)
          }
        }
      }
    }).catch((错误: unknown) => {
      已恢复.current.delete(范围)
      if (组件有效.current) modal.error({ title: '恢复会话失败', content: 错误 instanceof Error ? 错误.message : '无法读取本机会话记录' })
    }).finally(() => { if (组件有效.current) set恢复中范围((当前) => ({ ...当前, [范围]: false })) })
  }, [打开, 当前范围标识, 当前会话标识, 新版可用, modal])

  useEffect(() => { 跟随输出.current = true }, [当前范围标识])
  useEffect(() => {
    const 元素 = 消息容器.current
    if (元素 && 跟随输出.current) 元素.scrollTop = 元素.scrollHeight
  }, [会话, 打开])

  useEffect(() => {
    const 打开助手 = () => set打开(true)
    // 选区浮窗与右键菜单的 AI 快捷动作：打开助手并直接发送预置指令。
    // 经 ref 间接调用，避免监听器抓住首次渲染时的旧状态。
    const 接收指令 = (事件: Event) => {
      const 文本 = (事件 as CustomEvent<{ 文本?: string }>).detail?.文本
      if (typeof 文本 !== 'string' || 文本.trim() === '') return
      set打开(true)
      发送引用.current(文本)
    }
    window.addEventListener('seal-open-assistant', 打开助手)
    window.addEventListener('seal-assistant-ask', 接收指令)
    return () => {
      window.removeEventListener('seal-open-assistant', 打开助手)
      window.removeEventListener('seal-assistant-ask', 接收指令)
    }
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

  const 发送 = async (指定文本?: string, 指定执行?: boolean, 排队?: 排队任务) => {
    const 文本 = (指定文本 ?? 输入).trim()
    if (!文本) return
    if (!排队 && 文本.startsWith('/')) {
      const 命令 = 文本.toLowerCase()
      if (命令 !== '/compact') {
        if (命令 === '/help') set会话按范围((旧) => ({ ...旧, [当前范围标识]: [...(旧[当前范围标识] ?? []), { 角色: 'assistant', 内容: '/compact 压缩当前会话（排队执行）\n/pause 暂停后续队列\n/resume 继续队列\n/stop 停止当前生成并暂停队列\n/new 清空当前会话并开始新对话\n/help 查看命令' }] }))
        else if (命令 === '/pause') set队列暂停(true)
        else if (命令 === '/resume') set队列暂停(false)
        else if (命令 === '/stop') { set队列暂停(true); void 停止任务() }
        else if (命令 === '/new') { if (交互禁用) { message.info('请等待或停止当前任务后再使用 /new'); return }; void 新对话() }
        else { message.info('未知命令，输入 /help 查看可用操作'); return }
        if (!指定文本) set输入按范围((旧) => ({ ...旧, [当前范围标识]: '' }))
        return
      }
    }
    if (!配置?.地址 || !配置.模型) {
      set配置展开(true)
      modal.info({ title: '请先配置模型服务', content: '填写模型服务商、接口地址和模型名称后再开始对话。' })
      return
    }
    if (!排队) {
      if (队列引用.current.filter((项) => ['等待', '执行中'].includes(项.状态)).length >= 30) { message.warning('队列已满，请先处理或移除任务'); return }
      const 项: 排队任务 = { id: crypto.randomUUID(), 文本, 范围: 当前范围标识, 文件名: 当前文档?.name ?? '新建文件 / 一般对话', 会话标识: 当前会话标识, 强度, 自动执行: 文本.toLowerCase() === '/compact' ? false : 指定执行 ?? !仅规划, 状态: '等待' }
      变更队列((旧) => [...旧.filter((项) => !['完成', '取消'].includes(项.状态)).slice(-49), 项])
      if (!指定文本) set输入按范围((当前) => ({ ...当前, [当前范围标识]: '' }))
      return
    }
    if (进行中.current) return
    const 标识 = 排队.id
    const 文档 = 排队.范围 === '无文件' ? null : 最新文件.current.documents.find((项) => 项.id === 排队.范围) ?? null
    const 范围标识 = 排队.范围
    const { 表格文档模型, 演示文档模型 } = 最新文件.current
    变更队列((旧) => 旧.map((项) => 项.id === 标识 ? { ...项, 状态: '执行中' } : 项))
    const 任务: 执行任务 = { 标识, 范围: 范围标识, 会话标识: 排队.范围 === '无文件' ? 'general' : 会话标识按文档.current.get(排队.范围) ?? 排队.会话标识, 文件名: 文档?.name ?? '一般对话', 原始正文: '', 思考: '', 已停止: false, 文档, 原内容: '', 修改: [], 待刷新: {}, 正文已刷新: false, 思考已刷新: false }
    进行中.current = 任务
    set发送中(true)
    try {
      if (排队.范围 !== '无文件' && !文档) throw new Error('排队任务的原文件已关闭，请重新打开文件后发送需求')
      const 上下文 = 生成文件上下文(文档, 表格文档模型, 演示文档模型)
      任务.原内容 = 文档 ? 原始快照(文档, 表格文档模型, 演示文档模型) : ''
      任务.表格 = 文档 ? 表格文档模型[文档.id] : undefined
      任务.演示 = 文档 ? 演示文档模型[文档.id] : undefined
      const 消息列表 = [...(会话引用.current[范围标识] ?? []).filter((项) => 项.内容.trim() && (!项.状态 || 项.状态 === '完成')).map((项) => ({ 角色: 项.角色, 内容: 项.内容 })), { 角色: 'user' as const, 内容: 文本 }]
      set会话按范围((当前) => ({ ...当前, [范围标识]: [...(当前[范围标识] ?? []), { 角色: 'user', 内容: 文本 }, { 角色: 'assistant', 内容: '', 思考: '', 请求标识: 标识, 状态: '执行中', 阶段: '正在准备文件上下文' }] }))
      跟随输出.current = true
      const 结果 = await 桥接.ai.chat({ 消息: 消息列表, 文档上下文: 上下文, 文件快照: 文档 ? 任务.原内容 : undefined, 请求标识: 标识, 思考强度: 排队.强度, 上下文令牌: 配置.上下文令牌 ?? 131072, 会话标识: 任务.会话标识, 自动执行: 排队.自动执行, 手动压缩: 文本.toLowerCase() === '/compact' })
      if (!组件有效.current) return
      刷新任务消息(任务)
      if (任务.已停止 || 结果.数据?.已停止) {
        变更队列((旧) => 旧.map((项) => 项.id === 标识 ? { ...项, 状态: '取消' } : 项)); set队列暂停(true)
        更新任务消息(范围标识, 标识, { 状态: '已停止', 阶段: '已停止，未应用修改' })
        return
      }
      if (!结果.成功 || !结果.数据) throw new Error(结果.错误 || '模型服务未返回回复')
      const 回复 = 解析助手回复(结果.数据.内容)
      更新任务消息(范围标识, 标识, { 内容: 回复.回复, 思考: 结果.数据.思考 || 任务.思考, 阶段: '正在校验修改' })
      if (回复.修改.length > 0) 生成候选(任务, 回复.修改)
      if (结果.数据.计划 || 结果.数据.摘要 !== undefined || 结果.数据.压缩次数 !== undefined) {
        const 数据 = 结果.数据
        const 计划 = 数据.计划 ? 校验计划(数据.计划) : undefined
        set记忆按范围((当前) => ({ ...当前, [范围标识]: { 摘要: 数据.摘要 ?? 当前[范围标识]?.摘要 ?? '', 压缩次数: 数据.压缩次数 ?? 当前[范围标识]?.压缩次数 ?? 0, 计划: 计划 ?? 当前[范围标识]?.计划 ?? [] } }))
      }
      更新任务消息(范围标识, 标识, { 状态: '完成', 阶段: 任务.修改.length ? '修改已校验，等待确认' : '已回复，未修改文件' })
      变更队列((旧) => 旧.map((项) => 项.id === 标识 ? { ...项, 状态: '完成' } : 项))
    } catch (错误) {
      if (!组件有效.current) return
      刷新任务消息(任务)
      if (任务.已停止) { 变更队列((旧) => 旧.map((项) => 项.id === 标识 ? { ...项, 状态: '取消' } : 项)); set队列暂停(true); 更新任务消息(范围标识, 标识, { 状态: '已停止', 阶段: '已停止，未应用修改' }); return }
      变更队列((旧) => 旧.map((项) => 项.id === 标识 ? { ...项, 状态: '失败', 错误: 错误 instanceof Error ? 错误.message : '处理失败' } : 项)); set队列暂停(true)
      更新任务消息(范围标识, 标识, { 状态: '失败', 阶段: '处理失败，未应用修改' })
      set输入按范围((旧) => 旧[范围标识]?.trim() ? 旧 : { ...旧, [范围标识]: 文本 })
      modal.error({ title: '智能助手处理失败', content: 错误 instanceof Error ? 错误.message : '请检查模型设置与当前文件内容' })
    } finally {
      刷新任务消息(任务)
      const 结束状态 = 队列引用.current.find((项) => 项.id === 标识)?.状态
      变更队列((旧) => 旧.map((项) => 项.状态 === '已引导' && 项.错误 === 标识 ? { ...项, 状态: 结束状态 === '完成' ? '完成' : '失败', 错误: 结束状态 === '完成' ? undefined : '主任务未完成，补充需求可重试' } : 项))
      进行中.current = null; if (组件有效.current) set发送中(false)
    }
  }
  useEffect(() => {
    if (发送中 || 进行中.current || 队列暂停 || 引导中 || 清除中 || 处理候选中 || 绑定中 || Object.values(恢复中范围).some(Boolean)) return
    const 下一项 = 队列引用.current.find((项) => 项.状态 === '等待')
    if (!下一项 || (下一项.文本.toLowerCase() !== '/compact' && (待确认按文件[下一项.范围] || 恢复提示按范围[下一项.范围]))) return
    void 发送(下一项.文本, 下一项.自动执行, 下一项)
  }, [队列, 发送中, 队列暂停, 引导中, 清除中, 处理候选中, 绑定中, 恢复中范围, 待确认按文件, 恢复提示按范围])

  const 引导任务 = async (项: 排队任务) => {
    const 任务 = 进行中.current
    if (!任务 || 任务.已停止 || 引导中 || 项.状态 !== '等待') return
    if (任务.范围 !== 项.范围) { message.warning('引导需求必须属于当前正在处理的文件，请切回该文件后发送'); return }
    set引导中(项.id)
    try {
      const 结果 = await 桥接.ai.guide(任务.标识, 项.文本)
      if (!结果.成功) throw new Error(结果.错误 || '当前任务已进入收尾阶段')
      const 主状态 = 队列引用.current.find((旧项) => 旧项.id === 任务.标识)?.状态
      变更队列((旧) => 旧.map((旧项) => 旧项.id === 项.id ? { ...旧项, 状态: 主状态 === '完成' ? '完成' : 主状态 === '失败' || 主状态 === '取消' ? '失败' : '已引导', 错误: 主状态 === '失败' || 主状态 === '取消' ? '主任务未完成，补充需求可重试' : 任务.标识 } : 旧项))
      set会话按范围((当前) => ({ ...当前, [项.范围]: [...(当前[项.范围] ?? []), { 角色: 'user', 内容: `补充引导：${项.文本}` }] }))
      message.success('补充需求已提交，将在当前工作中一并处理')
    } catch (错误) { message.info(`${错误 instanceof Error ? 错误.message : '引导提交失败'}；需求仍保留在队列中`) }
    finally { if (组件有效.current) set引导中(null) }
  }
  // 每次渲染后刷新引用，保证浮窗/菜单触发的指令使用最新状态
  发送引用.current = (文本: string) => { void 发送(文本) }

  const 停止任务 = async () => {
    const 任务 = 进行中.current
    if (!任务 || 任务.已停止) return
    刷新任务消息(任务)
    任务.已停止 = true
    更新任务消息(任务.范围, 任务.标识, { 阶段: '正在停止' })
    try {
      const 结果 = await 桥接.ai.cancel(任务.标识)
      if (!结果.成功) throw new Error(结果.错误 || '请稍后重试')
    } catch (错误) {
      if (进行中.current === 任务) {
        任务.已停止 = false
        更新任务消息(任务.范围, 任务.标识, { 阶段: '停止失败，任务仍在执行' })
        modal.error({ title: '停止任务失败', content: 错误 instanceof Error ? 错误.message : '请稍后重试' })
      }
    }
  }

  const 应用修改 = () => {
    const 待确认 = 当前待确认
    if (!待确认) return
    try {
      const 文档 = documents.find((项) => 项.id === 待确认.标识)
      if (待确认.类型 === 'create') {
        const 文件 = (待确认.修改 as 创建文件[]).map(构建新文件)
        文件.forEach((项) => createDoc(项.类型, 项.内容, { 名称: 项.名称 }))
      } else {
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
      }
      set待确认按文件((当前) => ({ ...当前, [待确认.标识]: undefined }))
      const 旧计划 = 记忆按范围[待确认.范围]?.计划 ?? []
      const 计划 = 旧计划.map((项): 计划项 => 项.status === 'awaiting_confirmation' ? { ...项, status: 'completed' } : 项)
      set记忆按范围((当前) => ({ ...当前, [待确认.范围]: { 摘要: 当前[待确认.范围]?.摘要 ?? '', 压缩次数: 当前[待确认.范围]?.压缩次数 ?? 0, 计划 } }))
      if (typeof window.electronAPI?.ai?.updateSessionPlan === 'function') {
        set处理候选中(true)
        void 桥接.ai.updateSessionPlan(待确认.会话标识, 计划).then((结果) => {
          if (!结果.成功) throw new Error(结果.错误 || '无法保存计划完成状态')
        }).catch((错误: unknown) => { if (组件有效.current) modal.error({ title: '保存候选完成状态失败', content: `修改已应用到编辑区。${错误 instanceof Error ? 错误.message : '无法清除持久候选'}` }) }).finally(() => { if (组件有效.current) set处理候选中(false) })
      }
      message.success(待确认.类型 === 'create' ? '文件已创建到编辑区，请保存文件' : '修改已应用到当前编辑内容，请保存文件')
    } catch (错误) {
      modal.error({ title: '应用修改失败', content: 错误 instanceof Error ? 错误.message : '当前文件无法应用修改' })
    }
  }

  const 放弃修改 = async () => {
    const 待确认 = 当前待确认
    if (!待确认 || 发送中 || 处理候选中 || 绑定中) return
    set处理候选中(true)
    try {
      if (typeof window.electronAPI?.ai?.discardSessionProposal === 'function') {
        const 结果 = await 桥接.ai.discardSessionProposal(待确认.会话标识)
        if (!结果.成功) throw new Error(结果.错误 || '无法清除持久候选')
      }
      set待确认按文件((当前) => ({ ...当前, [待确认.标识]: undefined }))
    } catch (错误) { modal.error({ title: '放弃修改失败', content: 错误 instanceof Error ? 错误.message : '无法清除持久候选' }) }
    finally { if (组件有效.current) set处理候选中(false) }
  }

  const 新对话 = async () => {
    if (进行中.current || 清除中 || 恢复中 || 绑定中 || 处理候选中) return
    const 范围 = 当前范围标识
    set清除中(true)
    try {
      if (typeof window.electronAPI?.ai?.clearSession === 'function') {
        const 结果 = await 桥接.ai.clearSession(当前会话标识)
        if (!结果.成功) throw new Error(结果.错误 || '无法清除本机会话记忆')
      }
      set会话按范围((当前) => ({ ...当前, [范围]: [] }))
      set输入按范围((当前) => ({ ...当前, [范围]: '' }))
      set记忆按范围((当前) => ({ ...当前, [范围]: { 摘要: '', 压缩次数: 0, 计划: [] } }))
      set恢复提示按范围((当前) => ({ ...当前, [范围]: '' }))
      set待确认按文件((当前) => ({ ...当前, [范围]: undefined }))
      变更队列((旧) => 旧.filter((项) => 项.范围 !== 范围))
    } catch (错误) { modal.error({ title: '开始新对话失败', content: 错误 instanceof Error ? 错误.message : '无法清除本机会话记忆' }) }
    finally { if (组件有效.current) set清除中(false) }
  }

  return <>
    {放映中 ? null : <button type="button" className="assistant-launcher" onClick={() => set打开(true)} aria-label="打开智能助手" disabled={!桥接.ai.可用} title={桥接.ai.可用 ? undefined : '请在 Windows 桌面版使用智能助手'}><Icon name="ai" size={16} /><span>智能助手</span></button>}
    <Drawer className="assistant-drawer" title="智能助手" placement="right" width="min(430px, 100vw)" mask={false} open={打开 && !放映中} onClose={() => set打开(false)} destroyOnClose={false}>
      <div className={`assistant-drawer__layout${配置展开 ? ' assistant-drawer__layout--settings' : ''}`}>
        <div className="assistant-drawer__header"><strong>文件对话</strong><div className="assistant-drawer__header-actions"><Button size="small" disabled={交互禁用} loading={清除中} onClick={() => void 新对话()}>新对话</Button><Button type="link" onClick={() => set配置展开((值) => !值)}>{配置展开 ? '收起模型设置' : '模型设置'}</Button></div></div>
        {配置展开 ? <AiSettingsCard compact onSaved={(新配置) => { set配置(新配置); set强度(新配置.思考强度 ?? 'high'); set配置展开(false) }} /> : null}
        <div className="assistant-drawer__work">
        <div className="assistant-drawer__scope"><strong>当前范围：</strong>{当前文档 ? 当前文档.name : '未选择文件'}。{当前文档 ? '发送消息时会提供该文件内容；修改仅在审阅并应用后进入编辑区。' : '可以咨询问题或要求新建文字、表格、演示文件；新文件也会先显示预览。'}</div>
        {发送中 && 进行中.current?.范围 !== 当前范围标识 ? <div className="assistant-drawer__background-task">正在处理：{进行中.current?.文件名}<Button size="small" onClick={() => void 停止任务()}>停止</Button></div> : null}
        <div ref={消息容器} className="assistant-drawer__messages" role="log" aria-label="助手对话" onScroll={() => { const 元素 = 消息容器.current; if (元素) 跟随输出.current = 元素.scrollHeight - 元素.scrollTop - 元素.clientHeight < 64 }}>
          {恢复中 ? <div className="assistant-drawer__empty" role="status">正在恢复本机会话记忆</div> : null}
          {绑定中范围[当前范围标识] ? <div className="assistant-drawer__empty" role="status">正在绑定已保存文件的会话记忆</div> : null}
          {恢复提示按范围[当前范围标识] ? <div className="assistant-drawer__empty" role="status">{恢复提示按范围[当前范围标识]}<Button size="small" disabled={交互禁用} onClick={async () => {
            set处理候选中(true)
            try { const 结果 = await 桥接.ai.discardSessionProposal(当前会话标识); if (!结果.成功) throw new Error(结果.错误 || '无法清除过期候选'); set恢复提示按范围((旧) => ({ ...旧, [当前范围标识]: '' })) }
            catch (错误) { modal.error({ title: '清除过期候选失败', content: 错误 instanceof Error ? 错误.message : '请重试' }) }
            finally { set处理候选中(false) }
          }}>清除过期候选</Button></div> : null}
          {当前记忆?.计划.length ? <details className="assistant-context assistant-plan"><summary>任务计划 · {当前记忆.计划.filter((项) => 项.status === 'completed').length}/{当前记忆.计划.length} 已完成</summary><ol>{当前记忆.计划.map((项) => <li key={项.id}><span>{项.title}</span><span className="assistant-plan__status">{计划状态[项.status]}</span></li>)}</ol>{当前记忆.计划.some((项) => ['pending', 'in_progress', 'failed'].includes(项.status)) ? <Button size="small" disabled={交互禁用} onClick={() => void 发送('请执行当前任务计划，逐项完成并报告结果；需要修改文件时先生成候选供我确认。', true)}>执行计划</Button> : null}</details> : null}
          {当前记忆 && (当前记忆.摘要 || 当前记忆.压缩次数 > 0) ? <details className="assistant-context assistant-memory"><summary>会话记忆 · 已压缩 {当前记忆.压缩次数} 次</summary><div>{当前记忆.摘要 || '历史上下文已压缩，完整对话保存在本机。'}</div></details> : null}
          {!恢复中 && 会话.length === 0 ? <div className="assistant-drawer__empty">可以新建文字、表格和演示，改写内容、插入段落、更新单元格或设置演示动画。修改先预览，确认后进入编辑区。</div> : null}
          {会话.map((项, 索引) => <div className={`assistant-message${项.角色 === 'user' ? ' assistant-message--user' : ''}`} key={`${索引}-${项.角色}`}>
            <span className="assistant-message__role">{项.角色 === 'user' ? '我' : '助手'}</span>
            {项.思考 ? <details className="assistant-thinking" open={项.状态 === '执行中' ? true : undefined}><summary>思考内容{项.状态 === '执行中' && 项.阶段 === '正在思考' ? ' · 接收中' : ''}</summary><div>{项.思考}</div></details> : null}
            {项.内容 ? <div className={`assistant-message__body${项.状态 === '执行中' && 项.阶段 === '正在输出' ? ' assistant-message__body--streaming' : ''}`}>{项.内容}</div> : null}
            {项.状态 ? <div className="assistant-task" role="status">{项.状态 === '执行中' ? <span className="assistant-task__spinner" aria-hidden="true" /> : null}<span>{项.阶段}</span></div> : null}
          </div>)}
        </div>
        {当前待确认 ? <section className="assistant-preview" aria-label="待确认修改">
          <strong>待确认修改，共 {当前待确认.修改.length} 处</strong>
          <div className="assistant-preview__list">{当前待确认.修改.slice(修改页 * 每页修改数, (修改页 + 1) * 每页修改数).map((项, 索引) => {
            const 说明 = 修改说明(项)
            return <div className="assistant-preview__item" key={修改页 * 每页修改数 + 索引}><div>{说明.位置}</div><div className="assistant-preview__old">原文：{说明.原文 || '空白'}</div><div className="assistant-preview__new">修改后：{说明.新文 || '空白'}</div></div>
          })}</div>
          {当前待确认.修改.length > 每页修改数 ? <div className="assistant-preview__pagination"><Button size="small" aria-label="上一页修改" disabled={修改页 === 0} onClick={() => set修改页((页) => 页 - 1)}>上一页</Button><span>第 {修改页 + 1} / {Math.ceil(当前待确认.修改.length / 每页修改数)} 页</span><Button size="small" aria-label="下一页修改" disabled={(修改页 + 1) * 每页修改数 >= 当前待确认.修改.length} onClick={() => set修改页((页) => 页 + 1)}>下一页</Button></div> : null}
          <div className="assistant-preview__actions"><Button type="primary" onClick={应用修改} disabled={交互禁用}>应用修改</Button><Button disabled={交互禁用} onClick={() => void 放弃修改()}>放弃修改</Button></div>
        </section> : null}
        {队列.some((项) => ['等待', '执行中', '失败', '已引导'].includes(项.状态)) ? <section className="assistant-queue" aria-label="助手任务队列">
          <div className="assistant-queue__heading"><strong>任务队列 · {队列.filter((项) => 项.状态 === '等待').length} 项等待</strong><Button size="small" onClick={() => set队列暂停((旧) => !旧)}>{队列暂停 ? '继续队列' : '暂停队列'}</Button></div>
          <p role="status">{队列暂停 ? '队列已暂停，正在执行的任务会继续。' : 队列.find((项) => 项.状态 === '等待' && 待确认按文件[项.范围]) ? '等待确认上一项修改后继续。' : '按提交顺序执行；可将同一文件的补充需求引导到当前任务。'}</p>
          <div className="assistant-queue__list">{队列.filter((项) => ['等待', '执行中', '失败', '已引导'].includes(项.状态)).map((项) => <div className={`assistant-queue__item assistant-queue__item--${项.状态}`} key={项.id}>
            <div><strong>{项.状态} · {项.文件名}</strong><span>{项.文本}</span>{项.状态 === '失败' && 项.错误 ? <small>失败原因：{项.错误}</small> : null}</div>
            <div className="assistant-queue__actions">{项.范围 !== '无文件' && 项.范围 !== 当前范围标识 ? <Button size="small" onClick={() => setActiveDocumentId(项.范围)}>返回文件</Button> : null}
            {项.状态 === '等待' ? <><Button size="small" icon={<Icon name="ai" size={15} />} title="不打断当前任务，将补充需求一起处理" aria-label={`引导当前任务：${项.文本}`} disabled={!发送中 || 进行中.current?.范围 !== 项.范围 || !!引导中 || !项.自动执行} loading={引导中 === 项.id} onClick={() => void 引导任务(项)}>引导</Button><Button size="small" disabled={引导中 === 项.id} onClick={() => 变更队列((旧) => 旧.filter((旧项) => 旧项.id !== 项.id))}>移除</Button></> : null}
            {项.状态 === '失败' ? <><Button size="small" onClick={() => { 变更队列((旧) => [{ ...项, id: crypto.randomUUID(), 状态: '等待', 错误: undefined }, ...旧.filter((旧项) => 旧项.id !== 项.id)]); set队列暂停(false) }}>重试</Button><Button size="small" onClick={() => 变更队列((旧) => 旧.filter((旧项) => 旧项.id !== 项.id))}>移除</Button></> : null}</div>
          </div>)}</div>
        </section> : null}
        </div>
        <div className="assistant-drawer__composer">
          <div className="assistant-drawer__reasoning"><label>思考强度</label><Select aria-label="思考强度" value={强度} options={思考选项} disabled={发送中} onChange={set强度} />{新版可用 ? <Checkbox checked={仅规划} disabled={发送中} onChange={(事件) => set仅规划(事件.target.checked)}>仅生成计划</Checkbox> : null}</div>
          <p className="assistant-drawer__reasoning-note">{思考说明(配置?.参数模式, 强度)} · 上下文 {((配置?.上下文令牌 ?? 131072) / 1024).toFixed(0)}K，80%自动压缩 · /help</p>
          <Input.TextArea aria-label="发送给智能助手的消息" value={输入} maxLength={12000} rows={3} disabled={清除中} placeholder="输入需求，或输入 /help 查看命令" onChange={(事件) => set输入按范围((当前) => ({ ...当前, [当前范围标识]: 事件.target.value }))} onPressEnter={(事件) => { if (事件.ctrlKey) { 事件.preventDefault(); void 发送() } }} />
          <div className="assistant-drawer__composer-actions"><span>按 Ctrl+Enter 发送</span><div>{发送中 ? <Button onClick={() => void 停止任务()} disabled={进行中.current?.已停止}>停止生成</Button> : null}<Button type="primary" disabled={!输入.trim() || 清除中 || !配置} onClick={() => void 发送()}>{发送中 || 队列.some((项) => 项.状态 === '等待') || 当前待确认 ? '加入队列' : '发送'}</Button></div></div>
        </div>
      </div>
    </Drawer>
  </>
}
