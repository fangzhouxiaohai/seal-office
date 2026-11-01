import { useEffect, useState } from 'react'
import { Button, Empty, Input, Modal, Select, Tag } from 'antd'
import { cloudCall } from '../cloud/CloudProvider'
import CloudFileBrowser, { isFolder } from '../cloud/CloudFileBrowser'
import FileUploadButton from '../components/FileUploadButton'
import { readUpload } from '../cloud/fileData'
import { CloudGate, CredentialDialog, dateText, useCloudWorkspace, WorkspaceLoading, validPhone, WorkspaceError } from './common'
import { useCollaborationFiles } from './fileAccess'
import { canEditTeam, canManageMember, roleNames, type CollaborationDownload, type CredentialResult, type TaggedNode, type TeamEntry, type TeamInvite, type TeamMember, type TeamRole } from './types'
import { readCredential } from './credentialLinks'

type Dialog = 'create' | 'accept' | 'invite' | 'folder' | 'rename' | 'renameTeam' | null
interface TeamData { teams: TeamEntry[]; nodes: TaggedNode[]; members: TeamMember[]; invites: TeamInvite[] }
export default function TeamsPage() {
  const [teamId, setTeamId] = useState(''), [parent, setParent] = useState<string | null>(null), [selected, setSelected] = useState<string[]>([])
  const workspace = useCloudWorkspace<TeamData>({ teams: [], nodes: [], members: [], invites: [] }, async () => {
    const [teams, nodes, members] = await Promise.all([
      cloudCall<{ items: TeamEntry[] }>('teamList'),
      teamId ? cloudCall<{ items: TaggedNode[] }>('teamNodes', { id: teamId }) : Promise.resolve({ items: [] }),
      teamId ? cloudCall<{ items: TeamMember[]; invites?: TeamInvite[] }>('teamMembers', { id: teamId }) : Promise.resolve({ items: [], invites: [] }),
    ])
    return { teams: teams.items, nodes: nodes.items, members: members.items, invites: members.invites ?? [] }
  }, teamId)
  const { data, busy, error, execute } = workspace
  const team = data.teams.find(item => item.id === teamId), role = team?.role ?? 'viewer', editable = Boolean(team && canEditTeam(role)), manager = role === 'owner' || role === 'admin'
  const files = useCollaborationFiles(workspace.cloud.state.account?.id ?? '')
  const [dialog, setDialog] = useState<Dialog>(null), [name, setName] = useState(''), [credential, setCredential] = useState(''), [phone, setPhone] = useState(''), [inviteRole, setInviteRole] = useState<TeamRole>('viewer')
  const [target, setTarget] = useState<TaggedNode | null>(null), [membersOpen, setMembersOpen] = useState(false), [generated, setGenerated] = useState<{ title: string; credential: string } | null>(null)
  const [deleteNode, setDeleteNode] = useState<TaggedNode | null>(null), [deleteTeam, setDeleteTeam] = useState(false), [removeMember, setRemoveMember] = useState<TeamMember | null>(null)
  const [moveNode, setMoveNode] = useState<TaggedNode | null>(null), [moveParent, setMoveParent] = useState<string | null>(null)
  useEffect(() => { if (!teamId && data.teams.length) setTeamId(data.teams[0].id) }, [teamId, data.teams])
  useEffect(() => { setParent(null); setSelected([]); setMembersOpen(false) }, [teamId])
  useEffect(() => {
    const back = (event: Event) => { if (parent) { event.preventDefault(); setParent(data.nodes.find(node => node.id === parent)?.parent ?? null) } }
    window.addEventListener('seal-before-native-back', back); return () => window.removeEventListener('seal-before-native-back', back)
  }, [parent, data.nodes])
  if (!workspace.enabled) return <CloudGate title="团队空间" />
  if (workspace.initialLoading) return <WorkspaceLoading title="团队空间" />
  const descendants = (nodeId: string, ancestor: string) => { const seen = new Set<string>(); let cursor: string | null = nodeId; while (cursor && !seen.has(cursor)) { if (cursor === ancestor) return true; seen.add(cursor); cursor = data.nodes.find(item => item.id === cursor)?.parent ?? null } return false }
  const download = (node: TaggedNode) => () => cloudCall<CollaborationDownload>('teamDownload', { id: teamId, nodeId: node.id })
  const open = (node: TaggedNode) => { if (isFolder(node)) { setParent(node.id); setSelected([]) } else void execute(() => files.open(download(node), { kind: 'team', id: teamId, nodeId: node.id, editable })) }
  const showNameDialog = (kind: Dialog, initial = '', node?: TaggedNode) => { setName(initial); setTarget(node ?? null); setDialog(kind) }
  const shown = data.nodes.filter(node => !node.deleted && node.parent === parent)
  const ancestors: TaggedNode[] = [], seen = new Set<string>(); let cursor = parent
  while (cursor && !seen.has(cursor)) { seen.add(cursor); const node = data.nodes.find(item => item.id === cursor); if (!node) break; ancestors.unshift(node); cursor = node.parent }
  const submit = () => void execute(async () => {
    if (dialog === 'create') return cloudCall<TeamEntry>('teamCreate', { name: name.trim() })
    if (dialog === 'accept') return cloudCall<TeamEntry>('teamAccept', { credential: readCredential(credential, 'team') })
    if (dialog === 'invite') return cloudCall<CredentialResult>('teamInvite', { id: teamId, recipientPhone: phone, role: inviteRole, expiresAt: Date.now() + 7 * 86400000 })
    if (dialog === 'folder') return cloudCall('teamFolder', { id: teamId, name: name.trim(), parent })
    if (dialog === 'renameTeam') return cloudCall('teamUpdate', { id: teamId, name: name.trim() })
    return cloudCall('teamUpdateNode', { id: teamId, nodeId: target?.id, name: name.trim() })
  }, result => {
    if (dialog === 'invite' && result?.credential) setGenerated({ title: '团队邀请凭证已生成', credential: result.credential })
    if ((dialog === 'create' || dialog === 'accept') && result?.id) setTeamId(result.id)
    setDialog(null)
  })
  const titles: Record<Exclude<Dialog, null>, string> = { create: '创建团队空间', accept: '加入团队空间', invite: '生成团队邀请', folder: '新建团队文件夹', rename: '重命名团队文件', renameTeam: '重命名团队空间' }
  return <section className="seal-cloud-page seal-drive ds-page-shell">
    <header className="seal-collaboration-header"><h1>团队空间</h1><div className="seal-collaboration-toolbar"><Button type="primary" disabled={busy} onClick={() => showNameDialog('create')}>创建团队</Button><Button disabled={busy} onClick={() => { setCredential(''); setDialog('accept') }}>加入团队</Button><Button disabled={busy} onClick={() => void workspace.refresh()}>刷新团队</Button></div></header>
    <p className="seal-collaboration-description">团队成员按角色实时共同编辑加密文件，支持离线重连和在线成员。本机副本可另存；邀请凭证由你自行交给指定接收者。</p><WorkspaceError error={error} />
    <div className="seal-collaboration-toolbar"><Select className="seal-collaboration-team-selector" aria-label="选择团队空间" value={teamId || undefined} onChange={setTeamId} options={data.teams.map(item => ({ value: item.id, label: item.name }))} placeholder="选择团队" />{team ? <><Tag>{roleNames[role]}</Tag><Button disabled={busy} onClick={() => setMembersOpen(true)}>团队成员</Button>{role === 'owner' ? <><Button disabled={busy} onClick={() => showNameDialog('renameTeam', team.name)}>重命名团队</Button><Button danger disabled={busy} onClick={() => setDeleteTeam(true)}>删除团队</Button></> : null}</> : null}</div>
    {team ? <div className="seal-collaboration-team-files"><div className="seal-collaboration-toolbar">
      <FileUploadButton type="primary" disabled={busy || !editable} multiple onChange={event => { const uploads = Array.from(event.target.files ?? []); event.target.value = ''; if (uploads.length) void execute(async () => { for (const file of uploads) await cloudCall('teamSave', { id: teamId, name: file.name, filename: file.name, parent, data: await readUpload(file) }) }) }}>上传团队文件</FileUploadButton>
      <Button disabled={busy || !editable} onClick={() => showNameDialog('folder')}>新建团队文件夹</Button>{!editable ? <span className="seal-collaboration-description">当前角色只可查看和下载文件</span> : null}
    </div><nav className="seal-drive-path" aria-label="团队文件夹路径"><Button disabled={!parent || busy} onClick={() => setParent(data.nodes.find(node => node.id === parent)?.parent ?? null)}>上级目录</Button><button type="button" onClick={() => { setParent(null); setSelected([]) }}>全部团队文件</button>{ancestors.map(node => <span className="seal-drive-crumb" key={node.id}><span>/</span><button type="button" onClick={() => setParent(node.id)} translate="no">{node.meta.name}</button></span>)}</nav>
      <CloudFileBrowser nodes={shown} selected={selected} onSelect={setSelected} busy={busy} onOpen={open} actions={node => [
        { key: 'open', label: isFolder(node) ? '打开文件夹' : '打开本机副本', onClick: () => open(node) },
        ...(!isFolder(node) ? [{ key: 'download', label: '下载', onClick: () => void execute(() => files.download(download(node), { kind: 'team', id: teamId, nodeId: node.id })) }] : []),
        { key: 'rename', label: '重命名', disabled: !editable, onClick: () => showNameDialog('rename', node.meta.name, node) },
        { key: 'move', label: '移动', disabled: !editable, onClick: () => { setMoveNode(node); setMoveParent(node.parent) } },
        { key: 'remove', label: '删除', disabled: !editable, danger: true, onClick: () => setDeleteNode(node) },
      ]} />
    </div> : <Empty description="创建团队或使用邀请凭证加入团队后管理文件" />}
    <Modal title={dialog ? titles[dialog] : ''} open={Boolean(dialog)} centered confirmLoading={busy} okText={dialog === 'invite' ? '生成邀请凭证' : '确认'} cancelText="取消" onCancel={() => !busy && setDialog(null)} okButtonProps={{ disabled: dialog === 'accept' ? !credential.trim() : dialog === 'invite' ? !validPhone(phone) : !name.trim() }} onOk={submit}><div className="seal-collaboration-form">{dialog === 'accept' ? <div className="seal-collaboration-field"><label htmlFor="team-credential">团队邀请凭证</label><Input.TextArea id="team-credential" rows={4} value={credential} onChange={event => setCredential(event.target.value)} /></div> : dialog === 'invite' ? <><div className="seal-collaboration-field"><label htmlFor="team-invite-phone">接收账号手机号</label><Input id="team-invite-phone" value={phone} maxLength={11} inputMode="tel" autoComplete="tel" onChange={event => setPhone(event.target.value)} /></div><div className="seal-collaboration-field"><label htmlFor="team-invite-role">成员角色</label><Select id="team-invite-role" value={inviteRole} onChange={setInviteRole} options={(role === 'owner' ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']).map(value => ({ value, label: roleNames[value as TeamRole] }))} /></div><p className="seal-collaboration-description">凭证 7 天有效，只能由指定账号接受。</p></> : <div className="seal-collaboration-field"><label htmlFor="team-name">名称</label><Input id="team-name" maxLength={80} value={name} onChange={event => setName(event.target.value)} /></div>}</div><WorkspaceError error={error} /></Modal>
    <Modal title="团队成员与邀请" open={membersOpen} centered width={760} footer={<Button onClick={() => setMembersOpen(false)}>完成</Button>} onCancel={() => setMembersOpen(false)}><WorkspaceError error={error} />
      {manager ? <Button type="primary" disabled={busy} onClick={() => { setPhone(''); setInviteRole('viewer'); setDialog('invite') }}>生成成员邀请</Button> : null}
      <ul className="seal-collaboration-list" aria-label="团队成员列表">{data.members.map(member => <li key={member.userId} className="seal-collaboration-row"><div className="seal-collaboration-row__text"><strong>{member.phone}</strong><p>加入：{dateText(member.joined)}</p></div><div className="seal-collaboration-row__actions">{canManageMember(role, member.role) ? <><Select aria-label={`成员 ${member.phone} 的角色`} disabled={busy} value={member.role} options={(role === 'owner' ? ['admin', 'editor', 'viewer'] : ['editor', 'viewer']).map(value => ({ value, label: roleNames[value as TeamRole] }))} onChange={value => void execute(() => cloudCall('teamUpdateMember', { id: teamId, userId: member.userId, role: value }))} /><Button danger disabled={busy} aria-label={`移除成员 ${member.phone}`} onClick={() => setRemoveMember(member)}>移除</Button></> : <Tag>{roleNames[member.role]}</Tag>}</div></li>)}</ul>
      {manager && data.invites.length ? <><h3>邀请记录</h3><ul className="seal-collaboration-list" aria-label="团队邀请记录">{data.invites.map(invite => <li className="seal-collaboration-row" key={invite.id}><div className="seal-collaboration-row__text"><strong>{invite.recipientPhone}</strong><p>{roleNames[invite.role]} · {invite.accepted ? '已接受' : invite.revoked ? '已撤销' : `有效至 ${dateText(invite.expiresAt)}`}</p></div><Button danger disabled={busy || invite.accepted || invite.revoked} onClick={() => void execute(() => cloudCall('teamRevokeInvite', { id: teamId, inviteId: invite.id }))}>撤销邀请</Button></li>)}</ul></> : null}
    </Modal>
    <Modal title="移动团队文件" open={Boolean(moveNode)} centered confirmLoading={busy} okText="移动" cancelText="取消" onCancel={() => !busy && setMoveNode(null)} onOk={() => moveNode && void execute(() => cloudCall('teamUpdateNode', { id: teamId, nodeId: moveNode.id, name: moveNode.meta.name, parent: moveParent }), () => setMoveNode(null))}><Select aria-label="团队目标文件夹" style={{ width: '100%' }} value={moveParent ?? 'root'} onChange={value => setMoveParent(value === 'root' ? null : value)} options={[{ value: 'root', label: '全部团队文件' }, ...data.nodes.filter(node => isFolder(node) && !node.deleted && (!moveNode || !descendants(node.id, moveNode.id))).map(node => ({ value: node.id, label: node.meta.name }))]} /><WorkspaceError error={error} /></Modal>
    <Modal title="删除团队文件？" open={Boolean(deleteNode)} centered confirmLoading={busy} okText="删除文件" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => !busy && setDeleteNode(null)} onOk={() => deleteNode && void execute(() => cloudCall('teamRemoveNode', { id: teamId, nodeId: deleteNode.id }), () => setDeleteNode(null))}><p>删除团队文件及文件夹内容，所有团队成员都会失去后续访问能力。已下载副本无法收回。</p><WorkspaceError error={error} /></Modal>
    <Modal title="移除团队成员？" open={Boolean(removeMember)} centered confirmLoading={busy} okText="移除成员" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => !busy && setRemoveMember(null)} onOk={() => removeMember && void execute(() => cloudCall('teamRemoveMember', { id: teamId, userId: removeMember.userId }), () => setRemoveMember(null))}><p>移除后该账号不能继续访问团队云文件，已下载副本不受影响。</p><WorkspaceError error={error} /></Modal>
    <Modal title="删除整个团队空间？" open={deleteTeam} centered confirmLoading={busy} okText="删除团队空间" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => !busy && setDeleteTeam(false)} onOk={() => void execute(() => cloudCall('teamDelete', { id: teamId }), () => { setTeamId(''); setDeleteTeam(false) })}><p>团队成员、邀请以及团队文件都会删除。此操作不能恢复，请先下载需要的文件。</p><WorkspaceError error={error} /></Modal>
    <CredentialDialog value={generated} onClose={() => setGenerated(null)} />
  </section>
}
