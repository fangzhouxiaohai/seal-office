import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import { type 助手流片段, type 助手对话输入 } from '../ipc/bridge'
import { 交给助手, 通用AI指令 } from './quickActions'
import AiAssistant from './AiAssistant'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })
const 已保存配置 = { 名称: '已保存服务', 地址: 'https://example.com/chat/completions', 模型: '已保存模型', 已配置密钥: true, 思考强度: 'medium', 上下文令牌: 65536 }
function 延迟<T>() {
  let 完成!: (值: T) => void
  const promise = new Promise<T>((resolve) => { 完成 = resolve })
  return { promise, 完成 }
}
function 环境(类型: 'word' | 'table' | 'ppt' | 'pdf' = 'word') {
  const 配置 = 延迟<unknown>(), 会话 = 延迟<unknown>(), 回复 = 延迟<unknown>()
  let 推送: (片段: 助手流片段) => void = () => {}
  const ai = {
    getConfig: vi.fn(() => 配置.promise), getSession: vi.fn(() => 会话.promise),
    chat: vi.fn((_输入: 助手对话输入) => 回复.promise), onToolCall: () => () => {},
    onStream: (监听: typeof 推送) => { 推送 = 监听; return () => {} },
  }
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai,
    backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }),
  } })
  function 入口() {
    const store = useAppStore()
    return <>
      <button onClick={() => store.createDoc(类型, 类型 === 'word' ? '<p>原始内容</p>' : 类型 === 'pdf' ? '测试PDF数据' : undefined, { 名称: `样例.${类型 === 'word' ? 'docx' : 类型 === 'table' ? 'xlsx' : 类型 === 'ppt' ? 'pptx' : 'pdf'}` })}>打开样例</button>
      <button onClick={() => store.createDoc('word', '<p>另一个文件</p>', { 名称: '其他.docx' })}>切换文件</button>
      <AiAssistant />
    </>
  }
  render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
  const 快捷 = (文本 = '选中内容') => act(() => 交给助手(通用AI指令.find((项) => 项.id === 'ai.summarize')!, 文本))
  const 初始化 = async (历史: unknown = null) => { await act(async () => { 配置.完成({ 成功: true, 数据: 已保存配置 }); 会话.完成({ 成功: true, 数据: 历史 }) }) }
  return { ai, 配置, 会话, 回复, 快捷, 初始化, 推送: (片段: 助手流片段) => act(() => 推送(片段)) }
}

