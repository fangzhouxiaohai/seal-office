import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import SheetEditor from './SheetEditor'
import GlobalTabs from '../components/GlobalTabs'
import { AppProvider, useAppStore } from '../store'
import { SheetStatusBar, SheetTabs } from './SheetChrome'
import { 设置数据验证 } from './model'

const 渲染表格 = () =>
  render(
    // 与 main.tsx 保持一致地启用 StrictMode，复现真实运行环境的副作用双执行
    <React.StrictMode>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntdApp>
          <AppProvider>
            <SheetEditor />
          </AppProvider>
        </AntdApp>
      </ConfigProvider>
    </React.StrictMode>
  )

describe('表格编辑器容器', () => {
  it('数据验证弹窗设置列表后拒绝公式栏非法输入，撤销可移除规则', async () => {
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 容器 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table', '<table><tr><td>待办</td></tr></table>')}>打开验证表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><容器 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开验证表格'))
    await userEvent.click(screen.getByRole('tab', { name: '数据' }))
    await userEvent.click(screen.getByRole('button', { name: '数据验证' }))
    const 选项 = await screen.findByLabelText('选项（每行一项）')
    await userEvent.type(选项, '待办{Enter}完成')
    const 对话框 = 选项.closest('[role="dialog"]') as HTMLElement
    await userEvent.click(within(对话框).getByRole('button', { name: '应用规则' }))
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.数据验证).toMatchObject({ 类型: '列表', 选项: ['待办', '完成'] })
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '错误状态' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.原始值).toBe('待办')
    await waitFor(() => expect(screen.getAllByText('输入不符合数据验证').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('tab', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.数据验证).toBeUndefined()
  })

  it('批量粘贴中任一单元格不符合验证时整批不写入', async () => {
    const 读取 = vi.fn(async () => '新值\t错误状态')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: 读取 } })
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 容器 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table', '<table><tr><td>旧值</td><td>允许</td></tr></table>')}>打开批量验证表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><容器 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开批量验证表格'))
    act(() => 状态!.更新表格文档模型(状态!.activeDocumentId!, (当前) => [
      设置数据验证(当前[0], 'B1', { 类型: '列表', 选项: ['允许'], 允许空白: false }),
    ]))
    fireEvent.keyDown(container.querySelector('.wps-sheet') as HTMLElement, { key: 'v', ctrlKey: true })
    await waitFor(() => expect(读取).toHaveBeenCalled())
    await waitFor(() => expect(screen.getAllByText('输入不符合数据验证').length).toBeGreaterThan(0))
    const 表 = 状态!.表格文档模型[状态!.activeDocumentId!][0]
    expect(表.单元格.A1.原始值).toBe('旧值')
    expect(表.单元格.B1.原始值).toBe('允许')
  })

  it('拼写检查列出选区问题并在确认后修正单元格', async () => {
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 容器 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table', '<table><tr><td>我们的的团队,已经完成</td></tr></table>')}>打开拼写表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><容器 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开拼写表格'))
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '拼写检查' }))
    expect(await screen.findByText('当前选区发现 2 处可修正的文字问题')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '全部修正' }))
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.原始值).toBe('我们的团队，已经完成')
  })

  it('保护工作表阻止键盘清空与格式修改，解除后恢复编辑', async () => {
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 容器 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table', '<table><tr><td>原值</td></tr></table>')}>打开保护表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><容器 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开保护表格'))
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '保护工作表' }))
    await waitFor(() => expect(screen.getAllByText('确认保护工作表').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: /^保\s*护$/ }))
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].保护).toBe('本机')
    fireEvent.keyDown(container.querySelector('.wps-sheet') as HTMLElement, { key: 'Delete' })
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.原始值).toBe('原值')
    await userEvent.click(screen.getByRole('tab', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.格式.加粗).toBeUndefined()
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '保护工作表' }))
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].保护).toBeUndefined()
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '已修改' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    expect(状态!.表格文档模型[状态!.activeDocumentId!][0].单元格.A1.原始值).toBe('已修改')
  })
  it('键盘复制和粘贴多行区域与功能区命令一致', async () => {
    let 剪贴内容 = ''
    const 写入 = vi.fn(async (文本: string) => { 剪贴内容 = 文本 })
    const 读取 = vi.fn(async () => 剪贴内容)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: 写入, readText: 读取 } })
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td><td>丁</td></tr></table>')}>打开剪贴板表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开剪贴板表格' }))
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(网格, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(网格, { key: 'c', ctrlKey: true })
    await waitFor(() => expect(写入).toHaveBeenCalledWith('甲\t乙\n丙\t丁'))
    await userEvent.click(container.querySelector('[data-地址="C3"]') as HTMLElement)
    fireEvent.keyDown(网格, { key: 'v', ctrlKey: true })
    await waitFor(() => expect(container.querySelector('[data-地址="D4"]')?.textContent).toBe('丁'))
  })
  it('冻结与筛选写入工作表模型，供文件保存使用', async () => {
    const 容器 = () => {
      const 状态 = useAppStore()
      const 表 = 状态.表格文档模型[状态.activeDocumentId ?? '']?.[0]
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>类别</td></tr><tr><td>甲</td></tr><tr><td>乙</td></tr></table>')}>打开测试表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
        <output data-testid="工作表模型">{JSON.stringify(表)}</output>
      </>
    }
    render(<AntdApp><AppProvider><容器 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开测试表格' }))
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '冻结窗格' }))
    await userEvent.click(screen.getByRole('tab', { name: '数据' }))
    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    const 输入 = await screen.findByLabelText('仅显示该列中与输入值完全相同的行')
    await userEvent.type(输入, '甲')
    const 对话框 = 输入.closest('[role="dialog"]') as HTMLElement
    await userEvent.click(within(对话框).getByRole('button', { name: '应用筛选' }))
    const 模型 = JSON.parse(screen.getByTestId('工作表模型').textContent ?? '{}')
    expect(模型.冻结).toEqual({ 行: 1, 列: 0 })
    expect(模型.筛选).toEqual({ 列: 0, 值: '甲' })
  })
  it('返回首页后重新打开同一文件仍显示未保存的表格内容', async () => {
    const 路径 = 'C:\\资料\\预算.xlsx'
    const 最近记录 = { id: 'recent-budget', name: '预算.xlsx', type: 'table' as const, size: 0, updatedAt: '2026-10-03', starred: false, shared: false, 路径 }
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>原始值</td></tr></table>', { 路径 })}>首次打开表格</button>
        <button onClick={状态.goHome}>返回首页</button>
        <button onClick={() => void 状态.openDoc(最近记录)}>再次打开表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('首次打开表格'))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('原始值'))
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '未保存修改' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('未保存修改')
    await userEvent.click(screen.getByText('返回首页'))
    await userEvent.click(screen.getByText('再次打开表格'))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('未保存修改'))
  })

  it('打开第二份表格后保存仅写入第二份内容和路径', async () => {
    const writeXlsx = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    const saveToFile = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        office: { writeXlsx },
        saveToFile,
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>甲表</td></tr></table>', { 路径: 'C:\\资料\\甲.xlsx' })}>打开甲表</button>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>乙表</td></tr></table>', { 路径: 'C:\\资料\\乙.xlsx' })}>打开乙表</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开甲表'))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('甲表'))
    await userEvent.click(screen.getByText('打开乙表'))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('乙表'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(saveToFile).toHaveBeenCalledWith('C:\\资料\\乙.xlsx', 'UEsDBAo=', '二进制'))
    const 导出模型 = JSON.stringify(writeXlsx.mock.calls[writeXlsx.mock.calls.length - 1]?.[0])
    expect(导出模型).toContain('乙表')
    expect(导出模型).not.toContain('甲表')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('从多工作表文件切到单工作表文件时索引和选区回到首格', async () => {
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', [
          { 名称: '汇总', html: '<table><tr><td>1</td></tr></table>' },
          { 名称: '明细', html: '<table><tr><td>2</td></tr></table>' },
        ])}>打开多表</button>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>新文件</td></tr></table>')}>打开单表</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开多表'))
    await userEvent.click(screen.getByText('明细'))
    await userEvent.click(container.querySelector('[data-地址="B2"]') as HTMLElement)
    await userEvent.click(screen.getByText('打开单表'))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('新文件'))
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-sheet-tab--active')).toHaveLength(1)
  })

  it('工具栏打开另一文件时新建标签并保留原表格编辑内容', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\乙.xlsx'),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'UEsDBAo=', 二进制: true }),
        office: { readXlsx: vi.fn().mockResolvedValue({ 成功: true, 工作表列表: [{ 名称: '乙', html: '<table><tr><td>乙表</td></tr></table>' }] }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>甲表</td></tr></table>', { 路径: 'C:\\资料\\甲.xlsx' })}>打开甲表</button>
        <span data-testid="标签数">{状态.documents.length}</span>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开甲表'))
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '甲表未保存' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('乙表'))
    expect(screen.getByTestId('标签数')).toHaveTextContent('2')
    await userEvent.click(screen.getByRole('tab', { name: /甲.xlsx/ }))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('甲表未保存'))
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('关闭表格标签前确认，取消后保留当前表格', async () => {
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>未保存</td></tr></table>', { 路径: 'C:\\资料\\待办.xlsx' })}>打开表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开表格' }))
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '修改后' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    await userEvent.click(screen.getByRole('button', { name: '关闭 待办.xlsx' }))
    expect((await screen.findAllByText('文档有未保存的修改')).length).toBeGreaterThan(0)
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('修改后')
    const 取消 = await screen.findAllByRole('button', { name: /取\s*消/ })
    await userEvent.click(取消[取消.length - 1])
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('修改后')
    await waitFor(() => expect(screen.queryByText('关闭「待办.xlsx」将放弃尚未保存的内容。')).not.toBeInTheDocument())
  })

  it('从首页打开多工作表文件时显示全部工作表', async () => {
    const 导航 = () => {
      const 状态 = useAppStore()
      return 状态.module === 'table' ? <SheetEditor /> : <button onClick={() => 状态.createDoc('table', [
        { 名称: '汇总', html: '<table><tr><td>1</td></tr></table>' },
        { 名称: '明细', html: '<table><tr><td>2</td></tr></table>' },
      ])}>打开两表</button>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开两表'))
    await waitFor(() => expect(container.querySelectorAll('.wps-sheet-tab')).toHaveLength(2))
  })

  it('渲染 Ribbon 七标签', () => {
    渲染表格()
    ;['开始', '插入', '页面布局', '公式', '数据', '审阅', '视图'].forEach((名称) => {
      expect(screen.getByRole('tab', { name: 名称 })).toBeInTheDocument()
    })
  })

  it('视图命令冻结首行并拆分为两个独立滚动网格，再次点击可恢复', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '冻结窗格' }))
    expect((container.querySelector('[data-地址="A1"]') as HTMLElement).style.position).toBe('sticky')
    await userEvent.click(screen.getByRole('button', { name: '拆分' }))
    expect(container.querySelectorAll('.wps-sheet')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '拆分' }))
    expect(container.querySelectorAll('.wps-sheet')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '冻结窗格' }))
    expect((container.querySelector('[data-地址="A1"]') as HTMLElement).style.position).toBe('')
  })

  it('页面布局视图展示纸张预览并可返回普通网格', async () => {
    const { container } = 渲染表格()
    fireEvent.change(screen.getByLabelText('公式栏'), { target: { value: '打印内容' } })
    fireEvent.keyDown(screen.getByLabelText('公式栏'), { key: 'Enter' })
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '页面布局' }))
    expect(screen.getByRole('region', { name: '页面布局预览' })).toHaveTextContent('打印内容')
    expect(container.querySelector('.wps-sheet')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '普通' }))
    expect(container.querySelector('.wps-sheet')).not.toBeNull()
  })

  it('审阅批注可保存到选中单元格并在网格中查看', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('tab', { name: '审阅' }))
    await userEvent.click(screen.getByRole('button', { name: '批注' }))
    const 批注输入 = await screen.findByLabelText('批注内容')
    const 对话框 = 批注输入.closest('[role="dialog"]') as HTMLElement
    fireEvent.change(批注输入, { target: { value: '请复核' } })
    await userEvent.click(within(对话框).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')).toHaveAttribute('title', '批注：请复核'))
  })

  it('数据筛选只隐藏不匹配的行且可清除', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    for (const 值 of ['类别', '甲', '乙']) {
      fireEvent.change(公式栏, { target: { value: 值 } })
      fireEvent.keyDown(公式栏, { key: 'Enter' })
    }
    await userEvent.click(container.querySelector('[data-地址="A2"]') as HTMLElement)
    await userEvent.click(screen.getByRole('tab', { name: '数据' }))
    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    const 筛选输入 = await screen.findByLabelText('仅显示该列中与输入值完全相同的行')
    const 对话框 = 筛选输入.closest('[role="dialog"]') as HTMLElement
    expect((within(对话框).getByRole('textbox') as HTMLInputElement).value).toBe('甲')
    await userEvent.click(within(对话框).getByRole('button', { name: '应用筛选' }))
    await waitFor(() => expect(container.querySelector('[data-地址="A3"]')).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(container.querySelector('[data-地址="A3"]')).not.toBeNull()
  })

  it('渲染网格、名称框与工作表标签', () => {
    const { container } = 渲染表格()
    expect(container.querySelector('.wps-sheet')).not.toBeNull()
    expect(screen.getByLabelText('名称框')).toBeInTheDocument()
    expect(screen.getByLabelText('公式栏')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-sheet-tab')).toHaveLength(1)
    expect(container.querySelector('.wps-editor-status')).not.toBeNull()
  })

  it('默认选中 A1 并在名称框显示', () => {
    渲染表格()
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
  })

  it('点击单元格后名称框更新为对应地址', async () => {
    const { container } = 渲染表格()
    const 单元格 = container.querySelector('[data-地址="C3"]') as HTMLElement
    await userEvent.click(单元格)
    expect(screen.getByDisplayValue('C3')).toBeInTheDocument()
  })

  it('点击加粗后单元格样式生效', async () => {
    渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))
    expect(await screen.findByText('已应用加粗')).toBeInTheDocument()
  })

  it('点击待实现的表格命令给出中文指引', async () => {
    渲染表格()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '数据透视表' }))
    expect(await screen.findByText('数据透视表需要高级聚合功能，将在后续版本提供')).toBeInTheDocument()
  })

  it('插入符号追加到当前单元格并可撤销', async () => {
    const { container } = 渲染表格()
    fireEvent.change(screen.getByLabelText('公式栏'), { target: { value: '面积' } })
    fireEvent.keyDown(screen.getByLabelText('公式栏'), { key: 'Enter' })
    await userEvent.click(container.querySelector('[data-地址="A1"]') as HTMLElement)
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    await userEvent.click(screen.getByRole('button', { name: '符号' }))
    const 输入 = await screen.findByRole('textbox', { name: '要插入的符号' })
    const 对话框 = 输入.closest('[role="dialog"]') as HTMLElement
    await userEvent.clear(输入)
    await userEvent.type(输入, '㎡')
    await userEvent.click(within(对话框).getByRole('button', { name: '插入' }))
    await waitFor(() => expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('面积㎡'))
    await userEvent.click(screen.getByRole('tab', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('面积')
  })

  it('新建工作表后标签数量增加', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '新建工作表' }))
    expect(container.querySelectorAll('.wps-sheet-tab')).toHaveLength(2)
  })

  it('名称框输入无效地址时给出中文提示', async () => {
    渲染表格()
    const 名称框 = screen.getByLabelText('名称框')
    await userEvent.clear(名称框)
    await userEvent.type(名称框, '随便{Enter}')
    expect(await screen.findByText('地址格式无效，请输入形如 A1 的地址')).toBeInTheDocument()
  })

  it('双击单元格进入编辑并提交内容', async () => {
    const { container } = 渲染表格()
    const 单元格 = container.querySelector('[data-地址="A1"]') as HTMLElement
    fireEvent.doubleClick(单元格)
    // 名称框与公式栏也是空值，此处限定查询单元格内的编辑器
    const 输入框 = container.querySelector('.wps-sheet__editor') as HTMLInputElement
    expect(输入框).not.toBeNull()
    await userEvent.type(输入框, '42{Enter}')
    // 公式栏也会显示同一原始值，因此限定查询单元格本身
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('42')
  })

  // 复现并锁定「撤销后重做未恢复状态」的缺陷
  it('加粗后撤销再重做，单元格格式应恢复到加粗状态', async () => {    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '5{Enter}')
    // 公式栏 Enter 将选区移至 A2，需要移回 A1 以加粗目标单元格
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowUp' })
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))

    const 取字重 = () =>
      (container.querySelector('[data-地址="A1"]') as HTMLElement).style.fontWeight

    expect(取字重()).toBe('600')
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(取字重()).not.toBe('600')
    await userEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(取字重()).toBe('600')
  })

  it('方向键移动选区并在名称框反映', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowRight' })
    expect(screen.getByDisplayValue('B1')).toBeInTheDocument()
    fireEvent.keyDown(网格, { key: 'ArrowDown' })
    expect(screen.getByDisplayValue('B2')).toBeInTheDocument()
  })

  it('方向键在边界处不越界', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowUp' })
    fireEvent.keyDown(网格, { key: 'ArrowLeft' })
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
  })

  it('回车进入编辑态', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'Enter' })
    expect(container.querySelector('.wps-sheet__editor')).not.toBeNull()
  })

  it('可见字符直接进入编辑并预填该字符', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: '7' })
    const 输入框 = container.querySelector('.wps-sheet__editor') as HTMLInputElement
    expect(输入框).not.toBeNull()
    expect(输入框.value).toBe('7')
  })

  it('Delete 清空选区内容', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '9{Enter}')
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('9')
    // 公式栏 Enter 将选区移至 A2，Delete 清空当前选区 A2
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'Delete' })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('9')
    expect(container.querySelector('[data-地址="A2"]')?.textContent).toBe('')
  })
  // ---------- 增强键盘快捷键 ----------

  it('Ctrl+A 全选所有单元格', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'a', ctrlKey: true })
    // 全选后名称框应显示区域地址 A1:Z100（100行26列）
    expect(screen.getByDisplayValue('A1:Z100')).toBeInTheDocument()
  })

  it('Ctrl+Z 撤销操作', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '100{Enter}')
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('100')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'z', ctrlKey: true })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('')
  })

  it('Ctrl+Y 重做操作', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '200{Enter}')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'z', ctrlKey: true })
    fireEvent.keyDown(网格, { key: 'y', ctrlKey: true })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('200')
  })

  it('Alt+= 自动求和', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '10{Enter}')
    await userEvent.type(公式栏, '20{Enter}')
    await userEvent.type(公式栏, '30{Enter}')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: '=', altKey: true })
    expect(container.querySelector('[data-地址="A4"]')?.textContent).toBe('60')
  })

  it('Delete 清空多单元格选区', async () => {
    const { container } = 渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏')
    await userEvent.type(公式栏, '1{Enter}')
    // 公式栏 Enter 将选区移至 A2，ArrowRight → B2
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowRight' })
    // 从 B2 通过 Shift+按下 A1 扩展选区到 A1:B2
    const A1格 = container.querySelector('[data-地址="A1"]') as HTMLElement
    fireEvent.mouseDown(A1格, { button: 0, shiftKey: true }) // 扩展选区 A1:B2
    // 清空选区
    fireEvent.keyDown(网格, { key: 'Delete' })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('')
    expect(container.querySelector('[data-地址="B1"]')?.textContent).toBe('')
    expect(container.querySelector('[data-地址="A2"]')?.textContent).toBe('')
    expect(container.querySelector('[data-地址="B2"]')?.textContent).toBe('')
  })
})

