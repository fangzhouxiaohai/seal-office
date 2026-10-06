import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import TranslateDialog from './TranslateDialog'
import { 读取翻译配置 } from './translateSettings'

vi.mock('./translateSettings', async () => {
  const 实际 = await vi.importActual<typeof import('./translateSettings')>('./translateSettings')
  return {
    ...实际,
    读取翻译配置: vi.fn(),
  }
})

const 翻译 = vi.fn()

/** 主进程安全服务可用：翻译经 IPC 完成，渲染端不接触密钥 */
const 安装安全翻译通道 = (覆盖: Record<string, unknown> = {}) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      presentationAi: {
        capabilities: vi.fn(async () => ({ 成功: true, 数据: {} })),
        translate: 翻译,
        ...覆盖,
      },
    },
  })
}

const 渲染面板 = (覆盖: Partial<Parameters<typeof TranslateDialog>[0]> = {}) => {
  const 回调 = { onClose: vi.fn() }
  const 结果 = render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp><TranslateDialog open {...回调} {...覆盖} /></AntdApp>
    </ConfigProvider>
  )
  return { ...结果, 回调 }
}

describe('文字翻译面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(window, 'electronAPI')
    vi.mocked(读取翻译配置).mockResolvedValue({ 地址: '', 密钥: '', 目标语言: 'zh', 已配置密钥: false })
    翻译.mockResolvedValue({ 成功: true, 数据: { 译文: [{ 对象标识: '文字翻译', 原文: '你好', 译文: '译文内容' }], 批次: 1, 跳过: 0 } })
  })

  it('未打开时不渲染内容', () => {
    const { container } = render(
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntdApp><TranslateDialog open={false} onClose={() => {}} /></AntdApp>
      </ConfigProvider>
    )
    expect(container.querySelector('.wps-translate')).toBeNull()
  })

  it('未配置服务地址时给出明确中文指引', async () => {
    安装安全翻译通道()
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(
      await screen.findByText('尚未配置翻译服务，请先到 设置 → 翻译设置 填写服务地址与密钥')
    ).toBeInTheDocument()
    expect(翻译).not.toHaveBeenCalled()
  })

  it('源文本为空时提示先输入内容', async () => {
    安装安全翻译通道()
    渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByText('请先输入要翻译的源文本')).toBeInTheDocument()
    expect(翻译).not.toHaveBeenCalled()
  })

  it('已配置服务时经主进程安全通道翻译并展示结果', async () => {
    安装安全翻译通道()
    vi.mocked(读取翻译配置).mockResolvedValue({ 地址: 'https://api.example.com/translate', 密钥: '', 目标语言: 'zh', 已配置密钥: true })
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByText('译文内容')).toBeInTheDocument()
    expect(翻译).toHaveBeenCalledWith(expect.objectContaining({ 目标语言: 'zh', 条目: [{ 对象标识: '文字翻译', 原文: '你好' }] }))
  })

  it('翻译配置损坏时通过弹窗报告且不调用服务', async () => {
    安装安全翻译通道()
    vi.mocked(读取翻译配置).mockRejectedValue(new Error('配置损坏'))
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect((await screen.findAllByText('读取翻译设置失败')).length).toBeGreaterThan(0)
    expect(await screen.findByText('配置损坏')).toBeInTheDocument()
    expect(翻译).not.toHaveBeenCalled()
  })

  it('没有系统安全存储时明确报错，不使用明文密钥回退', async () => {
    vi.mocked(读取翻译配置).mockResolvedValue({ 地址: 'https://api.example.com/translate', 密钥: '', 目标语言: 'zh', 已配置密钥: true })
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByText(/当前环境不支持系统安全翻译服务/)).toBeInTheDocument()
    expect(翻译).not.toHaveBeenCalled()
  })

  it('翻译服务返回失败时展示真实原因', async () => {
    安装安全翻译通道()
    vi.mocked(读取翻译配置).mockResolvedValue({ 地址: 'https://api.example.com/translate', 密钥: '', 目标语言: 'zh', 已配置密钥: true })
    翻译.mockResolvedValue({ 成功: false, 错误: '模型服务鉴权失败，请检查密钥和访问权限' })
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByText('模型服务鉴权失败，请检查密钥和访问权限')).toBeInTheDocument()
  })

  it('点击关闭回传关闭事件', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(回调.onClose).toHaveBeenCalledTimes(1)
  })
})
