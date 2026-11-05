import { useEffect, useRef, useState } from 'react'
import { App, Button, Checkbox, Empty, Input, Pagination, Select, Tag } from 'antd'
import { cloudCall } from './CloudProvider'
import { useSettings } from '../store/settingsStore'
import type { CloudNode } from './CloudFileBrowser'
import './myShares.css'

type 分享类型 = 'link' | 'account'
type 分享状态 = 'active' | 'expired' | 'revoked' | 'sourceRemoved'
interface 分享记录 {
  id: string
  kind: 分享类型
  nodeId: string
  name?: string
  recipientPhone: string | null
  expiresAt: number | null
  permission: 'read' | 'edit' | null
  downloads: number | null
  created: number
  status: 分享状态
}
interface 批量结果 { kind: 分享类型; id: string; ok: boolean; error?: string }
interface Props { nodes: CloudNode[]; onBack: () => void }

export default function MySharesPage({ nodes, onBack }: Props) {
  const { message, modal } = App.useApp()
  const { 语言 } = useSettings()
  const en = 语言 === 'en-US', t = (zh: string, english: string) => en ? english : zh
  const [items, setItems] = useState<分享记录[]>([])
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [kind, setKind] = useState('all')
  const [name, setName] = useState('')
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const key = (item: Pick<分享记录, 'kind' | 'id'>) => `${item.kind}:${item.id}`
  const beginFilter = () => { setLoading(true); setItems([]); setTotal(0); setSelected([]) }
  const nodeNames = new Map(nodes.map(node => [node.id, node.meta?.filename || node.meta?.name]))
  const nameOf = (item: 分享记录) => item.status === 'sourceRemoved' ? t('来源文件已移除', 'Source file removed') : nodeNames.get(item.nodeId) || item.name || t('加密云文件', 'Encrypted cloud file')
  const permissionOf = (item: 分享记录) => item.kind === 'link' ? t('仅下载', 'Download only') : item.permission === 'edit' ? t('可编辑', 'Can edit') : t('只读', 'Read only')
  const expiryOf = (item: 分享记录) => item.expiresAt ? new Date(item.expiresAt).toLocaleString(en ? 'en-US' : 'zh-CN') : t('永久有效', 'Never expires')
  const load = async () => {
    const version = ++requestVersion.current
    setLoading(true)
    try {
      const result = await cloudCall<{ items: 分享记录[]; total: number }>('mySharesList', { page, limit: 50, status, kind, name })
      if (version !== requestVersion.current) return
      setItems(result.items)
      setTotal(result.total)
      if (!result.items.length && page > 1 && result.total > 0) setPage(Math.max(1, Math.ceil(result.total / 50)))
    } catch (caught) { if (version === requestVersion.current) { setItems([]); setTotal(0); setSelected([]); setError(caught instanceof Error ? caught.message : t('读取分享记录失败', 'Could not load shares')) } }
    finally { if (version === requestVersion.current) setLoading(false) }
  }
  useEffect(() => { setSelected([]); setError(''); void load(); return () => { requestVersion.current++ } }, [page, status, kind, name])
  const entries = items.filter(item => selected.includes(key(item))).map(item => ({ kind: item.kind, id: item.id }))
  const allSelected = items.length > 0 && items.every(item => selected.includes(key(item)))
  const toggleAll = (checked: boolean) => setSelected(checked ? items.map(key) : [])

  const execute = async (action: 'revoke' | 'delete' | 'cleanInvalid') => {
    setBusy(true)
    setError('')
    try {
      let results: 批量结果[] = []
      if (action === 'cleanInvalid') {
        let more = false, cursor: string | undefined
        do {
          const batch = await cloudCall<{ results: 批量结果[]; hasMore: boolean; nextCursor: string | null }>('mySharesBatch', { action, limit: 100, ...(cursor ? { cursor } : {}) })
          results = results.concat(batch.results)
          more = batch.hasMore
          if (more) {
            if (!batch.nextCursor || batch.nextCursor === cursor) throw new Error(t('清理分页信息无效，请刷新记录后重试。', 'Cleanup pagination is invalid. Refresh shares and try again.'))
            cursor = batch.nextCursor
          }
        } while (more)
      } else {
        const batch = await cloudCall<{ results: 批量结果[] }>('mySharesBatch', { action, entries })
        results = batch.results
      }
      const failed = results.filter(result => !result.ok)
      setSelected(failed.map(key))
      if (failed.length) setError(t(`${failed.length} 条记录处理失败：${failed.map(result => result.error || '未知错误').join('；')}`, `${failed.length} shares failed: ${failed.map(result => result.error || 'Unknown error').join('; ')}`))
      const success = results.filter(result => result.ok).length
      if (success) message.success(t(`已处理 ${success} 条分享记录`, `${success} shares updated`))
      else if (!failed.length) message.info(t('没有需要清理的已失效记录', 'No invalid shares to clean up'))
      await load()
    } catch (caught) { modal.error({ title: t('分享记录操作失败', 'Share operation failed'), content: caught instanceof Error ? caught.message : t('请稍后重试', 'Please try again') }) }
    finally { setBusy(false) }
  }
  const confirm = async (action: 'revoke' | 'delete' | 'cleanInvalid') => {
    if (loading || busy) return
    if (action !== 'cleanInvalid' && !entries.length) return
    let cleanCount = 0
    if (action === 'cleanInvalid') {
      setBusy(true)
      try { cleanCount = (await cloudCall<{ count: number }>('mySharesCleanupPreview')).count }
      catch (caught) { modal.error({ title: t('无法预览清理数量', 'Could not preview cleanup'), content: caught instanceof Error ? caught.message : t('请稍后重试', 'Please try again') }); return }
      finally { setBusy(false) }
      if (!cleanCount) { message.info(t('没有需要清理的已失效记录', 'No invalid shares to clean up')); return }
    }
    const title = action === 'revoke' ? t('取消所选分享？', 'Revoke selected shares?') : action === 'delete' ? t('删除所选分享记录？', 'Delete selected share records?') : t('清理所有已失效的分享记录？', 'Clean all invalid share records?')
    const content = action === 'revoke' ? t('分享将立即失效，记录仍会保留。', 'Shares will stop working, while their records remain.') : action === 'delete' ? t('仅移除分享记录，原云文件及其历史版本会保留。有效分享会先被取消。', 'Only share records will be removed. Active shares will be revoked first. Original files and versions remain.') : t(`当前可清理 ${cleanCount} 条记录。执行时将重新核验状态；只移除分享记录，原云文件与历史版本会保留。`, `${cleanCount} invalid records can be cleaned. Their status will be checked again before deletion. Original files and versions remain.`)
    modal.confirm({ title, centered: true, content, okButtonProps: { danger: action !== 'revoke' }, onOk: () => execute(action) })
  }
  const statusLabel: Record<分享状态, string> = {
    active: t('有效', 'Active'), expired: t('已过期', 'Expired'), revoked: t('已取消', 'Revoked'), sourceRemoved: t('来源文件已移除', 'Source file removed'),
  }
  const statusColor: Record<分享状态, string> = { active: 'success', expired: 'warning', revoked: 'default', sourceRemoved: 'error' }

  return <section className="seal-cloud-page seal-drive seal-my-shares ds-page-shell">
    <header className="seal-drive-header ds-page-header seal-my-shares-header">
      <div><Button type="link" className="seal-my-shares-back" onClick={onBack}>{t('返回云空间', 'Back to cloud space')}</Button><h1>{t('我的分享', 'My shares')}</h1></div>
      <Button disabled={busy || loading} onClick={() => void confirm('cleanInvalid')}>{t('清理已失效记录', 'Clean invalid records')}</Button>
    </header>
    <div className="seal-my-shares-tools">
      <Select aria-label={t('分享类型', 'Share type')} disabled={busy} value={kind} onChange={value => { beginFilter(); setPage(1); setKind(value) }} options={[
        { value: 'all', label: t('全部类型', 'All types') }, { value: 'link', label: t('分享链接', 'Share link') }, { value: 'account', label: t('指定账号共享', 'Account share') },
      ]} />
      <Select aria-label={t('分享状态', 'Share status')} disabled={busy} value={status} onChange={value => { beginFilter(); setPage(1); setStatus(value) }} options={[
        { value: 'all', label: t('全部状态', 'All statuses') }, { value: 'active', label: t('有效', 'Active') }, { value: 'expired', label: t('已过期', 'Expired') }, { value: 'revoked', label: t('已取消', 'Revoked') }, { value: 'sourceRemoved', label: t('来源文件已移除', 'Source file removed') },
      ]} />
      <Input allowClear disabled={busy} aria-label={t('按文件名筛选', 'Filter by file name')} placeholder={t('筛选文件名', 'Filter file names')} value={name} onChange={event => { beginFilter(); setPage(1); setName(event.target.value) }} />
      <span>{t(`共 ${total} 条记录`, `${total} records`)}</span>
    </div>
    {error ? <p className="seal-cloud-error" role="alert">{error}</p> : null}
    {selected.length ? <div className="seal-drive-selection"><span>{t(`已选择 ${selected.length} 条`, `${selected.length} selected`)}</span><Button disabled={busy || loading} onClick={() => void confirm('revoke')}>{t('批量取消分享', 'Revoke selected shares')}</Button><Button danger disabled={busy || loading} onClick={() => void confirm('delete')}>{t('删除所选记录', 'Delete selected records')}</Button><Button type="text" disabled={loading} onClick={() => setSelected([])}>{t('取消选择', 'Clear selection')}</Button></div> : null}
    <div className="seal-my-shares-list">
      <div className="seal-my-shares-list-heading"><Checkbox aria-label={t('全选本页分享', 'Select all shares on this page')} disabled={loading || busy} checked={allSelected} indeterminate={selected.length > 0 && !allSelected} onChange={event => toggleAll(event.target.checked)} /><span>{t('文件与分享方式', 'File and share type')}</span><span>{t('状态', 'Status')}</span><span>{t('创建时间', 'Created')}</span></div>
      {loading ? <p className="seal-my-shares-loading">{t('正在读取分享记录…', 'Loading shares…')}</p> : items.length ? <ul>{items.map(item => <li key={key(item)}>
        <Checkbox aria-label={t(`选择分享 ${nameOf(item)}`, `Select share ${nameOf(item)}`)} disabled={loading || busy} checked={selected.includes(key(item))} onChange={event => setSelected(previous => event.target.checked ? [...previous, key(item)] : previous.filter(value => value !== key(item)))} />
        <div className="seal-my-shares-name"><strong translate="no">{nameOf(item)}</strong><span>{item.kind === 'link' ? t('分享链接', 'Share link') : t('指定账号共享', 'Account share')}{item.recipientPhone ? ` · ${item.recipientPhone}` : ''}</span><div className="seal-my-shares-details"><span>{permissionOf(item)}</span><span>{t('到期', 'Expires')}：{expiryOf(item)}</span>{item.kind === 'link' ? <span>{t(`下载 ${item.downloads ?? 0} 次`, `${item.downloads ?? 0} downloads`)}</span> : null}</div></div>
        <Tag color={statusColor[item.status]}>{statusLabel[item.status]}</Tag>
        <time dateTime={new Date(item.created).toISOString()}>{new Date(item.created).toLocaleString(en ? 'en-US' : 'zh-CN')}</time>
      </li>)}</ul> : <Empty description={t('没有分享记录', 'No share records')} />}
    </div>
    {total > 50 ? <Pagination current={page} pageSize={50} total={total} disabled={loading || busy} showSizeChanger={false} onChange={value => { beginFilter(); setPage(value) }} /> : null}
    <p className="seal-my-shares-note">{t('历史分享链接的完整地址无法从服务器找回。需要重新分享时，请在原文件中生成新链接。', 'Full URLs for old share links cannot be recovered. Create a new link from the original file when needed.')}</p>
  </section>
}
