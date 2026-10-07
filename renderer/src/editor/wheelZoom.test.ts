import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { use滚轮缩放, 创建滚轮缩放, 是缩放滚轮, 折算滚动像素, 文字缩放范围, 阅读缩放范围 } from './wheelZoom'

/** 造一个只有缩放相关字段的滚轮事件 */
const 滚轮 = (deltaY: number, 额外: Partial<WheelEvent> = {}) =>
  事件({ deltaY, deltaMode: 0, ...额外 })

function 事件(字段: { deltaY: number; deltaMode?: number; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): WheelEvent {
  return 字段 as unknown as WheelEvent
}

describe('Ctrl+滚轮缩放', () => {
  it('只在按住 Ctrl 或 Command 时生效，Alt 组合交给系统', () => {
    expect(是缩放滚轮(滚轮(0, { ctrlKey: true }))).toBe(true)
    expect(是缩放滚轮(滚轮(0, { metaKey: true }))).toBe(true)
    expect(是缩放滚轮(滚轮(0))).toBe(false)
    expect(是缩放滚轮(滚轮(0, { ctrlKey: true, altKey: true }))).toBe(false)
  })

  it('按行或按页的滚动量折算成像素', () => {
    expect(折算滚动像素({ deltaY: 3, deltaMode: 0 })).toBe(3)
    expect(折算滚动像素({ deltaY: 3, deltaMode: 1 })).toBe(48)
    expect(折算滚动像素({ deltaY: 1, deltaMode: 2 })).toBe(100)
    expect(折算滚动像素({ deltaY: Number.NaN, deltaMode: 0 })).toBe(0)
  })

  it('向上滚放大、向下滚缩小，一次一格走一步', () => {
    const 处理 = 创建滚轮缩放(文字缩放范围)
    expect(处理({ deltaY: -100 }, 1)).toBe(1.1)
    expect(处理({ deltaY: 100 }, 1.1)).toBe(1)
    expect(处理({ deltaY: -120 }, 1)).toBe(1.1)
  })

  it('触控板的小增量先累积，够一步才变化', () => {
    const 处理 = 创建滚轮缩放(文字缩放范围)
    expect(处理({ deltaY: -30 }, 1)).toBeNull()
    expect(处理({ deltaY: -30 }, 1)).toBeNull()
    expect(处理({ deltaY: -30 }, 1)).toBeNull()
    expect(处理({ deltaY: -30 }, 1)).toBe(1.1)
    // 反向滚动抵掉累计量，不会突然跳变
    expect(处理({ deltaY: 40 }, 1.1)).toBeNull()
    expect(处理({ deltaY: -40 }, 1.1)).toBeNull()
  })

  it('到达上下限后停在边界，不越界也不积压', () => {
    const 处理 = 创建滚轮缩放(文字缩放范围)
    expect(处理({ deltaY: -100 }, 1.9)).toBe(2)
    expect(处理({ deltaY: -100 }, 2)).toBeNull()
    expect(处理({ deltaY: -100 }, 2)).toBeNull()
    expect(处理({ deltaY: 100 }, 2)).toBe(1.9)
    expect(处理({ deltaY: 100 }, 0.6)).toBe(0.5)
    expect(处理({ deltaY: 100 }, 0.5)).toBeNull()
  })

  it('PDF 阅读按 0.25 步长缩放', () => {
    const 处理 = 创建滚轮缩放(阅读缩放范围)
    expect(处理({ deltaY: -100 }, 1)).toBe(1.25)
    expect(处理({ deltaY: -100 }, 1.25)).toBe(1.5)
    expect(处理({ deltaY: 100 }, 1.5)).toBe(1.25)
  })

  it('缩放范围非法时立即报错，避免调用方拿到静默失效的处理器', () => {
    expect(() => 创建滚轮缩放({ 下限: 0, 上限: 2, 步长: 0.1 })).toThrow('缩放范围无效')
    expect(() => 创建滚轮缩放({ 下限: 1, 上限: 1, 步长: 0.1 })).toThrow('缩放范围无效')
    expect(() => 创建滚轮缩放({ 下限: 0.5, 上限: 2, 步长: 0 })).toThrow('缩放范围无效')
  })
})

describe('use滚轮缩放', () => {
  /** 用真实状态承载缩放，验证钩子与 React 更新链路 */
  const 挂载 = (初始 = 1) => renderHook(() => {
    const [缩放, set缩放] = useState(初始)
    use滚轮缩放(缩放, set缩放, 文字缩放范围)
    return 缩放
  })

  it('Ctrl+滚轮改变缩放，并拦下浏览器整页缩放', () => {
    const { result } = 挂载()
    const 被拦 = { 值: false }
    const 事件 = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true })
    事件.preventDefault = () => { 被拦.值 = true }
    act(() => { window.dispatchEvent(事件) })
    expect(result.current).toBe(1.1)
    expect(被拦.值).toBe(true)
  })

  it('未按 Ctrl 的滚动不改变缩放也不拦截，页面可以正常滚动', () => {
    const { result } = 挂载()
    const 被拦 = { 值: false }
    const 事件 = new WheelEvent('wheel', { deltaY: -100, cancelable: true })
    事件.preventDefault = () => { 被拦.值 = true }
    act(() => { window.dispatchEvent(事件) })
    expect(result.current).toBe(1)
    expect(被拦.值).toBe(false)
  })

  it('卸载后不再响应滚轮，避免切换模块后误改其他页面的缩放', () => {
    const { result, unmount } = 挂载()
    unmount()
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true })) })
    expect(result.current).toBe(1)
  })

  it('连续滚动到上限后保持在上限', () => {
    const { result } = 挂载(1.9)
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true })) })
    expect(result.current).toBe(2)
    act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true })) })
    expect(result.current).toBe(2)
  })
})
