import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import AiAssistant from './AiAssistant'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

function 环境() {
  const 完成: Array<(结果: unknown) => void> = []
  const chat = vi.fn(() => new Promise((resolve) => 完成.push(resolve)))
  const guide = vi.fn().mockResolvedValue({ 成功: true })
  const cancel = vi.fn().mockResolvedValue({ 成功: true })
  const updateSessionPlan = vi.fn().mockResolvedValue({ 成功: true })
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
    getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '本机', 服务商: 'custom', 地址: 'http://localhost/chat', 模型: '测试', 上下文令牌: 131072 } }), chat, guide, cancel, updateSessionPlan,
  }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
  function 入口() {
    const store = useAppStore()
    return <>
      <button onClick={() => store.createDoc('word', '<p>原始</p>', { 名称: '甲.docx' })}>打开甲</button>
      <button onClick={() => store.createDoc('word', '<p>乙内容</p>', { 名称: '乙.docx' })}>打开乙</button>
      <button onClick={() => store.documents[0] && store.selectWorkspaceTab(store.documents[0].id)}>返回甲</button>
      <button onClick={() => store.documents[0] && store.closeWorkspaceTab(store.documents[0].id)}>关闭甲</button>
      <output data-testid="files">{JSON.stringify(store.documents.map((doc) => ({ 名称: doc.name, 正文: doc.html, 类型: doc.type })))}</output>
      <AiAssistant />
    </>
  }
  render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
  const 打开 = async (文件 = false) => {
    if (文件) await userEvent.click(screen.getByRole('button', { name: '打开甲' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '准备' } })
    await waitFor(() => expect(screen.getByRole('button', { name: '发送' })).toBeEnabled())
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '' } })
  }
  const 发送 = async (文本: string) => {
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: 文本 } })
    await userEvent.click(screen.getByRole('button', { name: /^(发送|加入队列)$/ }))
  }
  const 返回 = async (序号: number, 内容: string, 其他 = {}) => { await act(async () => { 完成[序号]({ 成功: true, 数据: { 内容, ...其他 } }) }) }
  return { chat, guide, cancel, 完成, 打开, 发送, 返回 }
}

