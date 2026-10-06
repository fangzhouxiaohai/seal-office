import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import 阅读视图 from './ReadingView'

function 文稿() {
  const 结果 = 创建演示文稿()
  结果.幻灯片列表 = [创建幻灯片('标题幻灯片', '甲'), 创建幻灯片('标题和内容', '乙'), 创建幻灯片('空白', '丙')]
  return 结果
}

it('阅读视图在窗口内播放，保留返回编辑与页码控制，不请求系统全屏', () => {
  const 原全屏 = document.documentElement.requestFullscreen
  const 请求全屏 = vi.fn()
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: 请求全屏 })
  const 退出 = vi.fn()
  const { unmount } = render(<阅读视图 文稿={文稿()} 起始索引={0} 序列={[0, 2]} 图片地址={{}} on退出={退出}/>)
  expect(screen.getByRole('region', { name: '阅读视图' })).toBeInTheDocument()
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  expect(请求全屏).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '返回编辑' }))
  expect(退出).toHaveBeenCalled()
  unmount()
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: 原全屏 })
})

it('阅读视图退出后把焦点还给原来的元素', () => {
  const 按钮 = document.createElement('button')
  document.body.appendChild(按钮)
  按钮.focus()
  const 退出 = vi.fn()
  const { unmount } = render(<阅读视图 文稿={文稿()} 起始索引={0} 图片地址={{}} on退出={退出}/>)
  unmount()
  expect(document.activeElement).toBe(按钮)
  按钮.remove()
})

it('阅读视图按 Esc 退出，并阻止按键继续冒泡到编辑器', () => {
  const 退出 = vi.fn()
  render(<阅读视图 文稿={文稿()} 起始索引={0} 图片地址={{}} on退出={退出}/>)
  const 编辑器监听 = vi.fn()
  document.addEventListener('keydown', 编辑器监听)
  const 事件 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.dispatchEvent(事件)
  expect(退出).toHaveBeenCalled()
  expect(编辑器监听).not.toHaveBeenCalled()
  expect(事件.defaultPrevented).toBe(true)
  document.removeEventListener('keydown', 编辑器监听)
})

it('阅读视图播放不写入撤销历史，也不产生保存标记', () => {
  const 文稿数据 = 文稿()
  const 快照 = JSON.stringify(文稿数据)
  render(<阅读视图 文稿={文稿数据} 起始索引={1} 图片地址={{}} on退出={() => {}}/>)
  expect(JSON.stringify(文稿数据)).toBe(快照)
})
