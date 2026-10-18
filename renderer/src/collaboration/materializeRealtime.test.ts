import { createRequire } from 'node:module'
import { createHash, webcrypto } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { materializeRealtime } from './materializeRealtime'
import { createRealtimeClient, type RealtimeClient } from './realtimeClient'
import { createModelDocument, readModel, Y } from './crdtModel'
import { htmlToDocxModel } from '../editor/commands'
import { 创建工作表, 写入单元格 } from '../sheet/model'
import { 提取协作工作簿 } from '../sheet/sheetRealtimeSource'
import { 导出为Xlsx } from '../sheet/sheetExport'
import { 创建文本框, 创建演示文稿 } from '../ppt/deck'
import { 构建演示保存模型 } from '../ppt/saveModel'
import { decodeDiagramFile, encodeDiagramFile, type DiagramCloudModel } from '../localTools/diagramCloud'

// All document bytes, HTTP, account authorization and encrypted local storage
// are real. Only the desktop IPC/file boundary is supplied to this jsdom view.
const require = createRequire(import.meta.url), Module = require('node:module'), load = Module._load
let factory: any
try { Module._load = function (id: string, ...args: any[]) { const result = load.call(this, id, ...args); return id === 'node:worker_threads' ? { ...result, isMainThread: true } : result }; factory = require('../../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture } finally { Module._load = load }
const docx = require('../../../main/office/docxWriter.js'), reader = require('../../../main/office/docxReader.js'), xlsx = require('../../../main/office/xlsxCodec.js'), pptx = require('../../../main/office/pptxCodec.js')
let fixture: any, clients: RealtimeClient<any>[] = [], originalCrypto: PropertyDescriptor | undefined, service: any, failWriter = false
beforeEach(async () => {
  originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  fixture = await factory(); service = fixture.b; failWriter = false
  fixture.cloud.server.prependListener('request', (_req: unknown, response: any) => response.setHeader('Connection', 'close'))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    cloud: { invoke: async (action: string, input: any) => { try { return { 成功: true, 数据: await service[action](input) } } catch (error: any) { return { 成功: false, 错误: error.message, 状态码: error.status } } } },
    readFile: async (filename: string) => ({ 成功: true, 内容: fs.readFileSync(filename).toString('base64'), 二进制: true, 文件指纹: createHash('sha256').update(fs.readFileSync(filename)).digest('hex') }),
    saveToFile: async (filename: string, data: string) => { fs.writeFileSync(filename, Buffer.from(data, 'base64')); return { 成功: true, 文件指纹: createHash('sha256').update(fs.readFileSync(filename)).digest('hex') } },
    office: {
      writeDocx: async (model: any) => failWriter ? { 成功: false, 错误: '真实来源包拒绝有损结构写回' } : ({ 成功: true, 数据: (await docx.生成docx(model)).toString('base64') }),
      writeXlsx: async (model: any) => ({ 成功: true, 数据: (await xlsx.写入xlsx(model)).toString('base64') }),
      writePptx: async (model: any) => ({ 成功: true, 数据: (await pptx.写入pptx(model)).toString('base64') }),
      readPptx: async (data: string) => ({ 成功: true, ...await pptx.读取pptx(Buffer.from(data, 'base64')) }),
    }, presentationResources: { restore: async () => ({ 成功: true }) },
  } })
}, 60000)
afterEach(async () => { await Promise.all(clients.map(client => client.close())); clients = []; await fixture?.cleanup(); Reflect.deleteProperty(window, 'electronAPI'); if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto) })
async function wire(clientService: any, binding: any, type: 'word' | 'table' | 'ppt' | 'mindmap' | 'flowchart', model: any) { const client = createRealtimeClient({ binding, type, model, call: (action, input) => Promise.resolve().then(() => clientService[action](input)), onModel: () => {}, pollInterval: 60000 }); clients.push(client); await client.ready; return client }
async function settle(...items: RealtimeClient<any>[]) { for (let round = 0; round < 3; round++) await Promise.all(items.map(client => client.sync())) }
async function teamFile(name: string, data: Buffer) {
  const team = await fixture.a.teamCreate({ name: '下载闭环' }), invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'editor' })
  await fixture.b.teamAccept({ credential: invite.credential }); const saved = await fixture.a.teamSave({ id: team.id, name, data: data.toString('base64') })
  return { kind: 'team' as const, id: team.id, nodeId: saved.id }
}
function copy(file: any) { const filename = path.join(fixture.directory, crypto.randomUUID(), file.name); fs.mkdirSync(path.dirname(filename)); fs.writeFileSync(filename, Buffer.from(file.data, 'base64')); return { ...file, path: filename } }

