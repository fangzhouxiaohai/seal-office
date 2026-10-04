import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import DocEditor from '../editor/DocEditor'
import AiAssistant from './AiAssistant'
import { 标记放映开始 } from '../ppt/presentationState'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

describe('智能助手对话修改链路', () => {
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
