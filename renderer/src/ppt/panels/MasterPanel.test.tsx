import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, type 演示文稿 } from '../deck'
import { 默认主题标识, 内置主题列表 } from '../model/themes'
import { 创建默认母版, 按版式创建幻灯片 } from '../model/masters'
import MasterPanel from './MasterPanel'

const 默认主题 = 内置主题列表.find((项) => 项.标识 === 默认主题标识)!

const 造文稿 = (): 演示文稿 => {
  const 母版 = 创建默认母版()
  const 页 = 按版式创建幻灯片(母版.版式列表[1], 默认主题, '一页')
  return { ...创建演示文稿(), 主题: 默认主题, 母版列表: [母版], 幻灯片列表: [页] }
}

it('版式列表来自母版并可套用版式', () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  render(<App><MasterPanel 文稿={文稿} 只读={false} on应用={应用} /></App>)

  expect(screen.getByLabelText('母版')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '套用版式：空白' }))

  const 结果 = 应用.mock.calls[0][0] as 演示文稿
  expect(结果.幻灯片列表[0].版式标识).toBe(文稿.母版列表![0].版式列表[2].标识)
})

it('占位符可编辑并写回母版版式', () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  render(<App><MasterPanel 文稿={文稿} 只读={false} on应用={应用} /></App>)

  fireEvent.change(screen.getByLabelText('占位符水平位置'), { target: { value: '120' } })
  fireEvent.click(screen.getByRole('button', { name: '保存占位符' }))

  const 结果 = 应用.mock.calls[0][0] as 演示文稿
  expect(结果.母版列表![0].版式列表[1].占位符列表[0].x).toBe(120)
})

it('解除与恢复继承、同步占位符都走命令语义', () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  render(<App><MasterPanel 文稿={文稿} 只读={false} on应用={应用} /></App>)

  fireEvent.click(screen.getByRole('button', { name: '解除当前页继承' }))
  expect((应用.mock.calls[0][0] as 演示文稿).幻灯片列表[0].背景继承).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: '恢复当前页继承' }))
  expect((应用.mock.calls[1][0] as 演示文稿).幻灯片列表[0].背景继承).toBeUndefined()

  fireEvent.click(screen.getByRole('button', { name: '同步版式占位符' }))
  expect(应用).toHaveBeenCalledTimes(3)
})

it('新增版式拒绝重名并给出明确提示', () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  render(<App><MasterPanel 文稿={文稿} 只读={false} on应用={应用} /></App>)

  fireEvent.change(screen.getByLabelText('新版式名称'), { target: { value: '标题和内容' } })
  fireEvent.click(screen.getByRole('button', { name: '新增版式' }))

  expect(screen.getByRole('status').textContent).toContain('已存在')
  expect(应用).not.toHaveBeenCalled()
})

it('页脚、日期、页码与页面尺寸在本面板接通', () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  const { rerender } = render(<App><MasterPanel 文稿={文稿} 只读={false} on应用={应用} /></App>)
  fireEvent.change(screen.getByLabelText('页脚文本'), { target: { value: '海豹办公' } })
  fireEvent.click(screen.getByLabelText('显示页码'))
  fireEvent.click(screen.getByLabelText('显示日期'))
  fireEvent.click(screen.getByLabelText('首页不显示'))
  fireEvent.click(screen.getByRole('button', { name: '应用页脚到全部' }))
  const 页脚结果 = 应用.mock.calls[0][0] as 演示文稿
  expect(页脚结果.页脚设置).toEqual({ 页脚文本: '海豹办公', 显示页码: true, 显示日期: true, 首页不显示: true })

  fireEvent.click(screen.getByRole('button', { name: '页面尺寸 4:3' }))
  const 尺寸结果 = 应用.mock.calls[1][0] as 演示文稿
  expect(尺寸结果.页面尺寸).toEqual({ 宽: 960, 高: 720 })
  expect(尺寸结果.幻灯片列表[0].文本框列表[0].height).toBeGreaterThan(文稿.幻灯片列表[0].文本框列表[0].height)

  // 受控组件：把已应用的文稿回填后再切换方向
  rerender(<App><MasterPanel 文稿={尺寸结果} 只读={false} on应用={应用} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '切换页面方向' }))
  expect((应用.mock.calls[2][0] as 演示文稿).页面尺寸).toEqual({ 宽: 720, 高: 960 })
})

it('只读时母版操作全部禁用并说明原因', () => {
  const 文稿 = 造文稿()
  render(<App><MasterPanel 文稿={文稿} 只读 on应用={vi.fn()} /></App>)
  const 按钮 = screen.getByRole('button', { name: '套用版式：空白' })
  expect(按钮).toBeDisabled()
  expect(按钮.getAttribute('title')).toContain('只读')
})
