import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import { AppProvider } from '../store'
import { saveShortcutOverrides, SHORTCUT_STORAGE_KEY } from '../shortcuts/shortcuts'
import SheetEditor from './SheetEditor'
import GridView from './GridView'
import { 创建工作表, 设置数据验证 } from './model'

afterEach(() => { localStorage.removeItem(SHORTCUT_STORAGE_KEY); vi.unstubAllGlobals() })
const openSheet = () => render(<AntdApp><AppProvider><SheetEditor /></AppProvider></AntdApp>)

describe('表格可配置快捷键集成', () => {
  it('全选改绑后旧键不生效，新键实时作用于实际表格', () => {
    saveShortcutOverrides({ 'sheet:edit.selectAll': ['Ctrl+Alt+A'] })
    const { container, getByLabelText } = openSheet()
    const grid = container.querySelector('.wps-sheet')!
    fireEvent.keyDown(grid, { key: 'a', ctrlKey: true })
    expect((getByLabelText('名称框') as HTMLInputElement).value).toBe('A1')
    fireEvent.keyDown(grid, { key: 'a', ctrlKey: true, altKey: true })
    expect((getByLabelText('名称框') as HTMLInputElement).value).toBe('A1:Z100')
  })

  it('中文输入法候选确认不移动选区，禁用快捷键不触发命令', () => {
    saveShortcutOverrides({ 'sheet:edit.selectAll': [] })
    const { container, getByLabelText } = openSheet()
    const grid = container.querySelector('.wps-sheet')!
    fireEvent.keyDown(grid, { key: 'a', ctrlKey: true })
    expect((getByLabelText('名称框') as HTMLInputElement).value).toBe('A1')
    fireEvent.keyDown(grid, { key: 'ArrowRight', isComposing: true, keyCode: 229 })
    expect((getByLabelText('名称框') as HTMLInputElement).value).toBe('A1')
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    expect((getByLabelText('名称框') as HTMLInputElement).value).toBe('B1')
  })

  it('真实单元格编辑时输入法 Enter 和 Escape 不提前提交或取消，转换结束后正常提交', () => {
    const { container } = openSheet()
    const cell = container.querySelector('[data-地址="A1"]')!
    fireEvent.doubleClick(cell)
    const input = container.querySelector('.wps-sheet__editor') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'zhong' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(container.querySelector('.wps-sheet__editor')).toBe(input)
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 })
    expect(container.querySelector('.wps-sheet__editor')).toBe(input)
    fireEvent.change(input, { target: { value: '中文候选' } })
    fireEvent.compositionEnd(input)
    // Safari 等环境的候选确认可能已经 isComposing=false，但仍带 229。
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 229 })
    expect(container.querySelector('.wps-sheet__editor')).toBe(input)
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 })
    expect(container.querySelector('.wps-sheet__editor')).toBeNull()
    expect(cell.textContent).toBe('中文候选')
  })

  it('验证列表编辑控件也先让输入法完成候选确认，随后正常提交选项', () => {
    const sheet = 设置数据验证(创建工作表('列表'), 'A1', { 类型: '列表', 选项: ['待办', '完成'], 允许空白: true })
    const submit = vi.fn(), cancel = vi.fn()
    const { getByRole } = render(<GridView 工作表={sheet} 选区={{ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } }} 编辑地址="A1" 编辑值="待办" on选中={vi.fn()} on双击={vi.fn()} on编辑值变化={vi.fn()} on提交编辑={submit} on取消编辑={cancel} on选中整列={vi.fn()} on选中整行={vi.fn()} on全选={vi.fn()} />)
    const select = getByRole('combobox', { name: 'A1 选项' })
    fireEvent.keyDown(select, { key: 'Enter', isComposing: true, keyCode: 229 })
    fireEvent.keyDown(select, { key: 'Escape', isComposing: true, keyCode: 229 })
    expect(submit).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
    fireEvent.keyDown(select, { key: 'Enter', keyCode: 13 })
    expect(submit).toHaveBeenCalledOnce()
  })

  it('公式栏内输入法候选确认不提交半成品，转换结束后保存完整中文', () => {
    const { container, getByLabelText } = openSheet()
    const formula = getByLabelText('公式栏')
    fireEvent.change(formula, { target: { value: 'zhong' } })
    fireEvent.keyDown(formula, { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(getByLabelText('名称框')).toHaveValue('A1')
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('')
    expect(formula).toHaveValue('zhong')
    fireEvent.change(formula, { target: { value: '中文公式栏' } })
    fireEvent.keyDown(formula, { key: 'Enter', keyCode: 13 })
    expect(container.querySelector('[data-地址="A1"]')?.textContent).toBe('中文公式栏')
    expect(getByLabelText('名称框')).toHaveValue('A2')
  })
})

describe('表格系统粘贴', () => {
  // 网格不可编辑，浏览器不会派发 paste 事件；Ctrl+V 由粘贴命令主动读取系统剪贴板。
  const 模拟剪贴板 = (条目: { types: string[]; getType: (类型: string) => Promise<Blob> }[]) =>
    vi.stubGlobal('navigator', { ...navigator, clipboard: { read: async () => 条目, readText: async () => '', writeText: async () => {} } })
  it('Ctrl+V 把制表符文本写入选中单元格', async () => {
    模拟剪贴板([{ types: ['text/plain'], getType: async () => new Blob(['甲\t乙\n丙\t丁'], { type: 'text/plain' }) }])
    const { container, findByText } = openSheet()
    fireEvent.keyDown(container.querySelector('.wps-sheet')!, { key: 'v', ctrlKey: true })
    expect(await findByText('丁')).toBeTruthy()
  })
  it('截图（剪贴板只有图片）按 Ctrl+V 插入为工作表图片', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0))
    const 图 = new Blob([png], { type: 'image/png' })
    Object.defineProperty(图, 'arrayBuffer', { value: async () => png.buffer })
    模拟剪贴板([{ types: ['image/png'], getType: async () => 图 }])
    // jsdom 不解码图片：用最小替身模拟浏览器解码完成后的尺寸。
    vi.stubGlobal('Image', class { naturalWidth = 1; naturalHeight = 1; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_值: string) { queueMicrotask(() => this.onload?.()) } })
    const { container, findByText } = openSheet()
    fireEvent.keyDown(container.querySelector('.wps-sheet')!, { key: 'v', ctrlKey: true })
    expect(await findByText('图片已插入')).toBeTruthy()
  })
})