it('共享与个人云重新下载会真实生成最新DOCX，新设备所有者可从根密钥解密同一实时房间', async () => {
  const model = { html: '<p>起点😀终点</p>', source: '' }, original = await docx.生成docx(htmlToDocxModel(model.html)), saved = await fixture.a.save({ linkId: 'latest-docx', name: '最新.docx', data: original.toString('base64') })
  const share = await fixture.a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }); await fixture.b.shareAccept({ credential: share.credential })
  const binding = { kind: 'share' as const, id: share.id }, a = await wire(fixture.a, binding, 'word', model), b = await wire(fixture.b, binding, 'word', model)
  await Promise.all([a.publish({ ...model, html: '<p>起点甲😀终点</p>' }), b.publish({ ...model, html: '<p>起点😀乙终点</p>' })]); await settle(a, b)
  const received = await materializeRealtime(copy(await fixture.b.shareDownload({ id: share.id })), binding)
  const parsed = await reader.读取docx(fs.readFileSync(received.path)); expect(parsed.html).toContain('甲'); expect(parsed.html).toContain('乙'); expect(parsed.html).toContain('😀'); expect(received.live?.content).toBe(b.current.html)
  const ownerDevice = await fixture.client('13800111001'); service = ownerDevice
  const ownerBinding = await ownerDevice.realtimeNodeBinding({ id: saved.id }); expect(ownerBinding).toMatchObject({ kind: 'share', id: share.id, editable: true })
  const ownerCopy = await materializeRealtime(copy(await ownerDevice.download(saved.id)), ownerBinding)
  expect(ownerCopy.live?.content).toBe(b.current.html); expect((await reader.读取docx(fs.readFileSync(ownerCopy.path))).html).toContain('乙')
  await fixture.a.shareRevoke({ id: share.id })
  const afterRevoke = await materializeRealtime(copy(await ownerDevice.download(saved.id)), await ownerDevice.realtimeNodeBinding({ id: saved.id }))
  expect(afterRevoke.live?.content).toBe(b.current.html)
  await expect(ownerDevice.copy(saved.id)).rejects.toThrow('实时共同编辑')
  await expect(ownerDevice.publish(saved.id, 'knowledge', true)).rejects.toThrow('实时共同编辑')
  expect(fixture.cloud.db.query('SELECT id FROM realtime_rooms')).toHaveLength(1)
}, 60000)

it('团队最新XLSX下载重算合并后公式，未初始化的只读快照不创建协作房间', async () => {
  const initial = [写入单元格(写入单元格(创建工作表('结果', 10, 6), 'A1', '1'), 'B1', '=A1+2')], model = 提取协作工作簿(initial), binding = await teamFile('结果.xlsx', await xlsx.写入xlsx(导出为Xlsx(initial)))
  const untouched = copy(await fixture.b.teamDownload({ id: binding.id, nodeId: binding.nodeId })); expect((await materializeRealtime(untouched, binding)).live).toBeUndefined(); expect(fixture.cloud.db.query('SELECT id FROM realtime_rooms')).toHaveLength(0)
  const a = await wire(fixture.a, binding, 'table', model), b = await wire(fixture.b, binding, 'table', model)
  await Promise.all([a.publish(提取协作工作簿([写入单元格(initial[0], 'A1', '40')])), b.publish(提取协作工作簿([写入单元格(initial[0], 'B1', '=A1+3')]))]); await settle(a, b)
  const output = await materializeRealtime(copy(await fixture.b.teamDownload({ id: binding.id, nodeId: binding.nodeId })), binding), native = await xlsx.读取xlsx(fs.readFileSync(output.path))
  expect(output.live?.content[0].单元格.B1.显示值).toBe('43'); expect(JSON.stringify(native)).toContain('=A1+3'); expect(JSON.stringify(native)).toContain('43')
  await expect(fixture.b.teamSave({ id: binding.id, nodeId: binding.nodeId, name: '结果.xlsx', data: untouched.data, expectedVersion: untouched.version })).rejects.toMatchObject({ status: 409 })
}, 60000)

it('团队PPTX最新文字和原有图片都从真实文件往返保留，CRDT尚未重发的初始资源也完整', async () => {
  const png = fs.readFileSync(path.join(require.resolve('../../../main/office/docxImages.test.js'), '../../../renderer/src/editor/__fixtures__/office-image.png')).toString('base64'), id = createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex'), resource = { 标识: id, 类型: 'image/png', 数据: png }
  const deck = 创建演示文稿(); deck.幻灯片列表[0].文本框列表 = [创建文本框(10, 10, 300, 100, '原文')]; deck.资源索引 = { [id]: { 指纹: id, 类型: 'image/png', 字节数: Buffer.from(png, 'base64').length } }; deck.幻灯片列表[0].对象列表 = [{ id: '原有图片', 类型: '图片', x: 20, y: 200, width: 50, height: 50, 资源标识: id }]
  const original = await pptx.写入pptx(构建演示保存模型(deck, [resource])), binding = await teamFile('图文.pptx', original), model = { deck, resources: {} }, a = await wire(fixture.a, binding, 'ppt', model), b = await wire(fixture.b, binding, 'ppt', model)
  const next = JSON.parse(JSON.stringify(deck)); next.幻灯片列表[0].文本框列表[0].text = '实时甲😀𠀀'; await a.publish({ deck: next, resources: {} }); await settle(a, b)
  const output = await materializeRealtime(copy(await fixture.b.teamDownload({ id: binding.id, nodeId: binding.nodeId })), binding), native = await pptx.读取pptx(fs.readFileSync(output.path))
  expect(native.演示文稿.幻灯片列表[0].文本框列表[0].text).toBe('实时甲😀𠀀'); expect(native.资源条目).toHaveLength(1); expect(native.资源条目[0].数据).toBe(png)
}, 60000)

