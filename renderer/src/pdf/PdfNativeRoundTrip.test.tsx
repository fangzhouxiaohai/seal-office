import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { 桥接 } from '../ipc/bridge'
import { 读取本地文件内容 } from '../fileOpen'
import { AppProvider, useAppStore } from '../store'
import PdfPage from '../pages/PdfPage'
import PdfWorkbench from './PdfWorkbench'

const require = createRequire(import.meta.url)
const { PDFDocument, PDFName, PDFHexString, PDFDict } = require('pdf-lib')
const codec = require('../../../main/office/sealFormat.js')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR7sAAAAASUVORK5CYII='
type 文件记录 = { 数据: string; 文件指纹: string }
const sha = (data: string) => createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex')
const 原生PDF任务 = new Set<Promise<unknown>>()
function 跟踪PDF任务<T>(任务: Promise<T>): Promise<T> {
  原生PDF任务.add(任务)
  void 任务.then(() => 原生PDF任务.delete(任务), () => 原生PDF任务.delete(任务))
  return 任务
}

// Production PDF tools execute in the Main process. Running them through a
// Node child also avoids jsdom's different Uint8Array realm rejecting otherwise
// valid PDF bytes inside pdf-lib; no PDF operation is replaced by a mock result.
function 执行原生PDF(操作: string, 数据: string, ...参数: unknown[]): Promise<string> {
  const program = "const tools=require(process.argv[1]);const task=JSON.parse(process.argv[2]);Promise.resolve(tools[task.operation](Buffer.from(task.data,'base64'),...task.args)).then(value=>process.stdout.write(value.toString('base64'))).catch(error=>{console.error(error.stack);process.exitCode=1})"
  return 跟踪PDF任务(new Promise<string>((完成, 失败) => execFile(process.execPath,
    ['-e', program, require.resolve('../../../main/pdf/pdfTools.js'), JSON.stringify({ operation: 操作, data: 数据, args: 参数 })],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30000 },
    (错误, stdout) => 错误 ? 失败(错误) : 完成(stdout))))
}

// Wait on the real Main-process adapter result inside act, rather than making
// child-process startup/IO fit Testing Library's one-second DOM polling window.
// The ordinary UI assertions below keep their original timeout and strict count.
async function 完成PDF操作(触发: () => void, 操作: { mock: { calls: unknown[][]; results: { type: string; value: unknown }[] } }) {
  await act(async () => {
    const 序号 = 操作.mock.calls.length
    触发()
    expect(操作.mock.calls).toHaveLength(序号 + 1)
    const 结果 = 操作.mock.results[序号]
    expect(结果.type).toBe('return')
    await 结果.value
  })
}

vi.mock('./PdfViewer', () => ({
  default: ({ 数据, 文件名 }: { 数据?: string; 文件名?: string }) =>
    <output data-testid="native-pdf-preview" data-pdf={数据 ?? ''}>{文件名 ?? '等待选择文件'}</output>,
}))

async function 复杂PDF() {
  const pdf = await PDFDocument.create()
  pdf.setTitle('海豹 PDF 原内容𠮷🦭')
  const page = pdf.addPage([500, 700])
  page.drawText('Original text', { x: 30, y: 650 })
  const image = await pdf.embedPng(png)
  page.drawImage(image, { x: 40, y: 500, width: 24, height: 24 })
  page.node.addAnnot(pdf.context.register(pdf.context.obj({
    Type: PDFName.of('Annot'), Subtype: PDFName.of('Text'), Rect: [30, 500, 60, 530],
    Contents: PDFHexString.fromText('原始批注𠮷🦭'),
  })))
  pdf.addPage([500, 700]).drawText('Second page')
  await pdf.attach(new Uint8Array([0, 1, 2, 127, 255]), 'original.bin')
  return Buffer.from(await pdf.save()).toString('base64')
}

