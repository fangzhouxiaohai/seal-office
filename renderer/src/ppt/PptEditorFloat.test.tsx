import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import PptEditor from './PptEditor'
import { AppProvider, useAppStore } from '../store'
import { SettingsProvider } from '../store/settingsStore'
import { 创建演示文稿 } from './deck'

const 演示文稿 = () => {
  const 文稿 = 创建演示文稿()
  const 页 = 文稿.幻灯片列表[0]
  // 保留默认文本框的全部必需字段，只替换文字内容，避免构造出模型校验不通过的文稿
  const 原框 = 页.文本框列表[0]
  页.文本框列表 = [{ ...原框, text: '浮窗演示文本', 片段列表: [{ 文本: '浮窗演示文本' }] }] as never
  return 文稿
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 300, y: 200, left: 300, top: 200, right: 500, bottom: 320, width: 200, height: 120, toJSON: () => ({}),
  } as DOMRect)
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'electronAPI')
})

const 渲染演示 = () => {
  const 创建入口 = () => {
    const { createDoc } = useAppStore()
    return <button onClick={() => createDoc('ppt', 演示文稿())}>打开浮窗演示</button>
  }
  return render(
    <SettingsProvider>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntdApp>
          <AppProvider>
            <创建入口 />
            <PptEditor />
          </AppProvider>
        </AntdApp>
      </ConfigProvider>
    </SettingsProvider>
  )
}

/** 用文本框上的 mousedown 完成对象选中（与既有测试一致） */
const 选中文本框 = (容器: HTMLElement) => {
  const 框 = 容器.querySelector('.wps-ppt-box') as HTMLElement
  fireEvent.mouseDown(框)
  return 框
}

describe('演示编辑器选区浮窗', () => {
  it('选中对象后浮出面板，含对象操作、文本格式与 AI 快捷动作', async () => {
    const { container } = 渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗演示' }))
    expect(screen.queryByRole('toolbar', { name: '选中对象操作' })).toBeNull()

    选中文本框(container)
    await waitFor(() => expect(container.querySelector('.wps-ppt-box--selected')).not.toBeNull())

    const 面板 = await screen.findByRole('toolbar', { name: '选中对象操作' })
    for (const 名称 of ['复制', '剪切', '粘贴', '删除对象', '置于顶层', '置于底层', '左对齐', '水平居中', '右对齐', '加粗', '斜体', '下划线', '字体颜色（红色）']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
    for (const 名称 of ['润色', '翻译', '总结']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
  })

  it('对象操作接到真实对象操作：锁定对象时如实给出原因', async () => {
    const { container } = 渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗演示' }))
    选中文本框(container)
    const 面板 = await screen.findByRole('toolbar', { name: '选中对象操作' })

    // 默认版式里的文本框处于锁定状态：按钮走真实对象操作，由模型守卫给出原因而不是静默失败
    await userEvent.click(within(面板).getByRole('button', { name: '删除对象' }))
    expect(await screen.findByText(/已锁定/)).toBeInTheDocument()
  })

  it('AI 动作把选中对象文本交给助手', async () => {
    const { container } = 渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗演示' }))
    选中文本框(container)
    const 面板 = await screen.findByRole('toolbar', { name: '选中对象操作' })

    const 收到 = vi.fn()
    window.addEventListener('seal-assistant-ask', 收到)
    try {
      await userEvent.click(within(面板).getByRole('button', { name: '总结' }))
      expect(收到).toHaveBeenCalledOnce()
      const 文本 = (收到.mock.calls[0][0] as CustomEvent<{ 文本: string }>).detail.文本
      expect(文本).toContain('总结')
      expect(文本).toContain('浮窗演示文本')
    } finally {
      window.removeEventListener('seal-assistant-ask', 收到)
    }
  })

  it('右键菜单包含字体颜色与 AI 分组', async () => {
    const { container } = 渲染演示()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗演示' }))
    const 画布 = container.querySelector('.wps-ppt-canvas') as HTMLElement
    fireEvent.contextMenu(画布)
    const 菜单 = await screen.findByRole('menu')
    expect(within(菜单).getByText('字体颜色')).toBeInTheDocument()
    expect(within(菜单).getByText('AI 润色')).toBeInTheDocument()
    expect(within(菜单).getByRole('menuitem', { name: '红色' })).toBeInTheDocument()
  })
})
