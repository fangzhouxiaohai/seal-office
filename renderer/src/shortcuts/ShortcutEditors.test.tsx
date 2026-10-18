import { afterEach, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import DocEditor from '../editor/DocEditor'
import PptEditor from '../ppt/PptEditor'
import { AppProvider, useAppStore } from '../store'
import { saveShortcutOverrides, SHORTCUT_STORAGE_KEY } from './shortcuts'

afterEach(() => { localStorage.removeItem(SHORTCUT_STORAGE_KEY) })

it('文字编辑器只用重新分配的查找键，并保持查找输入框本地按键和正文内容', () => {
  saveShortcutOverrides({ 'word:edit.find': ['Ctrl+Alt+F'] })
  const Create = () => {
    const state = useAppStore()
    return <button onClick={() => state.createDoc('word', '<p>快捷键样本</p>')}>打开快捷键文字</button>
  }
  const { container } = render(<AntdApp><AppProvider><Create /><DocEditor /></AppProvider></AntdApp>)
  fireEvent.click(screen.getByText('打开快捷键文字'))
  const editor = container.querySelector('.wps-editor-canvas__content')!
  fireEvent.keyDown(editor, { key: 'f', ctrlKey: true })
  expect(screen.queryByPlaceholderText('查找内容')).not.toBeInTheDocument()
  fireEvent.keyDown(editor, { key: 'f', ctrlKey: true, altKey: true })
  const search = screen.getByPlaceholderText('查找内容')
  fireEvent.change(search, { target: { value: '样本' } })
  fireEvent.keyDown(search, { key: 'b', ctrlKey: true })
  expect(editor.textContent).toBe('快捷键样本')
  expect(search).toHaveValue('样本')
})

it('演示编辑器快捷键新增幻灯片后，Ctrl+Shift+Z 正确重做而不是再次撤销', () => {
  const { container } = render(<AntdApp><AppProvider><PptEditor /></AppProvider></AntdApp>)
  const count = () => container.querySelectorAll('.wps-ppt-thumb').length
  const before = count()
  fireEvent.keyDown(document, { key: 'm', ctrlKey: true })
  const after = count()
  expect(after).toBe(before + 1)
  fireEvent.keyDown(document, { key: 'z', ctrlKey: true })
  expect(count()).toBe(before)
  fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })
  expect(count()).toBe(after)
})
