import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp, ConfigProvider, Modal } from 'antd'
import { AppProvider, useAppStore, type AppState } from '../store'
import SheetEditor from '../sheet/SheetEditor'
import PptEditor from '../ppt/PptEditor'
import { 创建工作表, 写入单元格, 设置数据验证 } from '../sheet/model'
import { 创建演示文稿, 创建文本框 } from '../ppt/deck'
import { 保存全部文档 } from './saveAll'
import GlobalTabs from '../components/GlobalTabs'
import { RECENT_DOCS } from '../mock/recentDocs'

const codec = createRequire(import.meta.url)('../../../main/office/sealFormat.js')
const original = window.electronAPI
afterEach(() => { window.electronAPI = original; Modal.destroyAll() })

function setup(tabs = false) {
  let state!: AppState, backup = ''
  const files = new Map<string, string>()
  const backupSave = vi.fn(async (value: string) => { backup = value; return { 成功: true } })
  window.electronAPI = {
    backupLoad: async () => ({ 成功: true, 内容: null }), backupSave,
    backupClear: async () => ({ 成功: true }),
    saveToFile: async (path: string, value: string) => { files.set(path, value); return { 成功: true, 文件指纹: 'new-fingerprint' } },
    office: { writeSeal: async (type: string, payload: unknown) => ({ 成功: true, 数据: (await codec.writeSeal(type, payload)).toString('base64') }) },
  } as any
  function Host() {
    state = useAppStore()
    return <>{state.module === 'table' ? <SheetEditor /> : state.module === 'ppt' ? <PptEditor /> : null}{tabs ? <GlobalTabs /> : null}</>
  }
  const view = render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><Host /></AppProvider></AntdApp></ConfigProvider>)
  return { ...view, state: () => state, backup: () => JSON.parse(backup), backupSave, files }
}

it('首页、设置、帮助、原始setModule与导航入口在卸载前提交未blur草稿，非法/IME草稿阻止新建、打开、切换和关闭', async () => {
  const app = setup()
  await waitFor(() => expect(app.state().启动恢复结束).toBe(true))
  act(() => app.state().createDoc('table', [写入单元格(创建工作表('导航'), 'A1', '原值')], { 路径: 'E:/draft/导航.slxls' }))
  const id = app.state().activeDocumentId!
  const targets: Array<[() => void, string]> = [
    [() => app.state().goHome(), 'home'], [() => app.state().showSettings(), 'settings'],
    [() => app.state().showHelp(), 'help'], [() => app.state().setModule('home'), 'home'],
    [() => app.state().handleNav('recent', () => {}), 'home'],
  ]
  for (let index = 0; index < targets.length; index++) {
    const input = screen.getByLabelText('公式栏')
    fireEvent.change(input, { target: { value: `未blur导航${index}` } })
    act(() => targets[index][0]())
    expect(app.state().module).toBe(targets[index][1])
    expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe(`未blur导航${index}`)
    act(() => app.state().selectWorkspaceTab(id))
  }
  const input = screen.getByLabelText('公式栏')
  fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: '候选中' } })
  const blocked = [
    ...targets.map(([navigate]) => navigate), () => app.state().selectWorkspaceTab('home'),
    () => app.state().setActiveDocumentId(null), () => app.state().createDoc('word'),
    () => app.state().createEditorDoc(), () => app.state().closeEditorDoc(id), () => app.state().closeWorkspaceTab(id),
  ]
  for (const navigate of blocked) {
    act(navigate)
    expect(app.state().module).toBe('table'); expect(app.state().activeDocumentId).toBe(id)
    expect(app.state().documents).toHaveLength(1)
  }
  await act(async () => { await app.state().openDoc(RECENT_DOCS[0]) })
  expect(app.state().module).toBe('table'); expect(app.state().documents).toHaveLength(1)
  expect(screen.getAllByText('请先完成当前编辑').length).toBeGreaterThan(0)
  fireEvent.compositionEnd(input, { data: '候选中' })
  act(() => app.state().goHome())
  expect(app.state().module).toBe('home')
  expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe('候选中')
})

