import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import HomeRail from '../components/HomeRail'
import HomePage from '../pages/HomePage'
import LocalFilesPage from './LocalFilesPage'
import CalendarPage from './CalendarPage'
import DiagramPage from './DiagramPage'
import AppsPage from './AppsPage'
import { 桥接 } from '../ipc/bridge'

const StateProbe = () => {
  const { module, navKey, documents } = useAppStore()
  return <output data-testid="当前状态">{`${module}|${navKey}|${documents[0]?.name ?? ''}`}</output>
}

const 渲染 = (页面: React.ReactNode) => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider>{页面}<StateProbe /></AppProvider></AntdApp></ConfigProvider>)
const HomeShell = () => {
  const { navKey, handleNav } = useAppStore()
  return <><HomeRail activeKey={navKey} onNavigate={(键) => handleNav(键, () => undefined)} onNotify={() => undefined} /><HomePage /></>
}

describe('本地工作台', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

  it('桌面列表打开文字文件后建立已命名标签', async () => {
    vi.spyOn(桥接, 'listKnownFolder').mockResolvedValue({ 成功: true, 路径: 'C:\\Users\\A\\Desktop', 文件: [{ 名称: '记录.txt', 路径: 'C:\\Users\\A\\Desktop\\记录.txt', 扩展名: '.txt', 大小: 6, 修改时间: Date.now() }] })
    vi.spyOn(桥接, 'readFile').mockResolvedValue({ 成功: true, 内容: '正文', 二进制: false, 扩展名: '.txt' })
    vi.spyOn(桥接, 'recentAdd').mockResolvedValue({ 成功: true, 数据: [] })
    const 用户 = userEvent.setup()
    渲染(<LocalFilesPage 位置="desktop" />)
    expect(await screen.findByText('记录.txt')).toBeInTheDocument()
    await 用户.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(screen.getByTestId('当前状态')).toHaveTextContent('word|home|记录.txt'))
    expect(桥接.readFile).toHaveBeenCalledWith('C:\\Users\\A\\Desktop\\记录.txt')
  })

  it('本机文件已打开但最近记录失败时仅提示记录未更新', async () => {
    vi.spyOn(桥接, 'listKnownFolder').mockResolvedValue({ 成功: true, 路径: 'C:\\Users\\A\\Desktop', 文件: [{ 名称: '记录.txt', 路径: 'C:\\Users\\A\\Desktop\\记录.txt', 扩展名: '.txt', 大小: 6, 修改时间: Date.now() }] })
    vi.spyOn(桥接, 'readFile').mockResolvedValue({ 成功: true, 内容: '正文', 二进制: false, 扩展名: '.txt' })
    vi.spyOn(桥接, 'recentAdd').mockResolvedValue({ 成功: false, 错误: '记录文件损坏' })
    渲染(<LocalFilesPage 位置="desktop" />)
    await userEvent.click(await screen.findByRole('button', { name: '打开' }))
    await waitFor(() => expect(screen.getByTestId('当前状态')).toHaveTextContent('word|home|记录.txt'))
    expect((await screen.findAllByText('最近文档记录未更新')).length).toBeGreaterThan(0)
    expect(screen.queryByText('打开文件失败')).not.toBeInTheDocument()
    expect(screen.queryByText('已打开「记录.txt」')).not.toBeInTheDocument()
  })

  it('日历新增日程写入本机存储', async () => {
    const 用户 = userEvent.setup()
    渲染(<CalendarPage />)
    await 用户.click(screen.getByRole('button', { name: '新增日程' }))
    await 用户.type(screen.getByLabelText('标题'), '项目会议')
    await 用户.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('seal-local-calendar-v1') || '[]')).toMatchObject([{ 标题: '项目会议' }]))
  })

  it('脑图新增节点后保存可编辑图形数据', async () => {
    const 用户 = userEvent.setup()
    渲染(<DiagramPage 类型="脑图" />)
    await 用户.click(await screen.findByRole('button', { name: '添加节点' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('seal-local-mindmap-v1') || '{}').节点).toHaveLength(2))
    expect(JSON.parse(localStorage.getItem('seal-local-mindmap-v1') || '{}').连线).toHaveLength(1)
  })

  it('本机数据损坏时保留原文并提供备份入口', async () => {
    localStorage.setItem('seal-local-calendar-v1', '{损坏')
    渲染(<CalendarPage />)
    expect(await screen.findByText('本机日程暂不可编辑')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出原始数据' })).toBeInTheDocument()
    expect(localStorage.getItem('seal-local-calendar-v1')).toBe('{损坏')
  })

  it('应用入口可以进入日历和脑图', async () => {
    const 用户 = userEvent.setup()
    渲染(<AppsPage />)
    await 用户.click(screen.getByRole('button', { name: /本机日历/ }))
    expect(screen.getByTestId('当前状态')).toHaveTextContent('home|calendar|')
    await 用户.click(screen.getByRole('button', { name: /脑图/ }))
    expect(screen.getByTestId('当前状态')).toHaveTextContent('home|mindmap|')
  })

  it('首页栏目进入日历后展示可操作页面', async () => {
    const 用户 = userEvent.setup()
    渲染(<HomeShell />)
    await 用户.click(screen.getByRole('button', { name: '日历' }))
    expect(await screen.findByRole('heading', { name: '本机日历' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增日程' })).toBeInTheDocument()
  })
})
