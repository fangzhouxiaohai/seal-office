import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建演示文稿, 创建幻灯片 } from '../deck'
import { 创建图表, 设置图表动态 } from '../model/elements'
import AnimationPanel from './AnimationPanel'

it('切换效果下拉提供全部登记效果，选择高级效果后提交可用设置', () => {
  const 文稿 = 创建演示文稿(), 页 = 文稿.幻灯片列表[0], 修改 = vi.fn()
  render(<App><AnimationPanel 文稿={文稿} 页={页} 只读={false} on修改={修改}/></App>)
  const 效果 = screen.getByLabelText('切换效果') as HTMLSelectElement
  expect(Array.from(效果.options).map(项 => 项.value)).toEqual(['无','淡入淡出','推进','切出','擦除','形状','抽出','分割','溶解','涟漪','新闻快报','轮辐','百叶窗','梳理','平滑'])
  fireEvent.change(效果, { target: { value: '平滑' } })
  expect(修改.mock.calls[0][0].幻灯片列表[0].切换.效果).toBe('平滑')
})

it('轮辐显示辐条根数选项并提交登记取值', () => {
  const 文稿 = 创建演示文稿(), 页 = 文稿.幻灯片列表[0], 修改 = vi.fn()
  页.切换 = { 效果: '轮辐', 持续毫秒: 700, 方向: '左', 方式: '外', 轴: '水平' }
  render(<App><AnimationPanel 文稿={文稿} 页={页} 只读={false} on修改={修改}/></App>)
  const 辐条 = screen.getByLabelText('辐条根数') as HTMLSelectElement
  expect(Array.from(辐条.options).map(项 => 项.value)).toEqual(['1','2','3','4','6','8','12'])
  expect(辐条.value).toBe('4')
  fireEvent.change(辐条, { target: { value: '8' } })
  expect(修改.mock.calls[0][0].幻灯片列表[0].切换.辐条).toBe(8)
})

it('百叶窗与梳理显示展开轴选项', () => {
  const 文稿 = 创建演示文稿(), 页 = 文稿.幻灯片列表[0], 修改 = vi.fn()
  页.切换 = { 效果: '百叶窗', 持续毫秒: 700, 方向: '左', 方式: '外', 轴: '垂直' }
  render(<App><AnimationPanel 文稿={文稿} 页={页} 只读={false} on修改={修改}/></App>)
  const 轴 = screen.getByLabelText('展开方向') as HTMLSelectElement
  expect(轴.value).toBe('垂直')
  fireEvent.change(轴, { target: { value: '水平' } })
  expect(修改.mock.calls[0][0].幻灯片列表[0].切换.轴).toBe('水平')
})

it('动态图表的动画效果下拉提供图表分步', () => {
  const 图表 = 设置图表动态(创建图表('柱状图'), { 步进: '按系列', 每步毫秒: 500 })
  const 页 = 创建幻灯片()
  页.对象列表 = [图表]
  页.动画序列 = [{ id: 'a1', 对象标识: 图表.id, 效果: '图表分步', 触发: '单击', 持续毫秒: 1500 }]
  const 文稿 = 创建演示文稿(); 文稿.幻灯片列表 = [页]
  render(<App><AnimationPanel 文稿={文稿} 页={页} 选中={图表.id} 只读={false} on修改={vi.fn()}/></App>)
  const 效果 = screen.getByLabelText('动画1效果') as HTMLSelectElement
  expect(Array.from(效果.options).map(项 => 项.value)).toEqual(['出现','淡入','淡出','进入','退出','图表分步'])
  expect(效果.value).toBe('图表分步')
})

it('为选中的动态图表添加对象动画时提交指向该图表的动画', () => {
  const 图表 = 设置图表动态(创建图表('柱状图'), { 步进: '按分类', 每步毫秒: 500 })
  const 页 = 创建幻灯片()
  页.对象列表 = [图表]
  const 文稿 = 创建演示文稿(); 文稿.幻灯片列表 = [页]
  const 修改 = vi.fn()
  render(<App><AnimationPanel 文稿={文稿} 页={页} 选中={图表.id} 只读={false} on修改={修改}/></App>)
  fireEvent.click(screen.getByRole('button', { name: '添加对象动画' }))
  const 新页 = 修改.mock.calls[0][0].幻灯片列表[0]
  expect(新页.动画序列[0].对象标识).toBe(图表.id)
})

it('只读时高级切换控件全部禁用', () => {
  const 文稿 = 创建演示文稿(), 页 = 文稿.幻灯片列表[0]
  页.切换 = { 效果: '涟漪', 持续毫秒: 700, 方向: '左', 方式: '外', 轴: '水平' }
  render(<App><AnimationPanel 文稿={文稿} 页={页} 只读 on修改={vi.fn()}/></App>)
  expect(screen.getByLabelText('切换效果')).toBeDisabled()
  expect(screen.getByLabelText('切换持续时间（秒）')).toBeDisabled()
})