describe('工作表标签栏', () => {
  const 列表 = [
    { id: 's1', name: 'Sheet1' },
    { id: 's2', name: 'Sheet2' },
  ]

  it('渲染全部工作表并标记当前项', () => {
    const { container } = render(
      <SheetTabs 工作表列表={列表} 当前标识="s2" on切换={() => {}} on新建={() => {}} on删除={() => {}} />
    )
    expect(screen.getByText('Sheet1')).toBeInTheDocument()
    expect(container.querySelectorAll('.wps-sheet-tab--active')).toHaveLength(1)
  })

  it('点击标签回传标识', async () => {
    const 切换 = vi.fn()
    render(<SheetTabs 工作表列表={列表} 当前标识="s1" on切换={切换} on新建={() => {}} on删除={() => {}} />)
    await userEvent.click(screen.getByText('Sheet2'))
    expect(切换).toHaveBeenCalledWith('s2')
  })

  it('只有一个工作表时不显示删除按钮', () => {
    render(
      <SheetTabs 工作表列表={[列表[0]]} 当前标识="s1" on切换={() => {}} on新建={() => {}} on删除={() => {}} />
    )
    expect(screen.queryByRole('button', { name: /删除工作表/ })).toBeNull()
  })
})

describe('表格状态栏', () => {
  it('展示选区统计', () => {
    render(
      <SheetStatusBar
        统计={{ 计数: 3, 求和: 60, 平均值: 20, 最大: 30, 最小: 10 }}
        缩放={1}
        on缩放变化={() => {}}
      />
    )
    expect(screen.getByText('计数：3')).toBeInTheDocument()
    expect(screen.getByText('求和：60')).toBeInTheDocument()
    expect(screen.getByText('平均值：20')).toBeInTheDocument()
  })

  it('点击放大回传更大的缩放值', async () => {
    const 回调 = vi.fn()
    render(
      <SheetStatusBar
        统计={{ 计数: 0, 求和: 0, 平均值: 0, 最大: 0, 最小: 0 }}
        缩放={1}
        on缩放变化={回调}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(回调).toHaveBeenCalledWith(1.1)
  })
})

describe('表格快捷键增强', () => {
  it('Ctrl+Home 回到 A1', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    const 目标格 = container.querySelector('[data-地址="C3"]') as HTMLElement
    fireEvent.click(目标格)
    fireEvent.keyDown(网格, { key: 'Home', ctrlKey: true })
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
  })

  it('Shift+方向键扩展选区并在名称框显示区域', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(网格, { key: 'ArrowRight', shiftKey: true })
    expect(screen.getByDisplayValue('A1:B2')).toBeInTheDocument()
  })

  it('Ctrl+方向键跳到数据区边缘', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    // 写入 A1:A3 三个值（公式栏回车后自动下移）
    fireEvent.change(公式栏, { target: { value: '甲' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    fireEvent.change(公式栏, { target: { value: '乙' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    fireEvent.change(公式栏, { target: { value: '丙' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    expect(screen.getByDisplayValue('A4')).toBeInTheDocument()
    // 从 A4 向上跳应停在数据区最后一个非空格 A3
    fireEvent.keyDown(网格, { key: 'ArrowUp', ctrlKey: true })
    expect(screen.getByDisplayValue('A3')).toBeInTheDocument()
  })

  it('Ctrl+F 打开查找栏并定位到匹配单元格', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '海豹' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    fireEvent.keyDown(网格, { key: 'f', ctrlKey: true })
    const 查找输入 = screen.getByLabelText('查找内容') as HTMLInputElement
    expect(查找输入).toBeInTheDocument()
    fireEvent.change(查找输入, { target: { value: '海豹' } })
    fireEvent.keyDown(查找输入, { key: 'Enter' })
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
  })

  it('查找栏 Escape 关闭', () => {
    const { container } = 渲染表格()
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.keyDown(网格, { key: 'f', ctrlKey: true })
    const 查找输入 = screen.getByLabelText('查找内容') as HTMLInputElement
    fireEvent.keyDown(查找输入, { key: 'Escape' })
    expect(screen.queryByLabelText('查找内容')).toBeNull()
  })
})


describe('表格保存为 xlsx', () => {
  it('功能区打开 CSV 时保留文本、文件指纹并提示后续另存 XLSX', async () => {
    const 记录最近 = vi.fn().mockResolvedValue({ 成功: true })
    const 读取 = vi.fn().mockResolvedValue({ 成功: true, 内容: '编号,公式\r\n0012,=1+1', 二进制: false, 扩展名: '.csv', 文件指纹: '原指纹' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\数据.csv'),
      readFile: 读取,
      recentAdd: 记录最近,
    } })
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 入口 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table')}>启动表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('启动表格'))
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(状态!.文档路径[状态!.activeDocumentId!]).toBe('C:\\资料\\数据.csv'))
    const 表 = 状态!.表格文档模型[状态!.activeDocumentId!][0]
    expect(表.单元格.A2).toMatchObject({ 原始值: '0012', 显示值: '0012', 值类型: '文本' })
    expect(表.单元格.B2).toMatchObject({ 原始值: '=1+1', 显示值: '=1+1', 值类型: '文本' })
    expect(状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)?.文件指纹).toBe('原指纹')
    expect(读取).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(记录最近).toHaveBeenCalledWith(expect.objectContaining({ 路径: 'C:\\资料\\数据.csv', 类型: 'table' })))
    expect((await screen.findAllByText('CSV 已按文本导入')).length).toBeGreaterThan(0)
  })

  it('功能区打开格式错误的 CSV 时弹窗说明并保留原标签', async () => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\错误.csv'),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'a,"未闭合', 二进制: false, 扩展名: '.csv' }),
    } })
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 入口 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table')}>启动表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('启动表格'))
    const 原标识 = 状态!.activeDocumentId
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    expect((await screen.findAllByText('CSV 文件引号未闭合')).length).toBeGreaterThan(0)
    expect(状态!.activeDocumentId).toBe(原标识)
    expect(状态!.documents).toHaveLength(1)
  })

  it('CSV 来源点击保存先选择 XLSX 路径，不把二进制写回 CSV', async () => {
    const 选择路径 = vi.fn().mockResolvedValue('C:\\资料\\数据.xlsx')
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showSaveDialog: 选择路径,
      saveToFile: 写入,
      recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      office: { writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
    } })
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 入口 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table', '<table><tr><td>数据</td></tr></table>', { 路径: 'C:\\资料\\数据.csv' })}>打开 CSV</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开 CSV'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(选择路径).toHaveBeenCalledWith('数据.xlsx', 'table'))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\数据.xlsx', 'UEsDBAo=', '二进制'))
    expect(写入).not.toHaveBeenCalledWith('C:\\资料\\数据.csv', expect.anything(), expect.anything())
    expect(状态!.文档路径[状态!.activeDocumentId!]).toBe('C:\\资料\\数据.xlsx')
  })

  it('另存为目标已被其他标签占用时在编码和写盘前阻止', async () => {
    const 编码 = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showSaveDialog: vi.fn().mockResolvedValue('c:/资料/已有.xlsx'),
      saveToFile: 写入,
      office: { writeXlsx: 编码 },
    } })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>原文件</td></tr></table>', { 路径: 'C:\\资料\\已有.xlsx' })}>打开已有表格</button>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>副本</td></tr></table>')}>新建副本</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开已有表格'))
    await userEvent.click(screen.getByText('新建副本'))
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    expect((await screen.findAllByText('保存路径已被其他标签占用')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/已有\.xlsx/)).length).toBeGreaterThan(0)
    expect(编码).not.toHaveBeenCalled()
    expect(写入).not.toHaveBeenCalled()
  })

  it('直接打开 XLSX 后用读取指纹保存并记录新的文件指纹', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true, 文件指纹: '新指纹' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\预算.xlsx'),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'UEsDBAo=', 二进制: true, 文件指纹: '原指纹' }),
      saveToFile: 写入,
      recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      office: {
        readXlsx: vi.fn().mockResolvedValue({ 成功: true, 工作表列表: [{ 名称: '预算', html: '<table><tr><td>42</td></tr></table>' }] }),
        writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }),
      },
    } })
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 入口 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table')}>启动表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('启动表格'))
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)?.文件指纹).toBe('原指纹'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\预算.xlsx', 'UEsDBAo=', '二进制', '原指纹'))
    await waitFor(() => expect(状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)?.文件指纹).toBe('新指纹'))
  })

  it('导出单张工作表时不覆盖工作区中已打开的整个工作簿', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showSaveDialog: vi.fn().mockResolvedValue('C:\\资料\\工作簿.xlsx'),
      saveToFile: 写入,
      office: { writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
    } })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', [
          { 名称: '首页', html: '<table><tr><td>一</td></tr></table>' },
          { 名称: '明细', html: '<table><tr><td>二</td></tr></table>' },
        ], { 路径: 'C:\\资料\\工作簿.xlsx' })}>打开工作簿</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开工作簿'))
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '导出为表格' }))
    expect((await screen.findAllByText('导出路径已被打开的标签占用')).length).toBeGreaterThan(0)
    expect(写入).not.toHaveBeenCalled()
  })

  it('导出表格的目标扩展名不是 XLSX 时拒绝写入二进制', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      showSaveDialog: vi.fn().mockResolvedValue('C:\\资料\\误选.csv'),
      saveToFile: 写入,
      office: { writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
    } })
    渲染表格()
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '42' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '导出为表格' }))
    expect((await screen.findAllByText('导出表格失败')).length).toBeGreaterThan(0)
    expect(写入).not.toHaveBeenCalled()
  })

  it('导入警告弹窗说明风险，保存命令不覆盖来源文件', async () => {
    const 写入 = vi.fn()
    const 编码 = vi.fn()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        saveToFile: 写入,
        office: { writeXlsx: 编码 },
      },
    })
    const 创建入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>数据</td></tr></table>', { 路径: 'C:\\资料\\预算.xlsx', 警告: ['单元格样式未导入'] })}>打开带警告表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><创建入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开带警告表格' }))
    expect((await screen.findAllByText('表格内容可能未完整导入')).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('已阻止覆盖来源文件')).length).toBeGreaterThan(0)
    expect(编码).not.toHaveBeenCalled()
    expect(写入).not.toHaveBeenCalled()
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('带保真风险的表格仅能确认后另存到不同路径', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    const 选择路径 = vi.fn().mockResolvedValueOnce('c:/资料/预算.xlsx').mockResolvedValueOnce('C:\\资料\\预算副本.xlsx')
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        showSaveDialog: 选择路径,
        saveToFile: 写入,
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
        office: { writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
      },
    })
    const 创建入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('table', '<table><tr><td>数据</td></tr></table>', { 路径: 'C:\\资料\\预算.xlsx', 警告: ['图表未导入'] })}>打开带警告表格</button>
        {状态.module === 'table' ? <SheetEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><创建入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开带警告表格' }))
    await screen.findAllByText('表格内容可能未完整导入')
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    await waitFor(() => expect(选择路径).toHaveBeenCalledTimes(1))
    expect(写入).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    expect((await screen.findAllByText('确认保存副本')).length).toBeGreaterThan(0)
    const 确认按钮 = await screen.findAllByRole('button', { name: '保存副本' })
    await userEvent.click(确认按钮[确认按钮.length - 1])
    await waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\预算副本.xlsx', 'UEsDBAo=', '二进制'))
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('写盘失败时以弹窗显示具体错误', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        showSaveDialog: vi.fn().mockResolvedValue('C:\\资料\\预算.xlsx'),
        office: { writeXlsx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
        saveToFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '磁盘空间不足' }),
      },
    })
    渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getAllByRole('dialog').some((项) =>
      项.textContent?.includes('保存表格失败') && 项.textContent.includes('磁盘空间不足')
    )).toBe(true))
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('保存命令生成 xlsx 二进制并写盘，而不是 JSON 文本', async () => {
    const writeXlsx = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    const saveToFile = vi.fn().mockResolvedValue({ 成功: true, 路径: 'D:/docs/Sheet1.xlsx' })
    const showSaveDialog = vi.fn().mockResolvedValue('D:/docs/Sheet1.xlsx')
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      showSaveDialog,
      showOpenDialog: vi.fn().mockResolvedValue(null),
      saveToFile,
      readFile: vi.fn(),
      office: { writeXlsx, readXlsx: vi.fn() },
    } })
    渲染表格()
    // 先写入内容，保证工作表非空
    const 公式栏 = screen.getByLabelText('公式栏') as HTMLInputElement
    fireEvent.change(公式栏, { target: { value: '42' } })
    fireEvent.keyDown(公式栏, { key: 'Enter' })
    // 「文件」组位于开始标签下，直接点击保存按钮
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(writeXlsx).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(saveToFile).toHaveBeenCalledWith('D:/docs/Sheet1.xlsx', 'UEsDBAo=', '二进制')
    })
    // 打开对话框应请求表格类型过滤器
    expect(showSaveDialog).toHaveBeenCalledWith('Sheet1.xlsx', 'table')
  })
})

describe('表格鼠标拖选', () => {
  it('左键按下并拖过多格后选区扩展', () => {
    const { container } = 渲染表格()
    const 起始格 = container.querySelector('[data-地址="B2"]') as HTMLElement
    const 经过格 = container.querySelector('[data-地址="C3"]') as HTMLElement
    fireEvent.mouseDown(起始格, { button: 0 })
    fireEvent.mouseMove(经过格)
    fireEvent.mouseUp(document)
    expect(screen.getByDisplayValue('B2:C3')).toBeInTheDocument()
  })

  it('右键落在选区外时先把选区移到该格', () => {
    const { container } = 渲染表格()
    const 目标格 = container.querySelector('[data-地址="C4"]') as HTMLElement
    fireEvent.mouseDown(目标格, { button: 2 })
    expect(screen.getByDisplayValue('C4')).toBeInTheDocument()
  })
})
