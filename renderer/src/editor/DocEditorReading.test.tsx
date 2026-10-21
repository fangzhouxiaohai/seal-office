import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import DocEditor from './DocEditor'
import type { 文字页面设置 } from '../office/docModel'

const 原文 = '<h1>阅读验证</h1><p style="font-size:12pt">正文<b>格式保留</b></p><table><tbody><tr><td>表格</td></tr></tbody></table>'
const 页面设置: 文字页面设置 = { 纸张: 'A4', 纸张方向: '纵向', 页边距: '常规', 分栏: '两栏', 水印: '无', 页面边框: '无', 页面颜色: '无', 文字方向: '横排', 页眉Html: '<p>原始页眉</p>', 页脚Html: '<p>原始页脚</p>' }
function 创建入口() {
  const store = useAppStore()
  return <>
    <button onClick={() => store.createDoc('word', 原文, { 路径: '/seal/阅读.docx', 页面设置 })}>导入阅读文档</button>
    <button onClick={() => store.createDoc('word')}>新建空白文档</button>
    <output data-testid="document-state">{JSON.stringify(store.documents.find(item => item.id === store.activeDocumentId))}</output>
  </>
}
function 渲染(移动端 = true) {
  if (移动端) {
    document.documentElement.dataset.sealPlatform = 'web'
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: true, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }))
  }
  return render(<ConfigProvider button={{ autoInsertSpace: false }}><AntdApp><AppProvider><创建入口 /><DocEditor /></AppProvider></AntdApp></ConfigProvider>)
}
afterEach(() => {
  delete document.documentElement.dataset.sealPlatform
  localStorage.removeItem('seal-office.reading-font-size')
  vi.restoreAllMocks()
})

