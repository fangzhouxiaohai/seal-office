import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { describe, expect, it, vi } from 'vitest'
import PdfWorkbench from './PdfWorkbench'
import { 桥接 } from '../ipc/bridge'

vi.mock('./PdfViewer', () => ({
  default: ({ 数据, 文件名 }: { 数据?: string; 文件名?: string }) =>
    <div data-testid="pdf-preview">{数据 ? `${文件名} 已进入预览` : '等待选择文件'}</div>,
}))

describe('PDF 工作台', () => {
  it('取消另存路径仍保留处理后的编辑字节，原路径没有被覆盖', async () => {
    const 提取=vi.spyOn(桥接.pdf,'extract').mockResolvedValue({成功:true,数据:'JVBERi1lZGl0'})
    const 路径=vi.spyOn(桥接,'showSaveDialog').mockResolvedValue(null)
    const 保存=vi.spyOn(桥接,'saveToFile').mockResolvedValue({成功:true})
    const 编辑=vi.fn(),已保存=vi.fn()
    try{
      render(<AntdApp><PdfWorkbench 初始文件={{路径:'D:/原件.pdf',名称:'原件.pdf',数据:'JVBERi0='}} onEdited={编辑} onSaved={已保存}/></AntdApp>)
      fireEvent.click(screen.getByRole('button',{name:'展开 PDF 工具'}));fireEvent.click(screen.getByRole('button',{name:'执行并保存'}))
      await waitFor(()=>expect(编辑).toHaveBeenCalledWith('JVBERi1lZGl0'))
      expect(保存).not.toHaveBeenCalled();expect(已保存).not.toHaveBeenCalled()
    }finally{提取.mockRestore();路径.mockRestore();保存.mockRestore()}
  })
  it('接收首页打开的 PDF，并在再次打开时切换预览', async () => {
    const { rerender } = render(<AntdApp><PdfWorkbench 初始文件={{ 路径: 'C:\\文档\\甲.pdf', 名称: '甲.pdf', 数据: 'JVBERi0x' }} /></AntdApp>)
    expect(await screen.findByText('甲.pdf 已进入预览')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
    expect(screen.getByRole('button', { name: '预览 甲.pdf' })).toBeInTheDocument()

    rerender(<AntdApp><PdfWorkbench 初始文件={{ 路径: 'C:\\文档\\乙.pdf', 名称: '乙.pdf', 数据: 'JVBERi0y' }} /></AntdApp>)
    expect(await screen.findByText('乙.pdf 已进入预览')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '预览 甲.pdf' })).toBeInTheDocument()
  })

  it('选择本地 PDF 后显示文件名并交给阅读器预览', async () => {
    const 文件 = new File(['%PDF-1.7'], '资料.pdf', { type: 'application/pdf' })
    const { container } = render(<AntdApp><PdfWorkbench /></AntdApp>)
    const 选择器 = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(选择器, { target: { files: [文件] } })

    expect(await screen.findByText('资料.pdf 已进入预览')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
    expect(screen.getByRole('button', { name: '移除 资料.pdf' })).toBeInTheDocument()
  })

  it('无关操作参数隐藏，合并时能预览选中的文件', async () => {
    const 文件甲 = new File(['%PDF-1.7'], '甲.pdf', { type: 'application/pdf' })
    const 文件乙 = new File(['%PDF-1.7'], '乙.pdf', { type: 'application/pdf' })
    const { container } = render(<AntdApp><PdfWorkbench /></AntdApp>)
    const 选择器 = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(选择器, { target: { files: [文件甲, 文件乙] } })
    await waitFor(() => expect(screen.getByText('甲.pdf 已进入预览')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
    fireEvent.click(screen.getByRole('button', { name: '预览 乙.pdf' }))
    expect(screen.getByText('乙.pdf 已进入预览')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'PDF 操作' }))
    fireEvent.click(await screen.findByText('合并文件'))
    expect(screen.queryByRole('textbox', { name: '处理页码' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '旋转角度' })).not.toBeInTheDocument()
  })

  it('右侧工具栏默认收起，可按操作图标展开并再次折叠', () => {
    const { container } = render(<AntdApp><PdfWorkbench /></AntdApp>)
    expect(container.querySelector('.pdf-workbench')?.className).toContain('pdf-workbench--collapsed')
    expect(screen.getByRole('button', { name: '提取页面' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'PDF 操作' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '提取页面' }))
    expect(container.querySelector('.pdf-workbench')?.className).not.toContain('pdf-workbench--collapsed')
    expect(screen.getByRole('combobox', { name: 'PDF 操作' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '收起 PDF 工具' }))
    expect(screen.queryByRole('combobox', { name: 'PDF 操作' })).not.toBeInTheDocument()
  })

  it('处理结果保存后通知外层打开已保存文件标签', async () => {
    const 提取 = vi.spyOn(桥接.pdf, 'extract').mockResolvedValue({ 成功: true, 数据: 'JVBERi0x' })
    const 路径 = vi.spyOn(桥接, 'showSaveDialog').mockResolvedValue('C:\\文档\\提取.pdf')
    const 保存 = vi.spyOn(桥接, 'saveToFile').mockResolvedValue({ 成功: true })
    const 已保存 = vi.fn()
    try {
      render(<AntdApp><PdfWorkbench 初始文件={{ 路径: 'C:\\文档\\原件.pdf', 名称: '原件.pdf', 数据: 'JVBERi0x' }} onSaved={已保存} /></AntdApp>)
      fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
      fireEvent.click(screen.getByRole('button', { name: '执行并保存' }))
      await waitFor(() => expect(已保存).toHaveBeenCalledWith('C:\\文档\\提取.pdf', 'JVBERi0x'))
      expect(保存).toHaveBeenCalledOnce()
    } finally {
      提取.mockRestore()
      路径.mockRestore()
      保存.mockRestore()
    }
  })

  it('处理结果拒绝保存到非 PDF 扩展名路径', async () => {
    const 提取 = vi.spyOn(桥接.pdf, 'extract').mockResolvedValue({ 成功: true, 数据: 'JVBERi0x' })
    const 路径 = vi.spyOn(桥接, 'showSaveDialog').mockResolvedValue('C:\\文档\\提取.txt')
    const 保存 = vi.spyOn(桥接, 'saveToFile').mockResolvedValue({ 成功: true })
    const 已保存 = vi.fn()
    try {
      render(<AntdApp><PdfWorkbench 初始文件={{ 路径: 'C:\\文档\\原件.pdf', 名称: '原件.pdf', 数据: 'JVBERi0x' }} onSaved={已保存} /></AntdApp>)
      fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
      fireEvent.click(screen.getByRole('button', { name: '执行并保存' }))
      expect(await screen.findByRole('dialog', { name: 'PDF 保存失败' })).toBeInTheDocument()
      expect(保存).not.toHaveBeenCalled()
      expect(已保存).not.toHaveBeenCalled()
    } finally {
      提取.mockRestore()
      路径.mockRestore()
      保存.mockRestore()
    }
  })

  it('处理结果保存路径没有扩展名时补齐 PDF', async () => {
    const 提取 = vi.spyOn(桥接.pdf, 'extract').mockResolvedValue({ 成功: true, 数据: 'JVBERi0x' })
    const 路径 = vi.spyOn(桥接, 'showSaveDialog').mockResolvedValue('C:\\文档\\提取')
    const 保存 = vi.spyOn(桥接, 'saveToFile').mockResolvedValue({ 成功: true })
    const 已保存 = vi.fn()
    try {
      render(<AntdApp><PdfWorkbench 初始文件={{ 路径: 'C:\\文档\\原件.pdf', 名称: '原件.pdf', 数据: 'JVBERi0x' }} onSaved={已保存} /></AntdApp>)
      fireEvent.click(screen.getByRole('button', { name: '展开 PDF 工具' }))
      fireEvent.click(screen.getByRole('button', { name: '执行并保存' }))
      await waitFor(() => expect(已保存).toHaveBeenCalledWith('C:\\文档\\提取.pdf', 'JVBERi0x'))
      expect(保存).toHaveBeenCalledWith('C:\\文档\\提取.pdf', expect.any(Uint8Array), '二进制')
    } finally {
      提取.mockRestore()
      路径.mockRestore()
      保存.mockRestore()
    }
  })

  it('选择非 PDF 文件时用弹窗说明原因且不加入列表', async () => {
    const 文件 = new File(['普通文本'], '说明.txt', { type: 'text/plain' })
    const 原样式读取 = window.getComputedStyle.bind(window)
    const 样式读取 = vi.spyOn(window, 'getComputedStyle').mockImplementation((节点) => 原样式读取(节点))
    const { container } = render(<AntdApp><PdfWorkbench /></AntdApp>)
    const 选择器 = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(选择器, { target: { files: [文件] } })

    const 弹窗 = await screen.findByRole('dialog', { name: '文件类型不受支持' })
    expect(within(弹窗).getByText('请选择 PDF 文件。未添加：说明.txt')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览 说明.txt' })).not.toBeInTheDocument()
    样式读取.mockRestore()
  })
})
