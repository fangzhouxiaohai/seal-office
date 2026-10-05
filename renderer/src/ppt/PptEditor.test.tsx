import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import PptEditor from './PptEditor'
import GlobalTabs from '../components/GlobalTabs'
import { AppProvider, useAppStore, type AppState } from '../store'
import { 添加幻灯片, 创建演示文稿 } from './deck'

const 渲染演示 = () =>
  render(
    <ConfigProvider button={{ autoInsertSpace: false }}>
      <AntdApp>
        <AppProvider>
          <PptEditor />
        </AppProvider>
      </AntdApp>
    </ConfigProvider>
  )

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI')
})

describe('演示文稿编辑器容器', () => {
  it('删除对象后的撤销历史持有资源，关闭文稿与编辑器后释放全部所有权', async () => {
    const 指纹 = 'a'.repeat(64)
    const 所有权 = new Map<string, string[]>()
    const 同步 = vi.fn(async (标识: string, 引用: string[]) => { 所有权.set(标识, 引用); return { 成功: true } })
    const 释放 = vi.fn(async (标识: string) => { 所有权.delete(标识); return { 成功: true } })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      presentationResources: { sync: 同步, release: 释放 },
    } })
    let 状态: AppState | null = null
    const 入口 = () => { 状态 = useAppStore(); return 状态.documents.length ? <PptEditor /> : null }
    const 视图 = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
    const 文稿 = 创建演示文稿()
    文稿.资源索引 = { [指纹]: { 指纹, 类型: 'image/png', 字节数: 3 } }
    文稿.幻灯片列表[0].对象列表 = [{ id: '图片', 类型: '图片', x: 0, y: 0, width: 10, height: 10, 资源标识: 指纹 }]
    act(() => 状态!.createDoc('ppt', 文稿))
    const 标签 = 状态!.activeDocumentId!
    await waitFor(() => expect(所有权.get(`历史:${标签}`)).toContain(指纹))
    act(() => 状态!.更新演示文档模型(标签, 当前 => ({ ...当前, 幻灯片列表: 当前.幻灯片列表.map(页 => ({ ...页, 对象列表: [] })) })))
    await waitFor(() => expect(释放).toHaveBeenCalledWith(`文稿:${标签}`))
    expect(所有权.get(`历史:${标签}`)).toContain(指纹)
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(状态!.演示文档模型[标签].幻灯片列表[0].对象列表).toHaveLength(1))
    act(() => 状态!.closeEditorDoc(标签))
    await waitFor(() => expect(所有权.size).toBe(0))
    expect(释放).toHaveBeenCalledWith(`历史:${标签}`)
    视图.unmount()
  })
  it.each(['F5', 'Shift+F5', '菜单'])('零页演示通过 %s 放映时弹窗提示且不进入全屏', async (方式) => {
    const 进入 = vi.fn()
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      enterSlideshowFullscreen: 进入,
    } })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <><button onClick={() => 状态.createDoc('ppt', { id: 'empty', name: '空演示', 幻灯片列表: [], 当前索引: 0 })}>打开零页演示</button>{状态.module === 'ppt' ? <PptEditor /> : null}</>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开零页演示' }))
    if (方式 === '菜单') {
      await userEvent.click(screen.getByRole('tab', { name: '幻灯片放映' }))
      await userEvent.click(screen.getByRole('button', { name: '从头开始' }))
    } else fireEvent.keyDown(document, { key: 'F5', shiftKey: 方式 === 'Shift+F5' })
    expect(await screen.findByText('请先添加至少一张幻灯片，再开始放映。')).toBeInTheDocument()
    expect(进入).not.toHaveBeenCalled()
    expect(document.querySelector('.wps-slideshow')).toBeNull()
  })

  it('真实零页演示可打开、新增幻灯片并保存到原文件', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      saveToFile: vi.fn().mockResolvedValue({ 成功: true }),
      office: { writePptx: 写入 },
    } })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <><button onClick={() => 状态.createDoc('ppt', { id: 'empty', name: '空演示', 幻灯片列表: [], 当前索引: 0 }, { 路径: 'E:\\Temp\\空演示.pptx' })}>打开零页演示</button>{状态.module === 'ppt' ? <PptEditor /> : null}</>
    }
    const { container } = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开零页演示' }))
    expect(screen.getByText('暂无幻灯片')).toBeInTheDocument()
    expect(screen.getByText('第 0 张')).toBeInTheDocument()
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create')!)
    expect(container.querySelector('.wps-ppt-canvas')).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalled())
    expect(写入.mock.calls[0][0].幻灯片).toHaveLength(1)
  })

  it('幻灯片浏览可整体预览和拖动排序，并返回普通视图', async () => {
    const 模型 = 添加幻灯片(添加幻灯片(创建演示文稿()))
    模型.幻灯片列表.forEach((页, 索引) => { 页.文本框列表[0].text = ['甲页', '乙页', '丙页'][索引] })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 模型)}>打开排序演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开排序演示' }))
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '幻灯片浏览' }))
    const 卡片 = container.querySelectorAll('.wps-ppt-sorter__card')
    expect(卡片).toHaveLength(3)
    expect(Array.from(卡片, (项) => 项.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('甲页'), expect.stringContaining('乙页'), expect.stringContaining('丙页')]))
    const 拖拽数据 = { effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(卡片[0], { dataTransfer: 拖拽数据 })
    fireEvent.dragOver(卡片[2], { dataTransfer: 拖拽数据 })
    fireEvent.drop(卡片[2], { dataTransfer: 拖拽数据 })
    expect(Array.from(container.querySelectorAll('.wps-ppt-sorter__card'), (项) => 项.textContent?.match(/[甲乙丙]页/)?.[0])).toEqual(['乙页', '丙页', '甲页'])
    await userEvent.click(screen.getByRole('button', { name: '第 3 张上移' }))
    expect(Array.from(container.querySelectorAll('.wps-ppt-sorter__card'), (项) => 项.textContent?.match(/[甲乙丙]页/)?.[0])).toEqual(['乙页', '甲页', '丙页'])
    await userEvent.click(screen.getByRole('button', { name: '普通' }))
    expect(container.querySelector('.wps-ppt-canvas')).not.toBeNull()
  })

  it('备注页按页编辑，保存时把备注交给文件编码器', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        saveToFile: vi.fn().mockResolvedValue({ 成功: true }),
        office: { writePptx: 写入 },
      },
    })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', { ...添加幻灯片(创建演示文稿()), 当前索引: 0 }, { 路径: 'C:\\资料\\备注.pptx' })}>打开备注演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开备注演示' }))
    await userEvent.click(screen.getByRole('tab', { name: '视图' }))
    await userEvent.click(screen.getByRole('button', { name: '备注页' }))
    await userEvent.type(screen.getByRole('textbox', { name: '当前页备注' }), '开场提示')
    await userEvent.click(container.querySelectorAll('.wps-ppt-thumb')[1])
    await userEvent.type(screen.getByRole('textbox', { name: '当前页备注' }), '第二页提示')
    await userEvent.click(container.querySelectorAll('.wps-ppt-thumb')[0])
    expect(screen.getByRole('textbox', { name: '当前页备注' })).toHaveValue('开场提示')
    await userEvent.click(screen.getByRole('tab', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalled())
    expect(写入.mock.calls[0][0].幻灯片[0].备注).toBe('开场提示')
    expect(写入.mock.calls[0][0].幻灯片[1].备注).toBe('第二页提示')
  })

  it('保存失败时弹窗展示磁盘错误', async () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
        backupClear: vi.fn().mockResolvedValue({ 成功: true }),
        saveToFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '磁盘已满' }),
        office: { writePptx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
      },
    })
    const 创建入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\汇报.pptx' })}>打开演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><创建入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开演示' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('保存失败')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('磁盘已满').length).toBeGreaterThan(0)
  })

  it('另存为拒绝非 PPTX 扩展名且不写入格式不符的文件', async () => {
    const 编码 = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showSaveDialog: vi.fn().mockResolvedValue('C:\\资料\\汇报.txt'),
      saveToFile: 写入,
      office: { writePptx: 编码 },
    } })
    渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    expect((await screen.findAllByText('保存失败')).length).toBeGreaterThan(0)
    expect(编码).not.toHaveBeenCalled()
    expect(写入).not.toHaveBeenCalled()
  })

  it('另存为路径没有扩展名时补齐 PPTX', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true, 文件指纹: '新指纹' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showSaveDialog: vi.fn().mockResolvedValue('C:\\资料\\汇报'),
      saveToFile: 写入,
      office: { writePptx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
    } })
    渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\汇报.pptx', 'UEsDBAo=', '二进制'))
  })

  it('每份演示保留独立撤销历史', async () => {
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿('甲'), { 路径: 'C:\\资料\\甲.pptx' })}>打开甲</button>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿('乙'), { 路径: 'C:\\资料\\乙.pptx' })}>打开乙</button>
        <button onClick={() => 状态.setActiveDocumentId(状态.documents.find((项) => 项.name === '甲.pptx')?.id ?? null)}>切回甲</button>
        <button onClick={() => 状态.setActiveDocumentId(状态.documents.find((项) => 项.name === '乙.pptx')?.id ?? null)}>切回乙</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开甲'))
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
    await userEvent.click(screen.getByText('打开乙'))
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
    await userEvent.click(screen.getByText('切回甲'))
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(1))
    await userEvent.click(screen.getByText('切回乙'))
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(1))
  })
  it('工具栏打开另一份演示时新建标签并保留当前未保存内容', async () => {
    const 第二份 = 创建演示文稿('第二份演示')
    第二份.幻灯片列表[0].文本框列表[0].text = '第二份正文'
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
        backupClear: vi.fn().mockResolvedValue({ 成功: true }),
        showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\第二份.pptx'),
        readFile: vi.fn().mockResolvedValue({ 成功: true, 二进制: true, 内容: 'AA==', 扩展名: '.pptx' }),
        office: { readPptx: vi.fn().mockResolvedValue({ 成功: true, 演示文稿: 第二份, 警告: [] }) },
        recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      },
    })
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿('第一份演示'), { 路径: 'C:\\资料\\第一份.pptx' })}>打开第一份</button>
        <span data-testid="文档数量">{状态.documents.length}</span>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开第一份'))
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(screen.getByTestId('文档数量')).toHaveTextContent('2'))
    expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('第二份正文')
    await userEvent.click(screen.getByRole('tab', { name: /第一份\.pptx/ }))
    await waitFor(() => expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2))
  })

  it('关闭演示标签前要求确认并可取消', async () => {
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\汇报.pptx' })}>打开演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /><GlobalTabs /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开演示' }))
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: '关闭 汇报.pptx' }))
    expect((await screen.findAllByText('文档有未保存的修改')).length).toBeGreaterThan(0)
    const 取消按钮 = await screen.findAllByRole('button', { name: /取\s*消/ })
    await userEvent.click(取消按钮[取消按钮.length - 1])
    expect(screen.getByRole('tab', { name: /汇报\.pptx/ })).toBeInTheDocument()
  })
  it.each(['图片尚未导入','图片效果未完整导入','图片填充区域未完整导入','组合锁定属性未完整导入','原生对象已被外部修改，语义结构未完整导入'])('导入风险 %s 弹窗提示并禁止覆盖来源', async 风险 => {
    const 写入 = vi.fn()
    const 编码 = vi.fn()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
        backupClear: vi.fn().mockResolvedValue({ 成功: true }),
        saveToFile: 写入,
        office: { writePptx: 编码 },
      },
    })
    const 创建入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\汇报.pptx', 警告: [风险] })}>打开带警告演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><创建入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开带警告演示' }))
    expect((await screen.findAllByText('演示文稿内容可能未完整导入')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(风险).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findAllByText('已阻止覆盖来源文件')).length).toBeGreaterThan(0)
    expect(编码).not.toHaveBeenCalled()
    expect(写入).not.toHaveBeenCalled()
  })

  it('有保真风险的演示只能在确认后另存到不同路径', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    const 选择路径 = vi.fn().mockResolvedValueOnce('C:\\资料\\汇报.pptx').mockResolvedValueOnce('C:\\资料\\副本.pptx')
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        backupSave: vi.fn().mockResolvedValue({ 成功: true }),
        backupClear: vi.fn().mockResolvedValue({ 成功: true }),
        showSaveDialog: 选择路径,
        saveToFile: 写入,
        office: { writePptx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }) },
      },
    })
    const 创建入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\汇报.pptx', 警告: ['图片尚未导入'] })}>打开带警告演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><创建入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByRole('button', { name: '打开带警告演示' }))
    await screen.findAllByText('演示文稿内容可能未完整导入')
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    await waitFor(() => expect(选择路径).toHaveBeenCalledTimes(1))
    expect(写入).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    expect((await screen.findAllByText('确认保存副本')).length).toBeGreaterThan(0)
    const 确认按钮 = await screen.findAllByRole('button', { name: '保存副本' })
    await userEvent.click(确认按钮[确认按钮.length - 1])
    await waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\副本.pptx', 'UEsDBAo=', '二进制'))
  })

  it('另存为目标已被其他演示标签占用时在编码和写盘前阻止', async () => {
    const 编码 = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    const 写入 = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showSaveDialog: vi.fn().mockResolvedValue('c:/资料/已有.pptx'),
      saveToFile: 写入,
      office: { writePptx: 编码 },
    } })
    const 入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\已有.pptx' })}>打开已有演示</button>
        <button onClick={() => 状态.createDoc('ppt')}>新建演示副本</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开已有演示'))
    await userEvent.click(screen.getByText('新建演示副本'))
    await userEvent.click(screen.getByRole('button', { name: '另存为' }))
    expect((await screen.findAllByText('保存路径已被其他标签占用')).length).toBeGreaterThan(0)
    expect((await screen.findAllByText(/已有\.pptx/)).length).toBeGreaterThan(0)
    expect(编码).not.toHaveBeenCalled()
    expect(写入).not.toHaveBeenCalled()
  })

  it('直接打开 PPTX 后用读取指纹保存并记录新的文件指纹', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true, 文件指纹: '新指纹' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      showOpenDialog: vi.fn().mockResolvedValue('C:\\资料\\汇报.pptx'),
      readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: 'UEsDBAo=', 二进制: true, 文件指纹: '原指纹' }),
      saveToFile: 写入,
      recentAdd: vi.fn().mockResolvedValue({ 成功: true }),
      office: {
        readPptx: vi.fn().mockResolvedValue({ 成功: true, 演示文稿: 创建演示文稿() }),
        writePptx: vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' }),
      },
    } })
    let 状态: ReturnType<typeof useAppStore> | null = null
    const 入口 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('ppt')}>启动演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    render(<AntdApp><AppProvider><入口 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('启动演示'))
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)?.文件指纹).toBe('原指纹'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalledWith('C:\\资料\\汇报.pptx', 'UEsDBAo=', '二进制', '原指纹'))
    await waitFor(() => expect(状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)?.文件指纹).toBe('新指纹'))
  })

  it('切换演示时清除前一份文稿的选框与编辑状态', async () => {
    const 共用标识 = '相同文本框标识'
    const 创建内容 = (名称: string) => {
      const 模型 = 创建演示文稿(名称)
      模型.幻灯片列表[0].文本框列表[0].id = 共用标识
      模型.幻灯片列表[0].文本框列表[0].text = 名称
      return 模型
    }
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建内容('甲演示'))}>打开甲演示</button>
        <button onClick={() => 状态.createDoc('ppt', 创建内容('乙演示'))}>打开乙演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开甲演示'))
    fireEvent.mouseDown(container.querySelector('.wps-ppt-box') as HTMLElement)
    expect(container.querySelector('.wps-ppt-box--selected')).not.toBeNull()
    await userEvent.click(screen.getByText('打开乙演示'))
    await waitFor(() => expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('乙演示'))
    expect(container.querySelector('.wps-ppt-box--selected')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))
    expect(await screen.findByText('请先在画布中选中一个文本框')).toBeInTheDocument()
  })
  it('返回首页后重新打开同一文件仍显示未保存的幻灯片', async () => {
    const 路径 = 'C:\\资料\\汇报.pptx'
    const 最近记录 = { id: 'recent-report', name: '汇报.pptx', type: 'ppt' as const, size: 0, updatedAt: '2026-10-03', starred: false, shared: false, 路径 }
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径 })}>首次打开演示</button>
        <button onClick={状态.goHome}>返回首页</button>
        <button onClick={() => void 状态.openDoc(最近记录)}>再次打开演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('首次打开演示'))
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
    await userEvent.click(screen.getByText('返回首页'))
    await userEvent.click(screen.getByText('再次打开演示'))
    await waitFor(() => expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2))
  })

  it('打开第二份演示后保存仅写入第二份内容和路径', async () => {
    const writePptx = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    const saveToFile = vi.fn().mockResolvedValue({ 成功: true })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        office: { writePptx },
        saveToFile,
      },
    })
    const 创建内容 = (名称: string) => {
      const 模型 = 创建演示文稿(名称)
      模型.幻灯片列表[0].文本框列表[0].text = 名称
      return 模型
    }
    const 导航 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建内容('甲演示'), { 路径: 'C:\\资料\\甲.pptx' })}>打开甲演示</button>
        <button onClick={() => 状态.createDoc('ppt', 创建内容('乙演示'), { 路径: 'C:\\资料\\乙.pptx' })}>打开乙演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    const { container } = render(<AntdApp><AppProvider><导航 /></AppProvider></AntdApp>)
    await userEvent.click(screen.getByText('打开甲演示'))
    await waitFor(() => expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('甲演示'))
    await userEvent.click(screen.getByText('打开乙演示'))
    await waitFor(() => expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('乙演示'))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(saveToFile).toHaveBeenCalledWith('C:\\资料\\乙.pptx', 'UEsDBAo=', '二进制'))
    const 导出模型 = JSON.stringify(writePptx.mock.calls[writePptx.mock.calls.length - 1]?.[0])
    expect(导出模型).toContain('乙演示')
    expect(导出模型).not.toContain('甲演示')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('保存演示时把当前页切换效果交给文件编码器', async () => {
    const 写入 = vi.fn().mockResolvedValue({ 成功: true, 数据: 'UEsDBAo=' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
        saveToFile: vi.fn().mockResolvedValue({ 成功: true }),
        office: { writePptx: 写入 },
      },
    })
    const 创建入口 = () => {
      const 状态 = useAppStore()
      return <>
        <button onClick={() => 状态.createDoc('ppt', 创建演示文稿(), { 路径: 'C:\\资料\\切换.pptx' })}>打开切换演示</button>
        {状态.module === 'ppt' ? <PptEditor /> : null}
      </>
    }
    render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><创建入口 /></AppProvider></AntdApp></ConfigProvider>)
    await userEvent.click(screen.getByRole('button', { name: '打开切换演示' }))
    await userEvent.click(screen.getByRole('tab', { name: '切换' }))
    await userEvent.click(screen.getByRole('button', { name: '淡入淡出' }))
    await userEvent.click(screen.getByRole('tab', { name: '开始' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(写入).toHaveBeenCalled())
    expect(写入.mock.calls[0][0].幻灯片[0].过渡效果).toBe('淡入淡出')
  })

  it('尚未可靠保存的动画入口禁用并说明原因', async () => {
    渲染演示()
    await userEvent.click(screen.getByRole('tab', { name: '动画' }))
    const 按钮 = screen.getByRole('button', { name: '出现' })
    expect(按钮).toBeDisabled()
    expect(按钮).toHaveAttribute('title', '此操作尚未完成文件保存与重新打开验证')
    expect(screen.queryByText('已设置动画效果：出现')).toBeNull()
  })

  it('渲染 Ribbon 八标签', () => {
    渲染演示()
    ;['开始', '插入', '设计', '切换', '动画', '幻灯片放映', '审阅', '视图'].forEach((名称) => {
      expect(screen.getByRole('tab', { name: 名称 })).toBeInTheDocument()
    })
  })

  it('渲染缩略图、画布与状态栏', () => {
    const { container } = 渲染演示()
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(1)
    expect(container.querySelector('.wps-ppt-canvas')).not.toBeNull()
    expect(container.querySelector('.wps-editor-status')).not.toBeNull()
  })

  it('画布渲染版式初始文本框', () => {
    const { container } = 渲染演示()
    expect(container.querySelectorAll('.wps-ppt-box')).toHaveLength(1)
    // 缩略图也会展示文本，此处限定画布内容
    expect(container.querySelector('.wps-ppt-canvas')?.textContent).toContain('单击此处添加标题')
  })

  it('状态栏展示幻灯片序号与总数', () => {
    渲染演示()
    expect(screen.getByText('第 1 张')).toBeInTheDocument()
    expect(screen.getByText('共 1 张')).toBeInTheDocument()
  })

  it('点击缩略图区的新建按钮后缩略图增加', async () => {
    const { container } = 渲染演示()
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    expect(container.querySelectorAll('.wps-ppt-thumb')).toHaveLength(2)
  })

  it('原生图表通过往返验证后入口可用', async () => {
    渲染演示()
    await userEvent.click(screen.getByRole('tab', { name: '插入' }))
    expect(screen.getByRole('button', { name: '图表' })).toBeEnabled()
  })

  it('点击缩略图切换当前幻灯片', async () => {
    const { container } = 渲染演示()
    await userEvent.click(container.querySelector('.wps-ppt-thumbs__create') as HTMLElement)
    const 缩略图 = container.querySelectorAll('.wps-ppt-thumb')
    await userEvent.click(缩略图[0])
    expect(screen.getByText('第 1 张')).toBeInTheDocument()
  })

  it('未选中文本框时格式命令给出中文提示', async () => {
    渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '加粗' }))
    expect(await screen.findByText('请先在画布中选中一个文本框')).toBeInTheDocument()
  })
})