it('GlobalTabs关闭先准备未blur草稿并保留放弃/取消语义，完整干净文件关闭不增加弹窗', async () => {
  const app = setup(true)
  await waitFor(() => expect(app.state().启动恢复结束).toBe(true))
  act(() => app.state().createDoc('table', [写入单元格(创建工作表('标签'), 'A1', '原值')], { 路径: 'E:/draft/标签.slxls' }))
  const id = app.state().activeDocumentId!, input = screen.getByLabelText('公式栏')
  fireEvent.change(input, { target: { value: '关闭前未blur输入' } })
  expect(app.state().workspaceTabs[0].dirty).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '关闭 标签.slxls' }))
  let dialog = await screen.findByRole('dialog', { name: '文档有未保存的修改' })
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '文档有未保存的修改' })).toBeNull())
  expect(app.state().documents).toHaveLength(1)
  expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe('关闭前未blur输入')
  fireEvent.click(screen.getByRole('button', { name: '关闭 标签.slxls' }))
  dialog = await screen.findByRole('dialog', { name: '文档有未保存的修改' })
  fireEvent.click(within(dialog).getByRole('button', { name: '放弃修改' }))
  await waitFor(() => expect(app.state().documents).toHaveLength(0))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  act(() => app.state().createDoc('table', [写入单元格(创建工作表('完整'), 'A1', '已保存')], { 路径: 'E:/draft/完整.slxls' }))
  fireEvent.click(screen.getByRole('button', { name: '关闭 完整.slxls' }))
  expect(app.state().documents).toHaveLength(0)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('禁用工作状态备份仍在关闭检查前提交草稿并标记dirty，同时不写备份文件', async () => {
  localStorage.setItem('seal-session-restore', 'false')
  try {
    const app = setup()
    await waitFor(() => expect(app.state().启动恢复结束).toBe(true))
    act(() => app.state().createDoc('table', [写入单元格(创建工作表('关闭检测'), 'A1', '原值')], { 路径: 'E:/draft/关闭检测.slxls' }))
    const id = app.state().activeDocumentId!, input = screen.getByLabelText('公式栏')
    expect(app.state().workspaceTabs[0].dirty).toBe(false)
    fireEvent.change(input, { target: { value: '未blur必须提示保存' } })
    expect(app.state().workspaceTabs[0].dirty).toBe(false)
    await act(async () => { expect(await app.state().刷新工作状态备份()).toEqual({ 成功: true }) })
    expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe('未blur必须提示保存')
    expect(app.state().workspaceTabs[0].dirty).toBe(true)
    expect(app.backupSave).not.toHaveBeenCalled()
    fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: '候选字' } })
    await act(async () => { expect(await app.state().刷新工作状态备份()).toMatchObject({ 成功: false, 错误: expect.stringContaining('候选字') }) })
    expect(app.backupSave).not.toHaveBeenCalled()
  } finally { localStorage.removeItem('seal-session-restore') }
})

it.each(['formula', 'cell'])('表格%s未失焦输入进入后台备份及外部saveAll真实slxls，边界前不逐字改模型，重复准备不增加历史', async target => {
  const app = setup(), sheet = 写入单元格(创建工作表('源数据'), 'A1', '原值')
  await waitFor(() => expect(app.state().启动恢复结束).toBe(true))
  act(() => app.state().createDoc('table', [sheet], { 路径: 'E:/draft/未失焦.slxls' }))
  const id = app.state().activeDocumentId!
  let input: HTMLInputElement
  if (target === 'formula') input = screen.getByLabelText('公式栏')
  else { fireEvent.doubleClick(app.container.querySelector('[data-地址="A1"]')!); input = app.container.querySelector('.wps-sheet__editor') as HTMLInputElement }
  expect(input).toBeTruthy(); input.focus()
  const blurred = vi.fn(); input.addEventListener('blur', blurred)
  const text = '最新输入中文𠀀🦭é'
  const revision = app.state().草稿版本
  fireEvent.change(input, { target: { value: text } })
  expect(app.state().草稿版本).toBeGreaterThan(revision)
  expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe('原值')
  await act(async () => { expect(await app.state().刷新工作状态备份()).toEqual({ 成功: true }) })
  expect(app.backup().表格文档模型[id][0].单元格.A1.原始值).toBe(text)
  expect(blurred).not.toHaveBeenCalled(); expect(input).toHaveValue(text)
  fireEvent.change(input, { target: { value: text + ' 再编辑' } })
  let prepared!: ReturnType<AppState['准备编辑草稿']>
  act(() => { prepared = app.state().准备编辑草稿(id) })
  expect(prepared.成功).toBe(true)
  if (!prepared.成功) throw new Error(prepared.错误)
  expect(prepared.已提交).toEqual([id])
  const result = await 保存全部文档([{ 标识: id, 名称: '未失焦.slxls', 类型: 'table', 路径: 'E:/draft/未失焦.slxls', 表格模型: prepared.表格文档模型[id] }])
  expect(result.失败).toEqual([])
  expect((await codec.readSeal('slxls', Buffer.from(app.files.get('E:/draft/未失焦.slxls')!, 'base64'))).工作表列表[0].单元格.A1.原始值).toBe(text + ' 再编辑')
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: true, 已提交: [] }) })
  // Ribbon undo must discard its retained draft itself. A later background
  // prepare must not replay the text that was just undone.
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe(text)
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: true, 已提交: [] }) })
  expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe(text)
  expect(screen.getByLabelText('公式栏')).toHaveValue(text)
})

