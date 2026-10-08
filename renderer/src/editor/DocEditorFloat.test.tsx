import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp, ConfigProvider } from 'antd'
import DocEditor from './DocEditor'
import GlobalTabs from '../components/GlobalTabs'
import { AppProvider, useAppStore } from '../store'
import { SettingsProvider } from '../store/settingsStore'

/** 记录的格式化调用：[指令, 值] */
const 格式化调用: Array<[string, string | undefined]> = []

beforeEach(() => {
  // jsdom 不实现 Range 的矩形接口，这里给出稳定的合成矩形以便验证浮窗定位
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 200, y: 300, left: 200, top: 300, right: 340, bottom: 320, width: 140, height: 20, toJSON: () => ({}) }),
  })
  // setup.ts 已为 jsdom 补了恒返回 false 的 execCommand（不可重定义但可赋值），
  // 这里换成记录调用的替身；真实富文本效果由运行窗口核验，不在 jsdom 里假装可用。
  格式化调用.length = 0
  ;(document as unknown as { execCommand: (指令: string, 界面: boolean, 值?: string) => boolean }).execCommand =
    (指令: string, _界面: boolean, 值?: string) => { 格式化调用.push([指令, 值]); return true }
})

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

const 渲染带文档的编辑器 = () => {
  const 创建入口 = () => {
    const { createDoc } = useAppStore()
    return <button onClick={() => createDoc('word', '<p>浮窗测试正文</p>', { 路径: 'C:\\资料\\浮窗.docx' })}>打开浮窗文档</button>
  }
  return render(
    <SettingsProvider>
      <ConfigProvider button={{ autoInsertSpace: false }}>
        <AntdApp>
          <AppProvider>
            <创建入口 />
            <DocEditor />
            <GlobalTabs />
          </AppProvider>
        </AntdApp>
      </ConfigProvider>
    </SettingsProvider>
  )
}

/** 选中正文里的一段文字，模拟真实的选区与 selectionchange */
const 选中正文 = (容器: HTMLElement, 文本: string) => {
  const 节点 = 容器.querySelector('.wps-editor-canvas__content') as HTMLElement
  const 段落 = 节点.querySelector('p') as HTMLElement
  const 范围 = document.createRange()
  const 起点 = (段落.textContent ?? '').indexOf(文本)
  范围.setStart(段落.firstChild ?? 段落, Math.max(0, 起点))
  范围.setEnd(段落.firstChild ?? 段落, Math.max(0, 起点) + 文本.length)
  const 选择 = window.getSelection()
  选择?.removeAllRanges()
  选择?.addRange(范围)
  fireEvent.mouseUp(节点)
  return 节点
}

