import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { CloudProvider } from '../cloud/CloudProvider'
import SharedPage from './SharedPage'
import DevicesPage from './DevicesPage'
import TagsPage from './TagsPage'
import TeamsPage from './TeamsPage'
import CollaborationLinkEntry from './CollaborationLinkEntry'
import { credentialLink, parseCredentialFragment } from './credentialLinks'
import { getFileBinding, synchronizeBinding } from './fileAccess'

const store = vi.hoisted(() => ({ createDoc: vi.fn(), refreshRecents: vi.fn(), handleNav: vi.fn() }))
vi.mock('../store', () => ({ useAppStore: () => store }))
vi.mock('../store/settingsStore', () => ({ useSettings: () => ({ 语言: 'zh-CN' }) }))
const require = createRequire(import.meta.url)
configure({ asyncUtilTimeout: 10000 })
// Vitest itself uses a worker. Server public validation's dedicated-worker boot
// must not mistake this unrelated test worker for a document validation request.
const Module = require('node:module'), load = Module._load
let createLocalCollaborationFixture: any
try {
  Module._load = function (id: string, ...args: any[]) { const result = load.call(this, id, ...args); return id === 'node:worker_threads' ? { ...result, isMainThread: true } : result }
  ;({ createLocalCollaborationFixture } = require('../../../server/test/collaborationFixture.cjs'))
} finally { Module._load = load }
let fixture: any
beforeAll(async () => {
  fixture = await createLocalCollaborationFixture()
  // jsdom's synchronous accessibility scans can block this same server worker
  // beyond its keepalive timeout. Real HTTP remains enabled, with fresh sockets.
  fixture.cloud.server.prependListener('request', (_request: unknown, response: any) => response.setHeader('Connection', 'close'))
}, 60000)
afterAll(async () => { await fixture?.cleanup() })
afterEach(() => { cleanup(); Reflect.deleteProperty(window, 'electronAPI'); store.createDoc.mockClear(); store.handleNav.mockClear(); window.history.replaceState(null, '', '/') })
const bytes = (text: string) => Buffer.from(text).toString('base64')

/** Only Electron's OS surfaces are substituted; the actual IPC, encryption, filesystem and HTTP server run. */
function wire(client: any) {
  const Module = require('node:module'), original = Module._load
  let channel: any
  try {
    Module._load = function (id: string, ...args: any[]) { return id === 'electron' ? { app: { getPath: () => fixture.directory }, safeStorage: fixture.safeStorage, dialog: { showSaveDialog: async ({ defaultPath }: { defaultPath: string }) => ({ canceled: false, filePath: path.join(fixture.directory, defaultPath) }) } } : original.call(this, id, ...args) }
    const filename = require.resolve('../../../main/ipc/cloudChannel.js'); delete require.cache[filename]; channel = require(filename)
  } finally { Module._load = original }
  let handler: any
  channel.注册云端通道({ handle: (_key: string, callback: any) => { handler = callback } }, { cloudService: client })
  const invoke = vi.fn(async (action: string, input?: unknown) => {
    const result = await handler({}, action, input)
    if (process.env.SEAL_COLLAB_TEST_DEBUG) console.log('collab IPC', action, result.成功, result.错误, Array.isArray(result.数据) ? result.数据.length : result.数据?.items?.length)
    return result
  }), reveal = vi.fn(async () => ({ 成功: true }))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { cloud: { invoke }, readFile: async (filename: string) => ({ 成功: true, 内容: fs.readFileSync(filename, 'utf8'), 扩展名: path.extname(filename).slice(1) }), recentAdd: async () => ({ 成功: true }), revealInFolder: reveal } })
  return { invoke, reveal }
}
function mount(children: React.ReactNode) { return render(<AntdApp><CloudProvider>{children}</CloudProvider></AntdApp>) }
async function readyButton(name: string) {
  let button: HTMLButtonElement | undefined
  await waitFor(() => {
    button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => !item.closest('[style*="display: none"],[hidden]') && (item.getAttribute('aria-label') === name || item.textContent?.replace(/\s/g, '') === name.replace(/\s/g, '')))
    expect(button).toBeDefined(); expect(button).toBeEnabled()
  })
  return button!
}
async function option(label: string, name: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }))
  fireEvent.click(await screen.findByTitle(name))
}

it('未登录的四个入口均展示可操作账号门槛，不伪造云数据', async () => {
  for (const Page of [SharedPage, DevicesPage, TagsPage, TeamsPage]) {
    const view = mount(<Page />)
    fireEvent.click(screen.getByRole('button', { name: '登录并开通云空间' }))
    expect(await screen.findByRole('dialog', { name: '账号登录' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '刷新共享' })).not.toBeInTheDocument()
    view.unmount()
  }
})

