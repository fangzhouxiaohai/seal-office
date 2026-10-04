import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import DocEditor from '../editor/DocEditor'
import AiAssistant from './AiAssistant'
import { 标记放映开始 } from '../ppt/presentationState'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('智能助手对话修改链路', () => {
  it('恢复的计划仅有执行中步骤时仍可继续执行任务', async () => {
    const 计划 = [{ id: '继续读取', title: '继续核对当前文件', status: 'in_progress' }]
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: '已继续完成核对。', 计划: [{ ...计划[0], status: 'completed' }] } })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      onToolCall: () => () => {}, getSession: vi.fn().mockResolvedValue({ 成功: true, 数据: { 显示消息: [{ 角色: 'assistant', 内容: '核对尚未结束。', 状态: '已停止' }], 摘要: '', 压缩次数: 0, 计划 } }),
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    expect(await screen.findByText('任务计划 · 0/1 已完成')).toBeInTheDocument()
    await userEvent.click(screen.getByText('任务计划 · 0/1 已完成'))
    await userEvent.click(await screen.findByRole('button', { name: '执行计划' }))
    await waitFor(() => expect(对话).toHaveBeenCalledWith(expect.objectContaining({ 自动执行: true, 会话标识: 'general' })))
  })

  it('多批原生工具传入完整累计候选，前端不会重复第一批修改', async () => {
    let 调用工具: (输入: { 请求标识: string; 调用标识: string; 工具: string; 参数: unknown }) => void = () => {}
    let 完成: (结果: unknown) => void = () => {}
    const 对话 = vi.fn(() => new Promise((resolve) => { 完成 = resolve })), 回传 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      onToolCall: (回调: typeof 调用工具) => { 调用工具 = 回调; return () => {} }, submitToolResult: 回传,
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => { const 状态 = useAppStore(); return <><button onClick={() => 状态.createDoc('word', '<p>原始标题</p><p>原始正文</p>')}>打开文件</button><output data-testid="多批正文">{状态.documents[0]?.html}</output><AiAssistant /></> }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '分批改写标题和正文' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalled())
    const 标识 = (对话.mock.calls[0] as unknown as [{ 请求标识: string }])[0].请求标识
    const 第一批 = { 种类: '文字替换', 段落标识: '段落-1', 查找: '原始标题', 替换为: '正式标题' }
    const 第二批 = { 种类: '文字替换', 段落标识: '段落-2', 查找: '原始正文', 替换为: '正式正文' }
    act(() => 调用工具({ 请求标识: 标识, 调用标识: '第一批', 工具: 'propose_changes', 参数: { 回复: '标题候选', 修改: [第一批] } }))
    await waitFor(() => expect(回传).toHaveBeenCalledWith(expect.objectContaining({ 调用标识: '第一批', 成功: true })))
    act(() => 调用工具({ 请求标识: 标识, 调用标识: '第二批', 工具: 'propose_changes', 参数: { 回复: '完整候选', 修改: [第一批, 第二批] } }))
    await waitFor(() => expect(回传).toHaveBeenCalledWith(expect.objectContaining({ 调用标识: '第二批', 成功: true, 数据: { 候选已生成: true, 修改数量: 2 } })))
    expect(screen.getByText('待确认修改，共 2 处')).toBeInTheDocument()
    await act(async () => { 完成({ 成功: true, 数据: { 内容: '两批候选已校验，请确认。' } }) })
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('多批正文')).toHaveTextContent('<p>正式标题</p><p>正式正文</p>')
  })

  it('停止接口异常时显示弹窗并恢复停止按钮', async () => {
    let 完成: (结果: unknown) => void = () => {}
    const 对话 = vi.fn(() => new Promise((resolve) => { 完成 = resolve }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      cancel: vi.fn().mockRejectedValue(new Error('停止接口连接失败')),
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '进行分析' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '停止生成' }))
    expect(await screen.findByText('停止接口连接失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止生成' })).toBeEnabled()
    await act(async () => { 完成({ 成功: true, 数据: { 内容: '分析已完成' } }) })
  })

  it('恢复快照一致的持久候选，应用后即使没有计划也清除持久候选', async () => {
    const 更新计划 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: vi.fn(), onToolCall: () => () => {}, updateSessionPlan: 更新计划,
      getSession: vi.fn().mockResolvedValue({ 成功: true, 数据: { 显示消息: [{ 角色: 'assistant', 内容: '已有标题候选' }], 摘要: '', 计划: [], 压缩次数: 0, 待确认候选: { 回复: '已有标题候选', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '持久标题' }], 文档上下文: '', 文件快照: '<p>原始标题</p>' } } }),
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => { const 状态 = useAppStore(); return <><button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开文件</button><output data-testid="恢复候选正文">{状态.documents[0]?.html}</output><AiAssistant /></> }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    expect(await screen.findByText('待确认修改，共 1 处')).toBeInTheDocument()
    expect(screen.getByTestId('恢复候选正文')).toHaveTextContent('原始标题')
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('恢复候选正文')).toHaveTextContent('持久标题')
    await waitFor(() => expect(更新计划).toHaveBeenCalledWith(expect.any(String), []))
  })

  it('恢复时原文变化只提示候选过期，放弃有效候选会清除持久记录', async () => {
    const 放弃 = vi.fn().mockResolvedValue({ 成功: true })
    const 读取 = vi.fn().mockImplementation(async (标识: string) => ({ 成功: true, 数据: { 显示消息: [], 摘要: '', 计划: [], 压缩次数: 0, 待确认候选: { 回复: '标题修改候选', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '持久标题' }], 文档上下文: '', 文件快照: 标识.startsWith('file:') ? '<p>原始标题</p>' : '<p>旧版本</p>' } } }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: vi.fn(), onToolCall: () => () => {}, getSession: 读取, discardSessionProposal: 放弃,
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => { const 状态 = useAppStore(); return <><button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开变动文件</button><button onClick={() => 状态.createDoc('word', '<p>原始标题</p>', { 路径: 'C:\\资料\\候选.docx' })}>打开有效文件</button><AiAssistant /></> }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开变动文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    expect(await screen.findByText('已保存的修改候选已过期，请重新发送修改请求。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '打开有效文件' }))
    expect(await screen.findByText('待确认修改，共 1 处')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    await waitFor(() => expect(放弃).toHaveBeenCalledWith('file:c:/资料/候选.docx'))
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
  })

  it('新建文件保存后绑定原会话，重开面板按保存路径恢复完整对话', async () => {
    const 记忆 = new Map<string, unknown>()
    const 绑定 = vi.fn().mockImplementation(async (来源: string, 目标: string) => { 记忆.set(目标, 记忆.get(来源)); return { 成功: true } })
    const 读取 = vi.fn().mockImplementation(async (标识: string) => ({ 成功: true, 数据: 记忆.get(标识) ?? null }))
    const 对话 = vi.fn().mockImplementation(async (输入) => {
      记忆.set(输入.会话标识, { 显示消息: [...输入.消息, { 角色: 'assistant', 内容: '记住草稿修改目标' }], 摘要: '', 计划: [], 压缩次数: 0 })
      return { 成功: true, 数据: { 内容: '记住草稿修改目标' } }
    })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      onToolCall: () => () => {}, getSession: 读取, bindSession: 绑定,
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => {
      const 状态 = useAppStore(), [显示, set显示] = useState(true)
      return <><button onClick={() => 状态.createDoc('word', '<p>草稿正文</p>')}>新建草稿</button><button onClick={() => 状态.activeDocumentId && 状态.set文档路径(状态.activeDocumentId, 'C:\\资料\\已保存.docx')}>保存草稿</button><button onClick={() => set显示((当前) => !当前)}>切换助手挂载</button>{显示 ? <AiAssistant /> : null}</>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '新建草稿' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '记住我的草稿目标' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('记住草稿修改目标')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(绑定).toHaveBeenCalledWith(对话.mock.calls[0][0].会话标识, 'file:c:/资料/已保存.docx'))
    await userEvent.click(screen.getByRole('button', { name: '切换助手挂载' }))
    await userEvent.click(screen.getByRole('button', { name: '切换助手挂载' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    expect(await screen.findByText('记住草稿修改目标')).toBeInTheDocument()
    expect(读取).toHaveBeenLastCalledWith('file:c:/资料/已保存.docx')
  })

  it('后续正文合并刷新，失败前完整刷新尚未显示的尾部', async () => {
    let 推送: (片段: { 请求标识: string; 类型: '正文'; 内容: string }) => void = () => {}
    let 完成: (结果: unknown) => void = () => {}
    const 对话 = vi.fn(() => new Promise((resolve) => { 完成 = resolve }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      onStream: (回调: typeof 推送) => { 推送 = 回调; return () => {} },
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '连续输出' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalled())
    const 标识 = (对话.mock.calls[0] as unknown as [{ 请求标识: string }])[0].请求标识
    act(() => 推送({ 请求标识: 标识, 类型: '正文', 内容: '首段' }))
    expect(screen.getByText('首段')).toBeInTheDocument()
    act(() => { for (let 索引 = 0; 索引 < 200; 索引++) 推送({ 请求标识: 标识, 类型: '正文', 内容: '尾部' }) })
    expect(screen.getByText('首段')).toBeInTheDocument()
    await act(async () => { 完成({ 成功: false, 错误: '连接中断' }) })
    expect(document.querySelector('.assistant-message__body')?.textContent).toBe('连续输出')
    expect(document.querySelectorAll('.assistant-message__body')[1]?.textContent).toBe(`首段${'尾部'.repeat(200)}`)
    expect(await screen.findByText('连接中断')).toBeInTheDocument()
  })

  it('工具调用发现发送后原文件内容变化时返回错误且不生成候选', async () => {
    let 调用工具: (输入: { 请求标识: string; 调用标识: string; 工具: string; 参数: unknown }) => void = () => {}
    let 完成: (结果: unknown) => void = () => {}
    const 对话 = vi.fn(() => new Promise((resolve) => { 完成 = resolve })), 回传 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      onToolCall: (回调: typeof 调用工具) => { 调用工具 = 回调; return () => {} }, submitToolResult: 回传,
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => { const 状态 = useAppStore(); return <><button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开文件</button><button onClick={() => 状态.activeDocumentId && 状态.updateEditorHtml(状态.activeDocumentId, '<p>用户手动改写</p>')}>改动原文</button><AiAssistant /></> }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '修改标题' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: '改动原文' }))
    const 标识 = (对话.mock.calls[0] as unknown as [{ 请求标识: string }])[0].请求标识
    act(() => 调用工具({ 请求标识: 标识, 调用标识: '过期调用', 工具: 'propose_changes', 参数: { 回复: '修改标题', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '错误覆盖' }] } }))
    await waitFor(() => expect(回传).toHaveBeenCalledWith({ 请求标识: 标识, 调用标识: '过期调用', 成功: false, 错误: '文件内容已变化，请重新向助手发送请求' }))
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    await act(async () => { 完成({ 成功: true, 数据: { 内容: '原文件已变化，请重新发送。' } }) })
  })

  it('完整发送长文件上下文并对大批候选分页审阅', async () => {
    const 原文 = '长文件正文'.repeat(25000)
    const 修改 = Array.from({ length: 240 }, (_, 索引) => ({ 种类: '文字替换', 段落标识: `段落-${索引 + 2}`, 查找: '批量原文', 替换为: `批量新文${索引 + 1}` }))
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '完整修改建议', 修改 }) } })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => { const 状态 = useAppStore(); return <><button onClick={() => 状态.createDoc('word', `<p>${原文}</p>${'<p>批量原文</p>'.repeat(240)}`)}>打开长文件</button><AiAssistant /></> }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开长文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '整体修改' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('待确认修改，共 240 处')).toBeInTheDocument()
    expect(对话.mock.calls[0][0].文档上下文.length).toBeGreaterThan(120000)
    expect(document.querySelectorAll('.assistant-preview__item')).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: '下一页修改' }))
    expect(screen.getByText('修改后：批量新文21')).toBeInTheDocument()
    expect(screen.queryByText('修改后：批量新文1')).not.toBeInTheDocument()
  })

  it('恢复持久会话与压缩摘要，后续追问保留完整历史并能开始新对话', async () => {
    const 历史 = Array.from({ length: 24 }, (_, 索引) => ({ 角色: 索引 % 2 ? 'assistant' : 'user', 内容: `历史消息${索引}` }))
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: '继续分析', 摘要: '已保留文件目标', 压缩次数: 2 } })
    const 清除 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 上下文令牌: 262144, 已配置密钥: false } }),
      chat: 对话, onToolCall: () => () => {}, getSession: vi.fn().mockResolvedValue({ 成功: true, 数据: { 显示消息: 历史, 摘要: '已保留文件目标', 计划: [], 压缩次数: 2 } }), clearSession: 清除,
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) } })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    expect(await screen.findByText('历史消息0')).toBeInTheDocument()
    expect(screen.getByText('会话记忆 · 已压缩 2 次')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '沿用前面的目标' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalled())
    expect(对话.mock.calls[0][0]).toEqual(expect.objectContaining({ 会话标识: 'general', 自动执行: true, 上下文令牌: 262144 }))
    expect(对话.mock.calls[0][0].消息).toHaveLength(25)
    await waitFor(() => expect(screen.getByRole('button', { name: '新对话' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '新对话' }))
    await waitFor(() => expect(清除).toHaveBeenCalledWith('general'))
    expect(screen.getByRole('log', { name: '助手对话' })).not.toHaveTextContent('历史消息0')
  })

  it('仅规划后执行计划，工具调用只生成候选且应用后持久计划状态', async () => {
    let 调用工具: (输入: { 请求标识: string; 调用标识: string; 工具: string; 参数: unknown }) => void = () => {}
    const 回传 = vi.fn().mockResolvedValue({ 成功: true }), 更新计划 = vi.fn().mockResolvedValue({ 成功: true })
    const 计划 = [{ id: '步骤1', title: '改写标题', status: 'pending' }]
    const 对话 = vi.fn().mockResolvedValueOnce({ 成功: true, 数据: { 内容: '计划已生成', 计划 } }).mockImplementationOnce(async (输入) => {
      调用工具({ 请求标识: 输入.请求标识, 调用标识: '调用1', 工具: 'propose_changes', 参数: { 回复: '候选已生成', 修改: [{ 种类: '文字替换', 段落标识: '段落-1', 查找: '原始标题', 替换为: '完整标题' }] } })
      await new Promise((完成) => setTimeout(完成, 0))
      return { 成功: true, 数据: { 内容: '请审阅标题修改', 计划: [{ ...计划[0], status: 'awaiting_confirmation' }] } }
    })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { ai: {
      getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试', 地址: 'http://localhost/chat', 模型: '测试', 已配置密钥: false } }), chat: 对话,
      onToolCall: (回调: typeof 调用工具) => { 调用工具 = 回调; return () => {} }, submitToolResult: 回传, updateSessionPlan: 更新计划, getSession: vi.fn().mockResolvedValue({ 成功: true, 数据: null }),
    }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }), backupSave: vi.fn().mockResolvedValue({ 成功: true }) } })
    const 入口 = () => { const 状态 = useAppStore(); return <><button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开文件</button><output data-testid="工具原文">{状态.documents[0]?.html}</output><AiAssistant /></> }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '仅生成计划' }))
    fireEvent.change(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), { target: { value: '请拟订标题修改计划' } })
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByRole('button', { name: '执行计划' })).toBeInTheDocument()
    expect(对话.mock.calls[0][0].自动执行).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: '执行计划' }))
    expect(await screen.findByText('待确认修改，共 1 处')).toBeInTheDocument()
    expect(screen.getByTestId('工具原文')).toHaveTextContent('原始标题')
    await waitFor(() => expect(回传).toHaveBeenCalledWith(expect.objectContaining({ 请求标识: 对话.mock.calls[1][0].请求标识, 调用标识: '调用1', 成功: true, 数据: { 候选已生成: true, 修改数量: 1 } })))
    await waitFor(() => expect(screen.getByRole('button', { name: '应用修改' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('工具原文')).toHaveTextContent('完整标题')
    await waitFor(() => expect(更新计划).toHaveBeenCalledWith(expect.any(String), [{ ...计划[0], status: 'completed' }]))
  })

  it('返回前动态展示思考与正文，停止保留输出且不创建修改候选', async () => {
    let 推送: (片段: { 请求标识: string; 类型: '思考' | '正文'; 内容: string }) => void = () => {}
    let 完成: (结果: unknown) => void = () => {}
    const 释放 = vi.fn()
    const 对话 = vi.fn(() => new Promise((resolve) => { 完成 = resolve }))
    const 停止 = vi.fn(async () => { 完成({ 成功: true, 数据: { 内容: '', 已停止: true } }); return { 成功: true } })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      ai: {
        getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost/chat/completions', 模型: '测试', 参数模式: 'six', 思考强度: 'high', 已配置密钥: false } }),
        chat: 对话, cancel: 停止, onStream: (回调: typeof 推送) => { 推送 = 回调; return 释放 },
      }, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
    } })
    const { unmount } = render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '帮我分析')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalled())
    const 请求 = 对话.mock.calls[0] as unknown as [{ 请求标识: string; 思考强度: string }]
    expect(请求[0].思考强度).toBe('high')
    act(() => 推送({ 请求标识: '其他请求', 类型: '正文', 内容: '禁止串写' }))
    act(() => 推送({ 请求标识: 请求[0].请求标识, 类型: '思考', 内容: '先检查标题与段落。' }))
    expect(screen.getByText('先检查标题与段落。')).toBeInTheDocument()
    expect(screen.getByText('正在思考')).toBeInTheDocument()
    act(() => 推送({ 请求标识: 请求[0].请求标识, 类型: '正文', 内容: '{"回复":"建议使用统一标题' }))
    expect(screen.getByText('建议使用统一标题')).toBeInTheDocument()
    expect(screen.getByText('正在输出')).toBeInTheDocument()
    expect(screen.getByRole('log', { name: '助手对话' })).not.toHaveTextContent('禁止串写')
    expect(screen.getByRole('log', { name: '助手对话' })).not.toHaveTextContent('"回复"')
    await userEvent.click(screen.getByRole('button', { name: '停止生成' }))
    await waitFor(() => expect(screen.getByText('已停止，未应用修改')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    expect(screen.getByText('建议使用统一标题')).toBeInTheDocument()
    expect(停止).toHaveBeenCalledWith(请求[0].请求标识)
    unmount(); expect(释放).toHaveBeenCalled()
  })
  it('放映隐藏入口和已经打开的面板，退出后保留输入并恢复面板', async () => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      ai: {
        getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
        chat: vi.fn(),
      },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
    } })
    render(<AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '保留这条输入')
    let 释放!: () => void
    act(() => { 释放 = 标记放映开始() })
    try {
      expect(screen.queryByRole('button', { name: '打开智能助手' })).toBeNull()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: '智能助手' })).toBeNull())
    } finally { act(() => 释放()) }
    expect(screen.getByRole('button', { name: '打开智能助手' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: '发送给智能助手的消息' })).toHaveValue('保留这条输入')
  })
  it('读取当前文件、预览候选修改，并仅在确认后写入编辑区', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '建议将标题写得更明确。', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '项目概览' }] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p><strong>原始标题</strong></p>')}>打开文件</button>
        {状态.module === 'word' ? <DocEditor /> : null}
        <AiAssistant />
      </>
    }
    const { container } = render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '请改标题')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument())
    expect(对话.mock.calls[0][0].文档上下文).toContain('原始标题')
    expect(container.querySelector('.wps-editor-canvas__content strong')?.textContent).toBe('原始标题')
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    await waitFor(() => expect(container.querySelector('.wps-editor-canvas__content strong')?.textContent).toBe('项目概览'))
  })

  it('切换到 PDF 标签后不再把先前的文字文件发送给模型', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '已收到。', 修改: [] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开文字</button>
        <button onClick={() => 状态.createDoc('pdf')}>打开 PDF</button>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文字' }))
    await userEvent.click(screen.getByRole('button', { name: '打开 PDF' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    expect(document.querySelector('.assistant-drawer__scope')?.textContent).toContain('未选择文件')
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '你好')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalledTimes(1))
    expect(对话.mock.calls[0][0].文档上下文).toBe('')
  })

  it('切换到 PDF 标签后隐藏旧文件修改，返回原标签才可应用', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '建议修改标题。', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '项目概览' }] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开文字</button>
        <button onClick={() => 状态.createDoc('pdf')}>打开 PDF</button>
        <button onClick={() => 状态.documents[0] && 状态.selectWorkspaceTab(状态.documents[0].id)}>返回文字</button>
        <output data-testid="文字内容">{状态.documents[0]?.html ?? ''}</output>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文字' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '请改标题')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '打开 PDF' }))
    expect(screen.queryByText('待确认修改，共 1 处')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '应用修改' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '返回文字' }))
    expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('文字内容')).toHaveTextContent('项目概览')
  })

  it('工作表受保护时拒绝助手改写并保留待确认修改', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '建议调整状态。', 修改: [{ 种类: '单元格写入', 工作表: 'Sheet1', 地址: 'A1', 原值: '待办', 新值: '完成' }] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>待办</td></tr></table>')}>打开表格</button>
        <button onClick={() => 状态.activeDocumentId && 状态.更新表格文档模型(状态.activeDocumentId, (当前) => [{ ...当前[0], 保护: '本机' }])}>保护表格</button>
        <output data-testid="单元格内容">{状态.表格文档模型[状态.activeDocumentId ?? '']?.[0]?.单元格.A1?.原始值 ?? ''}</output>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开表格' }))
    await userEvent.click(screen.getByRole('button', { name: '保护表格' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '请改状态')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('单元格内容')).toHaveTextContent('待办')
    expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument()
    expect(await screen.findByText('工作表已保护，请先解除保护')).toBeInTheDocument()
    expect(screen.queryByText('修改已应用到当前编辑内容，请保存文件')).not.toBeInTheDocument()
  })

  it('切换文件后只发送当前文件的对话记录与内容', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '已收到。', 修改: [] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>甲文件正文</p>', { 名称: '甲文件.docx' })}>打开甲文件</button>
        <button onClick={() => 状态.createDoc('word', '<p>乙文件正文</p>', { 名称: '乙文件.docx' })}>打开乙文件</button>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开甲文件' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '甲文件的专属问题')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalledTimes(1))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '甲文件未发送的草稿')
    await userEvent.click(screen.getByRole('button', { name: '打开乙文件' }))
    expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).toHaveValue('')
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '乙文件的专属问题')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalledTimes(2))
    expect(对话.mock.calls[1][0].文档上下文).toContain('乙文件正文')
    expect(对话.mock.calls[1][0].文档上下文).not.toContain('甲文件正文')
    expect(对话.mock.calls[1][0].消息).toEqual([{ 角色: 'user', 内容: '乙文件的专属问题' }])
  })

  it('另存后使用已保存文件名发送当前内容且已有预览仍可应用', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '建议调整标题。', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '正式标题' }] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>原始标题</p>', { 名称: '草稿.docx' })}>打开草稿</button>
        <button onClick={() => {
          const 标识 = 状态.activeDocumentId
          if (!标识) return
          状态.set文档路径(标识, 'C:\\资料\\正式文件.docx')
          状态.markDocumentSaved(标识, 状态.documents.find((项) => 项.id === 标识)?.html ?? '')
        }}>另存文件</button>
        <output data-testid="保存后正文">{状态.documents.find((项) => 项.id === 状态.activeDocumentId)?.html ?? ''}</output>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开草稿' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '调整标题')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '另存文件' }))
    await userEvent.click(screen.getByRole('button', { name: '应用修改' }))
    expect(screen.getByTestId('保存后正文')).toHaveTextContent('正式标题')
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '概括当前文件')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalledTimes(2))
    expect(对话.mock.calls[1][0].文档上下文).toContain('正式文件.docx')
    expect(对话.mock.calls[1][0].文档上下文).toContain('正式标题')
    expect(对话.mock.calls[1][0].文档上下文).not.toContain('草稿.docx')
  })

  it('请求尚未返回时切换标签，回复和预览仍归属原文件', async () => {
    let 完成对话: (结果: unknown) => void = () => {}
    const 对话 = vi.fn().mockImplementation(() => new Promise((完成) => { 完成对话 = 完成 }))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>甲文件正文</p>', { 名称: '甲文件.docx' })}>打开甲</button>
        <button onClick={() => 状态.createDoc('word', '<p>乙文件正文</p>', { 名称: '乙文件.docx' })}>打开乙</button>
        <button onClick={() => 状态.documents[0] && 状态.selectWorkspaceTab(状态.documents[0].id)}>返回甲</button>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开甲' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '请修改甲文件')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(对话).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: '打开乙' }))
    完成对话({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '甲文件建议。', 修改: [{ 种类: '文字替换', 查找: '甲文件正文', 替换为: '甲文件新正文' }] }) } })
    await waitFor(() => expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).not.toBeDisabled())
    expect(screen.getByRole('log', { name: '助手对话' })).not.toHaveTextContent('甲文件建议')
    expect(screen.queryByText('待确认修改，共 1 处')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '返回甲' }))
    expect(screen.getByRole('log', { name: '助手对话' })).toHaveTextContent('甲文件建议')
    expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument()
  })

  it('模型服务失败时保留输入并显示错误弹窗', async () => {
    const 对话 = vi.fn().mockResolvedValue({ 成功: false, 错误: '模型服务鉴权失败' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><AiAssistant /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '请帮我检查')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('模型服务鉴权失败')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '发送给智能助手的消息' })).toHaveValue('请帮我检查')
  })

  it('在另一文件对话后仍保留原文件的待确认修改', async () => {
    const 对话 = vi.fn()
      .mockResolvedValueOnce({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '甲文件修改建议。', 修改: [{ 种类: '文字替换', 查找: '甲文件正文', 替换为: '甲文件新正文' }] }) } })
      .mockResolvedValueOnce({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '乙文件已分析。', 修改: [] }) } })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>甲文件正文</p>', { 名称: '甲文件.docx' })}>打开甲</button>
        <button onClick={() => 状态.createDoc('word', '<p>乙文件正文</p>', { 名称: '乙文件.docx' })}>打开乙</button>
        <button onClick={() => 状态.documents[0] && 状态.selectWorkspaceTab(状态.documents[0].id)}>返回甲</button>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开甲' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '修改甲文件')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '打开乙' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '分析乙文件')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByRole('log', { name: '助手对话' })).toHaveTextContent('乙文件已分析'))
    await userEvent.click(screen.getByRole('button', { name: '返回甲' }))
    expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument()
  })

  it('后续对话失败时仍保留当前文件的待确认修改', async () => {
    const 对话 = vi.fn()
      .mockResolvedValueOnce({ 成功: true, 数据: { 内容: JSON.stringify({ 回复: '修改建议。', 修改: [{ 种类: '文字替换', 查找: '原始标题', 替换为: '正式标题' }] }) } })
      .mockResolvedValueOnce({ 成功: false, 错误: '模型服务暂时不可用' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        ai: {
          getConfig: vi.fn().mockResolvedValue({ 成功: true, 数据: { 名称: '测试服务', 地址: 'http://localhost:11434/v1/chat/completions', 模型: '测试模型', 已配置密钥: false } }),
          chat: 对话,
        },
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>原始标题</p>')}>打开文字</button>
        <AiAssistant />
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开文字' }))
    await userEvent.click(screen.getByRole('button', { name: '打开智能助手' }))
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '请修改标题')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument())
    await userEvent.type(screen.getByRole('textbox', { name: '发送给智能助手的消息' }), '再解释一下')
    await userEvent.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('模型服务暂时不可用')).toBeInTheDocument()
    expect(screen.getByText('待确认修改，共 1 处')).toBeInTheDocument()
  })
})
