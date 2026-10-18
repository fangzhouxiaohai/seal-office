import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { RealtimeClient } from '../collaboration/realtimeClient'
import { diagramType, encodeDiagramFile, parseDiagramCloud, validateDiagramCloud, type DiagramCloudModel } from './diagramCloud'

const require = createRequire(import.meta.url), Module = require('node:module'), load = Module._load
let factory: any
try { Module._load = function (id: string, ...args: any[]) { const result = load.call(this, id, ...args); return id === 'node:worker_threads' ? { ...result, isMainThread: true } : result }; factory = require('../../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture } finally { Module._load = load }
let fixture: any, originalCrypto: PropertyDescriptor | undefined, clients: RealtimeClient<DiagramCloudModel>[] = []
beforeEach(async () => { originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); fixture = await factory(); fixture.cloud.server.prependListener('request', (_request: unknown, response: any) => response.setHeader('Connection', 'close')) }, 60000)
afterEach(async () => { await Promise.all(clients.map(client => client.close())); clients = []; await fixture.cleanup(); if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto) })
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const graph = (type: '脑图' | '流程图'): DiagramCloudModel => ({ schema: 1, type, title: '跨端图形😀', graph: { 节点: [{ id: 'root', 文本: '中心主题', x: 100, y: 100 }, { id: 'branch', 文本: '分支内容', x: 400, y: 100 }, { id: 'peer', 文本: '第三节点', x: 400, y: 300 }], 连线: [{ id: 'edge1', 起点: 'root', 终点: 'branch', 标签: '关系' }, { id: 'edge2', 起点: 'root', 终点: 'peer' }] } })
async function wire(service: any, binding: any, model: DiagramCloudModel, options: any = {}) { const client = new RealtimeClient<DiagramCloudModel>({ binding, type: diagramType(model.type), model, validate: validateDiagramCloud, call: (action, input) => Promise.resolve().then(() => service[action](input)), onModel: () => {}, pollInterval: 60000, ...options }); clients.push(client); await client.ready; return client }
async function room(type: '脑图' | '流程图') { const model = graph(type), team = await fixture.a.teamCreate({ name: '图形实时团队' }); for (const [service, phone] of [[fixture.b, '13800111002'], [fixture.c, '13800111003']]) { const invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: phone, role: 'editor' }); await service.teamAccept({ credential: invite.credential }) }; const saved = await fixture.a.teamSave({ id: team.id, name: model.title, filename: model.title + (type === '脑图' ? '.sealmind' : '.sealflow'), data: encodeDiagramFile(model) }); return { model, binding: { kind: 'team' as const, id: team.id, nodeId: saved.id } } }
async function settle(...values: RealtimeClient<DiagramCloudModel>[]) { for (let round = 0; round < 3; round++) await Promise.all(values.map(client => client.sync())) }

it.each(['脑图', '流程图'] as const)('%s三账号真实HTTP并发合并节点坐标、中文文字、备注和连线字段，撤销只撤自己的操作', async type => {
  const { model, binding } = await room(type), a = await wire(fixture.a, binding, model), b = await wire(fixture.b, binding, model), c = await wire(fixture.c, binding, model)
  const ma = copy(model), mb = copy(model), mc = copy(model)
  ma.graph.节点[1].x = 700; mb.graph.节点[1].文本 = '并发中文😀𠀀👩🏽‍💻é'; mb.graph.节点[1].备注 = '另一成员的备注'; mc.graph.连线[0].标签 = '远端标签'; mc.graph.节点.push({ id: 'remote-new', 文本: '远端新增', x: 900, y: 500 })
  await Promise.all([a.publish(ma), b.publish(mb), c.publish(mc)]); await settle(a, b, c)
  expect(a.current).toEqual(b.current); expect(c.current).toEqual(b.current)
  expect(a.current.graph.节点.find(node => node.id === 'branch')).toMatchObject({ x: 700, 文本: '并发中文😀𠀀👩🏽‍💻é', 备注: '另一成员的备注' }); expect(a.current.graph.连线[0].标签).toBe('远端标签')
  expect(a.canUndo).toBe(true); a.stopCapturing(); expect(a.undo()).toBe(true); await settle(a, b, c)
  expect(a.current.graph.节点.find(node => node.id === 'branch')).toMatchObject({ x: 400, 文本: '并发中文😀𠀀👩🏽‍💻é', 备注: '另一成员的备注' }); expect(a.current.graph.节点.some(node => node.id === 'remote-new')).toBe(true)
  expect(a.canRedo).toBe(true); expect(a.redo()).toBe(true); await settle(a, b, c); expect(a.current).toEqual(c.current); expect(validateDiagramCloud(a.current)).toBeNull()
}, 60000)

