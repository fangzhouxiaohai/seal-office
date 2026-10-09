import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import AssistantContent, { 单一代码块 } from './AssistantContent'

const 写入 = vi.fn().mockResolvedValue(undefined)
function 展示(内容: string) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: 写入 } })
  return render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AssistantContent 内容={内容} /></AntdApp></ConfigProvider>)
}
afterEach(() => { 写入.mockReset(); 写入.mockResolvedValue(undefined); Reflect.deleteProperty(window, 'electronAPI') })

describe('助手回复按类型展示与复制', () => {
  it('普通文本保留换行、空格和符号，底部按钮精确复制原文', async () => {
    const 内容 = '第一行\n  第二行 <tag> & 内容\n/compact 压缩会话'
    展示(内容)
    const 区域 = screen.getByRole('region', { name: 'TXT内容' })
    expect(区域.querySelector('.assistant-plaintext')?.textContent).toBe(内容)
    const 按钮 = within(区域).getByRole('button', { name: '复制文本' })
    expect(按钮.closest('footer')).not.toBeNull()
    fireEvent.click(按钮)
    await waitFor(() => expect(写入).toHaveBeenCalledWith(内容))
    expect(await screen.findByText('已复制')).toBeInTheDocument()
  })

  it.each([
    ['python', 'def greet(name):\n    return "你好 " + name # 注释', 'Python'],
    ['js', 'const answer = 42; console.log("hello");', 'JavaScript'],
    ['typescript', 'interface User { name: string }; const ok: boolean = true;', 'TypeScript'],
    ['sql', "SELECT name FROM users WHERE id = 12;", 'SQL'],
    ['json', '{"name": "海豹", "enabled": true}', 'JSON'],
    ['html', '<div class="seal">Hello</div>', 'HTML'],
  ])('%s 使用语言语法高亮且只复制代码正文', async (语言, 代码, 名称) => {
    展示('```' + 语言 + '\n' + 代码 + '\n```')
    const 区域 = screen.getByRole('region', { name: `${名称}内容` })
    expect(区域.querySelector('code')?.textContent).toBe(代码)
    expect(区域.querySelectorAll('code span[class^="hljs-"]').length).toBeGreaterThan(0)
    expect(区域.querySelector('div.seal')).toBeNull()
    fireEvent.click(within(区域).getByRole('button', { name: `复制${名称}代码` }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith(代码))
  })

  it('Markdown 显示标题、加粗、列表、任务与表格，复制保留语法', async () => {
    const 内容 = '# 工作计划\n\n**目标**与 `变量`\n\n- [x] 已核对\n- [ ] 待处理\n\n| 阶段 | 状态 |\n| --- | --- |\n| 一 | 完成 |'
    展示(内容)
    expect(screen.getByRole('heading', { name: '工作计划' })).toBeInTheDocument()
    expect(screen.getByText('目标').tagName).toBe('STRONG')
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox').every((项) => (项 as HTMLInputElement).disabled)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '复制Markdown 原文' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith(内容))
  })

  it('混合回复的多个代码块独立复制，正文有总复制按钮', async () => {
    const 内容 = '说明：\n\n```python\nprint(1)\n```\n\n接着运行：\n\n```sql\nSELECT 1;\n```'
    展示(内容)
    expect(screen.getAllByRole('region')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '复制Python代码' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('print(1)'))
    fireEvent.click(screen.getByRole('button', { name: '复制SQL代码' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('SELECT 1;'))
    fireEvent.click(screen.getByRole('button', { name: '复制Markdown 原文' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith(内容))
  })

  it('txt 围栏中的 Markdown 字符仍按纯文本展示，md 围栏按 Markdown 排版', () => {
    const view = 展示('```txt\n# 这不是标题\n**保持原样**\n```')
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'TXT内容' }).querySelector('.assistant-plaintext')?.textContent).toBe('# 这不是标题\n**保持原样**')
    view.rerender(<AntdApp><AssistantContent 内容={'```md\n# 真正的标题\n\n**加粗**\n```'} /></AntdApp>)
    expect(screen.getByRole('heading', { name: '真正的标题' })).toBeInTheDocument()
    view.rerender(<AntdApp><AssistantContent 内容="_只有斜体的短回复_" /></AntdApp>)
    expect(screen.getByText('只有斜体的短回复').tagName).toBe('EM')
    view.rerender(<AntdApp><AssistantContent 内容={'[参考文档][doc]\n\n[doc]: https://example.com/docs'} /></AntdApp>)
    expect(screen.getByRole('link', { name: '参考文档' })).toHaveAttribute('href', 'https://example.com/docs')
  })

  it('未知语言与未完成的流式围栏可读，不丢失正文', () => {
    const view = 展示('```unknown-lang\n<tag>原文</tag>\n')
    expect(screen.getByRole('region', { name: 'unknown-lang内容' }).querySelector('code')?.textContent).toBe('<tag>原文</tag>\n')
    view.rerender(<AntdApp><AssistantContent 内容={'```python\nprint("hello")\n```'} /></AntdApp>)
    expect(screen.getByRole('region', { name: 'Python内容' }).querySelector('code')?.textContent).toBe('print("hello")')
    expect(单一代码块('```python\nprint(1)\n```\n后续说明')).toBeNull()
    expect(单一代码块('~~~~txt\r\n```\r\n~~~~\r\n')).toEqual({ 语言: 'txt', 内容: '```' })
  })

  it('HTML、危险链接和远程图片不执行或加载，安全链接交给系统浏览器', async () => {
    const 外部 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { openExternal: 外部 } })
    展示('# 检查\n\n<script>alert(1)</script>\n\n[坏链接](javascript:alert)\n\n![图片](https://example.com/track.png)\n\n[文档](https://example.com/docs)')
    expect(document.querySelector('script, img, a[href^="javascript:"]')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: '文档' }))
    await waitFor(() => expect(外部).toHaveBeenCalledWith('https://example.com/docs'))
  })

  it('复制失败有明确提示，之后可重试', async () => {
    展示('需要复制的内容')
    写入.mockRejectedValueOnce(new Error('Permission denied'))
    fireEvent.click(screen.getByRole('button', { name: '复制文本' }))
    expect(await screen.findByText('复制失败，请选中内容手动复制')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '复制文本' }))
    await waitFor(() => expect(写入).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('已复制')).toBeInTheDocument()
  })
})
