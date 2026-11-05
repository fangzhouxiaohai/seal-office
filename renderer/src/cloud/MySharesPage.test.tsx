import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { beforeEach, expect, it, vi } from 'vitest'
import MySharesPage from './MySharesPage'

const fixture = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('./CloudProvider', () => ({ cloudCall: fixture.call }))
vi.mock('../store/settingsStore', () => ({ useSettings: () => ({ 语言: 'zh-CN' }) }))

const entries = [
  { kind: 'link', id: 'l1', nodeId: 'f1', status: 'active', permission: null, downloads: 5, recipientPhone: null, expiresAt: null, created: 1 },
  { kind: 'account', id: 's1', nodeId: 'f2', status: 'expired', permission: 'edit', downloads: null, recipientPhone: '138****9901', expiresAt: 1, created: 2 },
]
const nodes = [
  { id: 'f1', meta: { name: '合同.docx' } },
  { id: 'f2', meta: { name: '报表.xlsx' } },
] as any

beforeEach(() => {
  fixture.call.mockReset()
  fixture.call.mockImplementation(async (action, input) => {
    if (action === 'mySharesList') return { items: entries, page: input.page, limit: 50, total: 2 }
    if (action === 'mySharesCleanupPreview') return { count: 1 }
    if (action === 'mySharesBatch') return { results: input.entries?.map((entry: any) => ({ ...entry, ok: true })) || [{ kind: 'account', id: 's1', ok: true }], hasMore: false }
    return {}
  })
})

it('显示两类本人发起分享并支持当前页全选、批量取消和返回', async () => {
  const back = vi.fn()
  render(<AntdApp><MySharesPage nodes={nodes} onBack={back} /></AntdApp>)
  expect(await screen.findByText('合同.docx')).toBeInTheDocument()
  expect(screen.getByText('报表.xlsx')).toBeInTheDocument()
  expect(screen.getByText(/138\*\*\*\*9901/)).toBeInTheDocument()
  expect(screen.getByText('可编辑')).toBeInTheDocument()
  expect(screen.getByText('下载 5 次')).toBeInTheDocument()
  expect(screen.getByText(/永久有效/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: '全选本页分享' }))
  fireEvent.click(screen.getByRole('button', { name: '批量取消分享' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /确定|OK/ }))
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesBatch', { action: 'revoke', entries: [{ kind: 'link', id: 'l1' }, { kind: 'account', id: 's1' }] }))
  fireEvent.click(screen.getByRole('button', { name: '返回云空间' }))
  expect(back).toHaveBeenCalledOnce()
})

it('清理失效记录与删除选中记录使用不同操作', async () => {
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.click(screen.getByRole('button', { name: '清理已失效记录' }))
  expect(await screen.findByText(/当前可清理 1 条/)).toBeInTheDocument()
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /确定|OK/ }))
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesBatch', { action: 'cleanInvalid', limit: 100 }))
  fireEvent.click(screen.getByRole('checkbox', { name: '选择分享 合同.docx' }))
  fireEvent.click(screen.getByRole('button', { name: '删除所选记录' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /确定|OK/ }))
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesBatch', { action: 'delete', entries: [{ kind: 'link', id: 'l1' }] }))
})

it('按分享类型、状态与文件名组合筛选当前账号记录', async () => {
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '分享类型' }))
  fireEvent.click(await screen.findByTitle('分享链接'))
  fireEvent.change(screen.getByRole('textbox', { name: '按文件名筛选' }), { target: { value: '合同' } })
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesList', { page: 1, limit: 50, status: 'all', kind: 'link', name: '合同' }))
})

