import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore, type AppState } from '../store'
import AiAssistant from './AiAssistant'
import { AI身份提示事件 } from '../cloud/aiIdentity'

let store: AppState
const verified = { 成功: true, 数据: { accountId: 'mobile-assistant-test', verified: true, method: 'phone' } }
const config = { 名称: '测试', 地址: 'https://example.com/chat', 模型: 'test', 已配置密钥: false }
function setup(extra: Record<string, unknown> = {}, identity = vi.fn().mockResolvedValue(verified)) {
  const chat = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: '问答回复' } })
  const api = { getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: config }), chat,
    getSession: vi.fn().mockResolvedValue({ 成功: true, 数据: null }), onToolCall: () => () => {},
    updateSessionPlan: vi.fn().mockResolvedValue({ 成功: true }), ...extra }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { cloud: { invoke: identity }, ai: api,
    backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
  function Harness() { store = useAppStore(); return <AiAssistant /> }
  render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><Harness /></AppProvider></AntdApp></ConfigProvider>)
  return { chat, api, identity }
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
  await screen.findByRole('combobox', { name: '助手目标文件' })
}
async function send(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: text } })
  await waitFor(() => expect(screen.getByRole('button', { name: '发送' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: '发送' }))
}
function create(name: string, html = '<p>原文</p>') {
  act(() => store.createDoc('word', html, { 名称: name }))
  return store.activeDocumentId!
}
beforeEach(() => {
  document.documentElement.dataset.sealPlatform = 'app'
  // jsdom has no pointer capture; actual touch capture is covered by the production browser check.
  Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), hasPointerCapture: () => false, releasePointerCapture: vi.fn() })
})
afterEach(() => {
  delete document.documentElement.dataset.sealPlatform
  Reflect.deleteProperty(window, 'electronAPI')
  for (const key of ['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture']) Reflect.deleteProperty(HTMLElement.prototype, key)
})

