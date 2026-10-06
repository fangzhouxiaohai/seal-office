import { act, render } from '@testing-library/react'
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { 创建幻灯片, 创建演示文稿, 创建文本框, type 幻灯片, type 演示文稿 } from '../deck'
import { 创建图表, 设置图表动态 } from '../model/elements'
import { 播放画面 } from './PlaybackPage'
import { 播放控制器, type 播放快照 } from './controller'
import { SlideObjects } from '../render/SlideObjects'

const 原动画 = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
afterEach(() => {
  if (原动画) Object.defineProperty(HTMLElement.prototype, 'animate', 原动画)
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
  vi.restoreAllMocks(); vi.useRealTimers()
})

function 捕获动画() {
  const 调用: { 帧: Keyframe[]; 选项?: KeyframeAnimationOptions }[] = []
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn((帧: Keyframe[], 选项?: KeyframeAnimationOptions) => {
    调用.push({ 帧, 选项 })
    return { playState: 'running', pause: vi.fn(), play: vi.fn(), cancel: vi.fn(), finish: vi.fn() } as unknown as Animation
  }) })
  return 调用
}

function 双页文稿(标识: string): 演示文稿 {
  const 文稿 = 创建演示文稿()
  const 前页 = 创建幻灯片(); 前页.id = '页-1'; 前页.文本框列表 = [{ ...创建文本框(100, 100, 200, 80, '标题'), id: 标识 }]
  const 后页 = 创建幻灯片(); 后页.id = '页-2'; 后页.文本框列表 = [{ ...创建文本框(300, 200, 400, 160, '标题'), id: 标识 }]
  后页.切换 = { 效果: '平滑', 持续毫秒: 600, 方向: '左', 方式: '外', 轴: '水平' }
  文稿.幻灯片列表 = [前页, 后页]
  文稿.当前索引 = 1
  return 文稿
}

it('平滑切换按稳定标识插值位置与尺寸，进入对象淡入', () => {
  const 调用 = 捕获动画()
  const 文稿 = 双页文稿('框-1')
  文稿.幻灯片列表[1].文本框列表.push({ ...创建文本框(600, 400, 120, 60, '新对象'), id: '框-2' })
  const { rerender } = render(<播放画面 文稿={文稿} 状态={{ 索引: 0, 阶段: '等待', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 0 }} 缩放={1} />)
  调用.length = 0
  rerender(<播放画面 文稿={文稿} 状态={{ 索引: 1, 阶段: '切换', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 1 }} 缩放={1} />)
  const 插值 = 调用.find(项 => 项.帧.some(帧 => String(帧.transform ?? '').includes('translate')))
  expect(插值, '平滑应对配对对象生成插值帧').toBeTruthy()
  expect(插值!.帧[0].transform).toBe('translate(-200px, -100px) rotate(0deg) scale(0.5, 0.5)')
  expect(插值!.帧[1].transform).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)')
  const 淡入 = 调用.find(项 => 项.帧.length === 2 && 项.帧[0].opacity === 0 && 项.帧[1].opacity === 1)
  expect(淡入, '只在后页出现的对象应淡入').toBeTruthy()
})

it('平滑切换把只在前页出现的对象单独淡出，不重复绘制配对对象', () => {
  const 调用 = 捕获动画()
  const 文稿 = 双页文稿('框-1')
  文稿.幻灯片列表[0].文本框列表.push({ ...创建文本框(10, 10, 100, 40, '旧对象'), id: '框-旧' })
  const { container, rerender } = render(<播放画面 文稿={文稿} 状态={{ 索引: 0, 阶段: '等待', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 0 }} 缩放={1} />)
  调用.length = 0
  rerender(<播放画面 文稿={文稿} 状态={{ 索引: 1, 阶段: '切换', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 1 }} 缩放={1} />)
  const 旧层 = container.querySelector('.wps-playback-layer')
  expect(旧层?.querySelector('[data-框标识="框-旧"]')).toBeTruthy()
  expect(旧层?.querySelector('[data-框标识="框-1"]')).toBeFalsy()
  const 淡出 = 调用.find(项 => 项.帧.length === 2 && 项.帧[0].opacity === 1 && 项.帧[1].opacity === 0)
  expect(淡出, '退出对象应淡出').toBeTruthy()
})