it('批量部分失败保留失败记录供重试，并支持下一页', async () => {
  fixture.call.mockImplementation(async (action, input) => {
    if (action === 'mySharesList') return { items: input.page === 1 ? entries : [entries[0]], page: input.page, limit: 50, total: 51 }
    if (action === 'mySharesBatch') return { results: [{ kind: 'link', id: 'l1', ok: false, error: '分享记录不存在或无权操作' }, { kind: 'account', id: 's1', ok: true }], hasMore: false }
    return {}
  })
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.click(screen.getByRole('checkbox', { name: '全选本页分享' }))
  fireEvent.click(screen.getByRole('button', { name: '批量取消分享' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /确定|OK/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('1 条记录处理失败')
  expect(screen.getByRole('checkbox', { name: '选择分享 合同.docx' })).toBeChecked()
  fireEvent.click(screen.getByTitle('2'))
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesList', { page: 2, limit: 50, status: 'all', kind: 'all', name: '' }))
})

it('清理首批全失败时仍用游标处理后续失效记录', async () => {
  let batch = 0
  fixture.call.mockImplementation(async (action, input) => {
    if (action === 'mySharesList') return { items: entries, page: input.page, limit: 50, total: 2 }
    if (action === 'mySharesCleanupPreview') return { count: 101 }
    if (action === 'mySharesBatch') {
      batch++
      return batch === 1
        ? { results: [{ kind: 'link', id: 'l1', ok: false, error: '处理失败' }], hasMore: true, nextCursor: 'cursor-one' }
        : { results: [{ kind: 'account', id: 's1', ok: true }], hasMore: false, nextCursor: null }
    }
    return {}
  })
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.click(screen.getByRole('button', { name: '清理已失效记录' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /确定|OK/ }))
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesBatch', { action: 'cleanInvalid', limit: 100, cursor: 'cursor-one' }))
  expect(batch).toBe(2)
})

it('筛选请求失败后清空旧记录与选择，避免对旧筛选结果执行删除', async () => {
  fixture.call.mockImplementation(async (action, input) => {
    if (action === 'mySharesList' && input.name === '不存在') throw new Error('筛选服务暂不可用')
    if (action === 'mySharesList') return { items: entries, page: input.page, limit: 50, total: 2 }
    return {}
  })
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.click(screen.getByRole('checkbox', { name: '选择分享 合同.docx' }))
  fireEvent.change(screen.getByRole('textbox', { name: '按文件名筛选' }), { target: { value: '不存在' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('筛选服务暂不可用')
  expect(screen.queryByText('合同.docx')).not.toBeInTheDocument()
  expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '删除所选记录' })).not.toBeInTheDocument()
})

it('快速切换筛选时忽略旧慢响应，加载期间不可选择记录', async () => {
  let resolveSlow: (value: any) => void = () => {}
  fixture.call.mockImplementation((action, input) => {
    if (action !== 'mySharesList') return Promise.resolve({})
    if (input.name === '慢') return new Promise(resolve => { resolveSlow = resolve })
    if (input.name === '快') return Promise.resolve({ items: [{ ...entries[0], nodeId: 'fast', name: '快文件.docx' }], page: 1, limit: 50, total: 1 })
    return Promise.resolve({ items: entries, page: 1, limit: 50, total: 2 })
  })
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.change(screen.getByRole('textbox', { name: '按文件名筛选' }), { target: { value: '慢' } })
  expect(await screen.findByText('正在读取分享记录…')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: '全选本页分享' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: '按文件名筛选' }), { target: { value: '快' } })
  expect(await screen.findByText('快文件.docx')).toBeInTheDocument()
  resolveSlow({ items: entries, page: 1, limit: 50, total: 2 })
  await waitFor(() => expect(screen.getByText('快文件.docx')).toBeInTheDocument())
  expect(screen.queryByText('合同.docx')).not.toBeInTheDocument()
})

it('批量处理中禁用筛选控件，防止旧筛选刷新覆盖新结果', async () => {
  let finishBatch: (value: any) => void = () => {}
  fixture.call.mockImplementation((action, input) => {
    if (action === 'mySharesList') return Promise.resolve({ items: entries, page: input.page, limit: 50, total: 2 })
    if (action === 'mySharesBatch') return new Promise(resolve => { finishBatch = resolve })
    return Promise.resolve({})
  })
  render(<AntdApp><MySharesPage nodes={nodes} onBack={() => {}} /></AntdApp>)
  await screen.findByText('合同.docx')
  fireEvent.click(screen.getByRole('checkbox', { name: '选择分享 合同.docx' }))
  fireEvent.click(screen.getByRole('button', { name: '批量取消分享' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /确定|OK/ }))
  await waitFor(() => expect(fixture.call).toHaveBeenCalledWith('mySharesBatch', { action: 'revoke', entries: [{ kind: 'link', id: 'l1' }] }))
  expect(screen.getByRole('combobox', { name: '分享类型' })).toBeDisabled()
  expect(screen.getByRole('combobox', { name: '分享状态' })).toBeDisabled()
  expect(screen.getByRole('textbox', { name: '按文件名筛选' })).toBeDisabled()
  finishBatch({ results: [{ kind: 'link', id: 'l1', ok: true }], hasMore: false })
  await waitFor(() => expect(screen.getByRole('textbox', { name: '按文件名筛选' })).toBeEnabled())
})
