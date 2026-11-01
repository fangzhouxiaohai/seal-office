import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, App, Button, Input, Modal } from 'antd'
import { cloudCall, useCloud } from '../cloud/CloudProvider'
import { writeClipboardText } from '../editor/clipboard'
import Icon from '../components/Icon'
import LoadingState from '../components/LoadingState'
import '../cloud/drive.css'
import './collaboration.css'
import { credentialLink } from './credentialLinks'

export function useCloudWorkspace<T>(initial: T, loader: () => Promise<T>, scope = '') {
  const cloud = useCloud()
  const enabled = Boolean(cloud.state.account?.enabled && cloud.state.unlocked)
  const key = `${cloud.state.account?.id ?? ''}:${enabled}:${scope}`
  const current = useRef({ key, loader }); current.current = { key, loader }
  const generation = useRef(0), pending = useRef(false)
  const [data, setData] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(false), [loadedKey, setLoadedKey] = useState('')
  const refresh = useCallback(async () => {
    const capture = current.current, sequence = ++generation.current
    setLoading(true)
    try {
      const result = await capture.loader()
      if (current.current.key !== capture.key || sequence !== generation.current) return
      setData(result); setError('')
    } catch (reason) { if (current.current.key === capture.key && sequence === generation.current) setError(reason instanceof Error ? reason.message : '云端读取失败') }
    finally { if (current.current.key === capture.key && sequence === generation.current) { setLoadedKey(capture.key); setLoading(false) } }
  }, [])
  useEffect(() => {
    generation.current++; setData(initial); setError('')
    if (enabled) void refresh()
    return () => { generation.current++ }
  }, [key, refresh])
  useEffect(() => { const reload = () => { if (enabled) void refresh() }; window.addEventListener('seal-collaboration-refresh', reload); return () => window.removeEventListener('seal-collaboration-refresh', reload) }, [enabled, refresh])
  const execute = async <R,>(operation: () => Promise<R>, success?: (result: R) => void): Promise<boolean> => {
    if (pending.current) return false
    const capture = current.current.key
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await operation()
      if (capture !== current.current.key) return false
      success?.(result); await refresh(); return true
    } catch (reason) {
      if (capture === current.current.key) setError(reason instanceof Error ? reason.message : '操作失败，请重试')
      return false
    } finally { pending.current = false; setBusy(false) }
  }
  return { cloud, data, busy: busy || enabled && (loading || loadedKey !== key), initialLoading: enabled && loadedKey !== key, error, enabled, refresh, execute }
}

export function CloudGate({ title }: { title: string }) {
  const cloud = useCloud()
  return <section className="seal-drive seal-drive-welcome"><Icon name="cloud" size={54} /><h1>{title}</h1><p>登录并解锁加密云空间后使用此功能</p><Button type="primary" onClick={cloud.configure}>{cloud.state.account?.enabled ? '解锁云空间' : '登录并开通云空间'}</Button></section>
}

/** 首次读取云端数据时的统一加载界面，保留页面标题，避免空列表闪烁。 */
export function WorkspaceLoading({ title }: { title: string }) {
  return <section className="seal-cloud-page seal-drive ds-page-shell"><header className="seal-collaboration-header"><h1>{title}</h1></header><LoadingState 文字={`正在读取${title}…`} /></section>
}

export function WorkspaceError({ error }: { error: string }) { return error ? <Alert role="alert" type="error" showIcon message="操作未完成" description={error} /> : null }

export function CredentialDialog({ value, onClose }: { value: { title: string; credential: string } | null; onClose: () => void }) {
  const { message } = App.useApp()
  return <Modal title={value?.title} open={Boolean(value)} centered onCancel={onClose} footer={<Button onClick={onClose}>完成</Button>}>
    <p>请自行把凭证交给指定接收者。海豹办公不会自动发送消息；凭证过期或被撤销后不能继续使用。</p>
    <Input.TextArea aria-label="邀请凭证" readOnly rows={4} value={value?.credential ?? ''} />
    <Button onClick={() => { void writeClipboardText(value?.credential ?? '').then(() => message.success('凭证已复制')).catch(() => message.error('复制失败，请手动选择凭证复制')) }}>复制凭证</Button>
    {value && credentialLink(value.credential) ? <Button onClick={() => { void writeClipboardText(credentialLink(value.credential)).then(() => message.success('接收链接已复制')).catch(() => message.error('复制失败，请使用上方凭证')) }}>复制网页接收链接</Button> : null}
  </Modal>
}

export const cloudNodeList = async () => (await cloudCall<import('./types').TaggedNode[]>('list')).filter(node => !node.deleted)
export const validPhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone)
export const dateText = (value?: number) => value ? new Date(value).toLocaleString() : '长期有效'
