import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import { AppProvider, useAppStore } from '../store'

const 渲染编辑器 = () =>
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <AppProvider>
          <DocEditor />
        </AppProvider>
      </AntdApp>
    </ConfigProvider>
  )

const 渲染带创建入口的编辑器 = () => {
  const 创建入口 = () => {
    const { createDoc } = useAppStore()
    return <button onClick={() => createDoc('word', '<p>原文</p>', { 路径: 'C:\\资料\\报告.docx' })}>打开测试文档</button>
  }
  return render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <AppProvider>
          <创建入口 />
          <DocEditor />
        </AppProvider>
      </AntdApp>
    </ConfigProvider>
  )
}

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI')
})

describe('编辑器容器', () => {
  it('导入未保真内容时显示警告弹窗', async () => {
    const 创建入口 = () => {
      const { createDoc } = useAppStore()
      return <button onClick={() => createDoc('word', '<p>原文</p>', { 路径: 'C:\\资料\\报告.docx', 警告: ['图片尚未导入'] })}>打开带警告文档</button>
    }
    render(<AntdApp><AppProvider><创建入口 /><DocEditor /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开带警告文档' }))
    expect((await screen.findAllByText('文档内容可能未完整导入')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('图片尚未导入').length).toBeGreaterThan(0)
  })

  it('关闭已修改的标签前要求确认，取消后保留文档', async () => {
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>修改后的正文</p>'
    fireEvent.input(编辑区)
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    expect((await screen.findAllByText('文档有未保存的修改')).length).toBeGreaterThan(0)
    const 取消按钮 = await screen.findAllByRole('button', { name: '取消' })
    await userEvent.click(取消按钮[取消按钮.length - 1])
    expect(screen.getByRole('button', { name: '关闭 报告.docx' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    const 放弃按钮 = await screen.findAllByRole('button', { name: '放弃修改' })
    await userEvent.click(放弃按钮[放弃按钮.length - 1])
    await waitFor(() => expect(screen.queryByRole('button', { name: '关闭 报告.docx' })).toBeNull())
  })

  it('保存成功后以已保存内容为基准，关闭时不再提示', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    ;(window as any).electronAPI = {
      saveToFile: 写入,
      recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      backupClear: vi.fn().mockResolvedValue({ 成功: true }),
    }
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>修改后的正文</p>'
    fireEvent.input(编辑区)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '关闭 报告.docx' })).toBeNull())
    expect(screen.queryAllByText('文档有未保存的修改')).toHaveLength(0)
  })

  it('保存过程中继续输入不会被保存完成时的旧内容覆盖', async () => {
    let 完成写入!: (结果: { 成功: boolean }) => void
    const 写入 = vi.fn(() => new Promise<{ 成功: boolean }>((完成) => { 完成写入 = 完成 }))
    ;(window as any).electronAPI = {
      saveToFile: 写入,
      recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      backupClear: vi.fn().mockResolvedValue({ 成功: true }),
    }
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>开始保存的内容</p>'
    fireEvent.input(编辑区)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalledTimes(1))
    编辑区.innerHTML = '<p>保存中继续输入的内容</p>'
    fireEvent.input(编辑区)
    await act(async () => { 完成写入({ 成功: true }) })
    expect(编辑区.textContent).toBe('保存中继续输入的内容')
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    expect((await screen.findAllByText('文档有未保存的修改')).length).toBeGreaterThan(0)
  })

  it('保存失败后仍将修改视为未保存', async () => {
    ;(window as any).electronAPI = {
      saveToFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '磁盘已满' }),
      office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      backupClear: vi.fn().mockResolvedValue({ 成功: true }),
    }
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>修改后的正文</p>'
    fireEvent.input(编辑区)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByText(/磁盘已满/)
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    expect((await screen.findAllByText('文档有未保存的修改')).length).toBeGreaterThan(0)
  })

  it('修改后返回首页再打开，关闭标签仍提示未保存', async () => {
    const 路径 = 'C:\\资料\\报告.docx'
    const 最近记录 = { id: 'recent-report', name: '报告.docx', type: 'word' as const, size: 0, updatedAt: '2026-10-03', starred: false, shared: false, 路径 }
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('word', '<p>原文</p>', { 路径 })}>首次打开</button>
        <button onClick={状态.goHome}>返回首页</button>
        <button onClick={() => void 状态.openDoc(最近记录)}>再次打开</button>
        {状态.module === 'word' ? <DocEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('首次打开'))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>未保存的正文</p>'
    fireEvent.input(编辑区)
    await userEvent.click(screen.getByText('返回首页'))
    await userEvent.click(screen.getByText('再次打开'))
    await waitFor(() => expect(container.querySelector('.wps-editor-canvas__content')?.textContent).toContain('未保存的正文'))
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    expect((await screen.findAllByText('文档有未保存的修改')).length).toBeGreaterThan(0)
  })
  it('同时渲染标签栏、Ribbon、编辑区与状态栏', () => {
    const { container } = 渲染编辑器()
    expect(container.querySelector('.wps-doc-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-ribbon-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-ribbon-panel')).not.toBeNull()
    expect(container.querySelector('.wps-editor-canvas__content')).not.toBeNull()
    expect(container.querySelector('.wps-editor-status')).not.toBeNull()
  })

  it('默认展示开始标签的功能组', () => {
    渲染编辑器()
    expect(screen.getByText('剪贴板')).toBeInTheDocument()
    expect(screen.getByText('字体')).toBeInTheDocument()
  })

  it('点击插入标签后功能区切换', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    const 功能区 = document.querySelector('.wps-ribbon-panel') as HTMLElement
    expect(within(功能区).queryByText('剪贴板')).toBeNull()
    expect(within(功能区).getByText('插图')).toBeInTheDocument()
  })

  it('点击翻译命令打开翻译面板', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '翻译' }))
    expect(await screen.findByPlaceholderText('在此输入要翻译的内容')).toBeInTheDocument()
  })

  // jsdom 不支持 execCommand 的真实插入，因此这里只验证命令被正确派发并给出中文提示，
  // 图形与公式是否真正写入文档由运行窗口验证。
  it('插入图表命令给出中文提示', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '图表' }))
    await userEvent.click(await screen.findByText('折线图'))
    expect(await screen.findByText(/已插入折线图/)).toBeInTheDocument()
  })

  it('插入公式命令给出中文提示', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '公式' }))
    await userEvent.click(await screen.findByText('分数'))
    expect(await screen.findByText(/已插入「分数」公式/)).toBeInTheDocument()
  })

  it('保护文档后编辑区转为只读', async () => {
    const { container } = 渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '保护文档' }))
    expect(await screen.findByText(/已开启文档保护/)).toBeInTheDocument()
    const 编辑区 = container.querySelector('.wps-editor-canvas__content')
    expect(编辑区?.getAttribute('contenteditable')).toBe('false')
  })

  it('点击查找命令后展开查找面板', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('button', { name: '查找' }))
    expect(await screen.findByPlaceholderText('查找内容')).toBeInTheDocument()
  })

  it('标签栏在无文档时仍渲染新建入口', () => {
    渲染编辑器()
    expect(screen.getByRole('button', { name: '新建文档' })).toBeInTheDocument()
  })

  it('点击新建文档后出现一个文档标签', async () => {
    const { container } = 渲染编辑器()
    expect(container.querySelectorAll('.wps-doc-tab')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(container.querySelectorAll('.wps-doc-tab')).toHaveLength(1)
  })

  it('状态栏展示字数统计', () => {
    渲染编辑器()
    expect(screen.getByText(/字数：/)).toBeInTheDocument()
  })

  it('切换视图模式命令改变状态栏展示', async () => {
    const { container } = 渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '阅读版式' }))
    const 状态栏 = container.querySelector('.wps-editor-status') as HTMLElement
    expect(within(状态栏).getByText('阅读版式')).toBeInTheDocument()
  })

  it('渲染标尺', () => {
    const { container } = 渲染编辑器()
    expect(container.querySelector('.wps-ruler')).not.toBeNull()
  })
})