function 安装边界(文件 = new Map<string, 文件记录>()) {
  const 保存对话框 = vi.spyOn(桥接, 'showSaveDialog').mockResolvedValue(null)
  const 保存 = vi.spyOn(桥接, 'saveToFile').mockImplementation(async (路径, 数据, 格式, 预期指纹) => {
    expect(格式).toBe('二进制')
    if (预期指纹 && 文件.get(路径)?.文件指纹 !== 预期指纹) return { 成功: false, 错误: '文件已被其他程序修改，未覆盖原件' }
    const 内容 = typeof 数据 === 'string' ? 数据 : Buffer.from(数据).toString('base64')
    const 文件指纹 = sha(内容)
    文件.set(路径, { 数据: 内容, 文件指纹 })
    return { 成功: true, 路径, 文件指纹 }
  })
  vi.spyOn(桥接, 'readFile').mockImplementation(async 路径 => {
    const 记录 = 文件.get(路径)
    return 记录 ? { 成功: true, 内容: 记录.数据, 二进制: true, 扩展名: 路径.split('.').pop(), 文件指纹: 记录.文件指纹 } : { 成功: false, 错误: '不存在的测试文件' }
  })
  vi.spyOn(桥接.office, 'readSeal').mockImplementation(async (扩展, 数据) => ({ 成功: true, ...await codec.readSeal(扩展, Buffer.from(数据, 'base64')) }))
  vi.spyOn(桥接.office, 'writeSeal').mockImplementation(async (类型, 数据) => ({ 成功: true, 数据: (await codec.writeSeal(类型, 数据)).toString('base64') }))
  const 编辑 = vi.spyOn(桥接.pdf, 'editPage').mockImplementation((数据, 参数) => 跟踪PDF任务((async () => ({ 成功: true, 数据: await 执行原生PDF('编辑页面', 数据, 参数) }))()))
  const 插页 = vi.spyOn(桥接.pdf, 'insertBlank').mockImplementation((数据, 位置) => 跟踪PDF任务((async () => ({ 成功: true, 数据: await 执行原生PDF('插入空白页', 数据, 位置) }))()))
  return { 文件, 保存, 保存对话框, 编辑, 插页 }
}

beforeEach(() => {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => nativeGetComputedStyle(element))
})
afterEach(async () => {
  try {
    // Even a failed UI assertion must drain its child and adapter before the
    // next case installs new bridge spies; no late save dialog may cross cases.
    await act(async () => { while (原生PDF任务.size) await Promise.allSettled([...原生PDF任务]) })
    expect(原生PDF任务.size).toBe(0)
  } finally { vi.restoreAllMocks() }
})

it('HTML 文件选择器实际解包 SPDF，保留完整 PDF 字节并拒绝损坏容器', async () => {
  安装边界()
  const PDF数据 = await 复杂PDF()
  const 警告=['原始 OFD 转换保真记录'],容器 = await codec.writeSeal('pdf', { PDF数据, 警告 })
  const 添加 = vi.fn()
  render(<AntdApp><PdfWorkbench onAdded={添加} /></AntdApp>)
  const input = screen.getByLabelText('选择 PDF 文件') as HTMLInputElement
  expect(input.accept).toContain('.spdf')
  fireEvent.change(input, { target: { files: [new File([容器], '原生.SPДF.spdf')] } })
  await waitFor(() => expect(添加).toHaveBeenCalledWith({ 路径: null, 名称: '原生.SPДF.spdf', 数据: PDF数据, 警告 }))
  expect(screen.getByTestId('native-pdf-preview')).toHaveAttribute('data-pdf', PDF数据)
  fireEvent.change(input, { target: { files: [new File(['%PDF-1.7'], '损坏.spdf')] } })
  expect(await screen.findByRole('dialog', { name: 'PDF 文件读取失败' })).toBeInTheDocument()
  expect(添加).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('native-pdf-preview')).toHaveAttribute('data-pdf', PDF数据)
})

