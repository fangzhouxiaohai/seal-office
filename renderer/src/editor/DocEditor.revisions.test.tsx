import { createRequire } from 'node:module'
import { webcrypto } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import { AppProvider, useAppStore } from '../store'
import { CloudProvider } from '../cloud/CloudProvider'
import { restoreFileBinding } from '../collaboration/fileAccess'
import { getRealtimeClient } from '../collaboration/useRealtimeDocument'
import { createRealtimeClient, type RealtimeClient } from '../collaboration/realtimeClient'
import { joinWordModel, splitWordModel, validateWordModel } from './wordCollaboration'
import { htmlToDocxModel } from './commands'
const load = createRequire(import.meta.url), { 生成docx } = load('../../../main/office/docxWriter'), { 读取docx } = load('../../../main/office/docxReader'), { createLocalCollaborationFixture } = load('../../../server/test/collaborationFixture.cjs')
let fixture: any, remote: RealtimeClient<any> | undefined, id = '', cryptoDescriptor: PropertyDescriptor | undefined
const office = { writeDocx: async (model: any) => ({ 成功: true, 数据: (await 生成docx(model)).toString('base64') }), readDocx: async (data: string) => ({ 成功: true, ...await 读取docx(Buffer.from(data, 'base64')) }) }
afterEach(async () => { await remote?.close(); remote = undefined; await fixture?.cleanup(); fixture = undefined; Reflect.deleteProperty(window, 'electronAPI'); if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); cryptoDescriptor = undefined })
function renderEditor(html = '<p>正文</p>', path?: string, cloud = false) {
  const Open = () => { const store = useAppStore(); id = store.activeDocumentId || ''; return <button onClick={() => { store.createDoc('word', html, path ? { 路径: path } : undefined) }}>打开修订测试</button> }
  const body = <AppProvider><Open /><DocEditor /></AppProvider>
  return render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp>{cloud ? <CloudProvider>{body}</CloudProvider> : body}</AntdApp></ConfigProvider>)
}
function caret(text: Node, offset: number) { const range = document.createRange(); range.setStart(text, offset); range.collapse(true); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range) }
it('实际编辑器记录输入作者时间、逐条接受并能撤销，视图切换不移除历史', async () => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { office } })
  const { container } = renderEditor(); await userEvent.click(screen.getByText('打开修订测试'))
  await userEvent.click(screen.getByRole('tab', { name: '审阅' })); await userEvent.click(screen.getByRole('button', { name: /^修订$/ }))
  expect(screen.queryByRole('button', { name: '查看修订历史' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^修订历史$/ })); await userEvent.clear(screen.getByLabelText('审阅作者')); await userEvent.type(screen.getByLabelText('审阅作者'), '作者甲')
  const root = container.querySelector<HTMLElement>('.wps-editor-canvas__content')!
  caret(root.querySelector('p')!.firstChild!, 2)
  act(() => { root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '新增' })) })
  const revision = root.querySelector<HTMLElement>('.wps-insert')!
  expect(revision.dataset.sealRevisionAuthor).toBe('作者甲'); expect(Number.isFinite(Date.parse(revision.dataset.sealRevisionDate!))).toBe(true)
  expect(screen.getByText(/修订历史（1）/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: `接受修订${revision.dataset.sealRevisionId}` }))
  await waitFor(() => expect(root.querySelector('.wps-insert')).toBeNull()); expect(root.textContent).toBe('正文新增')
  await userEvent.click(screen.getByRole('tab', { name: '开始' })); await userEvent.click(screen.getByRole('button', { name: /^撤销$/ }))
  expect(root.querySelector('.wps-insert')!.textContent).toBe('新增')
}, 30000)

