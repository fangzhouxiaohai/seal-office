// 2.8.1 第七节：截图中“新建流程图项目”“回收站 (0)”两个组合按钮的双入口回归，
// 以及切换语言后用户命名保持原文、命令按当前语言显示。
import { afterEach, beforeEach, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider } from '../store'
import { SettingsProvider } from '../store/settingsStore'
import DiagramPage from './DiagramPage'
import { DiagramProjectStore, createDiagramProject } from './diagramProjects'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() }); afterEach(() => { localStorage.clear(); sessionStorage.clear() })
const show = (type: '脑图' | '流程图') => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><SettingsProvider><AppProvider><DiagramPage 类型={type} /></AppProvider></SettingsProvider></AntdApp></ConfigProvider>)

it.each([['流程图', 'New flowchart project', 'Flowchart'], ['脑图', 'New mind map project', 'Mind map']] as const)('英文界面下%s页的组合按钮按完整消息显示，可见文字与读屏名称一致', async (type, create, heading) => {
  localStorage.setItem('seal-language', 'en-US')
  const store = new DiagramProjectStore(type)
  store.write(createDiagramProject(type, '导出'), null)
  const view = show(type)
  expect(await screen.findByRole('button', { name: create })).toHaveTextContent(create)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(heading)
  const trash = screen.getByRole('button', { name: 'Recycle bin (0)' })
  expect(trash).toHaveTextContent('Recycle bin (0)')
  expect(screen.getByRole('button', { name: 'Projects (1)' })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Projects · 1 project')
  // 用户项目叫“导出”：名称原样保留，旁边的命令按英文显示
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('导出')
  expect(screen.getByRole('button', { name: 'Rename project: 导出' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Open project: 导出' })).toBeInTheDocument()
  expect(view.container.querySelector('.diagram-project-card p')?.textContent).toMatch(/^1 node · /)
  const visible = [...view.container.querySelectorAll('.diagram-projects :is(button, h1, label, p, option)')].map(n => n.textContent ?? '').join(' ').replace(/导出/g, '')
  expect(visible).not.toMatch(/[㐀-鿿]/u)
  await userEvent.click(trash)
  expect(screen.getByRole('status')).toHaveTextContent('Recycle bin · 0 projects')
})

it('中文界面下两个组合按钮保持中文，计数随回收站变化', async () => {
  localStorage.setItem('seal-language', 'zh-CN')
  new DiagramProjectStore('流程图').write({ ...createDiagramProject('流程图', '甲'), trashedAt: Date.now() }, null)
  show('流程图')
  expect(await screen.findByRole('button', { name: '新建流程图项目' })).toHaveTextContent('新建流程图项目')
  expect(screen.getByRole('button', { name: '回收站 (1)' })).toBeInTheDocument()
  await act(async () => { await userEvent.click(screen.getByRole('button', { name: '回收站 (1)' })) })
  expect(screen.getByRole('status')).toHaveTextContent('回收站 · 1 个项目')
})
