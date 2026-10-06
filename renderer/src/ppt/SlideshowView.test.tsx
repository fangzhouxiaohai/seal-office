import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import SlideshowView from './SlideshowView'
import { 添加幻灯片, 创建演示文稿 } from './deck'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })

function 安装全屏接口(进入 = vi.fn().mockResolvedValue({ 成功: true, 会话标识: '放映会话' })) {
  const 退出 = vi.fn().mockResolvedValue({ 成功: true })
  let 结束: ((标识: string) => void) | undefined
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
    enterSlideshowFullscreen: 进入,
    exitSlideshowFullscreen: 退出,
    onSlideshowEnded: (回调: typeof 结束) => { 结束 = 回调; return () => { 结束 = undefined } },
  } })
  return { 进入, 退出, 系统退出: () => 结束?.('放映会话') }
}

const 渲染放映 = (on退出 = vi.fn()) => render(<AntdApp><SlideshowView 文稿={创建演示文稿()} 当前索引={0} on翻页={vi.fn()} on退出={on退出} /></AntdApp>)

describe('演讲者视图接入', () => {
  function 安装演讲者接口(打开结果: Record<string, unknown> = { 成功: true, 会话标识: '演讲者会话', 显示器名称: '扩展显示器 2（1920×1080）' }) {
    const 打开 = vi.fn().mockResolvedValue(打开结果)
    const 更新 = vi.fn().mockResolvedValue({ 成功: true })
    const 关闭 = vi.fn().mockResolvedValue({ 成功: true })
    let 控制: ((数据: { 会话标识: string; 动作: string }) => void) | undefined
    let 已关闭: ((数据: { 会话标识: string; 原因: string }) => void) | undefined
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: {
      enterSlideshowFullscreen: vi.fn().mockResolvedValue({ 成功: true, 会话标识: '放映会话' }),
      exitSlideshowFullscreen: vi.fn().mockResolvedValue({ 成功: true }),
      onSlideshowEnded: () => () => {},
      presenter: {
        open: 打开, update: 更新, close: 关闭,
        onControl: (回调: typeof 控制) => { 控制 = 回调; return () => { 控制 = undefined } },
        onClosed: (回调: typeof 已关闭) => { 已关闭 = 回调; return () => { 已关闭 = undefined } },
        onDisplayChanged: () => () => {},
      },
    } })
    return { 打开, 更新, 关闭, 控制: (动作: string) => 控制?.({ 会话标识: '演讲者会话', 动作 }), 已关闭: (原因: string) => 已关闭?.({ 会话标识: '演讲者会话', 原因 }) }
  }

  it('请求演讲者时打开只读窗口并推送快照，控制命令回传到播放控制器', async () => {
    const 接口 = 安装演讲者接口()
    const 翻页 = vi.fn()
    const 文稿 = 添加幻灯片(创建演示文稿())
    render(<AntdApp><SlideshowView 文稿={文稿} 当前索引={0} 请求演讲者 on翻页={翻页} on退出={vi.fn()} /></AntdApp>)
    await waitFor(() => expect(接口.打开).toHaveBeenCalledWith({ 显示器: '主屏' }))
    await waitFor(() => expect(接口.更新).toHaveBeenCalled())
    expect(接口.更新.mock.calls[0][1].快照.页码).toBe(1)
    act(() => 接口.控制('下一页'))
    expect(翻页).toHaveBeenCalledWith(1)
    act(() => 接口.控制('暂停'))
    expect(screen.getByRole('button', { name: '继续放映' })).toBeInTheDocument()
    act(() => 接口.控制('结束'))
    act(() => 接口.已关闭('演讲者窗口已关闭'))
    expect(await screen.findByText('演讲者窗口已关闭')).toBeInTheDocument()
  })

  it('演讲者窗口打开后观众画面不因窗口失焦而暂停', async () => {
    安装演讲者接口()
    render(<AntdApp><SlideshowView 文稿={添加幻灯片(创建演示文稿())} 当前索引={0} 请求演讲者 on翻页={vi.fn()} on退出={vi.fn()} /></AntdApp>)
    await waitFor(() => expect(document.querySelector('.wps-slideshow__presenter')).not.toBeNull())
    fireEvent(window, new Event('blur'))
    expect(screen.getByRole('button', { name: '暂停放映' })).toBeInTheDocument()
    fireEvent(window, new Event('focus'))
    expect(screen.getByRole('button', { name: '暂停放映' })).toBeInTheDocument()
  })

  it('单显示器时打开演讲者视图给出真实提示并保留放映', async () => {
    const 接口 = 安装演讲者接口({ 成功: true, 会话标识: '演讲者会话', 显示器名称: '主显示器 1（1920×1080）', 提示: '本机只有一台显示器：演讲者窗口与观众画面位于同一台显示器，切到演讲者视图时观众会看到演讲者窗口内容' })
    render(<AntdApp><SlideshowView 文稿={添加幻灯片(创建演示文稿())} 当前索引={0} 请求演讲者 on翻页={vi.fn()} on退出={vi.fn()} /></AntdApp>)
    expect(await screen.findByText(/同一台显示器/)).toBeInTheDocument()
    expect(接口.打开).toHaveBeenCalled()
    expect(document.querySelector('.wps-slideshow')).not.toBeNull()
  })

  it('打开演讲者视图失败时展示真实原因，观众画面继续放映', async () => {
    安装演讲者接口({ 成功: false, 错误: '本机只检测到 1 台显示器，没有可用的第二屏' })
    render(<AntdApp><SlideshowView 文稿={添加幻灯片(创建演示文稿())} 当前索引={0} 请求演讲者 on翻页={vi.fn()} on退出={vi.fn()} /></AntdApp>)
    expect(await screen.findByText(/没有可用的第二屏/)).toBeInTheDocument()
    expect(document.querySelector('.wps-slideshow')).not.toBeNull()
  })

  it('退出放映时关闭演讲者窗口', async () => {
    const 接口 = 安装演讲者接口()
    const { unmount } = render(<AntdApp><SlideshowView 文稿={添加幻灯片(创建演示文稿())} 当前索引={0} 请求演讲者 on翻页={vi.fn()} on退出={vi.fn()} /></AntdApp>)
    await waitFor(() => expect(接口.更新).toHaveBeenCalled())
    unmount()
    expect(接口.关闭).toHaveBeenCalledWith('演讲者会话')
  })
})

