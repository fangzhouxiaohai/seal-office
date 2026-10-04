import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider, Modal, theme } from 'antd'
import { AppProvider, useAppStore, type AppState } from './store'
import { RECENT_DOCS } from './mock/recentDocs'
import { 写入单元格, 设置数据验证 } from './sheet/model'
import { 创建演示文稿 } from './ppt/deck'

/** 探针组件：把状态与操作暴露为可点击按钮，便于断言 */
const 探针 = ({ 提示文本 }: { 提示文本?: (文本: string) => void }) => {
  const 状态 = useAppStore()
  return (
    <div>
      <span data-testid="module">{状态.module}</span>
      <span data-testid="nav">{状态.navKey}</span>
      <span data-testid="view">{状态.viewMode}</span>
      <span data-testid="sort">{状态.sortKey}</span>
      <span data-testid="star-count">{状态.docs.filter((文档) => 文档.starred).length}</span>
      <span data-testid="visible-count">{状态.visibleDocs.length}</span>
      <span data-testid="total-count">{状态.docs.length}</span>
      <span data-testid="first-name">{状态.docs[0]?.name ?? '无'}</span>
      <span data-testid="active-id">{状态.activeDocId ?? '无'}</span>
      <span data-testid="editor-doc-count">{状态.documents.length}</span>
      <span data-testid="active-doc-html">
        {状态.documents.find((项) => 项.id === 状态.activeDocumentId)?.html ?? '无'}
      </span>
      <span data-testid="active-doc-name">
        {状态.documents.find((项) => 项.id === 状态.activeDocumentId)?.name ?? '无'}
      </span>
      <span data-testid="active-doc-path">{状态.文档路径[状态.activeDocumentId ?? ''] ?? '无'}</span>
      <button onClick={() => 状态.setModule('word')}>切模块</button>
      <button onClick={() => 状态.setNavKey('star')}>切星标</button>
      <button onClick={() => 状态.setViewMode('list')}>切列表</button>
      <button onClick={() => 状态.setSortKey('size')}>切排序</button>
      <button onClick={() => 状态.toggleStar(状态.docs[0].id)}>切首个星标</button>
      <button onClick={() => 状态.handleNav('pdf', 提示文本 ?? (() => {}))}>切PDF工具</button>
      <button onClick={() => 状态.renameDoc(状态.docs[0].id, '   ')}>重命名空名</button>
      <button onClick={() => 状态.removeDoc(状态.docs[0].id)}>删除首篇</button>
      <button onClick={() => 状态.setActiveDocId(状态.docs[0].id)}>选中首篇</button>
      <button onClick={() => 状态.createDoc('word')}>新建文字文档</button>
      <button onClick={() => 状态.createDoc('word', '<p>原文</p>', { 路径: 'C:\\资料\\原件.docx' })}>打开本地文字</button>
      <button onClick={() => 状态.updateEditorHtml(状态.activeDocumentId ?? '', '<p>新内容</p>')}>
        写入内容
      </button>
      <button onClick={() => 状态.closeEditorDoc(状态.activeDocumentId ?? '')}>关闭当前文档</button>
    </div>
  )
}

const 渲染探针 = (提示文本?: (文本: string) => void) =>
  render(
    <AppProvider 初始最近文档={RECENT_DOCS}>
      <探针 提示文本={提示文本} />
    </AppProvider>
  )

