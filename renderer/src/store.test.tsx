import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppStore, type AppState } from './store'
import { RECENT_DOCS } from './mock/recentDocs'

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
    const renameFile = vi.fn().mockResolvedValue({ 成功: true, 路径: 新路径, 名称: '已改名.docx' })
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
        <button onClick={() => 状态!.createDoc('word', '<p>原文</p>', { 路径: 旧路径 })}>打开原件</button>
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
    expect(renameFile).toHaveBeenCalledWith(旧路径, '已改名')
    expect(screen.getByTestId('编辑路径')).toHaveTextContent(新路径)
    expect(screen.getByTestId('编辑名称')).toHaveTextContent('已改名.docx')
    expect(状态!.docs[0].id).toBe(`recent-${新路径}`)
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

  it('ppt 类型的初始演示文稿按编辑标签标识保存', async () => {
    let 抓取: AppState | null = null
    const Probe = () => {
      抓取 = useAppStore()
      return null
    }
    const 演示 = { id: 'd1', name: '测试.pptx', 幻灯片列表: [{ id: 's1' }], 当前索引: 0 }
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
