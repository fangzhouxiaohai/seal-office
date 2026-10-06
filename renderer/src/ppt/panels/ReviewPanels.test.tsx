import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建文本框, 创建演示文稿, 更新幻灯片, type 演示文稿 } from '../deck'
import { 添加批注 } from '../model/comments'
import CommentsPanel from './CommentsPanel'
import ReviewPanel from './ReviewPanel'

const 单页稿 = (文本: string): 演示文稿 => {
  const 文稿 = 创建演示文稿()
  return 更新幻灯片(文稿, 文稿.幻灯片列表[0].id, { 文本框列表: [{ ...创建文本框(80, 60, 400, 120, 文本, 24), id: '文字' }] })
}

const 审阅属性 = (文稿: 演示文稿) => ({
  文稿, 页: 文稿.幻灯片列表[0], 只读: false, 显示批注: true,
  on显示变化: vi.fn(), on跳转: vi.fn(),
})

it('批注面板新建批注，显示开关只改变显示状态', () => {
  const 文稿 = 创建演示文稿(), 页 = 文稿.幻灯片列表[0], 修改 = vi.fn(), 显示 = vi.fn()
  render(<App><CommentsPanel {...审阅属性(文稿)} on显示变化={显示} on修改={修改} /></App>)
  fireEvent.click(screen.getByLabelText('显示批注标记'))
  expect(显示).toHaveBeenCalledWith(false)
  expect(修改).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('批注内容'), { target: { value: '标题再短一些' } })
  fireEvent.click(screen.getByRole('button', { name: '添加批注' }))
  expect(修改).toHaveBeenCalledTimes(1)
  expect(修改.mock.calls[0][0].批注列表[0]).toMatchObject({ 页标识: 页.id, 内容: '标题再短一些' })
})

it('回复、解决与删除批注都走文稿修改，只读时控件禁用', () => {
  const 基础 = 创建演示文稿(), 页 = 基础.幻灯片列表[0]
  const 带批注 = 添加批注(基础, { 页标识: 页.id, 内容: '请补充来源' }).文稿
  const 修改 = vi.fn()
  const { unmount } = render(<App><CommentsPanel {...审阅属性(带批注)} on修改={修改} /></App>)
  fireEvent.change(screen.getByLabelText('批注回复'), { target: { value: '已补充' } })
  fireEvent.click(screen.getByRole('button', { name: '回复' }))
  expect(修改.mock.calls[0][0].批注列表[0].回复[0]).toMatchObject({ 内容: '已补充' })
  fireEvent.click(screen.getByRole('button', { name: '标记解决' }))
  expect(修改.mock.calls[1][0].批注列表[0].已解决).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '删除批注' }))
  expect(修改.mock.calls[2][0].批注列表).toEqual([])
  unmount()
  render(<App><CommentsPanel {...审阅属性(带批注)} 只读 on修改={修改} /></App>)
  expect(screen.getByRole('button', { name: '添加批注' })).toBeDisabled()
  expect(screen.getByLabelText('批注内容')).toBeDisabled()
})

it('对象已删除的批注继续保留并明确标记失效', () => {
  const 基础 = 创建演示文稿(), 页 = 基础.幻灯片列表[0]
  const 带批注 = 添加批注(基础, { 页标识: 页.id, 对象标识: 页.文本框列表[0].id, 内容: '标题需要调整' }).文稿
  const 失效 = 更新幻灯片(带批注, 页.id, { 文本框列表: [] })
  render(<App><CommentsPanel {...审阅属性(失效)} on修改={vi.fn()} /></App>)
  expect(screen.getByText('标题需要调整')).toBeInTheDocument()
  expect(screen.getByText(/对象已删除/)).toBeInTheDocument()
})

it('排版检查列出结果，修正写入文稿，忽略只影响面板', () => {
  const 修改 = vi.fn(), 文稿 = 单页稿('请按装好驱动')
  const 属性 = { 文稿, 页: 文稿.幻灯片列表[0], 只读: false, 区域: '检查' as const, 转换方向: '繁' as const, on区域变化: vi.fn(), on方向变化: vi.fn(), on修改: 修改 }
  const { unmount } = render(<App><ReviewPanel {...属性} /></App>)
  expect(screen.getAllByText(/按装/).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '修正' }))
  expect(修改.mock.calls[0][0].幻灯片列表[0].文本框列表[0].text).toBe('请安装好驱动')
  unmount()
  render(<App><ReviewPanel {...属性} /></App>)
  fireEvent.click(screen.getByRole('button', { name: '忽略' }))
  expect(screen.queryAllByText(/按装/)).toHaveLength(0)
  expect(修改).toHaveBeenCalledTimes(1)
})

it('简繁转换先给出差异预览，确认后才写入文稿', () => {
  const 文稿 = 单页稿('发现并发展')
  const 修改 = vi.fn()
  render(<App><ReviewPanel 文稿={文稿} 页={文稿.幻灯片列表[0]} 只读={false} 区域="转换" 转换方向="繁" on区域变化={vi.fn()} on方向变化={vi.fn()} on修改={修改} /></App>)
  // 差异预览按片段分块渲染，按整条预览文本核对
  expect(screen.getByText(/共 3 处转换/).closest('li')?.textContent).toContain('發現並發展')
  expect(修改).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '应用转换' }))
  expect(修改).toHaveBeenCalledTimes(1)
  expect(修改.mock.calls[0][0].幻灯片列表[0].文本框列表[0].text).toBe('發現並發展')
  expect(screen.getByText(/词组/)).toBeInTheDocument()
})