describe('应用状态层', () => {
  it('保存路径查询识别其他已打开标签且允许当前标签原路径', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    render(<AppProvider><读取 /></AppProvider>)
    act(() => 状态!.createDoc('word', '<p>原文</p>', { 路径: 'C:\\资料\\报告.docx' }))
    const 已打开标识 = 状态!.activeDocumentId!
    act(() => 状态!.createDoc('table'))
    const 当前标识 = 状态!.activeDocumentId!
    expect(状态!.查找保存路径占用(当前标识, 'c:/资料/报告.docx')).toMatchObject({
      id: 已打开标识,
      name: '报告.docx',
    })
    expect(状态!.查找保存路径占用(已打开标识, 'C:\\资料\\报告.docx')).toBeNull()
  })

  it('保存完成时记录写盘前的页面设置，保存期间的新修改仍为未保存', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    const 初始设置 = { 纸张: 'A4', 纸张方向: '纵向' as const, 页边距: '普通', 分栏: '一栏', 水印: '', 页面边框: '无', 页面颜色: '#FFFFFF', 文字方向: '横排' as const }
    render(<AppProvider><读取 /></AppProvider>)
    act(() => 状态!.createDoc('word', '<p>原文</p>', { 路径: 'C:\\资料\\报告.docx', 页面设置: 初始设置 }))
    const 标识 = 状态!.activeDocumentId!
    const 写盘快照 = { ...初始设置, 纸张方向: '横向' as const }
    act(() => 状态!.更新文字页面设置(标识, 写盘快照))
    act(() => 状态!.更新文字页面设置(标识, { ...写盘快照, 页边距: '窄' }))
    act(() => 状态!.markDocumentSaved(标识, '<p>原文</p>', undefined, { 页面设置: 写盘快照 }))
    expect(状态!.documents.find((项) => 项.id === 标识)?.已保存页面设置).toEqual(写盘快照)
    expect(状态!.workspaceTabs.find((项) => 项.id === 标识)?.dirty).toBe(true)
  })

  it('首次保存默认页面设置后当前页面与保存基线保持一致', () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    const 默认设置 = { 纸张: 'A4', 纸张方向: '纵向' as const, 页边距: '普通', 分栏: '一栏', 水印: '', 页面边框: '无', 页面颜色: '#FFFFFF', 文字方向: '横排' as const }
    render(<AppProvider><读取 /></AppProvider>)
    act(() => 状态!.createDoc('word', '<p>正文</p>'))
    const 标识 = 状态!.activeDocumentId!
    expect(状态!.documents.find((项) => 项.id === 标识)?.页面设置).toBeUndefined()
    act(() => {
      状态!.markDocumentSaved(标识, '<p>正文</p>', undefined, { 页面设置: 默认设置 })
      状态!.set文档路径(标识, 'C:\\资料\\首存.docx')
    })
    expect(状态!.documents.find((项) => 项.id === 标识)?.页面设置).toEqual(默认设置)
    expect(状态!.documents.find((项) => 项.id === 标识)?.已保存页面设置).toEqual(默认设置)
    expect(状态!.workspaceTabs.find((项) => 项.id === 标识)?.dirty).toBe(false)
  })

  it('导入与保存页面设置的属性顺序不同不会误判为未保存', () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    const 导入设置 = { 纸张: 'A4', 纸张方向: '纵向' as const, 页边距: '常规', 分栏: '一栏', 页面边框: '无', 页面颜色: '无', 文字方向: '横排' as const, 水印: '无' }
    const 保存设置 = { 纸张: 'A4', 纸张方向: '纵向' as const, 页边距: '常规', 分栏: '一栏', 水印: '无', 页面边框: '无', 页面颜色: '无', 文字方向: '横排' as const }
    render(<AppProvider><读取 /></AppProvider>)
    act(() => 状态!.createDoc('word', '<p>正文</p>', { 路径: 'C:\\资料\\报告.docx', 页面设置: 导入设置 }))
    act(() => 状态!.markDocumentSaved(状态!.activeDocumentId!, '<p>正文</p>', undefined, { 页面设置: 保存设置 }))
    expect(状态!.workspaceTabs[0].dirty).toBe(false)
    act(() => 状态!.更新文字页面设置(状态!.activeDocumentId!, { ...导入设置, 页边距: '窄' }))
    expect(状态!.workspaceTabs[0].dirty).toBe(true)
  })

  it('最近文件星标写盘失败时不改变界面状态', async () => {
    const 文档 = { ...RECENT_DOCS[0], 路径: 'C:\\资料\\报告.docx' }
    const recentAdd = vi.fn().mockResolvedValue({ 成功: false, 错误: '记录文件只读' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { recentAdd, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) },
    })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <><button onClick={() => void 状态!.toggleStar(文档.id)}>切换星标</button><span data-testid="星标状态">{状态.docs[0].starred ? '是' : '否'}</span></> }
    render(<AppProvider 初始最近文档={[文档]}><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('切换星标'))
    expect(screen.getByTestId('星标状态')).toHaveTextContent('是')
    expect(recentAdd).toHaveBeenCalled()
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('最近记录移除失败时保留原条目', async () => {
    const 文档 = { ...RECENT_DOCS[0], 路径: 'C:\\资料\\报告.docx' }
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { recentRemove: vi.fn().mockResolvedValue({ 成功: false, 错误: '记录文件只读' }) },
    })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="记录数">{状态.docs.length}</span> }
    render(<AppProvider 初始最近文档={[文档]}><读取 /></AppProvider>)
    await expect(状态!.removeDoc(文档.id)).rejects.toThrow('记录文件只读')
    expect(screen.getByTestId('记录数')).toHaveTextContent('1')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('真实应用无最近记录时不显示演示文件', () => {
    render(<AppProvider><探针 /></AppProvider>)
    expect(screen.getByTestId('total-count')).toHaveTextContent('0')
  })

  it('初始处于首页、网格视图、按时间排序', () => {
    渲染探针()
    expect(screen.getByTestId('module')).toHaveTextContent('home')
    expect(screen.getByTestId('nav')).toHaveTextContent('home')
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
    expect(screen.getByTestId('sort')).toHaveTextContent('time')
  })

  it('显式注入测试文档时展示样本', () => {
    渲染探针()
    expect(screen.getByTestId('visible-count')).toHaveTextContent('12')
    expect(screen.getByTestId('total-count')).toHaveTextContent('12')
  })

  it('切换模块后模块标识更新', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切模块'))
    expect(screen.getByTestId('module')).toHaveTextContent('word')
  })

  it('切换到星标筛选后仅可见 5 篇星标文档', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切星标'))
    expect(screen.getByTestId('nav')).toHaveTextContent('star')
    expect(screen.getByTestId('visible-count')).toHaveTextContent('5')
  })

  it('切换视图模式生效', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切列表'))
    expect(screen.getByTestId('view')).toHaveTextContent('list')
  })

  it('切换排序方式生效', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切排序'))
    expect(screen.getByTestId('sort')).toHaveTextContent('size')
  })

  it('切换星标后星标数量由 5 变为 4', async () => {
    渲染探针()
    expect(screen.getByTestId('star-count')).toHaveTextContent('5')
    await userEvent.click(screen.getByText('切首个星标'))
    expect(screen.getByTestId('star-count')).toHaveTextContent('4')
  })

  it('已实现的导航项切换后navKey更新', async () => {
    const 提示 = vi.fn()
    渲染探针(提示)
    await userEvent.click(screen.getByText('切PDF工具'))
    expect(提示).not.toHaveBeenCalled()
    expect(screen.getByTestId('nav')).toHaveTextContent('pdf')
  })

  it('没有真实路径的记录拒绝重命名', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="首篇名称">{状态.docs[0].name}</span> }
    render(<AppProvider 初始最近文档={RECENT_DOCS}><读取 /></AppProvider>)
    await expect(状态!.renameDoc(RECENT_DOCS[0].id, '新名称.docx')).rejects.toThrow('没有真实文件路径')
    expect(screen.getByTestId('首篇名称')).toHaveTextContent(RECENT_DOCS[0].name)
  })

  it('重命名为纯空白时不生效', async () => {
    渲染探针()
    const 原名 = screen.getByTestId('first-name').textContent
    await userEvent.click(screen.getByText('重命名空名'))
    expect(screen.getByTestId('first-name').textContent).toBe(原名)
  })

  it('真实重命名成功后同步最近路径、打开标签和保存路径', async () => {
    const 旧路径 = 'C:\\资料\\原件.docx'
    const 新路径 = 'C:\\资料\\已改名.docx'
    const renameFile = vi.fn().mockResolvedValue({ 成功: true, 路径: 新路径, 名称: '已改名.docx', 文件指纹: '新路径指纹' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { renameFile, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) },
    })
    const 条目 = { ...RECENT_DOCS[0], id: `recent-${旧路径}`, name: '原件.docx', 路径: 旧路径 }
    let 状态: AppState | null = null
    const 读取 = () => {
      const 当前状态 = useAppStore()
      状态 = 当前状态
      return <>
        <button onClick={() => 状态!.createDoc('word', '<p>原文</p>', { 路径: 旧路径, 文件指纹: '旧路径指纹' })}>打开原件</button>
        <button onClick={() => void 状态!.renameDoc(条目.id, '  已改名  ')}>改名</button>
        <span data-testid="最近路径">{当前状态.docs[0]?.路径}</span>
        <span data-testid="编辑路径">{当前状态.文档路径[当前状态.activeDocumentId ?? '']}</span>
        <span data-testid="编辑名称">{当前状态.documents.find((项) => 项.id === 当前状态.activeDocumentId)?.name}</span>
      </>
    }
    render(<AppProvider 初始最近文档={[条目]}><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开原件'))
    await userEvent.click(screen.getByText('改名'))
    await waitFor(() => expect(screen.getByTestId('最近路径')).toHaveTextContent(新路径))
    expect(renameFile).toHaveBeenCalledWith(旧路径, '已改名', '旧路径指纹')
    expect(screen.getByTestId('编辑路径')).toHaveTextContent(新路径)
    expect(screen.getByTestId('编辑名称')).toHaveTextContent('已改名.docx')
    expect(状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)?.文件指纹).toBe('新路径指纹')
    expect(状态!.docs[0].id).toBe(`recent-${新路径}`)
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('已打开文件缺少版本指纹时拒绝重命名以免刷新版本后覆盖外部修改', async () => {
    const 旧路径 = 'C:\\资料\\原件.docx'
    const renameFile = vi.fn()
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { renameFile, backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }) },
    })
    const 条目 = { ...RECENT_DOCS[0], id: `recent-${旧路径}`, name: '原件.docx', 路径: 旧路径 }
    let 状态: AppState | null = null
    const 读取 = () => {
      状态 = useAppStore()
      return <button onClick={() => 状态!.createDoc('word', '<p>原文</p>', { 路径: 旧路径 })}>打开原件</button>
    }
    render(<AppProvider 初始最近文档={[条目]}><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开原件'))

    await expect(状态!.renameDoc(条目.id, '已改名')).rejects.toThrow('重新打开')
    expect(renameFile).not.toHaveBeenCalled()
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('真实重命名失败时保留原路径和名称', async () => {
    const 旧路径 = 'C:\\资料\\原件.docx'
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        renameFile: vi.fn().mockResolvedValue({ 成功: false, 错误: '目标文件已存在' }),
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      },
    })
    const 条目 = { ...RECENT_DOCS[0], id: `recent-${旧路径}`, name: '原件.docx', 路径: 旧路径 }
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="最近路径">{状态.docs[0]?.路径}</span> }
    render(<AppProvider 初始最近文档={[条目]}><读取 /></AppProvider>)
    await expect(状态!.renameDoc(条目.id, '冲突.docx')).rejects.toThrow('目标文件已存在')
    expect(screen.getByTestId('最近路径')).toHaveTextContent(旧路径)
    expect(状态!.docs[0].name).toBe('原件.docx')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('删除文档后总数减少', async () => {
    渲染探针()
    const 前总数 = Number(screen.getByTestId('total-count').textContent)
    await userEvent.click(screen.getByText('删除首篇'))
    expect(Number(screen.getByTestId('total-count').textContent)).toBe(前总数 - 1)
  })

  it('删除已打开的文档后选中标识被清空', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('选中首篇'))
    expect(screen.getByTestId('active-id')).toHaveTextContent('d01')
    await userEvent.click(screen.getByText('删除首篇'))
    expect(screen.getByTestId('active-id')).toHaveTextContent('无')
  })

  it('新建文档后编辑器文档列表增加一项', async () => {
    渲染探针()
    expect(screen.getByTestId('editor-doc-count')).toHaveTextContent('0')
    await userEvent.click(screen.getByText('新建文字文档'))
    expect(screen.getByTestId('editor-doc-count')).toHaveTextContent('1')
    expect(screen.getByTestId('module')).toHaveTextContent('word')
    expect(screen.getByTestId('active-doc-name')).toHaveTextContent('未命名文档.docx')
  })

  it('打开本地文件保留真实文件名和路径', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('打开本地文字'))
    expect(screen.getByTestId('active-doc-name')).toHaveTextContent('原件.docx')
    expect(screen.getByTestId('active-doc-path')).toHaveTextContent('C:\\资料\\原件.docx')
  })

  it('PDF 文件进入阅读工作台且不创建空白编辑标签', async () => {
    let 状态: AppState | null = null
    const 读取 = () => {
      状态 = useAppStore()
      return <span data-testid="当前PDF">{状态.PDF待预览?.名称 ?? '无'}</span>
    }
    render(<AppProvider><button onClick={() => 状态!.createDoc('pdf', 'JVBERi0=', { 路径: 'C:\\资料\\说明.pdf' })}>打开PDF</button><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开PDF'))
    expect(状态!.module).toBe('pdf')
    expect(状态!.documents).toHaveLength(0)
    expect(screen.getByTestId('当前PDF')).toHaveTextContent('说明.pdf')
  })

  it('更新文档内容后写回列表', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('新建文字文档'))
    await userEvent.click(screen.getByText('写入内容'))
    expect(screen.getByTestId('active-doc-html')).toHaveTextContent('新内容')
  })

  it('关闭最后一个文档后回到首页', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('新建文字文档'))
    await userEvent.click(screen.getByText('关闭当前文档'))
    expect(screen.getByTestId('editor-doc-count')).toHaveTextContent('0')
    expect(screen.getByTestId('module')).toHaveTextContent('home')
  })

  it('在 Provider 之外使用时抛出中文异常', () => {    // 抑制 React 对错误边界的控制台告警，保持测试输出整洁
    const 原始错误 = console.error
    console.error = () => {}
    expect(() => render(<探针 />)).toThrowError(/必须在 AppProvider 内使用/)
    console.error = 原始错误
  })
})

