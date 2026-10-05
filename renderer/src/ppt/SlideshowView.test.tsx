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
