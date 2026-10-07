import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import SheetEditor from './SheetEditor'
import { AppProvider, useAppStore } from '../store'
import { SettingsProvider } from '../store/settingsStore'

beforeEach(() => {
  // jsdom 不实现布局：Range 与元素矩形都给合成值，浮窗才拿得到锚点位置
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 120, y: 240, left: 120, top: 240, right: 220, bottom: 260, width: 100, height: 20, toJSON: () => ({}) }),
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 120, y: 240, left: 120, top: 240, right: 220, bottom: 260, width: 100, height: 20, toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'electronAPI')
})

const 渲染表格 = () => {
  const 创建入口 = () => {
    const { createDoc } = useAppStore()
    return <button onClick={() => createDoc('table', '<table><tr><td>数量</td><td>金额</td></tr><tr><td>1</td><td>100</td></tr></table>')}>打开浮窗表格</button>
  }
  return render(
    <SettingsProvider>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntdApp>
          <AppProvider>
            <创建入口 />
            <SheetEditor />
          </AppProvider>
        </AntdApp>
      </ConfigProvider>
    </SettingsProvider>
  )
}

/** 拖动选中一片单元格，触发多格选区 */
const 拖选 = (容器: HTMLElement, 起: string, 止: string) => {
  const 起始格 = 容器.querySelector(`[data-地址="${起}"]`) as HTMLElement
  const 结束格 = 容器.querySelector(`[data-地址="${止}"]`) as HTMLElement
  fireEvent.mouseDown(起始格, { button: 0 })
  fireEvent.mouseMove(结束格)
  fireEvent.mouseUp(document)
  return { 起始格, 结束格 }
}

describe('表格编辑器选区浮窗', () => {
  it('拖选多格后浮出面板，单选单元格不出现', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗表格' }))
    expect(screen.queryByRole('toolbar', { name: '选中单元格操作' })).toBeNull()

    // 单选一个有内容的单元格也不打扰：浮窗只在跨多格时出现
    const 单格 = container.querySelector('[data-地址="A1"]') as HTMLElement
    fireEvent.mouseDown(单格, { button: 0 })
    fireEvent.mouseUp(document)
    expect(screen.queryByRole('toolbar', { name: '选中单元格操作' })).toBeNull()

    拖选(container, 'A1', 'B2')
    const 面板 = await screen.findByRole('toolbar', { name: '选中单元格操作' })
    for (const 名称 of ['复制', '剪切', '加粗', '斜体', '下划线', '字体颜色（红色）', '填充（黄色）', '居中', '合并居中', '自动换行', '求和', '清除内容']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
    for (const 名称 of ['润色', '翻译', '总结']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
  })

  it('面板按钮走表格真实命令，AI 动作把选区文本交给助手', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗表格' }))
    拖选(container, 'A1', 'B2')
    const 面板 = await screen.findByRole('toolbar', { name: '选中单元格操作' })

    await userEvent.click(within(面板).getByRole('button', { name: '加粗' }))
    await waitFor(() => {
      // 加粗写入单元格格式，网格按格式渲染为 600 字重
      const 单元格 = container.querySelector('[data-地址="A1"]') as HTMLElement
      expect(单元格.getAttribute('style') ?? '').toMatch(/font-weight:\s*(600|bold)/i)
    })

    const 收到 = vi.fn()
    window.addEventListener('seal-assistant-ask', 收到)
    try {
      await userEvent.click(within(面板).getByRole('button', { name: '总结' }))
      expect(收到).toHaveBeenCalledOnce()
      const 文本 = (收到.mock.calls[0][0] as CustomEvent<{ 文本: string }>).detail.文本
      expect(文本).toContain('总结')
      // 选区文本按行给出，包含表头与数据
      expect(文本).toContain('数量')
      expect(文本).toContain('100')
    } finally {
      window.removeEventListener('seal-assistant-ask', 收到)
    }
  })

  it('Esc 收起面板', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗表格' }))
    拖选(container, 'A1', 'B2')
    await screen.findByRole('toolbar', { name: '选中单元格操作' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '选中单元格操作' })).toBeNull())
  })
})

describe('表格编辑器右键菜单扩充', () => {
  it('菜单包含填充、字体颜色、数据与 AI 分组，颜色项作用到选区', async () => {
    const { container } = 渲染表格()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗表格' }))
    拖选(container, 'A1', 'B2')
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.contextMenu(网格)

    const 菜单 = await screen.findByRole('menu')
    expect(within(菜单).getByText('填充颜色')).toBeInTheDocument()
    expect(within(菜单).getByText('字体颜色')).toBeInTheDocument()
    expect(within(菜单).getByText('数据')).toBeInTheDocument()
    expect(within(菜单).getByText('AI 润色')).toBeInTheDocument()

    await userEvent.click(within(菜单).getByRole('menuitem', { name: '黄色' }))
    await waitFor(() => {
      const 单元格 = container.querySelector('[data-地址="A1"]') as HTMLElement
      expect(单元格.getAttribute('style') ?? '').toMatch(/FFF176|255,\s*241,\s*118/i)
    })
  })
})