describe('文字编辑器选区浮窗', () => {
  it('选中内容后浮出面板，未选中时不出现', async () => {
    const { container } = 渲染带文档的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗文档' }))
    expect(screen.queryByRole('toolbar', { name: '选中内容操作' })).toBeNull()

    选中正文(container, '浮窗测试')
    const 面板 = await screen.findByRole('toolbar', { name: '选中内容操作' })
    expect(面板).toBeInTheDocument()
    // 本地格式动作与 AI 快捷动作都在面板里（限定浮窗内查询，功能区也有同名按钮）
    for (const 名称 of ['复制', '剪切', '格式刷', '加粗', '斜体', '下划线', '突出显示（黄色）', '清除格式', '项目符号', '编号']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
    for (const 名称 of ['润色', '扩写', '缩写', '重写', '翻译', '解释', '总结', '续写']) {
      expect(within(面板).getByRole('button', { name: 名称 })).toBeInTheDocument()
    }
  })

  it('点加粗作用于选区且面板保持不抢焦点', async () => {
    const { container } = 渲染带文档的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗文档' }))
    选中正文(container, '浮窗测试')
    await screen.findByRole('toolbar', { name: '选中内容操作' })

    // 面板按钮阻止默认，因此点下去不会抢走编辑区焦点
    const 面板 = screen.getByRole('toolbar', { name: '选中内容操作' })
    const 加粗 = within(面板).getByRole('button', { name: '加粗' })
    fireEvent.mouseDown(加粗)
    expect(document.activeElement?.className ?? '').not.toContain('wps-float-panel__item')
    await userEvent.click(加粗)
    expect(格式化调用).toContainEqual(['bold', undefined])
  })

  it('点 AI 快捷动作把选区交给助手并打开面板', async () => {
    const { container } = 渲染带文档的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗文档' }))
    选中正文(container, '浮窗测试')
    await screen.findByRole('toolbar', { name: '选中内容操作' })

    const 收到 = vi.fn()
    window.addEventListener('seal-assistant-ask', 收到)
    try {
      await userEvent.click(within(await screen.findByRole('toolbar', { name: '选中内容操作' })).getByRole('button', { name: '润色' }))
      expect(收到).toHaveBeenCalledOnce()
      const 文本 = (收到.mock.calls[0][0] as CustomEvent<{ 文本: string }>).detail.文本
      expect(文本).toContain('润色')
      expect(文本).toContain('浮窗测试')
    } finally {
      window.removeEventListener('seal-assistant-ask', 收到)
    }
  })

  it('滚动、Esc 与选区消失都会收起面板', async () => {
    const { container } = 渲染带文档的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗文档' }))
    选中正文(container, '浮窗测试')
    await screen.findByRole('toolbar', { name: '选中内容操作' })

    fireEvent.scroll(screen.getByRole('toolbar', { name: '选中内容操作' }).querySelector('.wps-float-panel__actions')!)
    expect(screen.getByRole('toolbar', { name: '选中内容操作' })).toBeInTheDocument()
    fireEvent.scroll(window)
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '选中内容操作' })).toBeNull())

    选中正文(container, '浮窗测试')
    await screen.findByRole('toolbar', { name: '选中内容操作' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '选中内容操作' })).toBeNull())

    选中正文(container, '浮窗测试')
    await screen.findByRole('toolbar', { name: '选中内容操作' })
    window.getSelection()?.removeAllRanges()
    fireEvent(document, new Event('selectionchange'))
    await waitFor(() => expect(screen.queryByRole('toolbar', { name: '选中内容操作' })).toBeNull())
  })
})

describe('文字编辑器右键菜单扩充', () => {
  it('菜单包含颜色调色板与 AI 快捷动作，并可作用到选区', async () => {
    const { container } = 渲染带文档的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗文档' }))
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    // 右键菜单由编辑区容器触发
    fireEvent.contextMenu(container.querySelector('.wps-editor-canvas__content') as HTMLElement)
    const 菜单 = await screen.findByRole('menu')
    expect(菜单).toBeInTheDocument()
    expect(within(菜单).getByText('突出显示')).toBeInTheDocument()
    expect(within(菜单).getByText('字体颜色')).toBeInTheDocument()
    expect(within(菜单).getByText('AI 润色')).toBeInTheDocument()

    // 选中文字后点菜单里的颜色项，应立即把颜色指令发给编辑器
    选中正文(container, '浮窗测试')
    fireEvent.contextMenu(编辑区)
    const 红色 = await screen.findByRole('menuitem', { name: '红色' })
    await userEvent.click(红色)
    await waitFor(() => expect(格式化调用.some(([指令, 值]) => 指令 === 'foreColor' && 值 === '#E34D59')).toBe(true))
  })

  it('菜单里的 AI 项触发助手指令', async () => {
    const { container } = 渲染带文档的编辑器()
    await userEvent.click(screen.getByRole('button', { name: '打开浮窗文档' }))
    选中正文(container, '浮窗测试')
    const 编辑区 = container.querySelector('.wps-editor-canvas__content') as HTMLElement
    fireEvent.contextMenu(编辑区)
    const 收到 = vi.fn()
    window.addEventListener('seal-assistant-ask', 收到)
    try {
      await userEvent.click(await screen.findByRole('menuitem', { name: 'AI 总结' }))
      expect(收到).toHaveBeenCalledOnce()
      expect((收到.mock.calls[0][0] as CustomEvent<{ 文本: string }>).detail.文本).toContain('总结')
    } finally {
      window.removeEventListener('seal-assistant-ask', 收到)
    }
  })
})
