import { useEffect, useState } from 'react'
import { Alert, Button } from 'antd'
import { useAppStore } from '../store'
import { useCloud } from '../cloud/CloudProvider'
import { bindingEvent, getFileBinding, synchronizeBinding } from './fileAccess'
import { getRealtimeClient, realtimeEvent } from './useRealtimeDocument'

export default function CollaborationSaveBanner() {
  const store = useAppStore(), cloud = useCloud(), [, setVersion] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false)
  useEffect(() => { const update = () => setVersion(value => value + 1); window.addEventListener(bindingEvent, update); window.addEventListener(realtimeEvent, update); return () => { window.removeEventListener(bindingEvent, update); window.removeEventListener(realtimeEvent, update) } }, [])
  const id = store.activeWorkspaceTabId ?? '', path = store.pdfDocuments.find(item => item.id === id)?.path ?? store.文档路径[id]
  const originalPath = store.documents.find(document => document.id === id)?.来源路径
  const binding = (path ? getFileBinding(path) : undefined) ?? (!path && originalPath ? getFileBinding(originalPath) : undefined)
  const dirty = store.workspaceTabs.some(tab => tab.id === id && tab.dirty)
  useEffect(() => { setError(''); setDone(false) }, [id])
  if (!['word', 'table', 'ppt', 'pdf'].includes(store.module) || !binding || binding.accountId !== cloud.state.account?.id) return null
  const client = getRealtimeClient(id), realtime = client?.status
  if (client && realtime && realtime.status !== 'unsupported') {
    const label = { connecting: '正在连接实时共同编辑', online: '实时共同编辑已连接', offline: '离线编辑 · 正在重连', readonly: '实时只读查看', revoked: '实时访问权限已撤销', error: '实时同步暂未完成', closed: '实时会话已关闭', unsupported: '' }[realtime.status]
    return <div className="seal-collaboration-save"><div className="seal-cloud-banner" role="status" aria-live="polite">
      <span>{label}{realtime.connected ? ` · ${realtime.peers.length + 1} 台设备在线` : ''}{realtime.pending ? ` · ${realtime.pending} 项本机修改待同步` : ''}。保存或导出会写出本机当前内容。</span>
      {realtime.peers.length ? <span aria-label="在线成员">{realtime.peers.map(peer => peer.name).join('、')}</span> : null}
      {!['connecting', 'revoked', 'readonly'].includes(realtime.status) ? <Button size="small" loading={busy} onClick={() => { if (busy) return; setBusy(true); setError(''); void client.flush().catch(reason => setError(reason instanceof Error ? reason.message : '重连失败')).finally(() => setBusy(false)) }}>立即同步</Button> : null}
    </div>{realtime.error || error ? <Alert role="alert" type={realtime.status === 'offline' ? 'warning' : 'error'} showIcon message={realtime.error || error} description="本机内容保留。权限撤销或离线时仍可另存本机副本；已下载副本无法远程收回。" /> : null}</div>
  }
  return <div className="seal-collaboration-save"><div className="seal-cloud-banner" role="status">
    <span>{binding.editable ? `当前为${binding.kind === 'team' ? '团队' : '共享'}本机副本 · 云版本 ${binding.version}。先保存到本机，再同步已保存内容。` : '当前为只读权限的本机副本；本机编辑不会写回共享来源。'}</span>
    {binding.editable ? <Button size="small" loading={busy} disabled={dirty || !cloud.state.unlocked} onClick={() => {
      if (!path || busy) return
      setBusy(true); setError(''); setDone(false)
      void synchronizeBinding(path, binding).then(() => setDone(true)).catch(reason => setError(reason instanceof Error ? reason.message : '同步失败')).finally(() => setBusy(false))
    }}>{dirty ? '请先保存本机副本' : '同步已保存内容'}</Button> : null}
    {done ? <span>同步成功</span> : null}
  </div>{error ? <Alert role="alert" type="error" showIcon message="共享同步失败" description={error} /> : null}</div>
}