it('格式历史与源包经过真实HTTP双账号同段并发和IME，撤销只移除本机修改且DOCX导出一致', async () => {
  cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  fixture = await createLocalCollaborationFixture(); fixture.cloud.server.prependListener('request', (_req: any, response: any) => response.setHeader('Connection', 'close'))
  const html = '<p>共同编辑终点</p>', seed = await 生成docx(htmlToDocxModel(html)), team = await fixture.a.teamCreate({ name: '真实文字协作' }), invite = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'editor' }); await fixture.b.teamAccept({ credential: invite.credential })
  const file = await fixture.a.teamSave({ id: team.id, name: '审阅.docx', data: seed.toString('base64') }), path = 'C:\\private-tests\\word-realtime.docx'
  const binding = { kind: 'team' as const, id: team.id, nodeId: file.id, version: file.version, name: '审阅.docx', editable: true, accountId: fixture.a.status().account.id }
  restoreFileBinding(path, binding)
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { office, cloud: { invoke: async (action: string, input: any) => { try { return { 成功: true, 数据: await fixture.a[action](input) } } catch (error: any) { return { 成功: false, 错误: error.message, 状态码: error.status } } } } } })
  const { container, unmount } = renderEditor(html, path, true); await userEvent.click(screen.getByText('打开修订测试'))
  await waitFor(() => expect(getRealtimeClient(id)?.status.connected).toBe(true), { timeout: 15000 })
  const local = getRealtimeClient(id)!, base = local.current
  remote = createRealtimeClient({ binding, type: 'word', model: splitWordModel(html), call: (action, input) => Promise.resolve(fixture.b[action](input)), onModel: () => {}, validate: validateWordModel, pollInterval: 60000 }); await remote.ready
  await userEvent.click(screen.getByRole('tab', { name: '审阅' })); await userEvent.click(screen.getByRole('button', { name: /^修订$/ }))
  const root = container.querySelector<HTMLElement>('.wps-editor-canvas__content')!; caret(root.querySelector('p')!.firstChild!, 2)
  await act(async () => { root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '甲' })); await remote!.publish({ ...base, html: base.html.replace('编辑', '乙编辑') }, base) })
  for (let round = 0; round < 3; round++) await act(async () => { await Promise.all([local.sync(), remote!.sync()]) })
  expect(root.textContent).toContain('甲'); expect(root.textContent).toContain('乙'); expect(local.current).toEqual(remote.current)
  await act(async () => { expect(local.undo()).toBe(true); await local.sync(); await remote!.sync() })
  expect(root.textContent).not.toContain('甲'); expect(root.textContent).toContain('乙')
  const p = root.querySelector('p')!, text = p.lastChild!; caret(text, text.textContent!.length)
  await act(async () => { root.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })); text.textContent += 'zhong'; await remote!.publish({ ...remote!.current, html: remote!.current.html.replace('终点', '丙终点') }); await remote!.sync(); await local.sync() })
  expect(root.textContent).toContain('zhong')
  await act(async () => { root.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' })) })
  for (let round = 0; round < 3; round++) await act(async () => { await Promise.all([local.sync(), remote!.sync()]) })
  expect(root.textContent).not.toContain('zhong'); expect(root.textContent).toContain('中文'); expect(root.textContent).toContain('丙'); expect(local.current).toEqual(remote.current)
  const exported = await 读取docx(await 生成docx(htmlToDocxModel(joinWordModel(local.current)))), box = document.createElement('div'); box.innerHTML = exported.html
  expect(box.textContent).toBe(root.textContent); expect(box.querySelector('[data-seal-revision-author]')).toBeTruthy()
  unmount(); await local.close()
}, 60000)

it('真实粘贴替换保留原文删除历史与新内容格式，块级粘贴明确保护原文', async () => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { office } })
  const { container } = renderEditor('<p>前<b>原文字</b>后</p>'); await userEvent.click(screen.getByText('打开修订测试'))
  await userEvent.click(screen.getByRole('tab', { name: '审阅' })); await userEvent.click(screen.getByRole('button', { name: /^修订$/ }))
  const root = container.querySelector<HTMLElement>('.wps-editor-canvas__content')!, old = root.querySelector('b')!.firstChild!, range = document.createRange(); range.selectNodeContents(old); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  const paste = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(paste, 'clipboardData', { value: { getData: (format: string) => format === 'text/html' ? '<em>新文字</em>' : '新文字' } })
  act(() => { root.dispatchEvent(paste) })
  expect(paste.defaultPrevented).toBe(true); expect(root.querySelector('.wps-delete')?.textContent).toBe('原文字'); expect(root.querySelector('.wps-insert em')?.textContent).toBe('新文字')
  const model = htmlToDocxModel(root.innerHTML), bytes = await 生成docx(model), read = await 读取docx(bytes)
  expect(read.html).toContain('原文字'); expect(read.html).toContain('新文字'); expect(read.html).toContain('data-seal-revision-type="del"')
  const before = root.innerHTML, blocked = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(blocked, 'clipboardData', { value: { getData: () => '<table><tr><td>复杂结构</td></tr></table>' } })
  act(() => { root.dispatchEvent(blocked) }); expect(blocked.defaultPrevented).toBe(true); expect(root.innerHTML).toBe(before)
}, 30000)
