import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片, type 演示文稿 } from '../deck'
import 放映设置面板 from './SlideshowSettingsPanel'

function 三页文稿(): 演示文稿 {
  const 文稿 = 创建演示文稿()
  文稿.幻灯片列表 = [创建幻灯片('标题幻灯片', '甲'), 创建幻灯片('标题和内容', '乙'), 创建幻灯片('空白', '丙')]
  return 文稿
}

const 默认偏好 = { 屏幕: '主屏' as const, 指针: '激光笔' as const, 媒体音量: 80 }

function 渲染(文稿: 演示文稿, 追加: Record<string, unknown> = {}) {
  const on修改 = vi.fn(), on偏好修改 = vi.fn()
  render(<App><放映设置面板 文稿={文稿} on修改={on修改} 偏好={默认偏好} on偏好修改={on偏好修改} {...追加}/></App>)
  return { on修改, on偏好修改 }
}

it('切换放映范围到自定义放映后写入所选放映标识', () => {
  const 文稿 = 三页文稿()
  文稿.自定义放映 = [{ id: '放映甲', 名称: '验收甲', 页面标识列表: [文稿.幻灯片列表[0].id] }]
  const { on修改 } = 渲染(文稿)
  fireEvent.change(screen.getByLabelText('放映范围'), { target: { value: '自定义放映' } })
  expect(on修改.mock.calls[0][0].放映设置.范围).toEqual({ 类型: '自定义放映', 放映标识: '放映甲' })
})

it('页码范围输入有效时写入起止，无效时不提交并提示原因', () => {
  const 文稿 = 三页文稿()
  const { on修改 } = 渲染(文稿)
  fireEvent.change(screen.getByLabelText('放映范围'), { target: { value: '页码范围' } })
  fireEvent.change(screen.getByLabelText('起始页'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('结束页'), { target: { value: '3' } })
  const 最后一次 = on修改.mock.calls[on修改.mock.calls.length - 1][0]
  expect(最后一次.放映设置.范围).toEqual({ 类型: '页码范围', 起始: 2, 结束: 3 })
  const 提交次数 = on修改.mock.calls.length
  fireEvent.change(screen.getByLabelText('起始页'), { target: { value: '5' } })
  fireEvent.blur(screen.getByLabelText('起始页'))
  expect(on修改.mock.calls.length).toBe(提交次数)
  expect(screen.getByRole('alert')).toHaveTextContent('页码范围')
})

it('换片方式与循环写入文稿模型', () => {
  const 文稿 = 三页文稿()
  const { on修改 } = 渲染(文稿)
  fireEvent.change(screen.getByLabelText('换片方式'), { target: { value: '手动' } })
  expect(on修改.mock.calls[0][0].放映设置.换片方式).toBe('手动')
  fireEvent.click(screen.getByLabelText('循环放映'))
  const 循环调用 = on修改.mock.calls.find((项) => '循环放映' in 项[0])
  expect(循环调用[0].循环放映).toBe(true)
})

it('新建自定义放映按当前页序保存，可重命名、移除页面与删除', () => {
  const 文稿 = 三页文稿()
  const { on修改 } = 渲染(文稿)
  fireEvent.change(screen.getByLabelText('新自定义放映名称'), { target: { value: '验收放映' } })
  fireEvent.click(screen.getByRole('button', { name: '新建自定义放映' }))
  const 新建 = on修改.mock.calls[0][0]
  expect(新建.自定义放映).toHaveLength(1)
  expect(新建.自定义放映[0].名称).toBe('验收放映')
  expect(新建.自定义放映[0].页面标识列表).toEqual(文稿.幻灯片列表.map((页) => 页.id))
})

it('已有自定义放映可以移除页面、调整顺序与删除整组', () => {
  const 文稿 = 三页文稿()
  const [甲, 乙, 丙] = 文稿.幻灯片列表
  文稿.自定义放映 = [{ id: '放映甲', 名称: '验收甲', 页面标识列表: [甲.id, 乙.id, 丙.id] }]
  文稿.放映设置 = { 范围: { 类型: '自定义放映', 放映标识: '放映甲' }, 换片方式: '使用计时' }
  const { on修改 } = 渲染(文稿)
  fireEvent.click(screen.getByRole('button', { name: '第 2 页上移' }))
  expect(on修改.mock.calls[0][0].自定义放映[0].页面标识列表).toEqual([乙.id, 甲.id, 丙.id])
  fireEvent.click(screen.getByRole('button', { name: '移除第 1 页' }))
  expect(on修改.mock.calls[1][0].自定义放映[0].页面标识列表).toEqual([乙.id, 丙.id])
  fireEvent.change(screen.getByLabelText('放映名称 1'), { target: { value: '改名后' } })
  expect(on修改.mock.calls[2][0].自定义放映[0].名称).toBe('改名后')
  fireEvent.click(screen.getByRole('button', { name: '删除自定义放映 1' }))
  expect(on修改.mock.calls[3][0].自定义放映).toEqual([])
})

it('本机偏好单独保存，不写入文稿模型', () => {
  const 文稿 = 三页文稿()
  const { on修改, on偏好修改 } = 渲染(文稿)
  fireEvent.change(screen.getByLabelText('演讲者屏'), { target: { value: '第二屏' } })
  expect(on偏好修改).toHaveBeenCalledWith({ ...默认偏好, 屏幕: '第二屏' })
  expect(on修改).not.toHaveBeenCalled()
})

it('只读时全部控件禁用，且说明禁用原因', () => {
  渲染(三页文稿(), { 只读: true })
  expect(screen.getByLabelText('放映范围')).toBeDisabled()
  expect(screen.getByLabelText('换片方式')).toBeDisabled()
  expect(screen.getByLabelText('循环放映')).toBeDisabled()
  expect(screen.getByRole('button', { name: '新建自定义放映' })).toBeDisabled()
  expect(screen.getByText(/只读/)).toBeInTheDocument()
})

it('没有第二台显示器时说明真实原因，不伪造成可选', () => {
  渲染(三页文稿(), { 显示器: [{ 标识: '1', 名称: '主显示器 1', 主屏: true }] })
  const 选择 = screen.getByLabelText('演讲者屏')
  expect(选择).toHaveTextContent('主显示器 1')
  expect(选择).not.toHaveTextContent('第二屏')
})
