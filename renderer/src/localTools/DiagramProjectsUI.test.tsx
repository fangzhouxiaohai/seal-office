import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider } from '../store'
import DiagramPage from './DiagramPage'
import { DiagramProjectStore, legacyDiagramKey } from './diagramProjects'
import { 新建图 } from './diagramData'

beforeEach(() => { localStorage.clear(); sessionStorage.clear() }); afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })
const show = (type: '脑图' | '流程图' = '脑图') => render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><DiagramPage 类型={type} /></AppProvider></AntdApp></ConfigProvider>)
const create = async (title: string, type: '脑图' | '流程图' = '脑图') => { await userEvent.click(screen.getByRole('button', { name: `新建${type}项目` })); await userEvent.clear(screen.getByLabelText('项目名称')); await userEvent.type(screen.getByLabelText('项目名称'), title); await userEvent.click(screen.getByRole('button', { name: '创建项目' })); await screen.findByRole('button', { name: '添加节点' }) }
const back = () => userEvent.click(screen.getByRole('button', { name: '返回项目列表' }))
const record = (title: string, type: '脑图' | '流程图' = '脑图') => new DiagramProjectStore(type).load().items.find(s => s.project.title === title)!.project

it.each(['脑图', '流程图'] as const)('%s真正多项目：创建A/B、输入自动保存、独立撤销、重命名/复制/搜索排序、回收站恢复和重载', async type => {
  const original = JSON.stringify(新建图(type)); localStorage.setItem(legacyDiagramKey(type), original)
  const view = show(type); await screen.findByRole('button', { name: `打开项目：我的${type}` }); expect(screen.queryByRole('button', { name: '添加节点' })).toBeNull()
  await create('甲项目', type); await userEvent.click(screen.getByRole('button', { name: '添加节点' })); await userEvent.clear(screen.getByLabelText('文字')); await userEvent.type(screen.getByLabelText('文字'), '甲正文'); await userEvent.type(screen.getByLabelText('节点备注'), '甲备注'); const a = record('甲项目', type); expect(a.graph.节点[1]).toMatchObject({ 文本: '甲正文', 备注: '甲备注' }); await back()
  await create('乙项目', type); await userEvent.click(screen.getByRole('button', { name: '添加节点' })); await userEvent.click(screen.getByRole('button', { name: '添加节点' })); const b = record('乙项目', type); expect(b.graph.节点).toHaveLength(3); await back()
  await userEvent.click(screen.getByRole('button', { name: '打开项目：甲项目' })); await userEvent.click(screen.getByRole('button', { name: '撤销' })); expect(record('甲项目', type).graph.节点[1].备注).toBe('甲备'); expect(record('乙项目', type)).toEqual(b); await userEvent.click(screen.getByRole('button', { name: '重做' })); expect(record('甲项目', type).graph).toEqual(a.graph); await back()
  await userEvent.click(screen.getByRole('button', { name: '重命名项目：甲项目' })); await userEvent.clear(screen.getByLabelText('项目名称')); await userEvent.type(screen.getByLabelText('项目名称'), '甲新名'); await userEvent.click(screen.getByRole('button', { name: '保存名称' })); await screen.findByRole('button', { name: '打开项目：甲新名' })
  await userEvent.click(screen.getByRole('button', { name: '复制项目：甲新名' })); const copy = record('甲新名 副本', type); expect(copy.graph).toEqual(a.graph); expect(copy.history.items).toHaveLength(1); expect(copy.id).not.toBe(a.id)
  await userEvent.type(screen.getByLabelText('搜索项目'), '甲新名'); expect(screen.queryByRole('button', { name: '打开项目：乙项目' })).toBeNull(); expect(screen.getAllByRole('button', { name: /打开项目：甲新名/ })).toHaveLength(2)
  await userEvent.clear(screen.getByLabelText('搜索项目')); await userEvent.selectOptions(screen.getByLabelText('项目排序'), 'name'); const titles = [...view.container.querySelectorAll<HTMLElement>('[data-project-title]')].map(n => n.dataset.projectTitle!); expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  await userEvent.click(screen.getByRole('button', { name: '删除项目：甲新名' })); await userEvent.click(within(await screen.findByRole('dialog', { name: '删除项目' })).getByRole('button', { name: '移入回收站' })); expect(screen.queryByRole('button', { name: '打开项目：甲新名' })).toBeNull(); expect(record('甲新名', type).trashedAt).toBeTypeOf('number')
  await userEvent.click(screen.getByRole('button', { name: '回收站' })); await userEvent.click(screen.getByRole('button', { name: '恢复项目：甲新名' })); await userEvent.click(screen.getByRole('button', { name: '项目列表' })); await userEvent.click(screen.getByRole('button', { name: '打开项目：甲新名' })); expect(record('甲新名', type).graph).toEqual(a.graph); expect(record('甲新名', type).history).toEqual(a.history); await back()
  view.unmount(); const again = show(type); await screen.findByRole('button', { name: '打开项目：乙项目' }); expect(again.container.querySelector('[data-diagram-editor]')).toBeNull(); expect(record('乙项目', type)).toEqual(b); expect(record('甲新名 副本', type)).toEqual(copy); expect(localStorage.getItem(legacyDiagramKey(type))).toBe(original); expect(localStorage.getItem(legacyDiagramKey(type) + ':backup-v2')).toBe(original)
})

it('损坏的旧图不被新建覆盖，错误提供原始备份和重试入口', async () => {
  localStorage.setItem(legacyDiagramKey('脑图'), '{损坏'); show(); expect(await screen.findByRole('alert')).toHaveTextContent('旧图迁移未完成'); expect(screen.getByRole('button', { name: '导出原始备份' })).toBeInTheDocument()
  await create('独立新图'); expect(localStorage.getItem(legacyDiagramKey('脑图'))).toBe('{损坏'); expect(record('独立新图').graph.节点).toHaveLength(1)
})

it('失效名称不创建假项目，永久删除必须在回收站确认且不影响别的项目', async () => {
  show(); await screen.findByRole('button', { name: '新建脑图项目' }); await create('甲'); await back(); await create('乙'); const b = record('乙'); await back()
  await userEvent.click(screen.getByRole('button', { name: '新建脑图项目' })); await userEvent.clear(screen.getByLabelText('项目名称')); fireEvent.click(screen.getByRole('button', { name: '创建项目' })); expect(screen.getByRole('alert')).toHaveTextContent('项目名称'); await userEvent.click(screen.getByRole('button', { name: '取消' }))
  await userEvent.click(screen.getByRole('button', { name: '删除项目：甲' })); await userEvent.click(within(await screen.findByRole('dialog', { name: '删除项目' })).getByRole('button', { name: '移入回收站' })); await userEvent.click(screen.getByRole('button', { name: '回收站' })); await userEvent.click(screen.getByRole('button', { name: '永久删除项目：甲' })); await userEvent.click(within(await screen.findByRole('dialog', { name: '永久删除项目' })).getByRole('button', { name: '永久删除' })); await waitFor(() => expect(new DiagramProjectStore('脑图').load().items).toHaveLength(1)); expect(record('乙')).toEqual(b)
})