it('只渲染指定标识时用于平滑旧层', () => {
  const 页 = 创建幻灯片()
  页.文本框列表 = [创建文本框(0, 0, 100, 40, '甲'), 创建文本框(0, 60, 100, 40, '乙')]
  const { container } = render(<SlideObjects 幻灯片={页} 仅标识={[页.文本框列表[1].id]} />)
  expect(container.querySelectorAll('[data-框标识]')).toHaveLength(1)
  expect(container.querySelector(`[data-框标识="${页.文本框列表[1].id}"]`)).toBeTruthy()
})

it('图表分步按每步时长逐系列显示，动画完成后回到最终状态', () => {
  vi.useFakeTimers()
  const 图表 = 设置图表动态(创建图表('柱状图'), { 步进: '按系列', 每步毫秒: 500 })
  图表.图表!.分类 = ['一', '二', '三']
  图表.图表!.系列 = [{ id: 'series-0', 名称: '甲', 数值: [1, 2, 3], 颜色: '#2B6CF6' }, { id: 'series-1', 名称: '乙', 数值: [4, 5, 6], 颜色: '#718096' }]
  const 页 = 创建幻灯片()
  页.对象列表 = [图表]
  页.动画序列 = [{ id: 'a1', 对象标识: 图表.id, 效果: '图表分步', 触发: '单击', 持续毫秒: 1000 }]
  const 文稿 = 创建演示文稿(); 文稿.幻灯片列表 = [页]; 文稿.当前索引 = 0
  let 控制: 播放控制器
  function 示例() {
    const [状态, 设置状态] = React.useState<播放快照>({ 索引: 0, 阶段: '等待', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 0 })
    React.useEffect(() => { 控制 = new 播放控制器(文稿, 0, { 更新: 设置状态, 翻页: () => {}, 结束: () => {}, 停止媒体: () => {} }); 控制.开始(); return () => 控制.销毁() }, [])
    return <><button onClick={() => 控制.单击()}>下一步</button><播放画面 文稿={文稿} 状态={状态} 缩放={1} /></>
  }
  const { container, getByText, unmount } = render(<示例 />)
  const 柱数 = () => container.querySelectorAll('[data-series-id] rect').length
  expect(柱数()).toBe(0)
  act(() => { getByText('下一步').click() })
  act(() => { vi.advanceTimersByTime(500) })
  expect(柱数()).toBe(3)
  act(() => { vi.advanceTimersByTime(500) })
  expect(柱数()).toBe(6)
  act(() => { vi.advanceTimersByTime(2000) })
  expect(柱数()).toBe(6)
  unmount()
})

it('没有分步动画时图表始终按最终状态绘制', () => {
  const 图表 = 设置图表动态(创建图表('柱状图'), { 步进: '按系列', 每步毫秒: 500 })
  图表.图表!.分类 = ['一', '二']
  图表.图表!.系列 = [{ id: 'series-0', 名称: '甲', 数值: [1, 2], 颜色: '#2B6CF6' }, { id: 'series-1', 名称: '乙', 数值: [3, 4], 颜色: '#718096' }]
  const 页: 幻灯片 = 创建幻灯片()
  页.对象列表 = [图表]
  const { container } = render(<播放画面 文稿={{ ...创建演示文稿(), 幻灯片列表: [页] }} 状态={{ 索引: 0, 阶段: '等待', 暂停: false, 活动动画: [], 完成动画: [], 页代次: 0 }} 缩放={1} />)
  expect(container.querySelectorAll('[data-series-id] rect')).toHaveLength(4)
})