it('并发删除节点和新增关联连线时不复活节点、不停止房间；撤销删除后恢复仍有效的远端连线', async () => {
  const { model, binding } = await room('流程图'), a = await wire(fixture.a, binding, model), b = await wire(fixture.b, binding, model)
  const removed = copy(model), linked = copy(model); removed.graph.节点 = removed.graph.节点.filter(node => node.id !== 'branch'); removed.graph.连线 = removed.graph.连线.filter(edge => edge.终点 !== 'branch'); linked.graph.连线.push({ id: 'new-edge', 起点: 'peer', 终点: 'branch', 标签: '并发关联' })
  await Promise.all([a.publish(removed), b.publish(linked)]); await settle(a, b)
  expect(a.current).toEqual(b.current); expect(a.status.status).toBe('online'); expect(a.current.graph.节点.some(node => node.id === 'branch')).toBe(false); expect(parseDiagramCloud(a.current).graph.连线.some(edge => edge.id === 'new-edge')).toBe(false)
  a.stopCapturing(); expect(a.undo()).toBe(true); await settle(a, b)
  expect(parseDiagramCloud(a.current).graph.连线.find(edge => edge.id === 'new-edge')?.标签).toBe('并发关联'); expect(a.current).toEqual(b.current)
}, 60000)

it('图形离线修改加密落盘后重启，合并在线新增节点且无重复；保留原节点和备注', async () => {
  const { model, binding } = await room('脑图'), a = await wire(fixture.a, binding, model); let offline = false
  const b = await wire(fixture.b, binding, model, { call: (action: string, input: any) => offline && !['realtimeRestore', 'realtimeQueue', 'realtimeState'].includes(action) ? Promise.reject(new Error('离线')) : Promise.resolve().then(() => fixture.b[action](input)) })
  offline = true; const draft = copy(model); draft.graph.节点[1].备注 = '离线备注😀'; draft.graph.节点.push({ id: 'offline-new', 文本: '离线新增', x: 100, y: 500 }); await b.publish(draft); await expect(b.sync()).rejects.toThrow('离线'); await b.close()
  const online = copy(model); online.graph.节点.push({ id: 'online-new', 文本: '在线新增', x: 800, y: 600 }); await a.publish(online); await a.flush()
  const recovered = await wire(fixture.reopen(fixture.b), binding, model); await settle(a, recovered)
  expect(a.current).toEqual(recovered.current); expect(a.current.graph.节点).toHaveLength(5); expect(new Set(a.current.graph.节点.map(node => node.id)).size).toBe(5); expect(a.current.graph.节点[1].备注).toBe('离线备注😀'); expect(recovered.status.pending).toBe(0)
}, 60000)

it('个人云两设备与共享接收者共同编辑同一图形，撤销最后共享后所有者仍能同步', async () => {
  const model = graph('脑图'), saved = await fixture.a.save({ linkId: crypto.randomUUID(), name: model.title, filename: '同一图.sealmind', data: encodeDiagramFile(model) }), owner = await fixture.a.realtimeNodeBinding({ id: saved.id })
  const a = await wire(fixture.a, owner, model), another = await fixture.client('13800111001'), second = await wire(another, await another.realtimeNodeBinding({ id: saved.id }), model)
  const invite = await fixture.a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }); await fixture.b.shareAccept({ credential: invite.credential }); const b = await wire(fixture.b, { kind: 'share', id: invite.id }, model)
  const mine = copy(model), remote = copy(model); mine.graph.节点[0].x = 900; remote.graph.节点[1].备注 = '共享端共同编辑'; await Promise.all([second.publish(mine), b.publish(remote)]); await settle(a, second, b)
  expect(a.current).toEqual(b.current); expect(second.current).toEqual(b.current); expect(a.current.graph.节点[0].x).toBe(900); expect(a.current.graph.节点[1].备注).toBe('共享端共同编辑')
  await fixture.a.shareRevoke({ id: invite.id }); await expect(b.sync()).rejects.toMatchObject({ status: 404 }); expect(b.status.status).toBe('revoked'); expect(b.status.readOnly).toBe(true)
  const next = copy(a.current); next.graph.节点[0].y = 700; await a.publish(next); await settle(a, second); expect(second.current.graph.节点[0].y).toBe(700)
}, 60000)

it('图形安全队列落盘失败明确报错，存储恢复后重试同步补写原操作而不丢图', async () => {
  const { model, binding } = await room('脑图'); let failDisk = true
  const a = await wire(fixture.a, binding, model, { call: (action: string, input: any) => failDisk && action === 'realtimeQueue' ? Promise.reject(new Error('安全存储写入失败')) : Promise.resolve().then(() => fixture.a[action](input)) })
  const next = copy(model); next.graph.节点[0].备注 = '待恢复的图形输入'; await expect(a.publish(next)).rejects.toThrow('安全存储写入失败'); expect(a.status.status).toBe('error'); expect(a.status.pending).toBe(1)
  failDisk = false; await a.flush(); expect(a.status.pending).toBe(0); const b = await wire(fixture.b, binding, model); await settle(a, b); expect(b.current.graph.节点[0].备注).toBe('待恢复的图形输入'); expect(a.current).toEqual(b.current)
}, 60000)
