import { afterEach, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider, useAppStore, type AppState } from '../store'
import { 创建演示文稿 } from './deck'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 准备编辑器 = async () => {
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
  act(() => 状态!.createDoc('ppt', 创建演示文稿()))
  const 标识 = () => 状态!.activeDocumentId!
  return { 状态: () => 状态!, 标识 }
}

it('审阅标签提供文档定稿与文档比对入口，定稿后编辑器进入只读并可继续编辑', async () => {
  const { 状态, 标识 } = await 准备编辑器()
  await userEvent.click(await screen.findByRole('tab', { name: '审阅' }))
  expect(screen.getByRole('button', { name: '文档定稿' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '文档比对' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '文档定稿' }))
  const 标记 = await screen.findByRole('button', { name: '标记为定稿' })
  expect(screen.getByText(/本版本不提供文档密码加密/)).toBeInTheDocument()
  await userEvent.click(标记)

  await waitFor(() => expect(状态().演示文档模型[标识()].定稿).toBeTruthy())
  const 只读框 = screen.getByRole('checkbox', { name: /只读查看/ })
  expect(只读框).toBeChecked()
  expect(只读框).toBeDisabled()
  expect(screen.getByText('本文稿已标记为定稿，处于只读状态。')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '继续编辑' }))
  await waitFor(() => expect(状态().演示文档模型[标识()].定稿).toBeUndefined())
  expect(screen.getByRole('checkbox', { name: /只读查看/ })).not.toBeChecked()
})

it('文档比对入口切换到比对视图并说明只读取文件', async () => {
  const { 状态 } = await 准备编辑器()
  await userEvent.click(await screen.findByRole('tab', { name: '审阅' }))
  await userEvent.click(screen.getByRole('button', { name: '文档比对' }))
  expect(await screen.findByRole('button', { name: '选择左侧文件' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择右侧文件' })).toBeInTheDocument()
  expect(screen.getByText(/比对只读取两份文件，不会修改其中任何一份/)).toBeInTheDocument()
  expect(状态().演示文档模型[状态().activeDocumentId!].定稿).toBeUndefined()
})
