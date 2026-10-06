import { expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider, useAppStore, type AppState } from '../store'
import { 创建演示文稿 } from './deck'

const 设置后端 = () => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      presentationResources: { sync: vi.fn(async () => ({ 成功: true })), release: vi.fn(async () => ({ 成功: true })) },
      presentationGeneration: {
        outline: vi.fn().mockResolvedValue({ 成功: true, 数据: { 提纲: [{ 页标识: 'p1', 标题: '季度目标', 版式: '标题幻灯片', 要点: [] }] } }),
        pages: vi.fn().mockResolvedValue({ 成功: true, 数据: { 页面: [{ 页标识: 'p1', 标题: '季度目标', 正文: '开场', 版式: '标题幻灯片', 要点: [] }] } }),
        singlePage: vi.fn(),
        beautify: vi.fn(),
        diagram: vi.fn(),
        validateCandidates: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
        readOutline: vi.fn(),
        assets: {
          list: vi.fn().mockResolvedValue({ 成功: true, 数据: [{ 标识: 'a1', 名称: '商务底图', 分类: '背景', 类型: 'image/png', 字节数: 1024, 授权: '自制', 导入时间: '2026-10-06T10:00:00.000Z' }] }),
          read: vi.fn(), import: vi.fn(), updateMeta: vi.fn(), remove: vi.fn(), semanticSearch: vi.fn(), search: vi.fn(),
        },
      },
    },
  })
}

const 准备编辑器 = async () => {
  设置后端()
  let 状态: AppState | null = null
  const 入口 = () => { 状态 = useAppStore(); return 状态.documents.length ? <PptEditor /> : null }
  render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
  await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
  act(() => 状态!.createDoc('ppt', 创建演示文稿()))
  return { 状态: () => 状态!, 标识: () => 状态!.activeDocumentId! }
}

const 功能区按钮 = (名称: string): HTMLElement => {
  const 面板 = document.querySelector('.wps-ribbon-panel')
  if (!面板) throw new Error('未找到功能区面板')
  return within(面板 as HTMLElement).getByRole('button', { name: 名称 })
}

it('插入标签的智能生成入口打开生成面板并完成提纲到插入的链路', async () => {
  const { 状态, 标识 } = await 准备编辑器()
  await userEvent.click(await screen.findByRole('tab', { name: '插入' }))
  await userEvent.click(功能区按钮('智能生成'))
  expect(await screen.findByRole('complementary', { name: '智能生成' })).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('演示主题'), '季度汇报')
  await userEvent.click(screen.getByRole('button', { name: '生成提纲' }))
  expect(await screen.findByText('季度目标')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '生成正文' }))
  await userEvent.click(await screen.findByRole('button', { name: '插入到文稿' }))
  await waitFor(() => expect(状态().演示文档模型[标识()].幻灯片列表).toHaveLength(2))
})

it('素材库入口打开素材面板并列出图库条目', async () => {
  await 准备编辑器()
  await userEvent.click(await screen.findByRole('tab', { name: '插入' }))
  await userEvent.click(功能区按钮('素材库'))
  expect(await screen.findByRole('complementary', { name: '素材库' })).toBeInTheDocument()
  expect(await screen.findByText('商务底图')).toBeInTheDocument()
})

it('只读状态下智能面板仍可查看但不可插入', async () => {
  await 准备编辑器()
  await userEvent.click(screen.getByLabelText('只读查看'))
  await userEvent.click(await screen.findByRole('tab', { name: '插入' }))
  await userEvent.click(功能区按钮('智能生成'))
  expect(await screen.findByRole('complementary', { name: '智能生成' })).toBeInTheDocument()
  expect(screen.getByLabelText('演示主题')).toBeDisabled()
  expect(screen.getByRole('button', { name: '生成提纲' })).toBeDisabled()
})
