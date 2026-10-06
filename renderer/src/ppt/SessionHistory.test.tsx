import { afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider, useAppStore, type AppState } from '../store'
import { 创建演示文稿 } from './deck'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 准备编辑器 = async () => {
  let 监听: ((消息: unknown) => void) | null = null
  const 注册 = vi.fn(async () => ({ 成功: true, 版本: 1, 内容: null, 路径: null, 已保存: true }))
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      presentationResources: { sync: vi.fn(async () => ({ 成功: true })), release: vi.fn(async () => ({ 成功: true })) },
      presentationSession: {
        identity: vi.fn(async () => ({ 成功: false })),
        register: 注册,
        read: vi.fn(async () => ({ 成功: true, 版本: 2, 内容: null })),
        commit: vi.fn(async () => ({ 成功: true, 版本: 2 })),
        saved: vi.fn(async () => ({ 成功: true })),
        claimPath: vi.fn(async () => ({ 成功: true })),
        releasePath: vi.fn(async () => ({ 成功: true })),
        unregister: vi.fn(async () => ({ 成功: true, 是否最后视图: true })),
        onChanged: (回调: (消息: unknown) => void) => { 监听 = 回调; return () => { 监听 = null } },
      },
    },
  })
  let 状态: AppState | null = null
  const 入口 = () => { 状态 = useAppStore(); return 状态.documents.length ? <PptEditor /> : null }
  const 视图 = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
  await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
  act(() => 状态!.createDoc('ppt', 创建演示文稿()))
  await waitFor(() => expect(注册).toHaveBeenCalled())
  return { 状态: () => 状态!, 标识: () => 状态!.activeDocumentId!, 推送远端: (消息: unknown) => act(() => 监听?.(消息)), 视图 }
}

it('远端窗口的修改进入本地撤销栈，撤销回到本地内容', async () => {
  const { 状态, 标识, 推送远端, 视图 } = await 准备编辑器()
  const 画布文本 = () => 视图.container.querySelector('.wps-ppt-canvas')?.textContent ?? ''
  const 本地文本 = 状态().演示文档模型[标识()].幻灯片列表[0].文本框列表[0].text
  expect(画布文本()).toContain(本地文本)

  const 当前 = 状态().演示文档模型[标识()]
  const 远端文稿 = { ...当前, 幻灯片列表: 当前.幻灯片列表.map((页, i) => i === 0 ? { ...页, 文本框列表: 页.文本框列表.map(框 => ({ ...框, text: '远端修改后的文字' })) } : 页) }
  推送远端({ 类型: '会话变更', 版本: 2, 内容: 远端文稿 })

  await waitFor(() => expect(画布文本()).toContain('远端修改后的文字'))
  const 撤销 = screen.getByRole('button', { name: '撤销' })
  expect(撤销).toBeEnabled()
  await userEvent.click(撤销)
  await waitFor(() => expect(画布文本()).toContain(本地文本))
  expect(画布文本()).not.toContain('远端修改后的文字')

  // 撤销远端修改后可重做，且不会把远端内容再提交回去形成回环
  const 提交 = (window as unknown as { electronAPI: { presentationSession: { commit: { mock: { calls: unknown[][] } } } } }).electronAPI.presentationSession.commit
  const 提交次数 = 提交.mock.calls.length
  await userEvent.click(screen.getByRole('button', { name: '重做' }))
  await waitFor(() => expect(画布文本()).toContain('远端修改后的文字'))
  expect(提交.mock.calls.length).toBe(提交次数)
})

it('重复或过期的远端广播不会回退本地内容', async () => {
  const { 状态, 标识, 推送远端, 视图 } = await 准备编辑器()
  const 画布文本 = () => 视图.container.querySelector('.wps-ppt-canvas')?.textContent ?? ''
  const 当前 = 状态().演示文档模型[标识()]
  const 远端文稿 = { ...当前, 幻灯片列表: 当前.幻灯片列表.map((页, i) => i === 0 ? { ...页, 文本框列表: 页.文本框列表.map(框 => ({ ...框, text: '远端二版' })) } : 页) }
  推送远端({ 类型: '会话变更', 版本: 5, 内容: 远端文稿 })
  await waitFor(() => expect(画布文本()).toContain('远端二版'))

  const 旧稿 = { ...当前, 幻灯片列表: 当前.幻灯片列表.map(页 => ({ ...页, 文本框列表: 页.文本框列表.map(框 => ({ ...框, text: '过期的远端内容' })) })) }
  推送远端({ 类型: '会话变更', 版本: 4, 内容: 旧稿 })
  await new Promise(完成 => setTimeout(完成, 30))
  expect(画布文本()).toContain('远端二版')
  expect(画布文本()).not.toContain('过期的远端内容')
})