describe('移动文字阅读模式', () => {
  it('全屏只读层保留原编辑节点、页面设置和字号进度，返回后恢复入口焦点', async () => {
    const {container}=渲染()
    await userEvent.click(screen.getByRole('button',{name:'导入阅读文档'}))
    const editor=container.querySelector('.wps-editor-canvas__content')!,html=editor.innerHTML,state=screen.getByTestId('document-state').textContent
    const entry=screen.getByRole('button',{name:'全屏左右翻页阅读'})
    await userEvent.click(entry)
    const reader=screen.getByRole('dialog',{name:'文字全屏阅读'})
    expect(reader.querySelector('[contenteditable]')).toHaveAttribute('contenteditable','false')
    expect(within(reader).queryByRole('button',{name:'放大阅读内容'})).toBeNull()
    fireEvent.doubleClick(within(reader).getByLabelText('文字左右翻页阅读区'))
    expect(within(reader).getByText('按屏重排 · 双指缩放')).toBeVisible()
    await userEvent.click(within(reader).getByRole('button',{name:'放大阅读内容'}))
    expect(within(reader).getByLabelText('阅读缩放')).toHaveTextContent('125%')
    fireEvent.keyDown(reader,{key:'Escape',isComposing:true});expect(reader).toBeInTheDocument()
    fireEvent.keyDown(reader,{key:'Escape'})
    expect(screen.queryByRole('dialog',{name:'文字全屏阅读'})).toBeNull()
    expect(entry).toHaveFocus()
    expect(container.querySelector('.wps-editor-canvas__content')).toBe(editor)
    expect(editor.innerHTML).toBe(html);expect(screen.getByTestId('document-state').textContent).toBe(state)
    await userEvent.click(entry)
    fireEvent.doubleClick(screen.getByLabelText('文字左右翻页阅读区'))
    expect(screen.getByLabelText('阅读缩放')).toHaveTextContent('125%')
    fireEvent(window,new Event('seal-before-native-back',{cancelable:true}))
    expect(screen.queryByRole('dialog',{name:'文字全屏阅读'})).toBeNull()
    expect(editor.innerHTML).toBe(html);expect(screen.getByTestId('document-state').textContent).toBe(state)
  })
  it('导入文档只读浏览、字号和查找不改变正文及页面设置，切换编辑保留原节点', async () => {
    const { container } = 渲染()
    await userEvent.click(screen.getByRole('button', { name: '导入阅读文档' }))
    const 工具栏 = screen.getByRole('toolbar', { name: '文档阅读与编辑' })
    const 根 = container.querySelector('.wps-editor-canvas__content')!
    const 原始HTML = 根.innerHTML
    const 原状态 = screen.getByTestId('document-state').textContent
    expect(根).toHaveAttribute('contenteditable', 'false')
    expect(screen.getByLabelText('页眉')).toHaveAttribute('contenteditable', 'false')
    expect(screen.getByLabelText('页脚')).toHaveAttribute('contenteditable', 'false')
    expect(screen.queryByRole('tab', { name: '开始' })).toBeNull()
    fireEvent.change(screen.getByLabelText('阅读字号'), { target: { value: '28' } })
    expect(container.querySelector('.wps-editor-workspace')).toHaveStyle({ '--seal-reading-font-size': '1.75rem' })
    await userEvent.click(within(工具栏).getByRole('button', { name: '查找' }))
    expect(screen.queryByPlaceholderText('替换为')).toBeNull()
    await userEvent.type(screen.getByPlaceholderText('查找内容'), '格式保留')
    await userEvent.click(screen.getByRole('button', { name: '查找下一个' }))
    expect(window.getSelection()?.toString()).toBe('格式保留')
    expect(根.innerHTML).toBe(原始HTML)
    expect(screen.getByTestId('document-state').textContent).toBe(原状态)
    await userEvent.click(within(工具栏).getByRole('button', { name: '编辑' }))
    expect(container.querySelector('.wps-editor-canvas__content')).toBe(根)
    expect(根).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByLabelText('页眉')).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByPlaceholderText('替换为')).toBeInTheDocument()
    expect(screen.getByTestId('document-state').textContent).toBe(原状态)
    expect(根.innerHTML).toBe(原始HTML)
  })

  it('新建文档默认编辑，进入阅读后正文快捷格式命令被阻止', async () => {
    const { container } = 渲染()
    await userEvent.click(screen.getByRole('button', { name: '新建空白文档' }))
    const 工具栏 = screen.getByRole('toolbar', { name: '文档阅读与编辑' })
    const 根 = container.querySelector('.wps-editor-canvas__content')!
    expect(根).toHaveAttribute('contenteditable', 'true')
    await userEvent.click(within(工具栏).getByRole('button', { name: '阅读' }))
    const 原始HTML = 根.innerHTML
    const 执行 = vi.spyOn(document, 'execCommand')
    fireEvent.keyDown(根, { key: 'b', ctrlKey: true })
    expect(执行).not.toHaveBeenCalled()
    expect(根).toHaveAttribute('contenteditable', 'false')
    expect(根.innerHTML).toBe(原始HTML)
    fireEvent.keyDown(根, { key: 'r', ctrlKey: true, altKey: true })
    expect(根).toHaveAttribute('contenteditable', 'true')
    fireEvent.keyDown(根, { key: 'r', ctrlKey: true, altKey: true })
    expect(根).toHaveAttribute('contenteditable', 'false')
    expect(根.innerHTML).toBe(原始HTML)
  })

  it('桌面导入保持原有页面编辑模式', async () => {
    const { container } = 渲染(false)
    await userEvent.click(screen.getByRole('button', { name: '导入阅读文档' }))
    expect(screen.queryByRole('toolbar', { name: '文档阅读与编辑' })).toBeNull()
    expect(container.querySelector('.wps-editor-workspace--reading')).toBeNull()
    expect(container.querySelector('.wps-editor-canvas__content')).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByLabelText('页眉')).toHaveAttribute('contenteditable', 'true')
  })
})