describe('移动助手目标文件与对话权限', () => {
  it('无文件时打开大弹窗，只允许普通问答，不能创建文件', async () => {
    const { chat } = setup()
    await open()
    expect(document.querySelector('.assistant-mobile-modal')).toBeInTheDocument()
    expect(document.querySelector('.assistant-drawer.ant-drawer')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '助手目标文件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '对话模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '工作模式' })).toBeDisabled()
    await send('你好')
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 只读对话: true, 自动执行: false, 会话标识: 'general', 文档上下文: '' })))
    expect(store.documents).toHaveLength(0)
  })

  it('默认当前文件，选择别的打开文件只切换助手范围，重开时重新默认当前文件', async () => {
    const { chat } = setup()
    const a = create('甲.sldoc', '<p>甲的正文</p>'), b = create('乙.sldoc', '<p>乙的正文</p>')
    await open()
    const target = screen.getByRole('combobox', { name: '助手目标文件' })
    expect(target).toHaveValue(b)
    await userEvent.selectOptions(target, a)
    expect(store.activeWorkspaceTabId).toBe(b)
    await send('总结所选文件')
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 只读对话: true, 文档上下文: expect.stringContaining('甲的正文') })))
    expect(chat.mock.calls[0][0].文档上下文).not.toContain('乙的正文')
    await userEvent.click(screen.getByRole('button', { name: '收起智能助手' }))
    await open()
    expect(screen.getByRole('combobox', { name: '助手目标文件' })).toHaveValue(b)
  })

  it('工作模式确认后只修改选中文件，关闭全部文件后自动恢复问答', async () => {
    const { chat } = setup()
    chat.mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '请确认甲的修改', 修改: [{ 种类: '文字替换', 查找: '甲的正文', 替换为: '甲的新正文' }] }) } })
    const a = create('甲.sldoc', '<p>甲的正文</p>'), b = create('乙.sldoc', '<p>乙的正文</p>')
    await open()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '助手目标文件' }), a)
    await userEvent.click(screen.getByRole('button', { name: '工作模式' }))
    await send('修改甲')
    const apply = await screen.findByRole('button', { name: '应用修改' })
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 只读对话: false, 自动执行: true, 文件快照: '<p>甲的正文</p>' }))
    expect(store.documents.find(doc => doc.id === a)?.html).toBe('<p>甲的正文</p>')
    await userEvent.click(apply)
    await waitFor(() => expect(store.documents.find(doc => doc.id === a)?.html).toContain('甲的新正文'))
    expect(store.documents.find(doc => doc.id === b)?.html).toBe('<p>乙的正文</p>')
    act(() => store.closeWorkspaceTab(a))
    act(() => store.closeWorkspaceTab(b))
    await waitFor(() => expect(screen.getByRole('button', { name: '工作模式' })).toBeDisabled())
    expect(screen.getByRole('button', { name: '对话模式' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('对话模式拒绝异步写工具，兼容协议也不能绕过只读限制', async () => {
    let tool: (input: any) => void = () => {}, finish: (value: any) => void = () => {}
    const proposal = { 回复: '写入候选', 修改: [{ 种类: '文字替换', 查找: '原文', 替换为: '变更' }] }
    const submit = vi.fn().mockResolvedValue({ 成功: true })
    const chat = vi.fn(() => new Promise(resolve => { finish = resolve }))
    setup({ chat, onToolCall: (callback: typeof tool) => { tool = callback; return () => {} }, submitToolResult: submit })
    create('只读.sldoc')
    await open(); await send('解释原文')
    await waitFor(() => expect(chat).toHaveBeenCalled())
    act(() => tool({ 请求标识: (chat.mock.calls as any)[0][0].请求标识, 调用标识: 'bad-write', 工具: 'propose_changes', 参数: proposal }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ 成功: false, 错误: expect.stringContaining('对话模式') })))
    await act(async () => finish({ 成功: true, 数据: { 内容: JSON.stringify(proposal) } }))
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    expect(store.documents[0].html).toBe('<p>原文</p>')
  })

  it('有工作候选时切换问答仍可提问，切回工作模式保留待确认修改', async () => {
    const { chat } = setup()
    chat.mockResolvedValueOnce({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '候选已生成', 修改: [{ 种类: '文字替换', 查找: '原文', 替换为: '修改后' }] }) } })
    create('混合会话.sldoc'); await open()
    await userEvent.click(screen.getByRole('button', { name: '工作模式' })); await send('修改原文')
    await screen.findByRole('button', { name: '应用修改' })
    await userEvent.click(screen.getByRole('button', { name: '对话模式' }))
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    await send('解释原文含义')
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2))
    expect(chat.mock.calls[1][0].只读对话).toBe(true)
    await waitFor(() => expect(screen.getByRole('button', { name: '工作模式' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '工作模式' }))
    expect(screen.getByRole('button', { name: '应用修改' })).toBeInTheDocument()
    expect(store.documents[0].html).toBe('<p>原文</p>')
  })

  it('关闭所选文件会回退到仍打开的文件；所有关闭后不再保留旧上下文', async () => {
    const { chat } = setup()
    const a = create('甲.sldoc'), b = create('乙.sldoc')
    await open()
    act(() => store.closeWorkspaceTab(b))
    expect(screen.getByRole('combobox', { name: '助手目标文件' })).toHaveValue(a)
    act(() => store.closeWorkspaceTab(a))
    await send('一般问题')
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 文档上下文: '', 只读对话: true, 会话标识: 'general' })))
  })

  it('关闭带有候选和排队任务的文件后，旧任务不会阻塞无文件问答', async () => {
    const { chat } = setup()
    chat.mockResolvedValueOnce({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '待确认', 修改: [{ 种类: '文字替换', 查找: '原文', 替换为: '变更' }] }) } })
    const id = create('排队.sldoc'); await open()
    await userEvent.click(screen.getByRole('button', { name: '工作模式' })); await send('修改原文')
    await screen.findByRole('button', { name: '应用修改' })
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '下一项修改' } })
    await userEvent.click(screen.getByRole('button', { name: '加入队列' }))
    await screen.findByText('下一项修改')
    act(() => store.closeWorkspaceTab(id))
    await screen.findByText('失败原因：任务的原文件已关闭，请重新打开文件后发送需求')
    expect(screen.getByRole('button', { name: '工作模式' })).toBeDisabled()
    await send('现在只问一个普通问题')
    await waitFor(() => expect(chat).toHaveBeenCalledTimes(2))
    expect(chat.mock.calls[1][0]).toMatchObject({ 只读对话: true, 文档上下文: '', 会话标识: 'general' })
    expect(store.documents).toHaveLength(0)
  })

  it('登录核验期间改选文件不会把原问题发给新的文件', async () => {
    let resolve: (value: unknown) => void = () => {}
    const identity = vi.fn(() => new Promise(done => { resolve = done }))
    const { chat } = setup({}, identity)
    const a = create('甲.sldoc'); create('乙.sldoc')
    await open(); await send('原文件的问题')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '助手目标文件' }), a)
    await act(async () => resolve(verified))
    expect(chat).not.toHaveBeenCalled()
    expect(await screen.findByText('目标文件或模式已变化，请确认后重新发送')).toBeInTheDocument()
  })

  it('未登录不发模型请求，保留用户草稿并触发原有登录入口', async () => {
    const required = vi.fn()
    window.addEventListener(AI身份提示事件, required)
    try {
      const { chat } = setup({}, vi.fn().mockResolvedValue({ 成功: false, 需要登录: true, code: 'AI_IDENTITY_REQUIRED', 错误: '请先登录' }))
      await open(); await send('保留问题')
      await waitFor(() => expect(required).toHaveBeenCalled())
      expect(chat).not.toHaveBeenCalled()
      expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).toHaveValue('保留问题')
    } finally { window.removeEventListener(AI身份提示事件, required) }
  })

  it('编辑器快捷问答使用所在文件，不误用弹窗上次选择的另一个文件', async () => {
    const { chat } = setup()
    const a = create('甲.sldoc', '<p>甲正文</p>'), b = create('乙.sldoc', '<p>乙正文</p>')
    await open(); await userEvent.selectOptions(screen.getByRole('combobox', { name: '助手目标文件' }), a)
    await userEvent.click(screen.getByRole('button', { name: '收起智能助手' }))
    act(() => window.dispatchEvent(new CustomEvent('seal-assistant-ask', { detail: { 文本: '解释选中文字' } })))
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 文档上下文: expect.stringContaining('乙正文') })))
    expect(screen.getByRole('combobox', { name: '助手目标文件' })).toHaveValue(b)
  })

  it('表格、演示和 PDF 都列入已打开文件；不支持写入的 PDF 明确保持问答', async () => {
    const { chat } = setup()
    act(() => store.createDoc('table'))
    const table = store.activeDocumentId!
    act(() => store.createDoc('ppt'))
    const ppt = store.activeDocumentId!
    act(() => store.createDoc('pdf', 'JVBERi0xLjQ=', { 名称: '参考.spdf' }))
    await open()
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('button', { name: '工作模式' })).toBeDisabled()
    expect(screen.getByText('PDF 可就选中文字问答，正文修改请使用 PDF 编辑功能。')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '助手目标文件' }), table)
    expect(screen.getByRole('button', { name: '工作模式' })).toBeEnabled()
    await send('读取表格内容')
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 文档上下文: expect.stringContaining('文件类型：表格'), 只读对话: true })))
    await waitFor(() => expect(screen.getByRole('button', { name: '工作模式' })).toBeEnabled())
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '助手目标文件' }), ppt)
    await send('总结演示')
    await waitFor(() => expect(chat).toHaveBeenCalledWith(expect.objectContaining({ 文档上下文: expect.stringContaining('文件类型：演示'), 只读对话: true })))
  })
})
