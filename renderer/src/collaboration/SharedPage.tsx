import { useState } from 'react'
import { Button, Empty, Input, Modal, Select, Tag } from 'antd'
import { cloudCall } from '../cloud/CloudProvider'
import { cloudNodeList, CloudGate, CredentialDialog, dateText, useCloudWorkspace, validPhone, WorkspaceError } from './common'
import { useCollaborationFiles } from './fileAccess'
import type { CollaborationDownload, CredentialResult, ShareEntry, TaggedNode } from './types'
import { readCredential } from './credentialLinks'

export default function SharedPage() {
  const workspace = useCloudWorkspace<{ shares: ShareEntry[]; files: TaggedNode[] }>({ shares: [], files: [] }, async () => {
    const [shares, files] = await Promise.all([cloudCall<{ items: ShareEntry[] }>('shareList'), cloudNodeList()])
    return { shares: shares.items, files: files.filter(file => file.kind === 'file') }
  })
  const { data, busy, error, cloud, execute } = workspace
  const files = useCollaborationFiles(cloud.state.account?.id ?? '')
  const [direction, setDirection] = useState<'sent' | 'received'>('received')
  const [dialog, setDialog] = useState<'create' | 'accept' | null>(null)
  const [nodeId, setNodeId] = useState(''), [phone, setPhone] = useState(''), [permission, setPermission] = useState<'read' | 'edit'>('read'), [days, setDays] = useState(7), [credential, setCredential] = useState('')
  const [generated, setGenerated] = useState<{ title: string; credential: string } | null>(null), [revoke, setRevoke] = useState<ShareEntry | null>(null)
  if (!workspace.enabled) return <CloudGate title="共享文档" />
  const get = (share: ShareEntry) => () => cloudCall<CollaborationDownload>('shareDownload', { id: share.id })
  return <section className="seal-cloud-page seal-drive ds-page-shell">
    <header className="seal-collaboration-header"><h1>共享文档</h1><div className="seal-collaboration-toolbar">
      <Button type="primary" disabled={busy} onClick={() => { setNodeId(''); setPhone(''); setPermission('read'); setDialog('create') }}>创建共享</Button>
      <Button disabled={busy} onClick={() => { setCredential(''); setDialog('accept') }}>接受共享凭证</Button>
      <Button disabled={busy} onClick={() => void workspace.refresh()}>刷新共享</Button>
    </div></header>
    <p className="seal-collaboration-description">按接收账号授权访问加密文件。支持实时合并、离线后重连和在线成员；本机副本可独立另存。旧服务器会明确提示升级。</p>
    <WorkspaceError error={error} />
    <div className="seal-collaboration-toolbar" role="group" aria-label="共享方向"><Button aria-pressed={direction === 'received'} type={direction === 'received' ? 'primary' : 'default'} onClick={() => setDirection('received')}>共享给我的</Button><Button aria-pressed={direction === 'sent'} type={direction === 'sent' ? 'primary' : 'default'} onClick={() => setDirection('sent')}>我共享的</Button></div>
    <ul className="seal-collaboration-list" aria-label="共享文档列表">
      {data.shares.filter(share => share.direction === direction).map(share => {
        const unavailable = Boolean(share.revoked || share.expiresAt && share.expiresAt < Date.now() || share.direction === 'received' && share.accepted === false)
        return <li className="seal-collaboration-row" key={share.id}><div className="seal-collaboration-row__text"><strong translate="no">{share.name}</strong><p>{share.direction === 'sent' ? `接收账号：${share.recipientPhone}` : '通过指定账号授权接收'} · 版本 {share.version}</p><p>有效期：{dateText(share.expiresAt)}</p><Tag>{share.direction === 'received' && share.accepted === false ? '请输入共享凭证接受' : unavailable ? '已失效' : share.permission === 'edit' ? '可编辑并同步' : '只读副本'}</Tag></div>
          <div className="seal-collaboration-row__actions"><Button disabled={busy || unavailable} aria-label={`打开共享副本 ${share.name}`} onClick={() => void execute(() => files.open(get(share), { kind: 'share', id: share.id, editable: share.direction === 'sent' || share.permission === 'edit' }))}>打开副本</Button><Button disabled={busy || unavailable} aria-label={`下载共享 ${share.name}`} onClick={() => void execute(() => files.download(get(share), { kind: 'share', id: share.id }))}>下载</Button>{share.direction === 'sent' ? <Button danger disabled={busy || Boolean(share.revoked)} aria-label={`撤销共享 ${share.name}`} onClick={() => setRevoke(share)}>撤销共享</Button> : null}</div></li>
      })}
    </ul>
    {!data.shares.some(share => share.direction === direction) ? <Empty description={direction === 'sent' ? '还没有创建共享' : '还没有接受共享凭证'} /> : null}
    <Modal title={dialog === 'create' ? '创建共享' : '接受共享凭证'} open={Boolean(dialog)} centered confirmLoading={busy} okText={dialog === 'create' ? '生成共享凭证' : '接受共享'} cancelText="取消" onCancel={() => !busy && setDialog(null)} okButtonProps={{ disabled: dialog === 'create' ? !nodeId || !validPhone(phone) : !credential.trim() }} onOk={() => {
      void execute(async () => dialog === 'create'
        ? cloudCall<CredentialResult>('shareCreate', { id: nodeId, recipientPhone: phone, permission, expiresAt: Date.now() + days * 86400000 })
        : cloudCall('shareAccept', { credential: readCredential(credential, 'share') }), result => {
        if (dialog === 'create' && result?.credential) setGenerated({ title: '共享凭证已生成', credential: result.credential })
        else setDirection('received')
        setDialog(null)
      })
    }}>
      <div className="seal-collaboration-form">{dialog === 'create' ? <>
        <div className="seal-collaboration-field"><label htmlFor="share-file">云文件</label><Select id="share-file" aria-label="要共享的云文件" value={nodeId || undefined} onChange={setNodeId} options={data.files.map(file => ({ value: file.id, label: file.meta.name }))} /></div>
        <div className="seal-collaboration-field"><label htmlFor="share-phone">接收账号手机号</label><Input id="share-phone" inputMode="tel" autoComplete="tel" maxLength={11} value={phone} onChange={event => setPhone(event.target.value)} /></div>
        <div className="seal-collaboration-field"><label htmlFor="share-permission">访问权限</label><Select id="share-permission" value={permission} onChange={setPermission} options={[{ value: 'read', label: '只读：下载本机副本' }, { value: 'edit', label: '编辑：允许实时共同编辑' }]} /></div>
        <div className="seal-collaboration-field"><label htmlFor="share-expiry">有效期</label><Select id="share-expiry" value={days} onChange={setDays} options={[{ value: 1, label: '1 天' }, { value: 7, label: '7 天' }, { value: 30, label: '30 天' }]} /></div>
      </> : <div className="seal-collaboration-field"><label htmlFor="share-credential">共享凭证</label><Input.TextArea id="share-credential" rows={4} value={credential} onChange={event => setCredential(event.target.value)} /><p className="seal-collaboration-description">请登录凭证所指定的接收账号。不会自动向创建者或其他人发送消息。</p></div>}</div>
      <WorkspaceError error={error} />
    </Modal>
    <Modal title="撤销这项共享？" open={Boolean(revoke)} centered confirmLoading={busy} okText="撤销共享" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => !busy && setRevoke(null)} onOk={() => revoke && void execute(() => cloudCall('shareRevoke', { id: revoke.id }), () => setRevoke(null))}><p>撤销后服务器会拒绝后续访问；接收者已经保存的本机副本无法收回。</p><WorkspaceError error={error} /></Modal>
    <CredentialDialog value={generated} onClose={() => setGenerated(null)} />
  </section>
}
