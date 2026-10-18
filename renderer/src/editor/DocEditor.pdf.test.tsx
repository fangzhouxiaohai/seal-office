import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import { AppProvider, useAppStore } from '../store'
vi.mock('../pdf/PdfViewer', () => ({ default: ({ 数据 }: { 数据: string }) => <div data-testid="pdf-preview">{数据}</div> }))
const load = createRequire(import.meta.url), { 生成docx } = load('../../../main/office/docxWriter'), { 读取docx } = load('../../../main/office/docxReader'), { complexWord } = load('../../../main/office/__fixtures__/complexWord.cjs')
const pdf = btoa('%PDF-1.4\nlocal-fixture\n%%EOF'), image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSPsAAAAASUVORK5CYII='
afterEach(() => { Reflect.deleteProperty(window, 'electronAPI'); vi.restoreAllMocks() })
function open(html: string, page?: any) { const Open = () => { const store = useAppStore(); return <button onClick={() => store.createDoc('word', html, { 名称: 'PDF测试.docx', 页面设置: page })}>打开PDF测试</button> }; return render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><Open /><DocEditor /></AppProvider></AntdApp></ConfigProvider>) }
function bridge() { const api = { office: { writeCompatible: vi.fn().mockResolvedValue({ 成功: false, 错误: '未登录，兼容引擎不可用' }) }, printPreview: vi.fn(async (_data: string, _format: string) => ({ 成功: true, 数据: pdf })), showSaveDialog: vi.fn().mockResolvedValue('C:\\qa\\离线.pdf'), saveToFile: vi.fn().mockResolvedValue({ 成功: true }), readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: pdf, 二进制: true, 扩展名: '.pdf' }), recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }) }; Object.defineProperty(window, 'electronAPI', { configurable: true, value: api }); return api }
it('普通离线文字含图片/脚注尾注沿用本机PDF，预览和导出重用同一模型PDF缓存', async () => {
  const api = bridge(), read = await 读取docx(await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '普通离线文字' }, { 文本: '', 注释引用: { 类型: 'footnote', 标识: 1 } }, { 文本: '', 注释引用: { 类型: 'endnote', 标识: 2 } }] }], 注释: [{ 类型: 'footnote', 标识: 1, 段落: [{ 类型: '段落', 文字: [{ 文本: '离线脚注' }] }] }, { 类型: 'endnote', 标识: 2, 段落: [{ 类型: '段落', 文字: [{ 文本: '离线尾注' }] }] }] }))
  const container = document.createElement('div'); container.innerHTML = read.html; container.querySelector('p')!.append(Object.assign(document.createElement('img'), { src: image, width: 1, height: 1 }))
  open(container.innerHTML, read.页面设置); await userEvent.click(screen.getByText('打开PDF测试')); await userEvent.click(screen.getByRole('button', { name: /^打印$/ }))
  await waitFor(() => expect(api.printPreview.mock.calls.some(call => call[1] === 'html')).toBe(true))
  const html = api.printPreview.mock.calls.find(call => call[1] === 'html')![0]; expect(html).toContain('普通离线文字'); expect(html).toContain('离线脚注'); expect(html).toContain('离线尾注'); expect(html).toContain(image); expect(html).not.toContain('data-seal-docx-package')
  expect(api.office.writeCompatible).not.toHaveBeenCalled(); await screen.findByTestId('pdf-preview'); await userEvent.click(screen.getByRole('button', { name: '关闭' })); await userEvent.click(screen.getByRole('button', { name: '导出为 PDF' }))
  await waitFor(() => expect(api.saveToFile).toHaveBeenCalledWith('C:\\qa\\离线.pdf', pdf, '二进制')); expect(api.printPreview.mock.calls.filter(call => call[1] === 'html')).toHaveLength(1); expect(api.office.writeCompatible).not.toHaveBeenCalled()
}, 20000)
it('普通文档另存PDF同样使用明确离线链路', async () => {
  const api = bridge(); open('<p>离线另存</p>'); await userEvent.click(screen.getByText('打开PDF测试')); await userEvent.click(screen.getByRole('button', { name: '另存为' })); await waitFor(() => expect(api.saveToFile).toHaveBeenCalledWith('C:\\qa\\离线.pdf', pdf, '二进制')); expect(api.printPreview.mock.calls.some(call => call[1] === 'html')).toBe(true); expect(api.office.writeCompatible).not.toHaveBeenCalled()
})
it('复杂来源打印/导出必须原生引擎，未登录错误不会触发HTML降级或保存成功', async () => {
  const api = bridge(), read = await 读取docx(await complexWord()); open(read.html, read.页面设置); await userEvent.click(screen.getByText('打开PDF测试')); await userEvent.click(screen.getByRole('button', { name: /^打印$/ })); await waitFor(() => expect(api.office.writeCompatible).toHaveBeenCalledTimes(1)); expect(await screen.findByText('未登录，兼容引擎不可用')).toBeInTheDocument(); expect(api.printPreview).not.toHaveBeenCalled(); expect(screen.queryByTestId('pdf-preview')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '导出为 PDF' })); await waitFor(() => expect(api.office.writeCompatible).toHaveBeenCalledTimes(2)); expect(api.printPreview).not.toHaveBeenCalled(); expect(api.saveToFile).not.toHaveBeenCalled()
}, 20000)