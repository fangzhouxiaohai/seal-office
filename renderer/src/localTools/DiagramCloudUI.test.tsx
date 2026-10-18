import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { CloudProvider } from '../cloud/CloudProvider'
import { AppProvider, useAppStore } from '../store'
import SharedPage from '../collaboration/SharedPage'
import * as Y from 'yjs'
import { decodeModel } from '../collaboration/crdtModel'
import { RealtimeClient } from '../collaboration/realtimeClient'
import DiagramPage from './DiagramPage'
import CloudDiagramEditor from './CloudDiagramEditor'
import { createDiagramProject, DiagramProjectStore } from './diagramProjects'
import { diagramType, encodeDiagramFile, type DiagramCloudEntry, type DiagramCloudModel } from './diagramCloud'

const require = createRequire(import.meta.url), Module = require('node:module'), load = Module._load
let factory: any
try { Module._load = function (id: string, ...args: any[]) { const result = load.call(this, id, ...args); return id === 'node:worker_threads' ? { ...result, isMainThread: true } : result }; factory = require('../../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture } finally { Module._load = load }
configure({ asyncUtilTimeout: 10000 })
let fixture: any, service: any, offline = false, originalCrypto: PropertyDescriptor | undefined, remoteClients: RealtimeClient<DiagramCloudModel>[] = []
const localActions = new Set(['status', 'realtimeRestore', 'realtimeSource', 'realtimeRecovery', 'realtimeCatalog', 'realtimeQueue', 'realtimeState', 'realtimeStage'])
beforeEach(async () => {
  localStorage.clear(); sessionStorage.clear(); offline = false
  originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  fixture = await factory(); service = fixture.a; fixture.cloud.server.prependListener('request', (_request: unknown, response: any) => response.setHeader('Connection', 'close'))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }), cloud: { invoke: vi.fn(async (action: string, input: any = {}) => {
    try { if (offline && !localActions.has(action)) throw new Error('模拟断网'); const value = ['rawDownload', 'realtimeDownload'].includes(action) ? await service.download(input.id, input.version) : await service[action](input); return { 成功: true, 数据: value } } catch (reason: any) { return { 成功: false, 错误: reason.message, 状态码: reason.status } }
  }) } } })
}, 60000)
afterEach(async () => { cleanup(); await Promise.all(remoteClients.map(client => client.close())); remoteClients = []; await fixture.cleanup(); Reflect.deleteProperty(window, 'electronAPI'); if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })
const wrap = (children: React.ReactNode) => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><CloudProvider><AppProvider>{children}</AppProvider></CloudProvider></AntdApp></ConfigProvider>)
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const model = (type: '脑图' | '流程图' = '脑图'): DiagramCloudModel => ({ schema: 1, type, title: '跨端项目', graph: { 节点: [{ id: 'root', 文本: '中心主题', x: 100, y: 100 }, { id: 'child', 文本: '分支', x: 400, y: 100 }], 连线: [{ id: 'edge', 起点: 'root', 终点: 'child' }] } })
async function wire(actor: any, binding: any, source: DiagramCloudModel) { const client = new RealtimeClient({ binding, type: diagramType(source.type), model: source, call: (action, input) => Promise.resolve().then(() => actor[action](input)), onModel: () => {}, pollInterval: 60000 }); remoteClients.push(client); await client.ready; return client }
async function teamEntry(type: '脑图' | '流程图', role = 'editor') { const source = model(type), team = await fixture.a.teamCreate({ name: '图形团队' }), invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role }); await fixture.b.teamAccept({ credential: invite.credential }); const saved = await fixture.a.teamSave({ id: team.id, name: source.title, filename: source.title + (type === '脑图' ? '.sealmind' : '.sealflow'), data: encodeDiagramFile(source) }); return { source, entry: { type: diagramType(type), title: source.title, name: source.title + (type === '脑图' ? '.sealmind' : '.sealflow'), binding: { kind: 'team', id: team.id, nodeId: saved.id, name: source.title, version: 1, editable: role !== 'viewer', accountId: fixture.b.status().account.id } } as DiagramCloudEntry } }
const cachedModel = (binding: any) => { const state = fixture.b.realtimeRestore({ binding })?.state; if (!state) return null; const doc = new Y.Doc(); try { Y.applyUpdate(doc, Uint8Array.from(Buffer.from(state, 'base64'))); return decodeModel(doc.getMap('document').get('model')) } finally { doc.destroy() } }
const online = () => waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('实时共同编辑已连接'))
const synchronize = async () => { await waitFor(() => expect(screen.getByRole('button', { name: '立即同步' })).toBeEnabled()); await userEvent.click(screen.getByRole('button', { name: '立即同步' })); await waitFor(() => expect(screen.getByRole('button', { name: '立即同步' })).toBeEnabled()) }

