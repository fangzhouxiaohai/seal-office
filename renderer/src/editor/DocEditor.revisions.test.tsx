import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import { AppProvider, useAppStore } from '../store'
import { htmlToDocxModel } from './commands'
const load = createRequire(import.meta.url), { 生成docx } = load('../../../main/office/docxWriter'), { 读取docx } = load('../../../main/office/docxReader')
const office = { writeDocx: async (model: any) => ({ 成功: true, 数据: (await 生成docx(model)).toString('base64') }), readDocx: async (data: string) => ({ 成功: true, ...await 读取docx(Buffer.from(data, 'base64')) }) }
afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })
function renderEditor(html = '<p>正文</p>', path?: string) {
  const Open = () => { const store = useAppStore(); return <button onClick={() => { store.createDoc('word', html, path ? { 路径: path } : undefined) }}>打开修订测试</button> }
  const body = <AppProvider><Open /><DocEditor /></AppProvider>
  return render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp>{body}</AntdApp></ConfigProvider>)
}
function caret(text: Node, offset: number) { const range = document.createRange(); range.setStart(text, offset); range.collapse(true); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range) }
it('实际编辑器记录输入作者时间、逐条接受并能撤销，视图切换不移除历史', async () => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { office } })
  const { container } = renderEditor(); await userEvent.click(screen.getByText('打开修订测试'))
  await userEvent.click(screen.getByRole('tab', { name: '审阅' })); await userEvent.click(screen.getByRole('button', { name: /^修订$/ }))
  expect(screen.queryByRole('button', { name: '查看修订历史' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /^修订历史$/ })); await userEvent.clear(screen.getByLabelText('审阅作者')); await userEvent.type(screen.getByLabelText('审阅作者'), '作者甲')
  const root = container.querySelector<HTMLElement>('.wps-editor-canvas__content')!
  caret(root.querySelector('p')!.firstChild!, 2)
  act(() => { root.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: '新增' })) })
  const revision = root.querySelector<HTMLElement>('.wps-insert')!
  expect(revision.dataset.sealRevisionAuthor).toBe('作者甲'); expect(Number.isFinite(Date.parse(revision.dataset.sealRevisionDate!))).toBe(true)
  expect(screen.getByText(/修订历史（1）/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: `接受修订${revision.dataset.sealRevisionId}` }))
  await waitFor(() => expect(root.querySelector('.wps-insert')).toBeNull()); expect(root.textContent).toBe('正文新增')
  await userEvent.click(screen.getByRole('tab', { name: '开始' })); await userEvent.click(screen.getByRole('button', { name: /^撤销$/ }))
  expect(root.querySelector('.wps-insert')!.textContent).toBe('新增')
}, 30000)

it('真实粘贴替换保留原文删除历史与新内容格式，块级粘贴明确保护原文', async () => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { office } })
  const { container } = renderEditor('<p>前<b>原文字</b>后</p>'); await userEvent.click(screen.getByText('打开修订测试'))
  await userEvent.click(screen.getByRole('tab', { name: '审阅' })); await userEvent.click(screen.getByRole('button', { name: /^修订$/ }))
  const root = container.querySelector<HTMLElement>('.wps-editor-canvas__content')!, old = root.querySelector('b')!.firstChild!, range = document.createRange(); range.selectNodeContents(old); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
  const paste = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(paste, 'clipboardData', { value: { getData: (format: string) => format === 'text/html' ? '<em>新文字</em>' : '新文字' } })
  act(() => { root.dispatchEvent(paste) })
  expect(paste.defaultPrevented).toBe(true); expect(root.querySelector('.wps-delete')?.textContent).toBe('原文字'); expect(root.querySelector('.wps-insert em')?.textContent).toBe('新文字')
  const model = htmlToDocxModel(root.innerHTML), bytes = await 生成docx(model), read = await 读取docx(bytes)
  expect(read.html).toContain('原文字'); expect(read.html).toContain('新文字'); expect(read.html).toContain('data-seal-revision-type="del"')
  const before = root.innerHTML, blocked = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(blocked, 'clipboardData', { value: { getData: () => '<table><tr><td>复杂结构</td></tr></table>' } })
  act(() => { root.dispatchEvent(blocked) }); expect(blocked.defaultPrevented).toBe(true); expect(root.innerHTML).toBe(before)
}, 30000)
