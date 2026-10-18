import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider } from '../store'
import DiagramPage from './DiagramPage'
import { 解析图数据 } from './diagramData'
import { DiagramProjectStore } from './diagramProjects'
import { 下载本地内容 } from './download'
vi.mock('./download', () => ({ 下载本地内容: vi.fn() }))
const read = (type: '脑图' | '流程图' = '脑图') => new DiagramProjectStore(type).load().items.find(state => state.project.id === document.querySelector<HTMLElement>('[data-diagram-editor]')?.dataset.diagramEditor)!.project.graph
const show = async () => { const result = render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><DiagramPage 类型="脑图" /></AppProvider></AntdApp></ConfigProvider>); await userEvent.click(await screen.findByRole('button', { name: '新建脑图项目' })); await userEvent.click(screen.getByRole('button', { name: '创建项目' })); await screen.findByRole('button', { name: '中心主题' }); return result }
beforeEach(() => { localStorage.clear(); sessionStorage.clear() }); afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })
function pointer(node: Element, type: string, x: number, y: number, id = 1) { const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }); Object.defineProperty(event, 'pointerId', { value: id }); fireEvent(node, event) }
it('节点属性、备注和标签可编辑，撤销重做与JSON/SVG实际内容一致', async () => {
  await show(); await userEvent.click(await screen.findByRole('button', { name: '添加节点' })); await userEvent.clear(screen.getByLabelText('文字')); await userEvent.type(screen.getByLabelText('文字'), '判断甲'); await userEvent.type(screen.getByLabelText('节点备注'), '需要核查的备注'); await userEvent.click(screen.getByRole('button', { name: '保存文字' })); await userEvent.selectOptions(screen.getByLabelText('节点形状'), '菱形'); await userEvent.click(screen.getByRole('button', { name: '暖橙配色' }))
  expect(read().节点[1]).toMatchObject({ 文本: '判断甲', 形状: '菱形', 备注: '需要核查的备注', 填充: '#FFF1DF' }); await userEvent.click(screen.getByRole('button', { name: '撤销' })); expect(read().节点[1].填充).toBeUndefined(); await userEvent.click(screen.getByRole('button', { name: '重做' })); expect(read().节点[1].填充).toBe('#FFF1DF')
  const edge = read().连线[0]; await userEvent.type(screen.getByLabelText('连线标签' + edge.id), '通过'); await userEvent.click(screen.getByRole('button', { name: '导出数据' })); const json = vi.mocked(下载本地内容).mock.calls.slice(-1)[0]![1]; expect(解析图数据(json)).toEqual(read()); await userEvent.click(screen.getByRole('button', { name: '导出图片' })); const svg = vi.mocked(下载本地内容).mock.calls.slice(-1)[0]![1], doc = new DOMParser().parseFromString(svg, 'image/svg+xml'); expect(doc.querySelector('polygon')).toBeTruthy(); expect(JSON.parse(doc.querySelector('metadata')!.textContent!).图).toEqual(read()); expect(doc.documentElement.textContent).toContain('通过')
})
it('Tab/Enter创建正确分支，Delete后撤销恢复节点与连线', async () => {
  const { container } = await show(); const root = await screen.findByRole('button', { name: '中心主题' }); await userEvent.click(root); fireEvent.keyDown(root, { key: 'Tab' }); await waitFor(() => expect(read().节点).toHaveLength(2)); const childId = read().节点[1].id, child = container.querySelector(`[data-node-id="${childId}"]`)!
  fireEvent.keyDown(child, { key: 'Enter' }); await waitFor(() => expect(read().节点).toHaveLength(3)); expect(read().连线[1].起点).toBe(read().节点[0].id)
  const last = container.querySelector(`[data-node-id="${read().节点[2].id}"]`)!; fireEvent.keyDown(last, { key: 'Delete' }); await userEvent.click(within(await screen.findByRole('dialog', { name: '删除节点' })).getByRole('button', { name: '删除' })); expect(read().节点).toHaveLength(2); await userEvent.click(screen.getByRole('button', { name: '撤销' })); expect(read().节点).toHaveLength(3); expect(read().连线).toHaveLength(2)
})
it('缩放后触控拖动按模型坐标计算，取消不落盘，一次拖动可一次撤销', async () => {
  const { container } = await show(); await userEvent.click(await screen.findByRole('button', { name: '添加节点' })); await userEvent.click(screen.getByRole('button', { name: '缩小画布' })); const zoom = Number(screen.getByLabelText('画布缩放').textContent!.replace('%','')) / 100, original = read(), id = original.节点[1].id, node = container.querySelector(`[data-node-id="${id}"]`)!
  act(() => { pointer(node, 'pointerdown', 100, 100); pointer(node, 'pointermove', 100 + zoom * 100, 100 + zoom * 50); pointer(node, 'pointerup', 100 + zoom * 100, 100 + zoom * 50) }); expect(read().节点[1].x).toBeCloseTo(original.节点[1].x + 100, 0); expect(read().节点[1].y).toBeCloseTo(original.节点[1].y + 50, 0)
  await userEvent.click(screen.getByRole('button', { name: '撤销' })); expect(read()).toEqual(original)
  act(() => { pointer(node, 'pointerdown', 100, 100); pointer(node, 'pointermove', 200, 200); pointer(node, 'pointercancel', 200, 200) }); expect(read()).toEqual(original)
})
it('持久化失败保留新增节点和可撤销草稿，明确未保存且重试后才恢复已保存状态', async () => {
  await show(); const nativeSet = Storage.prototype.setItem, spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (this === localStorage) throw Error('空间不足'); nativeSet.call(this, key, value) }); await userEvent.click(screen.getByRole('button', { name: '添加节点' })); expect(screen.getByRole('alert')).toHaveTextContent('空间不足'); expect(screen.getByRole('button', { name: '新分支' })).toBeInTheDocument(); expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled(); expect(screen.getByText('有未保存草稿')).toBeInTheDocument(); expect(read().节点).toHaveLength(2)
  spy.mockRestore(); await userEvent.click(screen.getByRole('button', { name: '重试保存' })); expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText('已保存到本机')).toBeInTheDocument()
})
it('流程图自动布局和常见形状保留有向连线，根节点也可删除并撤销', async () => {
  localStorage.setItem('seal-local-flow-v1', JSON.stringify({节点:[{id:'a',文本:'开始',x:80,y:80,形状:'椭圆'},{id:'b',文本:'条件',x:80,y:80,形状:'菱形'}],连线:[{id:'e',起点:'a',终点:'b',标签:'是'}]}))
  const {container}=render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><DiagramPage 类型="流程图"/></AppProvider></AntdApp></ConfigProvider>); await userEvent.click(await screen.findByRole('button',{name:'打开项目：我的流程图'})); await userEvent.click(await screen.findByRole('button',{name:'自动布局'})); expect(container.querySelector('.diagram-lines line')).toHaveAttribute('marker-end','url(#local-flow-arrow)'); const before=read('流程图'); expect(before.节点[1].x).toBeGreaterThan(before.节点[0].x)
  await userEvent.click(screen.getByRole('button',{name:'删除节点'})); await userEvent.click(within(await screen.findByRole('dialog',{name:'删除节点'})).getByRole('button',{name:'删除'})); expect(read('流程图').节点).toHaveLength(1); await userEvent.click(screen.getByRole('button',{name:'撤销'})); expect(read('流程图')).toEqual(before)
})