it('共享创建校验、凭证接收、私有副本打开、真实保存冲突和撤销反馈', async () => {
  const saved = await fixture.a.save({ linkId: 'ui-share', name: '界面共享机密.txt', data: bytes('原稿😀') })
  wire(fixture.a)
  let view = mount(<SharedPage />)
  fireEvent.click(await readyButton('创建共享'))
  expect(screen.getByRole('button', { name: '生成共享凭证' })).toBeDisabled()
  await option('要共享的云文件', '界面共享机密.txt')
  fireEvent.change(screen.getByLabelText('接收账号手机号'), { target: { value: '13800111002' } })
  await option('访问权限', '编辑：允许实时共同编辑')
  fireEvent.click(screen.getByRole('button', { name: '生成共享凭证' }))
  const credential = await screen.findByRole('textbox', { name: '邀请凭证' }) as HTMLTextAreaElement
  const secret = credential.value
  expect(secret).toMatch(/^seal-share-v1:/)
  view.unmount(); wire(fixture.b); view = mount(<SharedPage />)
  fireEvent.click(await readyButton('接受共享凭证'))
  fireEvent.change(screen.getByLabelText('共享凭证'), { target: { value: credentialLink(secret, 'https://seal.xingmasoft.com') } })
  fireEvent.click(screen.getByRole('button', { name: '接受共享' }))
  fireEvent.click(await readyButton('打开共享副本 界面共享机密.txt'))
  await waitFor(() => expect(store.createDoc).toHaveBeenCalledOnce())
  const filename = store.createDoc.mock.calls[0][2].路径, binding = getFileBinding(filename)!
  expect(fs.readFileSync(filename, 'utf8')).toBe('原稿😀')
  fs.writeFileSync(filename, '接收者编辑𠀀')
  await synchronizeBinding(filename, binding)
  expect(Buffer.from((await fixture.a.download(saved.id)).data, 'base64').toString()).toBe('接收者编辑𠀀')
  await expect(synchronizeBinding(filename, binding)).rejects.toThrow(/版本|冲突/)
  await fixture.a.shareRevoke({ id: binding.id })
  fireEvent.click(screen.getByRole('button', { name: '刷新共享' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '打开共享副本 界面共享机密.txt' })).toBeDisabled())
  view.unmount(); wire(fixture.reopen(fixture.b)); mount(<SharedPage />)
  expect(await screen.findByText('界面共享机密.txt')).toBeInTheDocument()
})

it('设备登记重命名在新会话保留，撤销当前授权后回到登录入口', async () => {
  const client = await fixture.client('13800111003')
  wire(client); let view = mount(<DevicesPage />)
  fireEvent.click(await readyButton('登记当前设备'))
  fireEvent.change(screen.getByLabelText('设备名称'), { target: { value: '本机验收设备' } })
  fireEvent.click(screen.getByRole('button', { name: '保存设备名称' }))
  fireEvent.click(await readyButton('重命名设备 本机验收设备'))
  fireEvent.change(screen.getByLabelText('设备名称'), { target: { value: '移动验收设备' } })
  fireEvent.click(screen.getByRole('button', { name: '保存设备名称' }))
  await screen.findByRole('button', { name: '撤销设备 移动验收设备' })
  view.unmount(); wire(fixture.reopen(client)); view = mount(<DevicesPage />)
  fireEvent.click(await readyButton('撤销设备 移动验收设备'))
  fireEvent.click(screen.getByRole('button', { name: '撤销设备授权' }))
  expect(await screen.findByRole('button', { name: '登录并开通云空间' })).toBeInTheDocument()
  expect(fixture.reopen(client).status().account).toBeNull()
})

it('标签创建编辑删除、目录筛选与全标签关联经真实服务持久化', async () => {
  const folder = await fixture.a.folder('已标记目录'), child = await fixture.a.save({ linkId: 'ui-tag-child', parent: folder.id, name: '标签子文档.txt', data: bytes('子内容') })
  wire(fixture.a); const view = mount(<TagsPage />)
  fireEvent.click(await readyButton('新建标签'))
  fireEvent.change(screen.getByLabelText('标签名称'), { target: { value: '界面标签' } })
  fireEvent.click(screen.getByRole('button', { name: '保存标签' }))
  fireEvent.click(await screen.findByRole('button', { name: /界面标签/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: '设置文件标签' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '设置文件标签' }))
  await option('云文件', '已标记目录'); await option('文件的全部标签', '界面标签')
  await waitFor(() => expect(screen.getByRole('button', { name: '应用文件标签' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '应用文件标签' }))
  const taggedFolder = await screen.findByText('已标记目录', { selector: '.seal-drive-file-name' })
  await waitFor(() => expect(taggedFolder.closest('button')).toBeEnabled())
  fireEvent.click(taggedFolder)
  expect(await screen.findByText('标签子文档.txt', { selector: '.seal-drive-file-name' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '返回标签结果' }))
  fireEvent.click(await readyButton('编辑标签'))
  fireEvent.change(screen.getByLabelText('标签名称'), { target: { value: '重命名标签' } })
  fireEvent.click(screen.getByRole('button', { name: '保存标签' }))
  await waitFor(() => expect(document.querySelector('.seal-collaboration-tags')?.textContent).toContain('重命名标签'))
  view.unmount(); wire(fixture.reopen(fixture.a)); mount(<TagsPage />)
  fireEvent.click(await screen.findByRole('button', { name: /重命名标签/ }))
  await screen.findByRole('button', { name: '已标记目录' })
  fireEvent.click(await readyButton('删除标签'))
  fireEvent.click(within(await screen.findByRole('dialog', { name: '删除标签？' })).getByRole('button', { name: '删除标签' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /重命名标签/ })).not.toBeInTheDocument())
  expect((await fixture.a.list()).some((node: any) => node.id === child.id)).toBe(true)
})