describe('createDoc 按文档保存模型', () => {
  it('首页与文字、表格、PDF 通过全局标签切换且保持各文档状态', async () => {
    let 状态: AppState | null = null
    const 读取 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('word', '<p>原文</p>')}>新建文字</button>
        <button onClick={() => 状态!.createDoc('table')}>新建表格</button>
        <button onClick={() => 状态!.createDoc('pdf', 'JVBERi0=', { 路径: 'C:\\资料\\手册.pdf' })}>打开手册</button>
        <button onClick={() => 状态!.selectWorkspaceTab('home')}>选择首页</button>
        <button onClick={() => 状态!.selectWorkspaceTab(状态!.workspaceTabs[0].id)}>选择文字</button>
        <button onClick={() => 状态!.selectWorkspaceTab(状态!.workspaceTabs[2].id)}>选择手册</button>
        <span data-testid="当前模块">{状态.module}</span>
        <span data-testid="标签顺序">{状态.workspaceTabs.map((项) => 项.name).join('、')}</span>
      </>
    }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('新建文字'))
    const 文字标识 = 状态!.activeDocumentId!
    状态!.updateEditorHtml(文字标识, '<p>修改</p>')
    await userEvent.click(screen.getByText('新建表格'))
    await userEvent.click(screen.getByText('打开手册'))
    expect(screen.getByTestId('标签顺序')).toHaveTextContent('未命名文档.docx、未命名表格.xlsx、手册.pdf')
    expect(状态!.workspaceTabs[0].dirty).toBe(true)
    await userEvent.click(screen.getByText('选择首页'))
    expect(screen.getByTestId('当前模块')).toHaveTextContent('home')
    await userEvent.click(screen.getByText('选择文字'))
    expect(screen.getByTestId('当前模块')).toHaveTextContent('word')
    expect(状态!.documents.find((项) => 项.id === 文字标识)?.html).toBe('<p>修改</p>')
    await userEvent.click(screen.getByText('选择手册'))
    expect(screen.getByTestId('当前模块')).toHaveTextContent('pdf')
    expect(状态!.PDF待预览?.名称).toBe('手册.pdf')
  })

  it('保存后标签立即使用磁盘文件名及已保存状态，后续修改重新标为未保存', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <button onClick={() => 状态!.createDoc('word', '<p>原文</p>')}>创建文档</button> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('创建文档'))
    const 标识 = 状态!.activeDocumentId!
    expect(状态!.workspaceTabs[0]).toMatchObject({ name: '未命名文档.docx', dirty: true, path: null })
    act(() => {
      状态!.set文档路径(标识, 'C:\\资料\\正式稿.docx')
      状态!.markDocumentSaved(标识, '<p>原文</p>')
    })
    expect(状态!.workspaceTabs[0]).toMatchObject({ name: '正式稿.docx', dirty: false, path: 'C:\\资料\\正式稿.docx' })
    act(() => 状态!.updateEditorHtml(标识, '<p>再改</p>'))
    expect(状态!.workspaceTabs[0].dirty).toBe(true)
  })

  it('文字页面设置按文档隔离，修改后标记未保存且保存后清除标记', () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="布局标签">{状态.workspaceTabs[0]?.dirty ? '未保存' : '已保存'}</span> }
    render(<AppProvider><读取 /></AppProvider>)
    const 页面设置 = { 纸张: 'A5', 纸张方向: '横向' as const, 页边距: '窄', 分栏: '两栏', 水印: '无', 页面边框: '方框', 页面颜色: '#FFF2CC', 文字方向: '竖排' as const }
    act(() => 状态!.createDoc('word', '<p>正文</p>', { 路径: 'C:\\资料\\页面.docx', 页面设置 }))
    const 标识 = 状态!.activeDocumentId!
    expect(状态!.documents[0].页面设置).toEqual(页面设置)
    expect(screen.getByTestId('布局标签')).toHaveTextContent('已保存')
    act(() => 状态!.更新文字页面设置(标识, { ...页面设置, 纸张方向: '纵向' }))
    expect(screen.getByTestId('布局标签')).toHaveTextContent('未保存')
    act(() => 状态!.markDocumentSaved(标识, '<p>正文</p>'))
    expect(screen.getByTestId('布局标签')).toHaveTextContent('已保存')
  })

  it('关闭混合类型标签后切换到相邻标签并保留首页', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <>
      <button onClick={() => 状态!.createDoc('word')}>文字</button>
      <button onClick={() => 状态!.createDoc('pdf', 'JVBERi0=', { 路径: 'C:\\资料\\说明.pdf' })}>说明</button>
      <button onClick={() => 状态!.closeWorkspaceTab(状态!.workspaceTabs[1].id)}>关闭说明</button>
    </> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('文字'))
    await userEvent.click(screen.getByText('说明'))
    expect(状态!.module).toBe('pdf')
    await userEvent.click(screen.getByText('关闭说明'))
    expect(状态!.module).toBe('word')
    expect(状态!.workspaceTabs).toHaveLength(1)
    expect(状态!.workspaceTabs[0].name).toBe('未命名文档.docx')
  })

  it('表格和演示保存基线随模型变化更新标签状态', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <>
      <button onClick={() => 状态!.createDoc('table')}>建表格</button>
      <button onClick={() => 状态!.createDoc('ppt')}>建演示</button>
    </> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('建表格'))
    const 表格标识 = 状态!.activeDocumentId!
    act(() => {
      状态!.set文档路径(表格标识, 'C:\\资料\\核算.xlsx')
      状态!.markDocumentSaved(表格标识, '', JSON.stringify(状态!.表格文档模型[表格标识]))
    })
    expect(状态!.workspaceTabs.find((项) => 项.id === 表格标识)).toMatchObject({ name: '核算.xlsx', dirty: false })
    act(() => 状态!.更新表格文档模型(表格标识, (当前) => [{ ...当前[0], name: '已修改' }]))
    expect(状态!.workspaceTabs.find((项) => 项.id === 表格标识)?.dirty).toBe(true)
    await userEvent.click(screen.getByText('建演示'))
    const 演示标识 = 状态!.activeDocumentId!
    act(() => {
      状态!.set文档路径(演示标识, 'C:\\资料\\汇报.pptx')
      状态!.markDocumentSaved(演示标识, '', JSON.stringify(状态!.演示文档模型[演示标识]))
    })
    expect(状态!.workspaceTabs.find((项) => 项.id === 演示标识)).toMatchObject({ name: '汇报.pptx', dirty: false })
    act(() => 状态!.更新演示文档模型(演示标识, (当前) => ({ ...当前, name: '已修改' })))
    expect(状态!.workspaceTabs.find((项) => 项.id === 演示标识)?.dirty).toBe(true)
  })

  it('同一路径 PDF 更新内容时复用标签并立即预览新版本', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <>
      <button onClick={() => 状态!.createDoc('pdf', '旧数据', { 路径: 'C:\\资料\\说明.pdf' })}>打开旧版</button>
      <button onClick={() => 状态!.createDoc('pdf', '新数据', { 路径: 'C:\\资料\\说明.pdf' })}>打开新版</button>
    </> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开旧版'))
    await userEvent.click(screen.getByText('打开新版'))
    expect(状态!.workspaceTabs).toHaveLength(1)
    expect(状态!.PDF待预览?.数据).toBe('新数据')
  })

  it('文件选择器添加无磁盘路径的 PDF 时以真实文件名建立标签', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <>
      <button onClick={() => 状态!.createDoc('pdf', 'PDF数据', { 名称: '上传手册.pdf' })}>添加文件</button>
      <button onClick={() => 状态!.createDoc('pdf', '另一份数据', { 名称: '上传手册.pdf' })}>添加同名文件</button>
      <button onClick={() => 状态!.selectWorkspaceTab(状态!.workspaceTabs[0].id)}>切回首份</button>
    </> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('添加文件'))
    expect(状态!.workspaceTabs).toHaveLength(1)
    expect(状态!.workspaceTabs[0]).toMatchObject({ name: '上传手册.pdf', path: null, dirty: false })
    expect(状态!.PDF待预览?.名称).toBe('上传手册.pdf')
    expect(状态!.PDF待预览?.数据).toBe('PDF数据')
    await userEvent.click(screen.getByText('添加同名文件'))
    expect(状态!.workspaceTabs).toHaveLength(2)
    expect(状态!.PDF待预览?.数据).toBe('另一份数据')
    await userEvent.click(screen.getByText('切回首份'))
    expect(状态!.PDF待预览).toMatchObject({ 名称: '上传手册.pdf', 数据: 'PDF数据' })
  })

  it('无磁盘路径的 PDF 重启后从工作状态恢复内容', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const readFile = vi.fn()
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: JSON.stringify({
        pdfDocuments: [{ id: '本地上传一', name: '上传手册.pdf', path: null, data: 'PDF数据' }],
        activePdfId: '本地上传一',
        activeModule: 'pdf',
        workspaceOrder: ['本地上传一'],
      }) })),
      readFile,
      backupSave: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="上传标签">{状态.workspaceTabs[0]?.name ?? '无'}</span> }
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(screen.getByTestId('上传标签')).toHaveTextContent('上传手册.pdf'))
    expect(状态!.PDF待预览?.数据).toBe('PDF数据')
    expect(readFile).not.toHaveBeenCalled()
    localStorage.removeItem('seal-session-restore')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('关闭工作状态恢复设置后不加载旧备份并清除持久状态', async () => {
    localStorage.setItem('seal-session-restore', 'false')
    const backupClear = vi.fn(async () => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: JSON.stringify({
        documents: [{ id: '旧文档', name: '旧文档.docx', html: '<p>旧内容</p>', 已保存Html: '<p>旧内容</p>', type: 'word' }],
        activeDocumentId: '旧文档',
      }) })),
      backupClear,
      backupSave: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="打开标签数">{状态.workspaceTabs.length}</span> }
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(backupClear).toHaveBeenCalled())
    expect(screen.getByTestId('打开标签数')).toHaveTextContent('0')
    expect(状态!.module).toBe('home')
    localStorage.removeItem('seal-session-restore')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('工作状态偏好读取失败时告知用户且不加载或清除备份', async () => {
    const 原读取 = Storage.prototype.getItem
    const 读取 = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, 键: string) {
      if (键 === 'seal-session-restore') throw new Error('偏好文件不可读')
      return 原读取.call(this, 键)
    })
    const 弹窗 = vi.spyOn(Modal, 'error').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const backupLoad = vi.fn(async () => ({ 成功: true, 内容: JSON.stringify({ documents: [{ id: '旧文档', name: '旧文档.docx', html: '<p>旧内容</p>', 已保存Html: '<p>旧内容</p>', type: 'word' }] }) }))
    const backupClear = vi.fn(async () => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { backupLoad, backupClear, backupSave: vi.fn(async () => ({ 成功: true })) } })
    try {
      render(<AppProvider><探针 /></AppProvider>)
      await waitFor(() => expect(弹窗).toHaveBeenCalledWith(expect.objectContaining({ title: '读取工作状态设置失败' })))
      expect(screen.getByTestId('editor-doc-count')).toHaveTextContent('0')
      expect(backupClear).not.toHaveBeenCalled()
    } finally {
      读取.mockRestore()
      弹窗.mockRestore()
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it.each([
    ['无法解析的内容', '{未闭合', ''],
    ['空文件', '', '备份文件格式无效'],
    ['缺少表格模型', JSON.stringify({ documents: [{ id: '损坏表格', name: '损坏表格.xlsx', html: '', type: 'table' }] }), '备份内容缺少表格或演示模型'],
    ['无效文档列表', JSON.stringify({ documents: '不是文档列表' }), '备份结构无效'],
  ])('启动备份含%s时先保留原文件，再允许当前会话正常备份', async (_情形, 原始内容, 错误片段) => {
    localStorage.setItem('seal-session-restore', 'true')
    const 确认弹窗 = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const 信息弹窗 = vi.spyOn(Modal, 'info').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const 备份保留 = vi.fn(async () => ({ 成功: true, 路径: 'C:\\用户数据\\backup\\autosave-invalid.json' }))
    const 备份写入 = vi.fn(async (_内容: string) => ({ 成功: true }))
    const 备份清理 = vi.fn(async () => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: 原始内容 })),
      backupPreserve: 备份保留, backupSave: 备份写入, backupClear: 备份清理,
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(确认弹窗).toHaveBeenCalledOnce())
      const 选项 = 确认弹窗.mock.calls[0][0]
      expect(选项.title).toBe('工作状态恢复失败')
      expect(String(选项.content)).toContain(错误片段)
      expect(选项.okText).toBe('保留原备份并继续')
      expect(选项.cancelText).toBe('重试恢复')
      expect(状态!.启动恢复结束).toBe(false)
      expect(await 状态!.刷新工作状态备份()).toMatchObject({ 成功: false })
      expect(备份写入).not.toHaveBeenCalled()
      expect(备份清理).not.toHaveBeenCalled()

      await act(async () => { await 选项.onOk?.() })
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      expect(备份保留).toHaveBeenCalledWith(原始内容)
      expect(信息弹窗).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('autosave-invalid.json') }))
      act(() => 状态!.createDoc('word', '<p>当前内容</p>'))
      await act(async () => { expect(await 状态!.刷新工作状态备份()).toMatchObject({ 成功: true }) })
      expect(备份写入).toHaveBeenCalledOnce()
      expect(JSON.parse(备份写入.mock.calls[0][0]).documents[0].html).toBe('<p>当前内容</p>')
    } finally {
      确认弹窗.mockRestore()
      信息弹窗.mockRestore()
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('启动备份恢复失败后选择重试能恢复原内容且不移动备份', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const 确认弹窗 = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const 备份读取 = vi.fn()
      .mockResolvedValueOnce({ 成功: true, 内容: '{未闭合' })
      .mockResolvedValueOnce({ 成功: true, 内容: JSON.stringify({ documents: [{ id: '原文', name: '原文.docx', html: '<p>已恢复</p>', type: 'word' }] }) })
    const 备份保留 = vi.fn(async () => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: 备份读取, backupPreserve: 备份保留,
      backupSave: vi.fn(async () => ({ 成功: true })), backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(确认弹窗).toHaveBeenCalledOnce())
      await act(async () => { await 确认弹窗.mock.calls[0][0].onCancel?.() })
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      expect(备份读取).toHaveBeenCalledTimes(2)
      expect(备份保留).not.toHaveBeenCalled()
      expect(状态!.documents[0].html).toBe('<p>已恢复</p>')
    } finally {
      确认弹窗.mockRestore()
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('原始备份未能保留时不得放行新备份覆盖', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const 确认弹窗 = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const 错误弹窗 = vi.spyOn(Modal, 'error').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const 备份写入 = vi.fn(async () => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: '{未闭合' })),
      backupPreserve: vi.fn(async () => ({ 成功: false, 错误: '备份目录只读' })),
      backupSave: 备份写入, backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(确认弹窗).toHaveBeenCalledOnce())
      await act(async () => { await expect(确认弹窗.mock.calls[0][0].onOk?.()).rejects.toThrow('备份目录只读') })
      expect(错误弹窗).toHaveBeenCalledWith(expect.objectContaining({ title: '保留原备份失败', content: expect.stringContaining('备份目录只读') }))
      expect(状态!.启动恢复结束).toBe(false)
      expect(await 状态!.刷新工作状态备份()).toMatchObject({ 成功: false })
      expect(备份写入).not.toHaveBeenCalled()
    } finally {
      确认弹窗.mockRestore()
      错误弹窗.mockRestore()
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('部分 PDF 标签无效时先保留完整原备份，再恢复其余文档', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const 原始内容 = JSON.stringify({
      documents: [{ id: '文字一', name: '草稿.docx', html: '<p>草稿</p>', type: 'word' }],
      pdfDocuments: [{ id: '损坏PDF', name: '损坏.pdf', path: null }],
    })
    const 警告弹窗 = vi.spyOn(Modal, 'warning').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const 备份保留 = vi.fn(async () => ({ 成功: true, 路径: 'C:\\用户数据\\backup\\autosave-invalid.json' }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: 原始内容 })),
      backupPreserve: 备份保留,
      backupSave: vi.fn(async () => ({ 成功: true })), backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      expect(备份保留).toHaveBeenCalledWith(原始内容)
      expect(状态!.documents[0].html).toBe('<p>草稿</p>')
      expect(状态!.pdfDocuments).toHaveLength(0)
      expect(警告弹窗).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('autosave-invalid.json') }))
    } finally {
      警告弹窗.mockRestore()
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('恢复工作状态时重新读取 PDF 文件并保留与文字的标签顺序', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: JSON.stringify({
        documents: [{ id: '文字一', name: '记录.docx', html: '<p>记录</p>', 已保存Html: '<p>记录</p>', type: 'word' }],
        activeDocumentId: '文字一',
        文档路径: { 文字一: 'C:\\资料\\记录.docx' },
        pdfDocuments: [{ id: 'PDF一', name: '手册.pdf', path: 'C:\\资料\\手册.pdf' }],
        activePdfId: 'PDF一',
        activeModule: 'pdf',
        workspaceOrder: ['PDF一', '文字一'],
      }) })),
      readFile: vi.fn(async () => ({ 成功: true, 二进制: true, 内容: 'JVBERi0=', 扩展名: '.pdf' })),
      backupSave: vi.fn(async () => ({ 成功: true })),
      backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="恢复标签">{状态.workspaceTabs.map((项) => 项.name).join('、')}</span> }
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(screen.getByTestId('恢复标签')).toHaveTextContent('手册.pdf、记录.docx'))
    expect(状态!.module).toBe('pdf')
    expect(状态!.PDF待预览?.数据).toBe('JVBERi0=')
    localStorage.removeItem('seal-session-restore')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('工作状态开关当次切换为开启时写入当前打开标签', async () => {
    localStorage.setItem('seal-session-restore', 'false')
    const backupSave = vi.fn(async (_内容: string) => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })),
      backupClear: vi.fn(async () => ({ 成功: true })),
      backupSave,
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <button onClick={() => 状态!.createDoc('word')}>创建当前文档</button> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('创建当前文档'))
    expect(backupSave).not.toHaveBeenCalled()
    act(() => {
      localStorage.setItem('seal-session-restore', 'true')
      window.dispatchEvent(new Event('seal-session-setting-changed'))
    })
    await waitFor(() => expect(backupSave).toHaveBeenCalled(), { timeout: 3500 })
    expect(JSON.parse(backupSave.mock.calls[0][0]).documents).toHaveLength(1)
    localStorage.removeItem('seal-session-restore')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('已保存文件刚打开即可刷新工作区备份，无须等待自动备份定时器', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const backupSave = vi.fn(async (_内容: string) => ({ 成功: true }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })), backupSave,
      backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span data-testid="刚打开标签数">{状态.workspaceTabs.length}</span> }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      act(() => 状态!.createDoc('word', '<p>正式稿</p>', { 路径: 'C:\\资料\\正式稿.docx' }))
      expect(screen.getByTestId('刚打开标签数')).toHaveTextContent('1')
      expect(状态!.workspaceTabs[0].dirty).toBe(false)
      expect(backupSave).not.toHaveBeenCalled()

      await act(async () => { expect(await 状态!.刷新工作状态备份()).toMatchObject({ 成功: true }) })

      expect(backupSave).toHaveBeenCalledOnce()
      expect(JSON.parse(backupSave.mock.calls[0][0])).toMatchObject({
        activeDocumentId: 状态!.activeDocumentId,
        workspaceOrder: [状态!.activeDocumentId],
        documents: [{ name: '正式稿.docx', html: '<p>正式稿</p>' }],
      })
    } finally {
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('关闭前刷新等待进行中的自动备份，再写入最新编辑内容', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    let 完成旧备份: ((结果: { 成功: boolean }) => void) | undefined
    let 写入次数 = 0
    const backupSave = vi.fn((_内容: string): Promise<{ 成功: boolean }> => {
      写入次数 += 1
      return 写入次数 === 1
        ? new Promise<{ 成功: boolean }>((完成) => { 完成旧备份 = 完成 })
        : Promise.resolve({ 成功: true })
    })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })), backupSave,
      backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span>{状态.documents[0]?.html ?? '空'}</span> }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      act(() => 状态!.createDoc('word', '<p>旧内容</p>', { 路径: 'C:\\资料\\报告.docx' }))
      await waitFor(() => expect(backupSave).toHaveBeenCalledOnce(), { timeout: 3500 })
      const 标识 = 状态!.activeDocumentId!
      act(() => 状态!.updateEditorHtml(标识, '<p>最新内容</p>'))
      const 刷新 = 状态!.刷新工作状态备份()
      await Promise.resolve()
      expect(backupSave).toHaveBeenCalledOnce()

      完成旧备份?.({ 成功: true })
      expect(await 刷新).toMatchObject({ 成功: true })
      expect(backupSave).toHaveBeenCalledTimes(2)
      expect(JSON.parse(backupSave.mock.calls[1][0]).documents[0].html).toBe('<p>最新内容</p>')
    } finally {
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('关闭前备份写入失败时返回具体错误，不将失败当成成功', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const backupSave = vi.fn(async () => ({ 成功: false, 错误: '磁盘空间不足' }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })), backupSave,
      backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <span>{状态.workspaceTabs.length}</span> }
    try {
      render(<AppProvider><读取 /></AppProvider>)
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      act(() => 状态!.createDoc('word', '<p>内容</p>', { 路径: 'C:\\资料\\报告.docx' }))
      const 结果 = await 状态!.刷新工作状态备份()
      expect(结果).toMatchObject({ 成功: false, 错误: '磁盘空间不足' })
      expect(backupSave).toHaveBeenCalledOnce()
    } finally {
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('自动备份错误使用当前深色主题的应用弹窗', async () => {
    localStorage.setItem('seal-session-restore', 'true')
    const 静态弹窗 = vi.spyOn(Modal, 'error').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    const backupSave = vi.fn(async () => ({ 成功: false, 错误: '磁盘空间不足' }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: null })), backupSave,
      backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => {
      状态 = useAppStore()
      const { token } = theme.useToken()
      return <><output data-testid="弹窗主题底色">{token.colorBgElevated}</output><span>{状态.workspaceTabs.length}</span></>
    }
    try {
      render(<ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}><AntdApp><AppProvider><读取 /></AppProvider></AntdApp></ConfigProvider>)
      await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
      act(() => 状态!.createDoc('word'))
      await waitFor(() => expect(backupSave).toHaveBeenCalledOnce(), { timeout: 3500 })
      expect(screen.getByTestId('弹窗主题底色')).toHaveTextContent('#1f1f1f')
      expect(静态弹窗).not.toHaveBeenCalled()
      expect((await screen.findByText('磁盘空间不足')).closest('[role="dialog"]')).toHaveClass('ant-modal')
    } finally {
      静态弹窗.mockRestore()
      localStorage.removeItem('seal-session-restore')
      Reflect.deleteProperty(window, 'electronAPI')
    }
  })

  it('跨类型标签切换与关闭后进入剩余文档所属编辑器', async () => {
    let 状态: AppState | null = null
    const 读取 = () => {
      状态 = useAppStore()
      return <>
        <button onClick={() => 状态!.createDoc('table')}>新建表格</button>
        <button onClick={() => 状态!.createDoc('word')}>新建文字</button>
        <button onClick={() => 状态!.setActiveDocumentId(状态!.documents.find((文档) => 文档.type === 'table')?.id ?? null)}>切到表格标签</button>
        <button onClick={() => 状态!.closeEditorDoc(状态!.activeDocumentId ?? '')}>关闭当前标签</button>
        <span data-testid="当前模块">{状态.module}</span>
      </>
    }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('新建表格'))
    await userEvent.click(screen.getByText('新建文字'))
    await userEvent.click(screen.getByText('切到表格标签'))
    expect(screen.getByTestId('当前模块')).toHaveTextContent('table')
    await userEvent.click(screen.getByText('关闭当前标签'))
    expect(screen.getByTestId('当前模块')).toHaveTextContent('word')
  })

  it('自动备份包含表格模型和路径，重新启动后恢复为可编辑表格', async () => {
    let 备份内容: string | null = null
    const backupSave = vi.fn(async (内容: string) => {
      备份内容 = 内容
      return { 成功: true }
    })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn(async () => ({ 成功: true, 内容: 备份内容 })),
        backupSave,
        backupClear: vi.fn(async () => ({ 成功: true })),
      },
    })
    let 状态: AppState | null = null
    const 读取 = () => {
      状态 = useAppStore()
      return <span data-testid="恢复模型">{状态.module === 'table' ? 状态.表格文档模型[状态.activeDocumentId ?? '']?.[0]?.单元格.A1?.原始值 ?? '空' : '首页'}</span>
    }
    const 首次 = render(<AppProvider><button onClick={() => 状态!.createDoc('table', '<table><tr><td>预算</td></tr></table>', { 路径: 'C:\\资料\\预算.xlsx' })}>打开表格</button><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开表格'))
    await waitFor(() => expect(backupSave).toHaveBeenCalled(), { timeout: 3500 })
    expect(JSON.parse(备份内容!).表格文档模型[状态!.activeDocumentId!][0].单元格.A1.原始值).toBe('预算')
    首次.unmount()
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(screen.getByTestId('恢复模型')).toHaveTextContent('预算'))
    expect(状态!.文档路径[状态!.activeDocumentId!]).toBe('C:\\资料\\预算.xlsx')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('零页演示的保存基线和路径可以静默备份恢复', async () => {
    let 备份内容: string | null = null
    const backupSave = vi.fn(async (内容: string) => { 备份内容 = 内容; return { 成功: true } })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: 备份内容 })), backupSave,
      backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    const 首次 = render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(window.electronAPI!.backupLoad).toHaveBeenCalled())
    act(() => 状态!.createDoc('ppt', { id: 'empty', name: '空演示', 幻灯片列表: [], 当前索引: 0 }, { 路径: 'E:\\Temp\\空演示.pptx' }))
    await waitFor(() => expect(backupSave).toHaveBeenCalled(), { timeout: 3500 })
    首次.unmount()
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(状态!.documents).toHaveLength(1))
    expect(状态!.演示文档模型[状态!.activeDocumentId!].幻灯片列表).toEqual([])
    expect(状态!.workspaceTabs[0].dirty).toBe(false)
    expect(状态!.文档路径[状态!.activeDocumentId!]).toBe('E:\\Temp\\空演示.pptx')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('旧演示备份升级模型版本后保持原文与已保存状态', async () => {
    const 旧稿 = 创建演示文稿('旧备份.pptx')
    delete 旧稿.模型版本
    delete 旧稿.资源索引
    旧稿.幻灯片列表[0].文本框列表[0].颜色 = '#000000'
    const 备份 = JSON.stringify({
      documents: [{ id: '旧标签', name: '旧备份.pptx', html: '', 已保存Html: '', 已保存模型: JSON.stringify(旧稿), type: 'ppt' }],
      activeDocumentId: '旧标签', 文档路径: { 旧标签: 'E:\\资料\\旧备份.pptx' },
      演示文档模型: { 旧标签: 旧稿 }, activeModule: 'ppt', workspaceOrder: ['旧标签'],
    })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: 备份 })),
      backupSave: vi.fn(async () => ({ 成功: true })), backupClear: vi.fn(async () => ({ 成功: true })),
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
    expect(状态!.演示文档模型.旧标签.模型版本).toBe(2)
    expect(状态!.演示文档模型.旧标签.幻灯片列表[0].文本框列表[0].颜色).toBe('#000000')
    expect(状态!.workspaceTabs[0].dirty).toBe(false)
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('演示资源随工作区备份导出并在恢复时先还原字节', async () => {
    let 备份内容: string | null = null
    const 指纹 = 'b'.repeat(64)
    const 同步 = vi.fn(async () => ({ 成功: true }))
    const 恢复 = vi.fn(async () => ({ 成功: true }))
    const 导出 = vi.fn(async () => ({ 成功: true, 条目: [{ 标识: 指纹, 类型: 'image/png', 数据: 'YWJj' }] }))
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      backupLoad: vi.fn(async () => ({ 成功: true, 内容: 备份内容 })),
      backupSave: vi.fn(async (内容: string) => { 备份内容 = 内容; return { 成功: true } }),
      backupClear: vi.fn(async () => ({ 成功: true })),
      presentationResources: { sync: 同步, restore: 恢复, export: 导出, release: vi.fn(async () => ({ 成功: true })) },
    } })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return null }
    const 首次 = render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(状态!.启动恢复结束).toBe(true))
    const 文稿 = 创建演示文稿('资源演示.pptx')
    文稿.资源索引 = { [指纹]: { 指纹, 类型: 'image/png', 字节数: 3 } }
    文稿.幻灯片列表[0].对象列表 = [{ id: '图一', 类型: '图片', x: 0, y: 0, width: 50, height: 50, 资源标识: 指纹 }]
    act(() => 状态!.createDoc('ppt', 文稿, { 路径: 'E:\\资料\\资源.pptx' }))
    await waitFor(() => expect(备份内容).not.toBeNull(), { timeout: 3500 })
    expect(JSON.parse(备份内容!).演示资源字节).toEqual([{ 标识: 指纹, 类型: 'image/png', 数据: 'YWJj' }])
    首次.unmount()
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(状态!.演示文档模型[状态!.activeDocumentId!]?.幻灯片列表[0].对象列表).toHaveLength(1))
    expect(恢复).toHaveBeenCalledWith([{ 标识: 指纹, 类型: 'image/png', 数据: 'YWJj' }])
    expect(同步).toHaveBeenCalledWith(expect.stringContaining('文稿:'), [指纹])
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('表格主入口创建并重开时保留页面设置与单元格布局元数据', async () => {
    let 状态: AppState | null = null
    const 来源 = [{
      名称: '预算', html: '<table><tr><td>标题</td><td></td></tr></table>',
      页面设置: { 页边距: '窄', 方向: '横向', 纸张大小: 'A5' },
      元数据: {
        单元格格式: { A1: { 加粗: true, 字体颜色: '#336699' } },
        合并区域: ['A1:B1'], 列宽: { 0: 120 }, 行高: { 0: 32 },
        冻结: { 行: 1, 列: 0 }, 筛选: { 列: 0, 值: '标题' },
      },
    }]
    const 读取 = () => { 状态 = useAppStore(); return <button onClick={() => 状态!.createDoc('table', 来源, { 路径: 'C:\\资料\\预算.xlsx' })}>打开预算</button> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开预算'))
    const 首次标识 = 状态!.activeDocumentId!
    const 检查 = () => {
      const 表 = 状态!.表格文档模型[状态!.activeDocumentId!][0]
      expect(表.页面设置).toEqual(来源[0].页面设置)
      expect(表.单元格.A1.格式).toEqual(来源[0].元数据.单元格格式.A1)
      expect(表.合并区域).toEqual(['A1:B1'])
      expect(表.列宽[0]).toBe(120)
      expect(表.行高[0]).toBe(32)
      expect(表.冻结).toEqual({ 行: 1, 列: 0 })
      expect(表.筛选).toEqual({ 列: 0, 值: '标题' })
    }
    检查()
    act(() => 状态!.closeEditorDoc(首次标识))
    await userEvent.click(screen.getByText('打开预算'))
    expect(状态!.activeDocumentId).not.toBe(首次标识)
    检查()
  })

  it('状态层拒绝绕过工作表保护和数据验证的外部更新', async () => {
    const 警告 = vi.spyOn(Modal, 'warning').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }))
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <button onClick={() => 状态!.createDoc('table', '<table><tr><td>待办</td></tr></table>')}>打开受控表</button> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('打开受控表'))
    const 标识 = 状态!.activeDocumentId!
    act(() => 状态!.更新表格文档模型(标识, (当前) => [{ ...当前[0], 保护: '本机' }]))
    act(() => 状态!.更新表格文档模型(标识, (当前) => [写入单元格(当前[0], 'A1', '绕过保护')]))
    expect(状态!.表格文档模型[标识][0].单元格.A1.原始值).toBe('待办')
    expect(警告).toHaveBeenCalledWith(expect.objectContaining({ title: '表格更新已阻止' }))
    act(() => 状态!.更新表格文档模型(标识, (当前) => [{ ...写入单元格(当前[0], 'A1', '同时改写'), 保护: undefined }]))
    expect(状态!.表格文档模型[标识][0].保护).toBe('本机')
    expect(状态!.表格文档模型[标识][0].单元格.A1.原始值).toBe('待办')
    act(() => 状态!.更新表格文档模型(标识, []))
    expect(状态!.表格文档模型[标识]).toHaveLength(1)
    act(() => 状态!.更新表格文档模型(标识, (当前) => [{ ...当前[0], 保护: undefined }]))
    expect(状态!.表格文档模型[标识][0].保护).toBeUndefined()
    act(() => 状态!.更新表格文档模型(标识, (当前) => [设置数据验证(当前[0], 'A1', { 类型: '列表', 选项: ['待办', '完成'], 允许空白: false })]))
    act(() => 状态!.更新表格文档模型(标识, (当前) => [写入单元格(当前[0], 'A1', '错误状态')]))
    expect(状态!.表格文档模型[标识][0].单元格.A1.原始值).toBe('待办')
    act(() => 状态!.更新表格文档模型(标识, (当前) => {
      const 改写 = 写入单元格(当前[0], 'A1', '删除规则并改写')
      return [{ ...改写, 单元格: { ...改写.单元格, A1: { ...改写.单元格.A1, 数据验证: undefined } } }]
    }))
    expect(状态!.表格文档模型[标识][0].单元格.A1.原始值).toBe('待办')
    act(() => 状态!.更新表格文档模型(标识, (当前) => [{ ...当前[0], 保护: '外部' }]))
    act(() => 状态!.更新表格文档模型(标识, (当前) => [{ ...当前[0], 保护: undefined }]))
    expect(状态!.表格文档模型[标识][0].保护).toBe('外部')
    警告.mockRestore()
  })

  it('word 类型的初始 HTML 直接写入新建文档', async () => {
    let 抓取: AppState | null = null
    const Probe = () => {
      抓取 = useAppStore()
      return null
    }
    render(
      <AppProvider>
        <button onClick={() => 抓取!.createDoc('word', '<p>模板正文</p>')}>注入</button>
        <Probe />
      </AppProvider>
    )
    fireEvent.click(screen.getByText('注入'))
    await waitFor(() => {
      expect(抓取!.documents[抓取!.documents.length - 1].html).toBe('<p>模板正文</p>')
    })
  })

  it('仅指定名称的新文字结果在标签中使用该名称', async () => {
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <button onClick={() => 状态!.createDoc('word', '<p>合并正文</p>', { 名称: '邮件合并结果.docx' })}>生成结果</button> }
    render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('生成结果'))
    const 文档 = 状态!.documents.find((项) => 项.id === 状态!.activeDocumentId)
    expect(文档).toMatchObject({ name: '邮件合并结果.docx', html: '<p>合并正文</p>' })
    expect(文档?.来源路径).toBeUndefined()
  })

  it('文字文档的已保存基线随编辑、保存和备份恢复持续有效', async () => {
    let 备份内容: string | null = null
    const backupSave = vi.fn(async (内容: string) => {
      备份内容 = 内容
      return { 成功: true }
    })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        backupLoad: vi.fn(async () => ({ 成功: true, 内容: 备份内容 })),
        backupSave,
        backupClear: vi.fn(async () => ({ 成功: true })),
      },
    })
    let 状态: AppState | null = null
    const 读取 = () => {
      const 当前状态 = useAppStore()
      状态 = 当前状态
      const 文档 = 当前状态.documents.find((项) => 项.id === 当前状态.activeDocumentId)
      return <>
        <span data-testid="保存基线">{文档?.已保存Html ?? '无'}</span>
        <button onClick={() => 当前状态.createDoc('word', '<p>原文</p>')}>创建基线文档</button>
        <button onClick={() => 当前状态.updateEditorHtml(当前状态.activeDocumentId!, '<p>未保存</p>')}>首次修改</button>
        <button onClick={() => 当前状态.markDocumentSaved(当前状态.activeDocumentId!, '<p>未保存</p>')}>标记保存</button>
        <button onClick={() => 当前状态.updateEditorHtml(当前状态.activeDocumentId!, '<p>再次修改</p>')}>再次修改</button>
      </>
    }
    const 首次 = render(<AppProvider><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('创建基线文档'))
    await waitFor(() => expect(screen.getByTestId('保存基线')).toHaveTextContent('原文'))
    const 标识 = 状态!.activeDocumentId!
    await userEvent.click(screen.getByText('首次修改'))
    await waitFor(() => expect(状态!.documents.find((项) => 项.id === 标识)?.html).toBe('<p>未保存</p>'))
    expect(状态!.documents.find((项) => 项.id === 标识)?.已保存Html).toBe('<p>原文</p>')
    await userEvent.click(screen.getByText('再次修改'))
    await userEvent.click(screen.getByText('标记保存'))
    await waitFor(() => expect(screen.getByTestId('保存基线')).toHaveTextContent('未保存'))
    expect(状态!.documents.find((项) => 项.id === 标识)?.html).toBe('<p>再次修改</p>')
    await waitFor(() => expect(JSON.parse(备份内容!).documents[0].html).toBe('<p>再次修改</p>'), { timeout: 3500 })
    expect(JSON.parse(备份内容!).documents[0].已保存Html).toBe('<p>未保存</p>')
    首次.unmount()
    render(<AppProvider><读取 /></AppProvider>)
    await waitFor(() => expect(状态!.documents[0]?.html).toBe('<p>再次修改</p>'))
    expect(状态!.documents[0].已保存Html).toBe('<p>未保存</p>')
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('重开最近文档后等待访问记录并刷新时间顺序', async () => {
    const 文档 = { ...RECENT_DOCS[0], type: 'word' as const, 路径: 'C:\\资料\\甲.txt', name: '甲.txt', starred: true }
    const recentAdd = vi.fn().mockResolvedValue({ 成功: true })
    const recentList = vi.fn().mockResolvedValue({ 成功: true, 数据: [
      { 路径: 文档.路径, 名称: 文档.name, 类型: 'word', 时间: Date.now(), 置顶: true },
    ] })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '正文', 二进制: false, 扩展名: '.txt' }),
        recentAdd,
        recentList,
        backupLoad: vi.fn().mockResolvedValue({ 成功: true, 内容: null }),
      },
    })
    let 状态: AppState | null = null
    const 读取 = () => { 状态 = useAppStore(); return <><span data-testid="首篇最近">{状态.docs[0]?.name ?? '无'}</span><button onClick={() => void 状态!.openDoc(文档)}>重开文档</button></> }
    render(<AppProvider 初始最近文档={[{ ...文档, name: '旧名称' }]}><读取 /></AppProvider>)
    await userEvent.click(screen.getByText('重开文档'))
    await waitFor(() => expect(screen.getByTestId('首篇最近')).toHaveTextContent('甲.txt'))
    expect(recentAdd).toHaveBeenCalledWith(expect.objectContaining({ 路径: 文档.路径, 置顶: true }))
    await userEvent.click(screen.getByText('重开文档'))
    await waitFor(() => expect(recentAdd).toHaveBeenCalledTimes(2))
    expect(recentAdd).toHaveBeenNthCalledWith(2, expect.objectContaining({ 路径: 文档.路径, 置顶: true }))
    expect(recentList).toHaveBeenCalledTimes(2)
    Reflect.deleteProperty(window, 'electronAPI')
  })

  it('table 类型的初始内容按编辑标签标识保存', async () => {
    let 抓取: AppState | null = null
    const Probe = () => {
      抓取 = useAppStore()
      return null
    }
    render(
      <AppProvider>
        <button onClick={() => 抓取!.createDoc('table', '<table><tbody><tr><td>1</td></tr></tbody></table>')}>注入</button>
        <Probe />
      </AppProvider>
    )
    fireEvent.click(screen.getByText('注入'))
    await waitFor(() => expect(抓取!.activeDocumentId).not.toBeNull())
    expect(抓取!.表格文档模型[抓取!.activeDocumentId!][0].单元格.A1.显示值).toBe('1')
  })

  it('已保存演示只翻页保持已保存，修改正文仍显示未保存，撤销正文修改后恢复', async () => {
    let 状态!: AppState
    const 读取 = () => { 状态 = useAppStore(); return null }
    render(<AppProvider><读取 /></AppProvider>)
    const 文稿 = 创建演示文稿('核验演示')
    文稿.幻灯片列表.push({ ...文稿.幻灯片列表[0], id: '第二页', 文本框列表: 文稿.幻灯片列表[0].文本框列表.map((框) => ({ ...框, id: `${框.id}-第二页` })) })
    act(() => 状态.createDoc('ppt', 文稿, { 路径: 'C:\\资料\\核验演示.pptx' }))
    const 标识 = 状态.activeDocumentId!
    expect(状态.workspaceTabs[0].dirty).toBe(false)
    act(() => 状态.更新演示文档模型(标识, { ...文稿, 当前索引: 1 }))
    expect(状态.workspaceTabs[0].dirty).toBe(false)
    const 已修改 = { ...文稿, 当前索引: 1, 幻灯片列表: 文稿.幻灯片列表.map((页, 索引) => 索引 === 0 ? { ...页, 文本框列表: 页.文本框列表.map((框) => ({ ...框, text: '修改后的标题' })) } : 页) }
    act(() => 状态.更新演示文档模型(标识, 已修改))
    expect(状态.workspaceTabs[0].dirty).toBe(true)
    act(() => 状态.更新演示文档模型(标识, { ...文稿, 当前索引: 1 }))
    expect(状态.workspaceTabs[0].dirty).toBe(false)
  })

  it('ppt 类型的初始演示文稿按编辑标签标识保存', async () => {
    let 抓取: AppState | null = null
    const Probe = () => {
      抓取 = useAppStore()
      return null
    }
    const 演示 = { ...创建演示文稿('测试.pptx'), id: 'd1' }
    render(
      <AppProvider>
        <button onClick={() => 抓取!.createDoc('ppt', 演示)}>注入</button>
        <Probe />
      </AppProvider>
    )
    fireEvent.click(screen.getByText('注入'))
    await waitFor(() => expect(抓取!.activeDocumentId).not.toBeNull())
    expect(抓取!.演示文档模型[抓取!.activeDocumentId!].id).toBe('d1')
  })
})
