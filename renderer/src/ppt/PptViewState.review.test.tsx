import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider, useAppStore, type AppState } from '../store'
import { 创建演示文稿 } from './deck'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 准备已保存文稿 = async () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      presentationResources: { sync: vi.fn(async () => ({ 成功: true })), release: vi.fn(async () => ({ 成功: true })) },
    },
  })
  let 状态: AppState | null = null
  const 入口 = () => { 状态 = useAppStore(); return 状态.documents.length ? <PptEditor /> : null }
  render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
  await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
  act(() => 状态!.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\查看状态.pptx' }))
  return { 状态: () => 状态! }
}
const 功能区按钮 = (名称: string) => screen.getAllByRole('button', { name: 名称 })[0]

it('查看类操作不产生未保存标记', async () => {
  const { 状态 } = await 准备已保存文稿()
  expect(状态().workspaceTabs[0].dirty).toBe(false)

  fireEvent.click(screen.getByRole('tab', { name: '审阅' }))
  expect(状态().workspaceTabs[0].dirty).toBe(false)

  fireEvent.click(功能区按钮('文档定稿'))
  await screen.findByRole('button', { name: '标记为定稿' })
  expect(状态().workspaceTabs[0].dirty).toBe(false)

  fireEvent.click(功能区按钮('文档比对'))
  await screen.findByRole('button', { name: '选择左侧文件' })
  expect(状态().workspaceTabs[0].dirty).toBe(false)

  fireEvent.click(功能区按钮('排版检查'))
  expect(状态().workspaceTabs[0].dirty).toBe(false)

  fireEvent.click(功能区按钮('新建批注'))
  await screen.findByRole('complementary', { name: '批注' })
  fireEvent.click(screen.getByLabelText('显示批注标记'))
  expect(状态().workspaceTabs[0].dirty).toBe(false)

  const 快照 = JSON.stringify(状态().演示文档模型[状态().activeDocumentId!])
  expect(快照).toContain('未命名演示')
})

it('查看类操作不改变正文内容快照', async () => {
  const { 状态 } = await 准备已保存文稿()
  const 标识 = 状态().activeDocumentId!
  const 正文 = JSON.stringify(状态().演示文档模型[标识].幻灯片列表)
  fireEvent.click(screen.getByRole('tab', { name: '审阅' }))
  fireEvent.click(功能区按钮('文档定稿'))
  await screen.findByRole('button', { name: '标记为定稿' })
  fireEvent.click(功能区按钮('新建批注'))
  await screen.findByRole('complementary', { name: '批注' })
  fireEvent.click(screen.getByLabelText('显示批注标记'))
  expect(JSON.stringify(状态().演示文档模型[标识].幻灯片列表)).toBe(正文)
  expect(状态().演示文档模型[标识].批注列表 ?? []).toEqual([])
})