describe('本机幻灯片切换', () => {
  it('切换到后台窗口暂停，回到前台后继续', () => {
    安装全屏接口();渲染放映();fireEvent(window,new Event('blur'))
    expect(screen.getByRole('button',{name:'继续放映'})).toBeInTheDocument()
    fireEvent(window,new Event('focus'));expect(screen.getByRole('button',{name:'暂停放映'})).toBeInTheDocument()
  })
  it('暂停按钮可用键盘聚焦，Tab 不被放映快捷键阻止', () => {
    安装全屏接口(); 渲染放映()
    const 事件=new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}); document.dispatchEvent(事件)
    expect(事件.defaultPrevented).toBe(false)
    fireEvent.click(screen.getByRole('button',{name:'暂停放映'}));expect(screen.getByRole('button',{name:'继续放映'})).toBeInTheDocument()
  })
  it('零页模型直接进入放映时安全退出并显示原因', async () => {
    const { 进入 } = 安装全屏接口()
    const 退出 = vi.fn()
    render(<AntdApp><SlideshowView 文稿={{ ...创建演示文稿(), 幻灯片列表: [] }} 当前索引={0} on翻页={vi.fn()} on退出={退出} /></AntdApp>)
    expect(await screen.findByText('请先添加至少一张幻灯片，再开始放映。')).toBeInTheDocument()
    expect(退出).toHaveBeenCalledTimes(1)
    expect(进入).not.toHaveBeenCalled()
    expect(document.querySelector('.wps-slideshow')).toBeNull()
  })
  it('翻页到有推进效果的页面时重新播放进入过渡', () => {
    安装全屏接口()
    const 文稿 = 添加幻灯片(创建演示文稿())
    文稿.幻灯片列表[1].过渡效果 = '推进'
    const 放映 = () => {
      const [索引, set索引] = React.useState(0)
      return <SlideshowView 文稿={文稿} 当前索引={索引} on翻页={set索引} on退出={vi.fn()} />
    }
    render(<AntdApp><放映 /></AntdApp>)
    expect(document.querySelector('.wps-slideshow__page--push')).toBeNull()
    fireEvent.click(screen.getByRole('dialog', { name: '幻灯片放映' }))
    expect(document.querySelector('.wps-slideshow__page--push')).not.toBeNull()
  })

  it('挂载时进入原生全屏，独立挂载到页面根部，卸载时恢复', async () => {
    const { 进入, 退出 } = 安装全屏接口()
    const { unmount, container } = 渲染放映()
    await waitFor(() => expect(进入).toHaveBeenCalledTimes(1))
    expect(container.querySelector('.wps-slideshow')).toBeNull()
    expect(document.body).toHaveClass('seal-presenting')
    unmount()
    await waitFor(() => expect(退出).toHaveBeenCalledWith('放映会话'))
    expect(document.body).not.toHaveClass('seal-presenting')
  })

  it('进入全屏尚未完成就卸载，也会恢复窗口', async () => {
    let 完成!: (结果: unknown) => void
    const { 退出 } = 安装全屏接口(vi.fn(() => new Promise((resolve) => { 完成 = resolve })))
    const { unmount } = 渲染放映()
    unmount()
    await act(async () => { 完成({ 成功: true, 会话标识: '放映会话' }) })
    expect(退出).toHaveBeenCalledWith('放映会话')
  })

  it('全屏失败展示原因并退出放映', async () => {
    安装全屏接口(vi.fn().mockResolvedValue({ 成功: false, 错误: '系统拒绝全屏' }))
    const 退出放映 = vi.fn()
    渲染放映(退出放映)
    expect(await screen.findByText('系统拒绝全屏')).toBeInTheDocument()
    expect(退出放映).toHaveBeenCalledTimes(1)
  })

  it('系统退出全屏和 Escape 均结束放映，F5 不触发编辑器快捷键', async () => {
    const { 系统退出 } = 安装全屏接口()
    const 退出放映 = vi.fn()
    渲染放映(退出放映)
    await act(async () => {})
    const 编辑器按键 = vi.fn()
    document.addEventListener('keydown', 编辑器按键)
    fireEvent.keyDown(document, { key: 'F5' })
    expect(编辑器按键).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(退出放映).toHaveBeenCalledTimes(1)
    act(系统退出)
    expect(退出放映).toHaveBeenCalledTimes(2)
    document.removeEventListener('keydown', 编辑器按键)
  })
})
