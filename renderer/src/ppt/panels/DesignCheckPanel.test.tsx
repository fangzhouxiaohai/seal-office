import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, type 演示文稿 } from '../deck'
import { 默认主题标识, 内置主题列表 } from '../model/themes'
import { 创建默认母版, 按版式创建幻灯片 } from '../model/masters'
import DesignCheckPanel from './DesignCheckPanel'

const 默认主题 = 内置主题列表.find((项) => 项.标识 === 默认主题标识)!

const 造文稿 = (): 演示文稿 => {
  const 母版 = 创建默认母版()
  const 页 = 按版式创建幻灯片(母版.版式列表[1], 默认主题, '一页')
  页.文本框列表[0].x = 300
  页.文本框列表[0].占位符 = '标题'
  页.文本框列表[0].占位符标识 = '占位-标题'
  页.文本框列表[0].text = '很长的标题'.repeat(30)
  页.文本框列表[0].height = 40
  return { ...创建演示文稿(), 主题: 默认主题, 母版列表: [母版], 幻灯片列表: [页] }
}

it('检查结果展示溢出、缺失字体与资源缺失的具体原因', () => {
  const 文稿 = 造文稿()
  文稿.幻灯片列表[0].文本框列表[0].字体 = '缺失字体'
  文稿.幻灯片列表[0].对象列表 = [{ id: '图片一', 类型: '图片', x: 0, y: 0, width: 10, height: 10, 资源标识: '缺失指纹' }]
  render(<App><DesignCheckPanel 文稿={文稿} 只读={false} on应用={vi.fn()} 检测字体={(字体) => 字体 !== '缺失字体'} /></App>)

  expect(screen.getByText(/文字溢出：1 处/)).toBeInTheDocument()
  expect(screen.getByText(/缺失字体：缺失字体（1 处）/)).toBeInTheDocument()
  expect(screen.getByText(/缺失指纹/)).toBeInTheDocument()
  expect(screen.getByText(/资源完整性：未通过/)).toBeInTheDocument()
})

it('本机美化先预览，确认后应用且不修改文字内容', () => {
  const 文稿 = 造文稿()
  const 应用 = vi.fn()
  const 快照 = JSON.stringify(文稿)
  render(<App><DesignCheckPanel 文稿={文稿} 只读={false} on应用={应用} /></App>)

  fireEvent.click(screen.getByRole('button', { name: '预览本机美化' }))
  expect(screen.getByRole('status').textContent).toContain('预览')
  expect(JSON.stringify(文稿)).toBe(快照)
  expect(应用).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '应用本机美化' }))
  const 结果 = 应用.mock.calls[0][0] as 演示文稿
  expect(结果.幻灯片列表[0].文本框列表[0].x).toBe(80)
  expect(结果.幻灯片列表[0].文本框列表[0].text).toBe(文稿.幻灯片列表[0].文本框列表[0].text)
})

it('明确声明本机美化不含 AI 建议', () => {
  render(<App><DesignCheckPanel 文稿={造文稿()} 只读={false} on应用={vi.fn()} /></App>)
  expect(screen.getByText(/本机对齐与排版，不含 AI 布局建议/)).toBeInTheDocument()
})

it('只读时美化按钮禁用并说明原因', () => {
  render(<App><DesignCheckPanel 文稿={造文稿()} 只读 on应用={vi.fn()} /></App>)
  const 按钮 = screen.getByRole('button', { name: '应用本机美化' })
  expect(按钮).toBeDisabled()
  expect(按钮.getAttribute('title')).toContain('只读')
})
