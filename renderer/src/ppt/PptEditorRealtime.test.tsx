import { createContext, useContext } from 'react'
import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, waitFor, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { AppProvider, useAppStore, type AppState } from '../store'
import PptEditor from './PptEditor'
import { 创建文本框, 创建演示文稿 } from './deck'
import { 构建演示保存模型 } from './saveModel'
import { restoreFileBinding } from '../collaboration/fileAccess'
import { getRealtimeClient } from '../collaboration/useRealtimeDocument'

// Each React workspace represents a separate platform window. Only its cloud
// transport boundary is injected; service, permissions, crypto, HTTP and codec
// are real. This lets two actual PptEditor instances run independent accounts.
const Transport = createContext<any>(null)
vi.mock('../cloud/CloudProvider', async original => ({ ...await original<any>(), useCloud: () => useContext(Transport) }))
const require = createRequire(import.meta.url), Module = require('node:module'), load = Module._load
let factory: any
try { Module._load = function (id: string, ...args: any[]) { const value = load.call(this, id, ...args); return id === 'node:worker_threads' ? { ...value, isMainThread: true } : value }; factory = require('../../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture } finally { Module._load = load }
const codec = require('../../../main/office/pptxCodec.js')
let fixture: any, views: Array<ReturnType<typeof render>> = [], originalCrypto: PropertyDescriptor | undefined
afterEach(async () => { views.forEach(view => view.unmount()); views = []; await fixture?.cleanup(); Reflect.deleteProperty(window, 'electronAPI'); if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto) })

it('真实两个演示编辑器自动合并不同文本框、撤销仅本地，并把一致模型实际写盘导出', async () => {
  originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  fixture = await factory(); fixture.cloud.server.prependListener('request', (_req: unknown, response: any) => response.setHeader('Connection', 'close'))
  const deck = 创建演示文稿(); deck.幻灯片列表[0].文本框列表 = [创建文本框(20, 30, 400, 100, '标题原文'), 创建文本框(20, 180, 400, 100, '正文原文')]
  const source = await codec.写入pptx(构建演示保存模型(deck, [])), team = await fixture.a.teamCreate({ name: '实时演示' }), invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'editor' })
  await fixture.b.teamAccept({ credential: invite.credential })
  const saved = await fixture.a.teamSave({ id: team.id, name: '共同演示.pptx', data: source.toString('base64') })
  const files = [path.join(fixture.directory, '客户端甲.pptx'), path.join(fixture.directory, '客户端乙.pptx')], writes: string[] = []
  files.forEach(filename => fs.writeFileSync(filename, source))
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }), reportUnsavedCount: async () => ({ 成功: true }),
    saveToFile: async (filename: string, data: string) => { fs.writeFileSync(filename, Buffer.from(data, 'base64')); writes.push(filename); return { 成功: true, 文件指纹: 'a'.repeat(64) } },
    office: { writePptx: async (model: unknown) => ({ 成功: true, 数据: (await codec.写入pptx(model)).toString('base64') }) },
    presentationResources: { sync: async () => ({ 成功: true }), release: async () => ({ 成功: true }), export: async () => ({ 成功: true, 条目: [] }), restore: async () => ({ 成功: true }) }
  } })
  const states: AppState[] = []
  const mount = async (service: any, index: number) => {
    restoreFileBinding(files[index], { kind: 'team', id: team.id, nodeId: saved.id, version: saved.version, name: '共同演示.pptx', accountId: service.status().account.id, editable: true })
    function Entry() { const state = useAppStore(); states[index] = state; return <><button onClick={() => state.createDoc('ppt', deck, { 路径: files[index] })}>打开编辑器{index}</button>{state.module === 'ppt' ? <PptEditor /> : null}</> }
    const view = render(<Transport.Provider value={{ state: service.status(), call: (action: string, input: any) => Promise.resolve().then(() => service[action](input)), refresh: async () => {}, configure: () => {} }}><AntdApp><AppProvider><Entry /></AppProvider></AntdApp></Transport.Provider>); views.push(view)
    await waitFor(() => expect(states[index].启动恢复结束).toBe(true)); fireEvent.click(within(view.container).getByText('打开编辑器' + index))
    await waitFor(() => expect(getRealtimeClient(states[index].activeDocumentId!)?.status.connected).toBe(true)); return view
  }
  const a = await mount(fixture.a, 0), b = await mount(fixture.b, 1), ca = getRealtimeClient(states[0].activeDocumentId!)!, cb = getRealtimeClient(states[1].activeDocumentId!)!
  fireEvent.doubleClick(a.container.querySelectorAll('.wps-ppt-box')[0]); fireEvent.change(a.container.querySelector('textarea')!, { target: { value: '甲实时😀标题' } }); fireEvent.doubleClick(b.container.querySelectorAll('.wps-ppt-box')[1]); fireEvent.change(b.container.querySelector('textarea')!, { target: { value: '乙实时𠀀正文' } })
  await act(async () => { for (let round = 0; round < 3; round++) await Promise.all([ca.sync(), cb.sync()]) })
  await waitFor(() => { for (let index = 0; index < 2; index++) { const boxes = states[index].演示文档模型[states[index].activeDocumentId!].幻灯片列表[0].文本框列表; expect(boxes.map(box => box.text)).toEqual(['甲实时😀标题', '乙实时𠀀正文']) } })
  await act(async () => { expect(ca.undo()).toBe(true); for (let round = 0; round < 2; round++) await Promise.all([ca.sync(), cb.sync()]) })
  expect(states[1].演示文档模型[states[1].activeDocumentId!].幻灯片列表[0].文本框列表.map(box => box.text)).toEqual(['标题原文', '乙实时𠀀正文'])
  await act(async () => { expect(ca.redo()).toBe(true); for (let round = 0; round < 2; round++) await Promise.all([ca.sync(), cb.sync()]) })
  fireEvent.keyDown(document, { key: 's', ctrlKey: true }); await waitFor(() => expect(writes).toContain(files[0])); a.unmount()
  fireEvent.keyDown(document, { key: 's', ctrlKey: true }); await waitFor(() => expect(writes).toContain(files[1]))
  for (const filename of files) { const reopened = await codec.读取pptx(fs.readFileSync(filename)); expect(reopened.演示文稿.幻灯片列表[0].文本框列表.map((box: any) => box.text)).toEqual(['甲实时😀标题', '乙实时𠀀正文']) }
}, 60000)