describe('快捷 AI 首次初始化和执行展示', () => {
  it.each(['word', 'table', 'ppt', 'pdf'] as const)('%s 冷启动第一次快捷操作等待配置和会话，只发出一次请求且不进入队列', async (类型) => {
    const e = 环境(类型)
    fireEvent.click(screen.getByText('打开样例')); e.快捷()
    await waitFor(() => expect(e.ai.getConfig).toHaveBeenCalledTimes(1))
    expect(e.ai.chat).not.toHaveBeenCalled()
    expect(screen.queryByText('请先配置模型服务')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '助手任务队列' })).not.toBeInTheDocument()
    await act(async () => e.配置.完成({ 成功: true, 数据: 已保存配置 }))
    expect(e.ai.chat).not.toHaveBeenCalled()
    await act(async () => e.会话.完成({ 成功: true, 数据: { 显示消息: [{ 角色: 'user', 内容: '之前的需求' }, { 角色: 'assistant', 内容: '已有记忆' }], 摘要: '', 压缩次数: 0, 计划: [] } }))
    await waitFor(() => expect(e.ai.chat).toHaveBeenCalledTimes(1))
    expect(e.ai.chat.mock.calls[0][0]).toMatchObject({ 上下文令牌: 65536, 思考强度: 'medium', 消息: expect.arrayContaining([expect.objectContaining({ 内容: '已有记忆' })]) })
    expect(e.ai.chat.mock.calls[0][0].文档上下文).toContain(`样例.${类型 === 'word' ? 'docx' : 类型 === 'table' ? 'xlsx' : 类型 === 'ppt' ? 'pptx' : 'pdf'}`)
    expect(e.ai.chat.mock.calls[0][0].消息.slice(-1)[0].内容).toContain('选中内容')
    expect(screen.queryByRole('region', { name: '助手任务队列' })).not.toBeInTheDocument()
    await act(async () => e.回复.完成({ 成功: true, 数据: { 内容: '快捷总结完成' } }))
    expect(screen.getByText('快捷总结完成')).toBeInTheDocument()
  })

  it('初始化中连续两条快捷消息只有第二条排队，切换文件仍使用第一条的原范围', async () => {
    const e = 环境(); fireEvent.click(screen.getByText('打开样例')); e.快捷('第一选区')
    fireEvent.click(screen.getByText('切换文件')); e.快捷('第二选区')
    const 队列 = await screen.findByRole('region', { name: '助手任务队列' })
    expect(within(队列).getByText(/第二选区/)).toBeInTheDocument()
    expect(within(队列).queryByText(/第一选区/)).not.toBeInTheDocument()
    await e.初始化(); await waitFor(() => expect(e.ai.chat).toHaveBeenCalledTimes(1))
    expect(e.ai.chat.mock.calls[0][0].文档上下文).toContain('样例.docx')
    await act(async () => e.回复.完成({ 成功: true, 数据: { 内容: '完成' } }))
    await waitFor(() => expect(e.ai.chat).toHaveBeenCalledTimes(2))
    expect(e.ai.chat.mock.calls[1][0].文档上下文).toContain('其他.docx')
  })

  it('已保存配置真实为空时才邀请配置，读取异常保留真实原因并可重试', async () => {
    const e = 环境(); fireEvent.click(screen.getByText('打开样例')); e.快捷()
    await act(async () => e.配置.完成({ 成功: false, 错误: '安全存储读取失败' }))
    expect(await screen.findByText('安全存储读取失败')).toBeInTheDocument()
    expect(screen.queryByText('请先配置模型服务')).not.toBeInTheDocument()
    expect(e.ai.chat).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    await act(async () => e.会话.完成({ 成功: true, 数据: null }))
    e.ai.getConfig.mockResolvedValue({ 成功: true, 数据: { ...已保存配置, 地址: '', 模型: '' } })
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('请先配置模型服务', { selector: '.ant-modal-confirm-title' })).toBeInTheDocument()
    expect(e.ai.chat).not.toHaveBeenCalled()
  })

  it('设置变更后晚到的旧配置不能覆盖新配置，首次指令继续使用新窗口', async () => {
    const e = 环境(); fireEvent.click(screen.getByText('打开样例')); e.快捷()
    await waitFor(() => expect(e.ai.getConfig).toHaveBeenCalledTimes(1))
    e.ai.getConfig.mockResolvedValue({ 成功: true, 数据: { ...已保存配置, 上下文令牌: 262144 } })
    act(() => window.dispatchEvent(new Event('seal-ai-setting-changed')))
    await e.初始化(); await waitFor(() => expect(e.ai.chat).toHaveBeenCalledTimes(1))
    expect(e.ai.chat.mock.calls[0][0].上下文令牌).toBe(262144)
    expect(screen.queryByRole('region', { name: '助手任务队列' })).not.toBeInTheDocument()
    await act(async () => e.回复.完成({ 成功: true, 数据: { 内容: '使用新配置完成' } }))
  })

  it('恢复持久候选后快捷需求等待确认，不覆盖上一次修改', async () => {
    const e = 环境(); fireEvent.click(screen.getByText('打开样例')); e.快捷()
    await e.初始化({ 显示消息: [], 摘要: '', 压缩次数: 0, 计划: [], 待确认候选: { 回复: '原候选', 修改: [{ 种类: '文字替换', 查找: '原始内容', 替换为: '已建议内容' }], 文件快照: '<p>原始内容</p>' } })
    expect(await screen.findByText('待确认修改，共 1 处')).toBeInTheDocument()
    expect(e.ai.chat).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: '助手任务队列' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '应用修改' }))
    await waitFor(() => expect(e.ai.chat).toHaveBeenCalledTimes(1))
    expect(e.ai.chat.mock.calls[0][0].文档上下文).toContain('已建议内容')
    await act(async () => e.回复.完成({ 成功: true, 数据: { 内容: '完成' } }))
  })

  it('执行过程每个工具独占一行，完成和失败更新原行，计划默认折叠并实时更新', async () => {
    const e = 环境(); fireEvent.click(screen.getByText('打开样例')); e.快捷(); await e.初始化()
    await waitFor(() => expect(e.ai.chat).toHaveBeenCalledTimes(1))
    const 请求标识 = e.ai.chat.mock.calls[0][0].请求标识!
    const 步骤 = [{ id: 'read', title: '读取选区', status: 'in_progress' }, { id: 'summarize', title: '总结要点', status: 'pending' }]
    e.推送({ 请求标识, 类型: '计划', 内容: JSON.stringify(步骤) })
    const 计划 = screen.getByText('任务计划 · 0/2 已完成').closest('details')!
    expect(计划).not.toHaveAttribute('open')
    e.推送({ 请求标识, 类型: '工具', 调用标识: 'read-1', 内容: '读取当前文件', 执行状态: '执行中' })
    e.推送({ 请求标识, 类型: '工具', 调用标识: 'read-1', 内容: '读取当前文件', 执行状态: '完成', 详情: '已读取选区' })
    e.推送({ 请求标识, 类型: '工具', 调用标识: 'read-2', 内容: '重新读取', 执行状态: '失败', 详情: '范围无效' })
    const 过程 = screen.getByRole('list', { name: '执行过程' })
    expect(within(过程).getAllByRole('listitem')).toHaveLength(2)
    expect(within(过程).getByText('完成')).toBeInTheDocument()
    expect(within(过程).getByText('失败')).toBeInTheDocument()
    e.推送({ 请求标识, 类型: '计划', 内容: JSON.stringify([{ ...步骤[0], status: 'completed' }, { ...步骤[1], status: 'in_progress' }]) })
    expect(screen.getByText('任务计划 · 1/2 已完成')).toBeInTheDocument()
    expect(计划).not.toHaveAttribute('open')
    await act(async () => e.回复.完成({ 成功: true, 数据: { 内容: '要点总结' } }))
    expect(within(过程).getAllByRole('listitem')).toHaveLength(2)
  })
})