it('表格未完成IME及验证非法草稿阻止备份，Esc取消不复活草稿，候选字完成后可正常写入', async () => {
  const app = setup()
  await waitFor(() => expect(app.state().启动恢复结束).toBe(true))
  const source = 设置数据验证(写入单元格(创建工作表('验证'), 'A1', '原值'), 'A1', { 类型: '列表', 选项: ['原值', '中文𠀀'], 允许空白: false })
  act(() => app.state().createDoc('table', [source], { 路径: 'E:/draft/验证.slxls' }))
  const id = app.state().activeDocumentId!, input = screen.getByLabelText('公式栏')
  fireEvent.change(input, { target: { value: '不合法' } })
  const before = app.backupSave.mock.calls.length
  await act(async () => { expect(await app.state().刷新工作状态备份()).toMatchObject({ 成功: false, 错误: expect.stringContaining('数据验证') }) })
  expect(app.backupSave).toHaveBeenCalledTimes(before)
  expect(app.state().表格文档模型[id][0].单元格.A1.原始值).toBe('原值')
  fireEvent.keyDown(input, { key: 'Escape' }); expect(input).toHaveValue('原值')
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: true, 已提交: [] }) })
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: '中' } })
  await act(async () => { expect(await app.state().刷新工作状态备份()).toMatchObject({ 成功: false, 错误: expect.stringContaining('候选字') }) })
  expect(app.backupSave).toHaveBeenCalledTimes(before)
  fireEvent.change(input, { target: { value: '中文𠀀' } })
  fireEvent.compositionEnd(input, { data: '中文𠀀' })
  await act(async () => { expect(await app.state().刷新工作状态备份()).toEqual({ 成功: true }) })
  expect(app.backup().表格文档模型[id][0].单元格.A1.原始值).toBe('中文𠀀')
})

it('演示未失焦文本在备份与saveAll的真实slppt中保留完整片段，输入法/撤销/Esc/只读均不重放旧草稿', async () => {
  const app = setup(), deck = 创建演示文稿(), box = 创建文本框(10, 20, 500, 200, '原文字')
  box.片段列表 = [{ 文本: '原文字', 加粗: true, 颜色: '#112233' }]
  deck.幻灯片列表[0].文本框列表 = [box]
  await waitFor(() => expect(app.state().启动恢复结束).toBe(true))
  act(() => app.state().createDoc('ppt', deck, { 路径: 'E:/draft/未失焦.slppt' }))
  const id = app.state().activeDocumentId!
  const edit = () => { fireEvent.doubleClick(app.container.querySelector('.wps-ppt-box')!); return app.container.querySelector('.wps-ppt-box__editor') as HTMLTextAreaElement }
  let input = edit(), text = '原文字 中文𠀀🦭é\n第二行'
  const blurred = vi.fn(); input.addEventListener('blur', blurred)
  fireEvent.change(input, { target: { value: text } })
  expect(app.state().演示文档模型[id].幻灯片列表[0].文本框列表[0].text).toBe('原文字')
  await act(async () => { expect(await app.state().刷新工作状态备份()).toEqual({ 成功: true }) })
  expect(app.backup().演示文档模型[id].幻灯片列表[0].文本框列表[0].text).toBe(text)
  expect(blurred).not.toHaveBeenCalled(); expect(document.activeElement).toBe(input)
  fireEvent.compositionStart(input); fireEvent.change(input, { target: { value: text + ' 候选' } })
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: false, 错误: expect.stringContaining('候选字') }) })
  fireEvent.compositionEnd(input, { data: '候选' })
  let prepared!: ReturnType<AppState['准备编辑草稿']>
  act(() => { prepared = app.state().准备编辑草稿(id) })
  if (!prepared.成功) throw new Error(prepared.错误)
  const result = await 保存全部文档([{ 标识: id, 名称: '未失焦.slppt', 类型: 'ppt', 路径: 'E:/draft/未失焦.slppt', 演示模型: prepared.演示文档模型[id] }])
  expect(result.失败).toEqual([])
  const reopened = await codec.readSeal('slppt', Buffer.from(app.files.get('E:/draft/未失焦.slppt')!, 'base64'))
  const reopenedBox = reopened.演示文稿.幻灯片列表[0].文本框列表[0]
  expect(reopenedBox.text).toBe(text + ' 候选'); expect(reopenedBox.片段列表.map((part: { 文本: string }) => part.文本).join('')).toBe(text + ' 候选')
  expect(reopenedBox.片段列表[0].加粗).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(app.state().演示文档模型[id].幻灯片列表[0].文本框列表[0].text).toBe(text)
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: true, 已提交: [] }) })
  fireEvent.change(input, { target: { value: '取消此草稿' } }); fireEvent.keyDown(input, { key: 'Escape' })
  expect(app.container.querySelector('.wps-ppt-box__editor')).toBeNull()
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: true, 已提交: [] }) })
  input = edit(); fireEvent.change(input, { target: { value: '只读不应保存此草稿' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '只读查看' }))
  act(() => { expect(app.state().准备编辑草稿(id)).toMatchObject({ 成功: true, 已提交: [] }) })
  expect(app.state().演示文档模型[id].幻灯片列表[0].文本框列表[0].text).toBe(text)
})
