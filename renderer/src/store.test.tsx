import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppStore } from './store'

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
      <button onClick={() => 状态.setModule('word')}>切模块</button>
      <button onClick={() => 状态.setNavKey('star')}>切星标</button>
      <button onClick={() => 状态.setViewMode('list')}>切列表</button>
      <button onClick={() => 状态.setSortKey('size')}>切排序</button>
      <button onClick={() => 状态.toggleStar(状态.docs[0].id)}>切首个星标</button>
      <button onClick={() => 状态.handleNav('pdf', 提示文本 ?? (() => {}))}>切PDF工具</button>
      <button onClick={() => 状态.renameDoc(状态.docs[0].id, '新名称.docx')}>重命名首篇</button>
      <button onClick={() => 状态.renameDoc(状态.docs[0].id, '  新名称.docx  ')}>重命名带空白</button>
      <button onClick={() => 状态.renameDoc(状态.docs[0].id, '   ')}>重命名空名</button>
      <button onClick={() => 状态.removeDoc(状态.docs[0].id)}>删除首篇</button>
      <button onClick={() => 状态.setActiveDocId(状态.docs[0].id)}>选中首篇</button>
      <button onClick={() => 状态.createDoc('word')}>新建文字文档</button>
      <button onClick={() => 状态.updateEditorHtml(状态.activeDocumentId ?? '', '<p>新内容</p>')}>
        写入内容
      </button>
      <button onClick={() => 状态.closeEditorDoc(状态.activeDocumentId ?? '')}>关闭当前文档</button>
    </div>
  )
}

const 渲染探针 = (提示文本?: (文本: string) => void) =>
  render(
    <AppProvider>
      <探针 提示文本={提示文本} />
    </AppProvider>
  )

describe('应用状态层', () => {
  it('初始处于首页、网格视图、按时间排序', () => {
    渲染探针()
    expect(screen.getByTestId('module')).toHaveTextContent('home')
    expect(screen.getByTestId('nav')).toHaveTextContent('home')
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
    expect(screen.getByTestId('sort')).toHaveTextContent('time')
  })

  it('初始展示全部示例文档', () => {
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

  it('重命名文档后名称更新', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('重命名首篇'))
    expect(screen.getByTestId('first-name')).toHaveTextContent('新名称.docx')
  })

  it('重命名时首尾空白被剔除', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('重命名带空白'))
    expect(screen.getByTestId('first-name').textContent).toBe('新名称.docx')
  })

  it('重命名为纯空白时不生效', async () => {
    渲染探针()
    const 原名 = screen.getByTestId('first-name').textContent
    await userEvent.click(screen.getByText('重命名空名'))
    expect(screen.getByTestId('first-name').textContent).toBe(原名)
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
