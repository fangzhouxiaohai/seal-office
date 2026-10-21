import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../App'
import { useAppStore, type AppState } from '../store'
import { 创建工作表, 写入单元格 } from '../sheet/model'
import { 创建演示文稿, 创建文本框 } from '../ppt/deck'

const codec = createRequire(import.meta.url)('../../../main/office/sealFormat.js')
const original = window.electronAPI
afterEach(() => { window.electronAPI = original })

it.each(['table', 'ppt'] as const)('App 真正主进程saveAll请求保存%s未失焦草稿，写盘期间继续输入时阻止退出', async type => {
  let state!: AppState, requestSave: ((id: string) => void) | undefined, requestClose: ((id: string) => void) | undefined
  const respond = vi.fn(async (_id: string, _result: unknown) => ({ 成功: true })), closeReply = vi.fn(async (_id: string, _result: unknown) => ({ 成功: true }))
  let complete: (() => void) | undefined, defer = false, encoded = ''
  const write = vi.fn(async (_path: string, bytes: string) => {
    encoded = bytes
    if (defer) await new Promise<void>(resolve => { complete = resolve })
    return { 成功: true, 文件指纹: 'written' }
  })
  window.electronAPI = {
    backupLoad: async () => ({ 成功: true, 内容: null }), backupSave: async () => ({ 成功: true }), backupClear: async () => ({ 成功: true }),
    recentList: async () => ({ 成功: true, 数据: [] }), recentAdd: async () => ({ 成功: true, 数据: [] }),
    saveToFile: write, reportUnsavedCount: () => new Promise(() => {}),
    onSaveAllRequested: (callback: (id: string) => void) => { requestSave = callback; return () => { requestSave = undefined } }, respondSaveAll: respond,
    onCloseStateRequested: (callback: (id: string) => void) => { requestClose = callback; return () => { requestClose = undefined } }, respondCloseState: closeReply,
    office: { writeSeal: async (kind: string, payload: unknown) => ({ 成功: true, 数据: (await codec.writeSeal(kind, payload)).toString('base64') }) },
  } as any
  const Probe = () => { state = useAppStore(); return null }
  const { container } = render(<App 初始最近文档={[]} 跨端导航={Probe} />)
  await waitFor(() => expect(state.启动恢复结束).toBe(true))
  const path = `E:/draft/app.${type === 'table' ? 'slxls' : 'slppt'}`
  const deck = 创建演示文稿(); deck.幻灯片列表[0].文本框列表 = [创建文本框(10, 20, 500, 200, '原文')]
  act(() => state.createDoc(type, type === 'table' ? [写入单元格(创建工作表('未失焦'), 'A1', '原文')] : deck, { 路径: path }))
  let input: HTMLInputElement | HTMLTextAreaElement
  if (type === 'table') input = screen.getByLabelText('公式栏')
  else { fireEvent.doubleClick(container.querySelector('.wps-ppt-box')!); input = container.querySelector('.wps-ppt-box__editor') as HTMLTextAreaElement }
  input.focus()
  fireEvent.change(input, { target: { value: '后台保存未失焦𠀀🦭' } })
  await act(async () => { requestClose?.('先刷新备份') })
  await waitFor(() => expect(closeReply).toHaveBeenCalledWith('先刷新备份', { 未保存数量: 1, 备份成功: true }))
  await act(async () => { requestSave?.('保存草稿') })
  await waitFor(() => expect(respond).toHaveBeenCalledOnce())
  expect(respond.mock.calls[0]).toEqual(['保存草稿', { 成功: true, 已取消: false, 已保存: [path.split('/').pop()], 失败: [] }])
  expect(state.workspaceTabs.find(tab => tab.path === path)?.dirty).toBe(false)
  const reopened = await codec.readSeal(type === 'table' ? 'slxls' : 'slppt', Buffer.from(encoded, 'base64'))
  expect(type === 'table' ? reopened.工作表列表[0].单元格.A1.原始值 : reopened.演示文稿.幻灯片列表[0].文本框列表[0].text).toBe('后台保存未失焦𠀀🦭')
  expect(document.activeElement).toBe(input)
  defer = true; fireEvent.change(input, { target: { value: '本轮待写盘' } })
  await act(async () => { requestSave?.('并发输入') })
  await waitFor(() => expect(write).toHaveBeenCalledTimes(2))
  fireEvent.change(input, { target: { value: '写盘期间继续输入，不能退出' } })
  await act(async () => { complete?.() })
  await waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
  expect(respond.mock.calls[1][1]).toMatchObject({ 成功: false, 失败: [{ 原因: '保存期间文档有新的修改，请再次保存后退出' }] })
  expect(state.workspaceTabs.find(tab => tab.path === path)?.dirty).toBe(true)
  expect(input).toHaveValue('写盘期间继续输入，不能退出')
})
