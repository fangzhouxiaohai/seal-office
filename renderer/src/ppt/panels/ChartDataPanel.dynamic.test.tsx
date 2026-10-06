import { fireEvent, render, screen } from '@testing-library/react'
import { App } from 'antd'
import { expect, it, vi } from 'vitest'
import { 创建图表 } from '../model/elements'
import ChartDataPanel from './ChartDataPanel'

const 渲染 = (对象 = 创建图表('柱状图'), 替换 = vi.fn()) => {
  render(<App><ChartDataPanel 对象={对象} 禁用={false} on替换={替换}/></App>)
  return 替换
}

it('默认不启用动态播放，启用后按步进方式与每步时长提交', () => {
  const 替换 = 渲染()
  expect((screen.getByLabelText('动态播放') as HTMLSelectElement).value).toBe('不启用')
  fireEvent.change(screen.getByLabelText('动态播放'), { target: { value: '按分类' } })
  fireEvent.change(screen.getByLabelText('每步时长（秒）'), { target: { value: '0.8' } })
  fireEvent.click(screen.getByRole('button', { name: '应用图表数据' }))
  expect(替换).toHaveBeenCalledTimes(1)
  expect(替换.mock.calls[0][0].图表.动态).toEqual({ 步进: '按分类', 每步毫秒: 800 })
  expect(替换.mock.calls[0][0].图表.系列[0].数值).toEqual([12, 24, 18])
})

it('关闭动态播放时移除设置且保留图表数据', () => {
  const 图表 = 创建图表('柱状图')
  图表.图表!.动态 = { 步进: '按系列', 每步毫秒: 500 }
  const 替换 = 渲染(图表)
  expect((screen.getByLabelText('动态播放') as HTMLSelectElement).value).toBe('按系列')
  fireEvent.change(screen.getByLabelText('动态播放'), { target: { value: '不启用' } })
  fireEvent.click(screen.getByRole('button', { name: '应用图表数据' }))
  expect(替换.mock.calls[0][0].图表.动态).toBeUndefined()
  expect(替换.mock.calls[0][0].图表.分类).toEqual(['第一季度', '第二季度', '第三季度'])
})

it('不启用动态播放时不显示每步时长输入', () => {
  渲染()
  expect(screen.queryByLabelText('每步时长（秒）')).toBeNull()
})
