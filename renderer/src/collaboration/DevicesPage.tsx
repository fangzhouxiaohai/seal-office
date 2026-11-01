import { useState } from 'react'
import { Button, Empty, Input, Modal, Tag } from 'antd'
import Icon from '../components/Icon'
import { cloudCall } from '../cloud/CloudProvider'
import { CloudGate, dateText, useCloudWorkspace, WorkspaceLoading, WorkspaceError } from './common'
import type { CloudDevice } from './types'

export default function DevicesPage() {
  const workspace = useCloudWorkspace<CloudDevice[]>([], async () => (await cloudCall<{ items: CloudDevice[] }>('deviceList')).items)
  const { data, error, busy, execute } = workspace
  const [editing, setEditing] = useState<CloudDevice | 'current' | null>(null), [name, setName] = useState(''), [revoking, setRevoking] = useState<CloudDevice | null>(null)
  if (!workspace.enabled) return <CloudGate title="我的设备" />
  if (workspace.initialLoading) return <WorkspaceLoading title="我的设备" />
  return <section className="seal-cloud-page seal-drive ds-page-shell"><header className="seal-collaboration-header"><h1>我的设备</h1><div className="seal-collaboration-toolbar"><Button type="primary" disabled={busy} onClick={() => { setEditing('current'); setName('') }}>登记当前设备</Button><Button disabled={busy} onClick={() => void workspace.refresh()}>刷新设备</Button></div></header>
    <p className="seal-collaboration-description">管理云账号授权设备。撤销授权后该设备不能继续请求云文件，已下载的离线副本仍由设备持有人保管。</p><WorkspaceError error={error} />
    <ul className="seal-collaboration-list" aria-label="已授权设备">{data.map(device => <li className="seal-collaboration-row" key={device.id}><Icon name="device" size={28} /><div className="seal-collaboration-row__text"><strong>{device.name}{device.current ? <Tag>当前设备</Tag> : null}</strong><p>登记：{dateText(device.created)}</p><p>最近活动：{dateText(device.lastSeen)}{device.revoked ? ' · 授权已撤销' : ''}</p></div><div className="seal-collaboration-row__actions"><Button disabled={busy || device.revoked} aria-label={`重命名设备 ${device.name}`} onClick={() => { setName(device.name); setEditing(device) }}>重命名</Button><Button danger disabled={busy || device.revoked} aria-label={`撤销设备 ${device.name}`} onClick={() => setRevoking(device)}>撤销授权</Button></div></li>)}</ul>
    {!data.length ? <Empty description="还没有登记的设备" /> : null}
    <Modal title={editing === 'current' ? '登记当前设备' : '重命名设备'} open={Boolean(editing)} centered confirmLoading={busy} okText="保存设备名称" cancelText="取消" okButtonProps={{ disabled: !name.trim() }} onCancel={() => !busy && setEditing(null)} onOk={() => void execute(() => cloudCall(editing === 'current' ? 'deviceRegister' : 'deviceRename', { ...(editing && editing !== 'current' ? { id: editing.id } : {}), name: name.trim() }), () => setEditing(null))}><div className="seal-collaboration-field"><label htmlFor="cloud-device-name">设备名称</label><Input id="cloud-device-name" value={name} maxLength={80} onChange={event => setName(event.target.value)} /></div><WorkspaceError error={error} /></Modal>
    <Modal title="撤销设备授权？" open={Boolean(revoking)} centered confirmLoading={busy} okText="撤销设备授权" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => !busy && setRevoking(null)} onOk={() => revoking && void execute(async () => { await cloudCall('deviceRevoke', { id: revoking.id }); if (revoking.current) await workspace.cloud.refresh() }, () => setRevoking(null))}><p>{revoking?.current ? '这会退出当前设备的云账号授权。请确认需要的本机文件已经保存。' : `撤销「${revoking?.name}」后，该设备需要重新登录获得授权。`}</p><WorkspaceError error={error} /></Modal>
  </section>
}