it('原生 PDF 经真实批注、插图和插页后 Ctrl+S 保存原路径，重开完整保留字节和对象', async () => {
  const 边界 = 安装边界()
  const 路径 = 'D:/原生文档/复杂𠮷.spdf'
  const 初始PDF = await 复杂PDF()
  const 警告=['原始来源转换时存在无法还原的绘图'],初始容器 = (await codec.writeSeal('pdf', { PDF数据: 初始PDF, 警告 })).toString('base64')
  边界.文件.set(路径, { 数据: 初始容器, 文件指纹: sha(初始容器) })
  let 状态: ReturnType<typeof useAppStore>
  function 入口() {
    状态 = useAppStore()
    return <button onClick={() => void (async () => {
      const 文档 = await 读取本地文件内容(路径)
      状态.createDoc('pdf', 文档.内容, { 路径, 文件指纹: 文档.文件指纹, 警告: 文档.警告 })
    })()}>打开原生测试</button>
  }
  render(<AntdApp><AppProvider 初始最近文档={[]}><入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开原生测试'))
  await waitFor(() => expect(screen.getByTestId('native-pdf-preview')).toHaveAttribute('data-pdf', 初始PDF))
  fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '编辑操作' }))
  fireEvent.click(await screen.findByText('添加可见批注'))
  fireEvent.change(screen.getByRole('textbox', { name: '文字内容' }), { target: { value: 'NEW_NOTE_2026' } })
  await 完成PDF操作(() => fireEvent.click(screen.getByRole('button', { name: '编辑并另存' })), 边界.编辑)
  await waitFor(() => expect(边界.保存对话框).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByRole('button', { name: '编辑并另存' })).not.toHaveClass('ant-btn-loading'))
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '编辑操作' }))
  fireEvent.click(await screen.findByText('插入图片'))
  fireEvent.change(screen.getByLabelText('选择插入图片'), { target: { files: [new File([Buffer.from(png, 'base64')], '图像.png', { type: 'image/png' })] } })
  await screen.findByText('图片已就绪')
  await 完成PDF操作(() => fireEvent.click(screen.getByRole('button', { name: '编辑并另存' })), 边界.编辑)
  await waitFor(() => expect(边界.保存对话框).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: '编辑并另存' })).not.toHaveClass('ant-btn-loading'))
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'PDF 操作' }))
  fireEvent.click(await screen.findByText('插入空白页'))
  await 完成PDF操作(() => fireEvent.click(screen.getByRole('button', { name: '执行并保存' })), 边界.插页)
  await waitFor(() => expect(边界.保存对话框).toHaveBeenCalledTimes(3))
  await waitFor(() => expect(screen.getByRole('button', { name: '保存 PDF' })).toBeEnabled())
  expect(边界.保存).not.toHaveBeenCalled()
  expect(状态!.pdfDocuments[0].dirty).toBe(true)
  const 修改字节 = 状态!.pdfDocuments[0].data!
  expect(修改字节).not.toBe(初始PDF)
  fireEvent.keyDown(document, { key: 's', code: 'KeyS', ctrlKey: true })
  await waitFor(() => expect(边界.保存).toHaveBeenCalledOnce())
  await waitFor(() => expect(状态!.pdfDocuments[0].dirty).toBe(false))
  expect(边界.保存.mock.calls[0][0]).toBe(路径)
  expect(边界.保存.mock.calls[0][3]).toBe(sha(初始容器))
  expect(状态!.pdfDocuments[0].文件指纹).toBe(边界.文件.get(路径)!.文件指纹)
  expect(边界.保存对话框).toHaveBeenCalledTimes(3)
  const 重开 = await 读取本地文件内容(路径)
  expect(重开.内容).toBe(修改字节)
  expect(重开.警告).toEqual(警告)
  expect(状态!.pdfDocuments[0].警告).toEqual(警告)
  const pdf = await PDFDocument.load(重开.内容)
  expect(pdf.getPageCount()).toBe(3)
  expect(pdf.getTitle()).toBe('海豹 PDF 原内容𠮷🦭')
  const 原始页 = pdf.getPage(1)
  const annotations = 原始页.node.Annots()
  const annotation = pdf.context.lookup(annotations.get(0), PDFDict)
  expect(annotation.lookup(PDFName.of('Contents')).decodeText()).toBe('原始批注𠮷🦭')
  const images = 原始页.node.Resources().lookup(PDFName.of('XObject'), PDFDict)
  expect(images.keys().length).toBe(2)
  expect(pdf.catalog.lookup(PDFName.of('Names'), PDFDict).has(PDFName.of('EmbeddedFiles'))).toBe(true)
})

it.each(['.spdf', '.pdf'])('当前 %s 文档普通保存使用原路径和新指纹，外部修改后拒绝覆盖并保留未保存状态', async 扩展 => {
  const 边界 = 安装边界()
  const 数据 = await 复杂PDF(), 路径 = 'D:/文档/原件' + 扩展
  const 磁盘字节 = 扩展 === '.pdf' ? 数据 : (await codec.writeSeal('pdf', { PDF数据: 数据 })).toString('base64')
  边界.文件.set(路径, { 数据: 磁盘字节, 文件指纹: sha(磁盘字节) })
  let 状态: ReturnType<typeof useAppStore>
  function 入口() { 状态 = useAppStore(); return <button onClick={() => 状态.createDoc('pdf', 数据, { 路径, 文件指纹: sha(磁盘字节) })}>打开当前文档</button> }
  render(<AntdApp><AppProvider 初始最近文档={[]}><入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开当前文档'))
  await screen.findByRole('button', { name: '保存 PDF' })
  fireEvent.click(screen.getByRole('button', { name: '保存 PDF' }))
  await waitFor(() => expect(边界.保存).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole('button', { name: '保存 PDF' })).toBeEnabled())
  expect(边界.保存对话框).not.toHaveBeenCalled()
  const 最新指纹 = 边界.文件.get(路径)!.文件指纹
  expect(状态!.pdfDocuments[0].文件指纹).toBe(最新指纹)
  if (扩展 === '.pdf') expect(边界.文件.get(路径)!.数据).toBe(数据)
  边界.文件.set(路径, { 数据: '外部字节不能被覆盖', 文件指纹: 'external-change' })
  await act(async () => { 状态!.更新PDF内容(状态!.pdfDocuments[0].id, await 执行原生PDF('插入空白页', 数据, 1)) })
  fireEvent.keyDown(document, { key: 's', ctrlKey: true })
  expect(await screen.findByRole('dialog', { name: 'PDF 保存失败' })).toBeInTheDocument()
  expect(边界.保存.mock.calls[1][3]).toBe(最新指纹)
  expect(边界.文件.get(路径)!.数据).toBe('外部字节不能被覆盖')
  expect(状态!.pdfDocuments[0].dirty).toBe(true)
})