it('写出失败或撤权不会静默退回旧文件，旧整文件上传不能绕过实时内容', async () => {
  const model = { html: '<p>原文</p>', source: '' }, original = await docx.生成docx(htmlToDocxModel(model.html)), saved = await fixture.a.save({ linkId: 'fail-safe', name: '保护.docx', data: original.toString('base64') }), share = await fixture.a.shareCreate({ id: saved.id, recipientPhone: '13800111002', permission: 'edit' }); await fixture.b.shareAccept({ credential: share.credential })
  const binding = { kind: 'share' as const, id: share.id }, a = await wire(fixture.a, binding, 'word', model); await a.publish({ ...model, html: '<p>最新原文</p>' }); await a.flush()
  const file = copy(await fixture.b.shareDownload({ id: share.id })); failWriter = true
  await expect(materializeRealtime(file, binding)).rejects.toThrow('拒绝有损'); expect(fs.readFileSync(file.path)).toEqual(original)
  await expect(fixture.b.shareSave({ id: share.id, data: file.data, expectedVersion: file.version })).rejects.toMatchObject({ status: 409 })
  const upload = await fixture.request('/v1/uploads', { client: fixture.a, method: 'POST', data: { nodeId: saved.id, expected: saved.version, bytes: 128 } }); expect(upload.status).toBe(409)
  await fixture.a.shareRevoke({ id: share.id }); await expect(materializeRealtime(file, binding)).rejects.toMatchObject({ status: 404 }); expect(fs.readFileSync(file.path)).toEqual(original)
}, 60000)

it('同账号两个窗口的安全全状态缓存合并保存，不因后写入窗口覆盖另一窗口未发操作', async () => {
  const model = { html: '<p>基线</p>', source: '' }, original = await docx.生成docx(htmlToDocxModel(model.html)), binding = await teamFile('多窗口.docx', original), a = await wire(fixture.a, binding, 'word', model), b = await wire(fixture.a, binding, 'word', model)
  await Promise.all([a.publish({ ...model, html: '<p>甲基线</p>' }), b.publish({ ...model, html: '<p>基线乙</p>' })])
  const cached = fixture.a.realtimeRestore({ binding }), doc = createModelDocument(); Y.applyUpdate(doc, Buffer.from(cached.state, 'base64')); const restored = readModel<any>(doc); doc.destroy()
  expect(restored.html).toContain('甲'); expect(restored.html).toContain('乙'); expect(cached.pending).toBe(2)
}, 60000)


it.each(['脑图', '流程图'] as const)('%s最新下载真实物化加密日志，包含远端修改且输出路径不越界，初始来源包保持历史语义', async type => {
  const model: DiagramCloudModel = { schema: 1, type, title: '来源项目', graph: { 节点: [{ id: 'root', 文本: '来源主题', x: 10, y: 20 }], 连线: [] } }
  const extension = type === '脑图' ? 'sealmind' : 'sealflow', original = Buffer.from(encodeDiagramFile(model), 'base64'), binding = await teamFile('来源项目.' + extension, original)
  const owner = await wire(fixture.a, binding, type === '脑图' ? 'mindmap' : 'flowchart', model), next: DiagramCloudModel = { ...model, title: '../最新项目', graph: { 节点: [{ ...model.graph.节点[0], 文本: '实时修改😀𠀀', 备注: '远端最新备注', x: 500 }], 连线: [] } }
  await owner.publish(next); await owner.flush()
  const source = await fixture.b.teamDownload({ id: binding.id, nodeId: binding.nodeId }), filename = path.join(fixture.directory, '来源项目.' + extension); fs.writeFileSync(filename, Buffer.from(source.data, 'base64'))
  const latest = await materializeRealtime({ ...source, path: filename }, binding)
  expect(path.dirname(latest.path)).toBe(fixture.directory); expect(path.basename(latest.path)).toBe('.._最新项目.' + extension)
  expect(decodeDiagramFile(fs.readFileSync(latest.path).toString('base64'), type)).toEqual(next)
  expect(fs.readFileSync(filename)).toEqual(original); expect(decodeDiagramFile((await fixture.b.teamDownload({ id: binding.id, nodeId: binding.nodeId })).data).graph).toEqual(model.graph)
  expect((await service.realtimeRestore({ binding })).state).toBeTruthy()
}, 60000)