it('团队查看者界面禁写，实时降权在服务端阻止越权，所有者可真实创建与重命名目录', async () => {
  const team = await fixture.a.teamCreate({ name: '界面团队' }), invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'viewer' })
  await fixture.b.teamAccept({ credential: invite.credential }); wire(fixture.b)
  let view = mount(<TeamsPage />)
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '新建团队文件夹' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '上传团队文件' })).toBeDisabled()
  })
  expect(screen.queryByRole('button', { name: '重命名团队' })).not.toBeInTheDocument()
  await fixture.a.teamUpdateMember({ id: team.id, userId: fixture.b.status().account.id, role: 'editor' })
  fireEvent.click(await readyButton('刷新团队'))
  await waitFor(() => expect(screen.getByRole('button', { name: '新建团队文件夹' })).toBeEnabled())
  await fixture.a.teamUpdateMember({ id: team.id, userId: fixture.b.status().account.id, role: 'viewer' })
  fireEvent.click(screen.getByRole('button', { name: '新建团队文件夹' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '越权目录' } }); fireEvent.click(screen.getByRole('button', { name: /^确\s*认$/ }))
  expect((await screen.findAllByText('团队角色没有此操作权限')).length).toBeGreaterThan(0)
  expect((await fixture.a.teamNodes({ id: team.id })).items).toHaveLength(0)
  view.unmount(); wire(fixture.a); view = mount(<TeamsPage />)
  await waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '新建团队文件夹')?.disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: '新建团队文件夹' }))
  fireEvent.change(await screen.findByLabelText('名称'), { target: { value: '真实团队目录' } }); fireEvent.click(screen.getByRole('button', { name: /^确\s*认$/ }))
  await screen.findByText('真实团队目录', { selector: '.seal-drive-file-name' })
  fireEvent.click(await readyButton('更多操作 真实团队目录')); fireEvent.click(await screen.findByText('重命名', { exact: true }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '重命名团队目录' } }); fireEvent.click(screen.getByRole('button', { name: /^确\s*认$/ }))
  expect(await screen.findByText('重命名团队目录', { selector: '.seal-drive-file-name' })).toBeInTheDocument()
  expect((await fixture.reopen(fixture.a).teamNodes({ id: team.id })).items[0].meta.name).toBe('重命名团队目录')
})

it('网页 hash 导入清除地址秘密，失败不导航，正确账号确认后真实接收并保留文档', async () => {
  const team = await fixture.a.teamCreate({ name: '链接团队' }), invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'viewer' })
  const url = credentialLink(invite.credential, 'https://seal.xingmasoft.com')
  expect(url.startsWith('https://seal.xingmasoft.com/office/#team=')).toBe(true)
  expect(new URL(url).search).toBe(''); expect(parseCredentialFragment(new URL(url).hash)?.credential).toBe(invite.credential)
  wire(fixture.a); window.history.replaceState(null, '', '/office/' + new URL(url).hash)
  let view = mount(<CollaborationLinkEntry />)
  const confirm = await screen.findByRole('button', { name: '确认接收' })
  expect(window.location.hash).toBe('')
  fireEvent.click(confirm)
  expect(await screen.findByRole('alert')).toHaveTextContent(/邀请不存在|账号/)
  expect(store.handleNav).not.toHaveBeenCalled(); expect(store.createDoc).not.toHaveBeenCalled()
  view.unmount(); wire(fixture.b); window.history.replaceState(null, '', '/office/' + new URL(url).hash); view = mount(<CollaborationLinkEntry />)
  fireEvent.click(await screen.findByRole('button', { name: '确认接收' }))
  await waitFor(() => expect(store.handleNav).toHaveBeenCalledWith('team', expect.any(Function)))
  expect((await fixture.reopen(fixture.b).teamList()).items.some((item: any) => item.id === team.id)).toBe(true)
  expect(store.createDoc).not.toHaveBeenCalled()
  await act(async () => { view.unmount() })
})

it('读取失败显示明确错误，重试从真实服务恢复持久化标签', async () => {
  const { invoke } = wire(fixture.a), actual = invoke.getMockImplementation()!
  let unavailable = true
  invoke.mockImplementation(async (action, input) => action === 'tagList' && unavailable ? { 成功: false, 错误: '网络暂时不可用，请重试' } : actual(action, input))
  mount(<TagsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('网络暂时不可用，请重试')
  unavailable = false
  fireEvent.click(await readyButton('刷新标签'))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '新建标签' })).toBeEnabled()
})
