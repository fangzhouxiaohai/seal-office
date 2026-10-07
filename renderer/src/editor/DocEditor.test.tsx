import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import GlobalTabs from '../components/GlobalTabs'
import { AppProvider, useAppStore } from '../store'

const 渲染编辑器 = () =>
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <AppProvider>
          <DocEditor />
          <GlobalTabs />
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
          <GlobalTabs />
        </AppProvider>
      </AntdApp>
    </ConfigProvider>
  )
}

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI')
})

describe('编辑器容器', () => {
  it('图片对齐更新未保存状态，并可撤销、重做', async () => {
    const 创建入口 = () => {
      const { createDoc } = useAppStore()
      return <button onClick={() => createDoc('word', '<p>前文<img width="120" height="80" alt="位置核验">后文</p>', { 路径: 'C:\\资料\\图片.docx' })}>打开图片文档</button>
    }
    const { container } = render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><创建入口 /><DocEditor /><GlobalTabs /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开图片文档' }))
    const 根 = container.querySelector('.wps-editor-canvas__content')!
    const 图 = 根.querySelector('img')!
    vi.spyOn(图, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 200, left: 100, top: 200, width: 120, height: 80, right: 220, bottom: 280, toJSON: () => ({}) })
    expect(container.querySelector('.wps-global-tab__dirty')).toBeNull()
    await userEvent.click(图)
    await userEvent.click(within(screen.getByRole('toolbar', { name: '图片工具' })).getByRole('button', { name: '居中' }))
    expect(根.querySelector('img')?.parentElement?.style.textAlign).toBe('center')
    expect(container.querySelector('.wps-global-tab__dirty')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(根.querySelector('p')).toHaveTextContent('前文后文')
    expect(根.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelector('.wps-global-tab__dirty')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(根.querySelector('img')?.parentElement?.style.textAlign).toBe('center')
    expect(container.querySelector('.wps-global-tab__dirty')).not.toBeNull()
  })

  it('图片入口直接选择本机文件，不再弹出无法保存 DOCX 的确认框', async () => {
    const 点击 = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    try {
      渲染编辑器()
      await userEvent.click(screen.getByRole('tab', { name: '插入' }))
      await userEvent.click(screen.getByRole('button', { name: '图片' }))
      expect(点击).toHaveBeenCalledOnce()
      expect(screen.queryByText('图片无法保存为 DOCX')).toBeNull()
    } finally { 点击.mockRestore() }
  })
  it('导航窗格列出文档标题并定位对应段落', async () => {
    const 创建入口 = () => {
      const { createDoc } = useAppStore()
      return <button onClick={() => createDoc('word', '<h1>项目计划</h1><p>正文</p><h2>交付安排</h2>')}>打开大纲文档</button>
    }
    const { container } = render(<AntdApp><AppProvider><创建入口 /><DocEditor /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开大纲文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    const 标题 = 编辑区.querySelectorAll('h1, h2')
    const 定位 = vi.fn()
    标题[1].scrollIntoView = 定位
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '导航窗格' }))
    const 窗格 = screen.getByRole('complementary', { name: '文档导航' })
    expect(container.querySelector('.wps-editor-canvas__content')).toBe(编辑区)
    expect(within(窗格).getByRole('button', { name: '交付安排' })).toBeInTheDocument()
    await userEvent.click(within(窗格).getByRole('button', { name: '交付安排' }))
    expect(定位).toHaveBeenCalled()
    await userEvent.click(within(窗格).getByRole('button', { name: '关闭导航窗格' }))
    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
  })

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

  it('导入文档保存后底部标签清除修改标记并可直接关闭', async () => {
    ;(window as any).electronAPI = {
      saveToFile: vi.fn().mockResolvedValue({ 成功: true }),
      recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      backupClear: vi.fn().mockResolvedValue({ 成功: true }),
    }
    const 创建入口 = () => {
      const { createDoc, workspaceTabs } = useAppStore()
      return <><button onClick={() => createDoc('word', '<p>导入正文</p>', {
        路径: 'C:\\资料\\导入.docx',
        页面设置: { 纸张: 'A4', 纸张方向: '纵向', 页边距: '常规', 分栏: '一栏', 页面边框: '无', 页面颜色: '无', 文字方向: '横排', 水印: '无' },
      })}>打开导入文档</button><span data-testid="修改状态">{workspaceTabs.some((项) => 项.dirty) ? '未保存' : '已保存'}</span></>
    }
    render(<AntdApp><AppProvider><创建入口 /><DocEditor /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开导入文档' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByText('文件已保存')
    expect(screen.getByTestId('修改状态')).toHaveTextContent('已保存')
    await userEvent.click(screen.getByRole('button', { name: '关闭 导入.docx' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '关闭 导入.docx' })).toBeNull())
    expect(screen.queryAllByText('文档有未保存的修改')).toHaveLength(0)
  })

  it('保存读取实际编辑内容并同步尚未触发输入事件的内容', async () => {
    ;(window as any).electronAPI = {
      saveToFile: vi.fn().mockResolvedValue({ 成功: true }),
      recentAdd: vi.fn().mockResolvedValue({ 成功: true, 数据: [] }),
      office: { writeDocx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'YQ==' }) },
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      backupSave: vi.fn().mockResolvedValue({ 成功: true }),
      backupClear: vi.fn().mockResolvedValue({ 成功: true }),
    }
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>保存时的实际正文</p>'
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByText('文件已保存')
    await userEvent.click(screen.getByRole('button', { name: '关闭 报告.docx' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '关闭 报告.docx' })).toBeNull())
    expect(screen.queryAllByText('文档有未保存的修改')).toHaveLength(0)
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
    const { container } = render(<AntdApp><AppProvider><导航 /><GlobalTabs /></AppProvider></AntdApp>)
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
  it('全局底部标签栏与 Ribbon、编辑区、状态栏共同渲染', () => {
    const { container } = 渲染编辑器()
    expect(container.querySelector('.wps-global-tabs')).not.toBeNull()
    expect(container.querySelector('.wps-doc-tabs')).toBeNull()
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

  it('邮件合并先预览再生成独立标签，原模板保留字段', async () => {
    const 创建入口 = () => {
      const { createDoc } = useAppStore()
      return <button onClick={() => createDoc('word', '<p><strong>您好，{{姓名}}</strong>：请到{{城市}}报到。</p>', { 路径: 'C:\\资料\\通知模板.docx' })}>打开邮件模板</button>
    }
    const { container } = render(<AntdApp><AppProvider><创建入口 /><DocEditor /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开邮件模板' }))
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '邮件合并' }))
    expect(screen.getByRole('button', { name: '生成新文档' })).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: '收件人数据' }), '姓名,城市{enter}张三,上海{enter}李四,北京')
    await userEvent.click(screen.getByRole('button', { name: /预\s*览/ }))
    const 预览 = screen.getByRole('region', { name: '合并预览' })
    expect(预览.textContent).toContain('您好，张三：请到上海报到')
    await userEvent.click(screen.getByRole('button', { name: '生成新文档' }))
    expect(container.querySelectorAll('.wps-global-tab')).toHaveLength(2)
    expect(container.querySelector('.wps-editor-canvas__content')?.textContent).toContain('您好，李四：请到北京报到')
    await userEvent.click(screen.getByRole('tab', { name: '通知模板.docx' }))
    expect(container.querySelector('.wps-editor-canvas__content')?.textContent).toContain('{{姓名}}')
  })

  // 文档写入器无法保存图形，插入前先说明适用格式并要求确认。
  it('图表插入前明确提示 DOCX 限制', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '图表' }))
    await userEvent.click(await screen.findByText('折线图'))
    expect((await screen.findAllByText('图表无法保存为 DOCX')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '仍要插入' }))
    expect(await screen.findByText(/已插入折线图/)).toBeInTheDocument()
  })

  it('公式插入前明确提示 DOCX 限制', async () => {
    渲染编辑器()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '公式' }))
    await userEvent.click(await screen.findByText('分数'))
    expect((await screen.findAllByText('公式无法保存为 DOCX')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '仍要插入' }))
    expect(await screen.findByText(/已插入「分数」公式/)).toBeInTheDocument()
  })

  it('脚注入口不插入假的注释标记', async () => {
    const { container } = 渲染编辑器()
    const 原文 = container.querySelector('.wps-editor-canvas__content')?.innerHTML
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '脚注' }))
    expect((await screen.findAllByText('脚注暂不可用')).length).toBeGreaterThan(0)
    expect(container.querySelector('.wps-editor-canvas__content')?.innerHTML).toBe(原文)
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

  it('全局标签栏在无文档时仍渲染新建入口', () => {
    渲染编辑器()
    expect(screen.getByRole('button', { name: '新建标签' })).toBeInTheDocument()
  })

  it('点击新建标签后出现一个底部文档标签', async () => {
    const { container } = 渲染编辑器()
    expect(container.querySelectorAll('.wps-global-tab')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: '新建标签' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: '新建文字' }))
    expect(container.querySelectorAll('.wps-global-tab')).toHaveLength(1)
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

  it('Ctrl+滚轮缩放页面内容，滚动条方向与浏览器习惯一致', async () => {
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 百分比 = () => screen.getByRole('button', { name: '恢复百分之百' }).textContent
    const 纸张 = () => container.querySelector('.wps-editor-canvas__paper') as HTMLElement
    const 滚 = (deltaY: number, ctrlKey = true) =>
      fireEvent(window, new WheelEvent('wheel', { deltaY, ctrlKey, cancelable: true }))

    expect(百分比()).toBe('100%')
    expect(纸张().style.transform).toContain('scale(1)')
    // 向上滚放大
    滚(-100)
    await waitFor(() => expect(百分比()).toBe('110%'))
    expect(纸张().style.transform).toContain('scale(1.1)')
    滚(-100)
    await waitFor(() => expect(百分比()).toBe('125%'))
    // 向下滚缩小
    滚(100)
    await waitFor(() => expect(百分比()).toBe('110%'))
    // 未按 Ctrl 的滚动不改变缩放
    滚(-100, false)
    await waitFor(() => expect(百分比()).toBe('110%'))
  })

  it('Ctrl+滚轮到达上下限后停在边界，可点状态栏恢复百分之百', async () => {
    const { container } = 渲染带创建入口的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开测试文档' }))
    const 百分比 = () => screen.getByRole('button', { name: '恢复百分之百' }).textContent
    // 按档位放大：12 档到 1000%，继续滚到上限 6400%
    for (let 次 = 0; 次 < 12; 次 += 1) {
      fireEvent(window, new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }))
    }
    await waitFor(() => expect(百分比()).toBe('1000%'))
    expect((container.querySelector('.wps-editor-canvas__paper') as HTMLElement).style.transform).toContain('scale(10)')
    for (let 次 = 0; 次 < 40; 次 += 1) {
      fireEvent(window, new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }))
    }
    await waitFor(() => expect(百分比()).toBe('6400%'))
    expect((container.querySelector('.wps-editor-canvas__paper') as HTMLElement).style.transform).toContain('scale(64)')
    await userEvent.click(screen.getByRole('button', { name: '恢复百分之百' }))
    await waitFor(() => expect(百分比()).toBe('100%'))
  })
})