it('未命名 PDF 的 Ctrl+S 使用另存为，默认 SPDF；占用其他标签路径时在写盘前拒绝', async () => {
  const 边界 = 安装边界(), 数据 = await 复杂PDF()
  边界.保存对话框.mockResolvedValue('D:/文档/新文档')
  let 状态: ReturnType<typeof useAppStore>
  function 入口() { 状态 = useAppStore(); return <button onClick={() => 状态.createDoc('pdf', 数据, { 名称: '未命名.spdf' })}>新建待保存</button> }
  render(<AntdApp><AppProvider 初始最近文档={[]}><入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('新建待保存'))
  await waitFor(() => expect(screen.getByRole('button', { name: '保存 PDF' })).toBeEnabled())
  fireEvent.keyDown(document, { key: 's', ctrlKey: true })
  await waitFor(() => expect(边界.保存).toHaveBeenCalledOnce())
  await waitFor(() => expect(状态!.pdfDocuments[0].path).toBe('D:/文档/新文档.spdf'))
  expect(边界.保存对话框).toHaveBeenCalledWith('未命名.spdf', 'pdf')
  expect((await codec.readSeal('spdf', Buffer.from(边界.文件.get('D:/文档/新文档.spdf')!.数据, 'base64'))).PDF数据).toBe(数据)
  await act(async () => { 状态!.createDoc('pdf', 数据, { 路径: 'D:/文档/第二个.spdf' }) })
  边界.保存对话框.mockResolvedValue('D:/文档/新文档.spdf')
  fireEvent.keyDown(document, { key: 's', ctrlKey: true, shiftKey: true })
  const modal = await screen.findByRole('dialog', { name: 'PDF 保存失败' })
  expect(within(modal).getByText(/目标路径已在/)).toBeInTheDocument()
  expect(边界.保存).toHaveBeenCalledOnce()
  expect(状态!.pdfDocuments).toHaveLength(2)
})

it('写盘期间新编辑不会被旧保存快照覆盖或错误标成已保存', async () => {
  const 边界 = 安装边界(), 数据 = await 复杂PDF()
  const 新数据 = await 执行原生PDF('插入空白页', 数据, 1)
  let 完成写盘: ((value: { 成功: boolean; 文件指纹: string }) => void) | undefined
  边界.保存.mockImplementation(() => new Promise<{ 成功: boolean; 文件指纹: string }>(resolve => { 完成写盘 = resolve }))
  let 状态: ReturnType<typeof useAppStore>
  function 入口() { 状态 = useAppStore(); return <button onClick={() => 状态.createDoc('pdf', 数据, { 路径: 'D:/文档/并发.spdf', 文件指纹: 'old-disk' })}>打开并发文档</button> }
  render(<AntdApp><AppProvider 初始最近文档={[]}><入口 /><PdfPage /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开并发文档'))
  await waitFor(() => expect(screen.getByRole('button', { name: '保存 PDF' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '保存 PDF' }))
  await waitFor(() => expect(完成写盘).toBeDefined())
  await act(async () => { 状态!.更新PDF内容(状态!.pdfDocuments[0].id, 新数据) })
  await act(async () => { 完成写盘!({ 成功: true, 文件指纹: 'saved-snapshot-fingerprint' }) })
  await waitFor(() => expect(状态!.pdfDocuments[0].文件指纹).toBe('saved-snapshot-fingerprint'))
  expect(状态!.pdfDocuments[0].data).toBe(新数据)
  expect(状态!.pdfDocuments[0].dirty).toBe(true)
  expect(screen.getByTestId('native-pdf-preview')).toHaveAttribute('data-pdf', 新数据)
  const 保存负载 = await codec.readSeal('spdf', Buffer.from(边界.保存.mock.calls[0][1] as string, 'base64'))
  expect(保存负载.PDF数据).toBe(数据)
})
