import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditorCanvas from './EditorCanvas'
import Ruler from './Ruler'
import DocumentTabs from './DocumentTabs'
import EditorStatusBar from './EditorStatusBar'

describe('编辑区', () => {
  it('渲染可编辑容器并写入初始内容', () => {
    const { container } = render(<EditorCanvas html="<p>初始内容</p>" />)
    const 编辑区 = container.querySelector('.wps-editor-canvas__content')
    expect(编辑区).not.toBeNull()
    expect(编辑区?.getAttribute('contenteditable')).toBe('true')
    expect(编辑区?.innerHTML).toBe('<p>初始内容</p>')
  })

  it('内容变化时回传最新 HTML', () => {
    const 回调 = vi.fn()
    const { container } = render(<EditorCanvas html="<p>初始</p>" onChange={回调} />)
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    编辑区.innerHTML = '<p>改后</p>'
    fireEvent.input(编辑区)
    expect(回调).toHaveBeenCalledWith('<p>改后</p>')
  })

  it('显示段落标记时带对应类名', () => {
    const { container } = render(<EditorCanvas html="<p>内容</p>" showParagraphMark />)
    expect(container.querySelector('.wps-editor-canvas--marks')).not.toBeNull()
  })

  it('缩放比例写入纸张样式', () => {
    const { container } = render(<EditorCanvas html="<p>内容</p>" scale={1.5} />)
    const 纸张 = container.querySelector('.wps-editor-canvas__paper') as HTMLElement
    expect(纸张.style.transform).toContain('1.5')
  })
})

describe('水平标尺', () => {
  it('渲染标尺与三个缩进标记', () => {
    const { container } = render(<Ruler />)
    expect(container.querySelector('.wps-ruler')).not.toBeNull()
    expect(container.querySelectorAll('.wps-ruler__marker')).toHaveLength(3)
  })
})

describe('文档标签栏', () => {
  const 文档列表 = [
    { id: 'w1', name: '未命名文档.docx' },
    { id: 'w2', name: '季度报告.docx' },
  ]

  it('渲染全部文档标签', () => {
    render(
      <DocumentTabs documents={文档列表} activeId="w1" onSelect={() => {}} onClose={() => {}} onCreate={() => {}} />
    )
    expect(screen.getByText('未命名文档.docx')).toBeInTheDocument()
    expect(screen.getByText('季度报告.docx')).toBeInTheDocument()
  })

  it('当前标签带选中类名', () => {
    const { container } = render(
      <DocumentTabs documents={文档列表} activeId="w2" onSelect={() => {}} onClose={() => {}} onCreate={() => {}} />
    )
    const 选中项 = container.querySelectorAll('.wps-doc-tab--active')
    expect(选中项).toHaveLength(1)
    expect(选中项[0].textContent).toContain('季度报告.docx')
  })

  it('点击标签回传其标识', async () => {
    const 切换 = vi.fn()
    render(
      <DocumentTabs documents={文档列表} activeId="w1" onSelect={切换} onClose={() => {}} onCreate={() => {}} />
    )
    await userEvent.click(screen.getByText('季度报告.docx'))
    expect(切换).toHaveBeenCalledWith('w2')
  })

  it('点击关闭按钮只触发关闭，不触发切换', async () => {
    const 切换 = vi.fn()
    const 关闭 = vi.fn()
    render(
      <DocumentTabs documents={文档列表} activeId="w1" onSelect={切换} onClose={关闭} onCreate={() => {}} />
    )
    await userEvent.click(screen.getAllByRole('button', { name: /关闭/ })[0])
    expect(关闭).toHaveBeenCalledWith('w1')
    expect(切换).not.toHaveBeenCalled()
  })

  it('点击新建触发新建回调', async () => {
    const 新建 = vi.fn()
    render(
      <DocumentTabs documents={文档列表} activeId="w1" onSelect={() => {}} onClose={() => {}} onCreate={新建} />
    )
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(新建).toHaveBeenCalledTimes(1)
  })
})

describe('编辑器状态栏', () => {
  it('展示页码、字数与缩放', () => {
    render(<EditorStatusBar 页码={1} 总页数={3} 字数={256} 缩放={1} on缩放变化={() => {}} />)
    expect(screen.getByText(/第 1 页/)).toBeInTheDocument()
    expect(screen.getByText(/共 3 页/)).toBeInTheDocument()
    expect(screen.getByText(/字数：256/)).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('点击放大回传更大的缩放比例', async () => {
    const 回调 = vi.fn()
    render(<EditorStatusBar 页码={1} 总页数={1} 字数={0} 缩放={1} on缩放变化={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(回调).toHaveBeenCalledWith(1.1)
  })

  it('点击缩小回传更小的缩放比例', async () => {
    const 回调 = vi.fn()
    render(<EditorStatusBar 页码={1} 总页数={1} 字数={0} 缩放={1} on缩放变化={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '缩小' }))
    expect(回调).toHaveBeenCalledWith(0.9)
  })

  it('缩放不超过上下限', async () => {
    const 回调 = vi.fn()
    render(<EditorStatusBar 页码={1} 总页数={1} 字数={0} 缩放={2} on缩放变化={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(回调).toHaveBeenCalledWith(2)
  })

  it('点击百分比复位为一倍', async () => {
    const 回调 = vi.fn()
    render(<EditorStatusBar 页码={1} 总页数={1} 字数={0} 缩放={1.5} on缩放变化={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '恢复百分之百' }))
    expect(回调).toHaveBeenCalledWith(1)
  })
})
