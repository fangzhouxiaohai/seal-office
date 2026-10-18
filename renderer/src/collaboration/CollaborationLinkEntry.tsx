import { useEffect, useRef, useState } from 'react'
import { App, Button, Modal } from 'antd'
import { cloudCall, useCloud } from '../cloud/CloudProvider'
import { useAppStore } from '../store'
import { parseCredentialFragment, type CredentialLink } from './credentialLinks'
import { WorkspaceError } from './common'

export default function CollaborationLinkEntry() {
  const cloud = useCloud(), store = useAppStore()
  const { message } = App.useApp()
  const [entry, setEntry] = useState<CredentialLink | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef(false)
  useEffect(() => {
    const consume = () => {
      const incoming = parseCredentialFragment(window.location.hash)
      if (!incoming) return
      // Retain the secret only in component memory, including while the user logs in.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      setEntry(incoming); setError('')
    }
    consume(); window.addEventListener('hashchange', consume)
    return () => window.removeEventListener('hashchange', consume)
  }, [])
  const ready = Boolean(cloud.state.account?.enabled && cloud.state.unlocked)
  return <Modal open={Boolean(entry)} title={entry?.kind === 'share' ? '接收共享文档' : '接收团队邀请'} centered closable={!busy} keyboard={!busy} maskClosable={!busy} onCancel={() => setEntry(null)} footer={<>
    <Button disabled={busy} onClick={() => setEntry(null)}>取消</Button>
    {ready ? <Button type="primary" loading={busy} onClick={() => {
      if (!entry || pending.current) return
      pending.current = true; setBusy(true); setError('')
      void cloudCall(entry.kind === 'share' ? 'shareAccept' : 'teamAccept', { credential: entry.credential }).then(() => {
        store.handleNav(entry.kind === 'share' ? 'shared' : 'team', text => message.info(text))
        window.dispatchEvent(new Event('seal-collaboration-refresh')); setEntry(null)
      }).catch(reason => setError(reason instanceof Error ? reason.message : '凭证导入失败，请检查账号和有效期')).finally(() => { pending.current = false; setBusy(false) })
    }}>确认接收</Button> : <Button type="primary" onClick={cloud.configure}>登录并解锁云空间</Button>}
  </>}><p>请使用凭证指定的接收账号。确认后访问加密云文件，当前打开的本机文档仍会保留。</p>{ready ? <p>当前账号：{cloud.state.account?.phone}</p> : <p>请先登录并解锁，再回来确认接收。</p>}<WorkspaceError error={error} /></Modal>
}