it('真实UI把本机图同步到个人云，输入写入加密实时队列，断网重开恢复，重新联网同步', async () => {
  const local = createDiagramProject('脑图', '原本机项目', model().graph); new DiagramProjectStore('脑图').write(local, null)
  let view = wrap(<DiagramPage 类型="脑图" />)
  await userEvent.click(screen.getByRole('button', { name: '云端与协作' })); await screen.findByRole('button', { name: '新建云脑图项目' }); await userEvent.click(screen.getByRole('button', { name: '本机项目' }))
  await userEvent.click(screen.getByRole('button', { name: '同步到云端：原本机项目' })); await screen.findByRole('dialog', { name: '保存脑图到云端' }); await userEvent.click(screen.getByRole('button', { name: '保存并打开云项目' })); await online()
  fireEvent.change(screen.getByLabelText('节点备注'), { target: { value: '云端中文备注😀' } }); await synchronize(); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).not.toHaveTextContent('待同步'))
  expect(new DiagramProjectStore('脑图').load().items.find(item => item.project.id === local.id)?.project.graph).toEqual(local.graph)
  offline = true; await synchronize(); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('离线编辑'))
  fireEvent.change(screen.getByLabelText('节点备注'), { target: { value: '离线仍保留的备注𠀀' } }); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('待同步'))
  await userEvent.click(screen.getByRole('button', { name: '返回项目列表' })); await screen.findByRole('button', { name: '打开云项目：原本机项目' }); view.unmount(); service = fixture.reopen(fixture.a)
  view = wrap(<DiagramPage 类型="脑图" />); await userEvent.click(screen.getByRole('button', { name: '云端与协作' })); await userEvent.click(await screen.findByRole('button', { name: '打开云项目：原本机项目' })); await waitFor(() => expect(screen.getByLabelText('节点备注')).toHaveValue('离线仍保留的备注𠀀'))
  offline = false; act(() => window.dispatchEvent(new Event('online'))); await online(); await synchronize(); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).not.toHaveTextContent('待同步')); view.unmount()
}, 60000)

it('共享页打开图形进入同一个云编辑器，只读不能修改，仍可另存独立本机项目', async () => {
  const source = model(), saved = await fixture.a.save({ linkId: crypto.randomUUID(), name: source.title, filename: '共享图.sealmind', data: encodeDiagramFile(source) }), owner = await fixture.a.realtimeNodeBinding({ id: saved.id }); await wire(fixture.a, owner, source)
  const invite = await fixture.a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'read' }); await fixture.b.shareAccept({ credential: invite.credential }); service = fixture.b
  const Router = () => { const store = useAppStore(); return store.navKey === 'mindmap' ? <DiagramPage 类型="脑图" /> : <SharedPage /> }
  wrap(<Router />); await userEvent.click(await screen.findByRole('button', { name: `打开共享副本 ${source.title}` })); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('实时只读查看'))
  expect(screen.getByRole('button', { name: '添加节点' })).toBeDisabled(); expect(screen.getByLabelText('文字')).toBeDisabled(); const before = (await fixture.a.realtimeSnapshot({ binding: owner })).head
  fireEvent.change(screen.getByLabelText('文字'), { target: { value: '不允许写入' } }); expect((await fixture.a.realtimeSnapshot({ binding: owner })).head).toBe(before)
  await userEvent.click(screen.getByRole('button', { name: '另存本机项目' })); expect(new DiagramProjectStore('脑图').load().items).toHaveLength(1); expect(new DiagramProjectStore('脑图').load().items[0].project.graph).toEqual(source.graph)
}, 60000)

it('云列表显示团队流程图，只读实时接收远端修改，成员移除后停止编辑', async () => {
  const { source, entry } = await teamEntry('流程图', 'viewer'), owner = await wire(fixture.a, entry.binding, source); service = fixture.b
  wrap(<DiagramPage 类型="流程图" />); await userEvent.click(screen.getByRole('button', { name: '云端与协作' })); await userEvent.click(await screen.findByRole('button', { name: '打开云项目：跨端项目' })); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('实时只读查看'))
  const next = copy(owner.current); next.graph.节点[0].文本 = '团队远端修改'; await act(async () => { await owner.publish(next); await owner.flush() }); await screen.findByRole('button', { name: '团队远端修改' }); expect(screen.getByLabelText('文字')).toBeDisabled()
  await fixture.a.teamUpdateMember({ id: entry.binding.id, userId: fixture.b.status().account.id, role: 'editor' }); await online(); expect(screen.getByLabelText('文字')).toBeEnabled()
  fireEvent.change(screen.getByLabelText('节点备注'), { target: { value: '角色提升后无需重开即可编辑' } }); await synchronize(); await owner.sync(); expect(owner.current.graph.节点[0].备注).toBe('角色提升后无需重开即可编辑')
  await fixture.a.teamUpdateMember({ id: entry.binding.id, userId: fixture.b.status().account.id, role: 'viewer' }); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('实时只读查看')); expect(screen.getByLabelText('文字')).toBeDisabled()
  await fixture.a.teamRemoveMember({ id: entry.binding.id, userId: fixture.b.status().account.id }); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('访问权限已撤销')); expect(screen.getByRole('button', { name: '添加节点' })).toBeDisabled()
}, 60000)

