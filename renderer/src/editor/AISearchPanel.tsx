import { useEffect, useRef, useState } from 'react'
import { 桥接 } from '../ipc/bridge'
import { 搜索文档含义, type AI搜索结果 } from './aiSearch'
import { 高亮搜索, 定位文字 } from './textSearch'

export default function AISearchPanel({ query, getRoot, documentId }: { query: string; getRoot: () => HTMLElement | null; documentId: string }) {
  const [结果, set结果] = useState<AI搜索结果[]>([]), [状态, set状态] = useState(''), [忙碌, set忙碌] = useState(false)
  const 任务 = useRef<{ 取消: boolean; 请求: string; 快照: string } | null>(null)
  const 停止 = () => { const 当前 = 任务.current; if (当前) { 当前.取消 = true; if (当前.请求) void 桥接.ai.cancel(当前.请求) }; set忙碌(false) }
  useEffect(() => {
    set结果([]); set状态(''); set忙碌(false)
    return () => { const 当前 = 任务.current; if (当前) { 当前.取消 = true; if (当前.请求) void 桥接.ai.cancel(当前.请求) } }
  }, [documentId, query])
  const 搜索 = async () => {
    const 根 = getRoot(); if (!根 || !query.trim()) { set状态('请输入搜索需求'); return }
    const 当前 = { 取消: false, 请求: '', 快照: 根.innerHTML }; 任务.current = 当前
    set忙碌(true); set结果([]); set状态('AI 正在准备搜索…')
    try {
      const 内容 = await 搜索文档含义(根, query, { 已取消: () => 当前.取消, 请求: id => { 当前.请求 = id }, 进度: set状态 })
      if (!当前.取消) { set结果(内容); set状态(内容.length ? `AI 找到 ${内容.length} 处相关内容，点击结果定位` : 'AI 未找到有依据的相关内容') }
    } catch (错误) { if (!当前.取消) set状态(错误 instanceof Error ? 错误.message : 'AI 搜索失败') }
    finally { if (任务.current === 当前) { 当前.请求 = ''; set忙碌(false) } }
  }
  return <div className="wps-find__ai">
    <button type="button" className="wps-find__button" disabled={忙碌} onClick={搜索}>AI 搜索</button>
    {忙碌 && <button type="button" className="wps-find__button" onClick={() => { 停止(); set状态('已停止 AI 搜索') }}>停止搜索</button>}
    <span className="wps-find__tip">按含义查找；使用已配置的模型服务，搜索时发送本文档文字。</span>
    <div role="status">{状态}</div>
    {结果.length > 0 && <div className="wps-find__results" aria-label="AI 搜索结果">{结果.map((项, 序号) => <button type="button" key={序号} onClick={() => {
      const 根 = getRoot()
      if (!根 || 根.innerHTML !== 任务.current?.快照) { set结果([]); set状态('文档已变化，请重新进行 AI 搜索'); return }
      高亮搜索(结果.map(项 => 项.范围), 项.范围); 定位文字(根, 项.范围)
    }}><strong>{序号 + 1}. {项.原文}</strong>{项.说明 && <span>{项.说明}</span>}</button>)}</div>}
  </div>
}
