import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigProvider } from 'antd'
import TranslateDialog from './TranslateDialog'
import { 读取翻译配置 } from './translateSettings'
import { 翻译文本 } from './translate'

vi.mock('./translateSettings', async () => {
  const 实际 = await vi.importActual<typeof import('./translateSettings')>('./translateSettings')
  return {
    ...实际,
    读取翻译配置: vi.fn(),
  }
})

vi.mock('./translate', async () => {
  const 实际 = await vi.importActual<typeof import('./translate')>('./translate')
  return {
    ...实际,
    翻译文本: vi.fn(),
  }
})

const 渲染面板 = (覆盖: Partial<Parameters<typeof TranslateDialog>[0]> = {}) => {
  const 回调 = { onClose: vi.fn() }
  const 结果 = render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <TranslateDialog open {...回调} {...覆盖} />
    </ConfigProvider>
  )
  return { ...结果, 回调 }
}

describe('文字翻译面板', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(读取翻译配置).mockReturnValue({ 地址: '', 密钥: '', 目标语言: 'zh' })
    vi.mocked(翻译文本).mockResolvedValue('译文内容')
  })

  it('未打开时不渲染内容', () => {
    const { container } = render(
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <TranslateDialog open={false} onClose={() => {}} />
      </ConfigProvider>
    )
    expect(container.querySelector('.wps-translate')).toBeNull()
  })

  it('未配置服务地址时给出明确中文指引', async () => {
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(
      await screen.findByText('尚未配置翻译服务，请先到 设置 → 翻译设置 填写服务地址与密钥')
    ).toBeInTheDocument()
    expect(翻译文本).not.toHaveBeenCalled()
  })

  it('源文本为空时提示先输入内容', async () => {
    渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByText('请先输入要翻译的源文本')).toBeInTheDocument()
    expect(翻译文本).not.toHaveBeenCalled()
  })

  it('已配置服务时调用翻译文本并展示结果', async () => {
    vi.mocked(读取翻译配置).mockReturnValue({ 地址: 'https://api.example.com/translate', 密钥: 'k', 目标语言: 'zh' })
    渲染面板()
    await userEvent.type(screen.getByPlaceholderText('在此输入要翻译的内容'), '你好')
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByText('译文内容')).toBeInTheDocument()
    expect(翻译文本).toHaveBeenCalledTimes(1)
  })

  it('点击关闭回传关闭事件', async () => {
    const { 回调 } = 渲染面板()
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(回调.onClose).toHaveBeenCalledTimes(1)
  })
})