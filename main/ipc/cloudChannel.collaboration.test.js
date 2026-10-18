const fs = require('node:fs'), path = require('node:path')
const { createLocalCollaborationFixture } = require('../../server/test/collaborationFixture.cjs')
function invokeFor(client, directory) {
  const electronPath = require.resolve('electron'), channelPath = require.resolve('./cloudChannel'); require('electron')
  const electronExports = require.cache[electronPath].exports, channelCache = require.cache[channelPath]
  require.cache[electronPath].exports = { app: { getPath: () => directory }, dialog: { showSaveDialog: async () => { throw new Error('协作打开不应调用另存为对话框') } } }; delete require.cache[channelPath]
  try { let invoke; require('./cloudChannel').注册云端通道({ handle: (_name, handler) => { invoke = handler } }, { cloudService: client }); return (action, input) => invoke({}, action, input) }
  finally { require.cache[electronPath].exports = electronExports; if (channelCache) require.cache[channelPath] = channelCache; else delete require.cache[channelPath] }
}
describe('真实协作 IPC 与 HTTP 集成', () => {
  let fixture
  afterEach(async () => { await fixture?.cleanup() })
  it('共享下载写应用私有副本，编辑同步冲突返回真实失败且不覆盖本机修改', async () => {
    fixture = await createLocalCollaborationFixture(); const { a, b } = fixture, invoke = invokeFor(b, fixture.directory)
    const saved = await a.save({ linkId: 'doc', name: '合同.txt', data: Buffer.from('初稿').toString('base64') })
    const shared = await a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }); expect((await invoke('shareAccept', { credential: shared.credential })).成功).toBe(true)
    const opened = await invoke('shareDownload', { id: shared.id }); expect(opened.成功).toBe(true); expect(path.resolve(opened.数据.path).startsWith(path.resolve(fixture.directory) + path.sep)).toBe(true); expect(fs.readFileSync(opened.数据.path, 'utf8')).toBe('初稿')
    fs.writeFileSync(opened.数据.path, '尚未上传的本机修改')
    await a.shareSave({ id: shared.id, expectedVersion: 1, data: Buffer.from('另一位作者的新版本').toString('base64') })
    const conflict = await invoke('shareSave', { id: shared.id, expectedVersion: opened.数据.version, data: fs.readFileSync(opened.数据.path).toString('base64') })
    expect(conflict).toMatchObject({ 成功: false, 状态码: 409 }); expect(fs.readFileSync(opened.数据.path, 'utf8')).toBe('尚未上传的本机修改'); expect(Buffer.from((await a.download(saved.id)).data, 'base64').toString()).toBe('另一位作者的新版本')
    await a.shareRevoke({ id: shared.id }); expect(await invoke('shareDownload', { id: shared.id })).toMatchObject({ 成功: false, 状态码: 404 })
  })
  it('团队打开经过服务器成员鉴权，移除成员后不再生成下载文件', async () => {
    fixture = await createLocalCollaborationFixture(); const { a, b } = fixture, invoke = invokeFor(b, fixture.directory)
    const team = await a.teamCreate({ name: '真实团队' }), invitation = await a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'viewer' }); await b.teamAccept({ credential: invitation.credential }); const saved = await a.teamSave({ id: team.id, name: '计划.txt', data: Buffer.from('已加密计划').toString('base64') })
    const result = await invoke('teamDownload', { id: team.id, nodeId: saved.id }); expect(result.成功).toBe(true); expect(fs.readFileSync(result.数据.path, 'utf8')).toBe('已加密计划')
    await a.teamRemoveMember({ id: team.id, userId: b.status().account.id }); expect((await invoke('teamDownload', { id: team.id, nodeId: saved.id })).成功).toBe(false)
  })
})