it('中文合成输入期间保留编辑基线，合并同字段远端插入和位置修改；删除中的输入加密保留', async () => {
  const { source, entry } = await teamEntry('脑图'), owner = await wire(fixture.a, entry.binding, source); service = fixture.b
  const saveLocal = vi.fn(), createNew = vi.fn(); wrap(<CloudDiagramEditor entry={entry} model={source} onBack={() => {}} onNew={createNew} onSaveLocal={saveLocal} />); await online()
  const text = screen.getByLabelText('文字'); fireEvent.compositionStart(text); fireEvent.change(text, { target: { value: '中心主题本地' } })
  const remote = copy(owner.current); remote.graph.节点[0].文本 = '远端中心主题'; remote.graph.节点[0].x = 800
  await act(async () => { await owner.publish(remote); await owner.flush() }); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('2 台设备在线')); await waitFor(() => expect(cachedModel(entry.binding)?.graph.节点.find((node: any) => node.id === 'root')?.x).toBe(800)); expect(fixture.b.realtimeRestore({ binding: entry.binding }).pending).toBe(0)
  expect(text).toHaveValue('中心主题本地'); fireEvent.compositionEnd(text, { data: '本地' }); await userEvent.click(screen.getByRole('button', { name: '立即同步' })); await owner.sync(); expect(owner.current.graph.节点[0]).toMatchObject({ 文本: '远端中心主题本地', x: 800 })
  await userEvent.click(screen.getByRole('button', { name: '分支' })); const childText = screen.getByLabelText('文字'); fireEvent.compositionStart(childText); fireEvent.change(childText, { target: { value: '分支未提交输入' } })
  const removed = copy(owner.current); removed.graph.节点 = removed.graph.节点.filter(node => node.id !== 'child'); removed.graph.连线 = []; await act(async () => { await owner.publish(removed); await owner.flush() }); await waitFor(() => expect(cachedModel(entry.binding)?.graph.节点.some((node: any) => node.id === 'child')).toBe(false)); fireEvent.compositionEnd(childText, { data: '未提交输入' })
  await screen.findByText(/其他成员删除了正在编辑的节点/); await waitFor(() => expect(fixture.b.realtimeRecovery({ binding: entry.binding })?.model.graph.节点.find((node: any) => node.id === 'child').文本).toBe('分支未提交输入'))
  expect(owner.current.graph.节点.some(node => node.id === 'child')).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: '新建脑图项目' })); await screen.findByRole('dialog', { name: '保留未合并输入' }); expect(createNew).not.toHaveBeenCalled(); await userEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  await userEvent.click(screen.getByRole('button', { name: '另存恢复项目' })); expect(saveLocal).toHaveBeenCalledWith(expect.objectContaining({ graph: expect.objectContaining({ 节点: expect.arrayContaining([expect.objectContaining({ 文本: '分支未提交输入' })]) }) }))
}, 60000)


it('所有者尚未初始化房间时，共享只读源仍可打开，断网后真正重开不丢内容且不会创建远端房间', async () => {
  const source = model(), saved = await fixture.a.save({ linkId: crypto.randomUUID(), name: source.title, filename: '未初始化.sealmind', data: encodeDiagramFile(source) })
  const invite = await fixture.a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'read' }); await fixture.b.shareAccept({ credential: invite.credential }); service = fixture.b
  let view = wrap(<DiagramPage 类型="脑图" />); await userEvent.click(screen.getByRole('button', { name: '云端与协作' })); await userEvent.click(await screen.findByRole('button', { name: '打开云项目：跨端项目' }))
  await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('实时只读查看')); expect(screen.getByLabelText('文字')).toHaveValue('中心主题'); expect(screen.getByLabelText('文字')).toBeDisabled()
  expect((await fixture.a.realtimeSnapshot({ binding: { kind: 'node', id: saved.id } })).initialized).toBe(false)
  offline = true; await userEvent.click(screen.getByRole('button', { name: '返回项目列表' })); view.unmount(); service = fixture.reopen(fixture.b)
  view = wrap(<DiagramPage 类型="脑图" />); await userEvent.click(screen.getByRole('button', { name: '云端与协作' })); await userEvent.click(await screen.findByRole('button', { name: '打开云项目：跨端项目' })); await waitFor(() => expect(document.querySelector('.diagram-cloud-status')).toHaveTextContent('离线编辑')); expect(screen.getByLabelText('文字')).toHaveValue('中心主题'); expect(screen.getByLabelText('文字')).toBeDisabled()
  expect(fixture.b.realtimeRestore({ binding: { kind: 'share', id: invite.id } }).sourceModel.graph).toEqual(source.graph)
}, 60000)