describe('助手多消息队列和引导', () => {
  it('连续消息按顺序处理，生成结束不清空正在输入的新需求', async () => {
    const e = 环境(); await e.打开(); await e.发送('第一条')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).toBeEnabled()
    await e.发送('第二条'); await e.发送('第三条')
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '尚未发送的草稿' } })
    expect(e.chat).toHaveBeenCalledTimes(1)
    await e.返回(0, '第一条完成'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(2))
    expect((e.chat.mock.calls[1] as unknown as [{ 消息: Array<{ 内容: string }> }])[0].消息.slice(-1)[0]?.内容).toBe('第二条')
    await e.返回(1, '第二条完成'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(3))
    await e.返回(2, '第三条完成')
    expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).toHaveValue('尚未发送的草稿')
  })
  it('同文件后续任务等待确认，并使用应用后的最新内容', async () => {
    const e = 环境(); await e.打开(true); await e.发送('改正文')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1)); await e.发送('总结修改结果')
    await e.返回(0, JSON.stringify({ 回复: '候选', 修改: [{ 种类: '文字替换', 查找: '原始', 替换为: '新正文' }] }))
    expect(e.chat).toHaveBeenCalledTimes(1)
    expect(screen.getByText('等待确认上一项修改后继续。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(2))
    expect((e.chat.mock.calls[1] as unknown as [{ 文档上下文: string }])[0].文档上下文).toContain('新正文')
    await e.返回(1, '总结完成')
  })
  it('引导按钮把同一文件的需求合入当前任务，既不取消也不重复运行', async () => {
    const e = 环境(); await e.打开(true); await e.发送('写计划')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1)); await e.发送('再加入预算')
    await userEvent.click(screen.getByRole('button', { name: '引导当前任务：再加入预算' }))
    expect(e.guide).toHaveBeenCalledWith((e.chat.mock.calls[0] as unknown as [{ 请求标识: string }])[0].请求标识, '再加入预算')
    expect(e.cancel).not.toHaveBeenCalled()
    expect(within(screen.getByRole('region', { name: '助手任务队列' })).getByText(/已引导/)).toBeInTheDocument()
    await e.返回(0, '计划与预算均已结合')
    expect(e.chat).toHaveBeenCalledTimes(1)
  })
  it('引导被收尾拒绝时保留队列，当前回复结束后正常处理', async () => {
    const e = 环境(); e.guide.mockResolvedValue({ 成功: false, 错误: '正在收尾' })
    await e.打开(); await e.发送('当前需求'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1))
    await e.发送('后续需求'); await userEvent.click(screen.getByRole('button', { name: '引导当前任务：后续需求' }))
    expect(screen.getByText('正在收尾；需求仍保留在队列中')).toBeInTheDocument()
    await e.返回(0, '当前完成'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(2)); await e.返回(1, '后续完成')
  })
  it('已接受的引导不会被后续入队清除，主任务失败后仍能重试', async () => {
    const e = 环境(); await e.打开(true); await e.发送('主任务')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1)); await e.发送('引导需求')
    await userEvent.click(screen.getByRole('button', { name: '引导当前任务：引导需求' }))
    await e.发送('后续任务')
    const 队列 = screen.getByRole('region', { name: '助手任务队列' })
    expect(within(队列).getByText(/已引导/)).toBeInTheDocument()
    await act(async () => e.完成[0]({ 成功: false, 错误: '任务未完成' }))
    expect(within(队列).getByText(/主任务未完成，补充需求可重试/)).toBeInTheDocument()
    expect(within(队列).getAllByRole('button', { name: '重试' })).toHaveLength(2)
    expect(e.chat).toHaveBeenCalledTimes(1)
  })
  it('任务切换文件后仍绑定提交时的文件，不允许跨文件引导', async () => {
    const e = 环境(); await e.打开(true); await e.发送('处理甲')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: '打开乙' })); await e.发送('处理乙')
    expect(screen.getByRole('button', { name: '引导当前任务：处理乙' })).toBeDisabled()
    await e.返回(0, '甲完成'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(2))
    expect((e.chat.mock.calls[1] as unknown as [{ 文档上下文: string }])[0].文档上下文).toContain('乙内容')
    await e.返回(1, '乙完成')
  })
  it('主任务失败暂停队列且保留输入，重试恢复后处理后续任务', async () => {
    const e = 环境(); await e.打开(); await e.发送('第一项'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1))
    await e.发送('第二项')
    await act(async () => e.完成[0]({ 成功: false, 错误: '连接失败' }))
    expect(screen.getByText('队列已暂停，正在执行的任务会继续。')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).toHaveValue('第一项')
    expect(e.chat).toHaveBeenCalledTimes(1)
    const 错误弹窗 = (await screen.findByText('连接失败', { selector: '.ant-modal-confirm-content' })).closest('.ant-modal-content') as HTMLElement
    await userEvent.click(within(错误弹窗).getByRole('button', { name: 'OK' })); await userEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(2)); await e.返回(1, '第一项重试成功')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(3)); await e.返回(2, '第二项完成')
  })
  it('没有打开文件时创建真正含正文的编辑草稿，确认前不创建', async () => {
    const e = 环境(); await e.打开(); await e.发送('新建工作计划')
    await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1))
    await e.返回(0, JSON.stringify({ 回复: '新建候选', 修改: [{ 种类: '创建文件', 类型: 'word', 名称: '工作计划.docx', 内容: '阶段一调研\n阶段二实施' }] }))
    expect(screen.getByTestId('files')).toHaveTextContent('[]')
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('files')).toHaveTextContent('工作计划.docx')
    expect(screen.getByTestId('files')).toHaveTextContent('阶段二实施')
  })
  it('/help本地处理，/compact排队且发送专用压缩标志', async () => {
    const e = 环境(); await e.打开(); await e.发送('/help')
    expect(screen.getByRole('log', { name: '助手对话' })).toHaveTextContent('/compact 压缩当前会话')
    expect(e.chat).not.toHaveBeenCalled()
    await e.发送('/COMPACT'); await waitFor(() => expect(e.chat).toHaveBeenCalledTimes(1))
    expect(e.chat).toHaveBeenCalledWith(expect.objectContaining({ 手动压缩: true, 自动执行: false }))
    await e.返回(0, '上下文已压缩', { 压缩次数: 1, 计划: [], 摘要: '已有目标' })
    expect(screen.getByText('会话记忆 · 已压缩 1 次')).toBeInTheDocument()
  })
})
