// 移动端返回键层级判定的规则测试。
//
// 用户要求：只要底部主导航可见，返回键就直接回桌面；
// 不显示底部主导航时才逐级返回，浮层先关闭。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 计算返回去向, 底部标签栏可见 } from './backLevel'

let 根: HTMLElement

beforeEach(() => {
  根 = document.createElement('div')
  document.body.appendChild(根)
  // jsdom 不做布局：让「可见」判定依赖的尺寸与样式返回可预期的值
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value() { return [{ x: 0, y: 0, width: 100, height: 58, top: 0, left: 0, bottom: 58, right: 100 }] },
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(HTMLElement.prototype, 'getClientRects')
  Reflect.deleteProperty(document, 'elementFromPoint')
  Reflect.deleteProperty(document, 'fullscreenElement')
})

function 建标签栏(样式 = '') {
  const 栏 = document.createElement('nav')
  栏.className = 'seal-mobile-nav'
  if (样式) 栏.setAttribute('style', 样式)
  根.appendChild(栏)
  return 栏
}

describe('底部标签栏可见性', () => {
  it('存在且未被隐藏时视为可见', () => {
    建标签栏()
    expect(底部标签栏可见(document)).toBe(true)
  })

  it('display:none 视为不可见', () => {
    建标签栏('display:none')
    expect(底部标签栏可见(document)).toBe(false)
  })

  it('visibility:hidden 视为不可见', () => {
    建标签栏('visibility:hidden')
    expect(底部标签栏可见(document)).toBe(false)
  })

  it('没有标签栏元素时视为不可见，不抛异常', () => {
    expect(底部标签栏可见(document)).toBe(false)
  })

  it('标签栏完全位于可视区外时视为不可见', () => {
    const 栏 = 建标签栏()
    Object.defineProperty(栏, 'getClientRects', {
      value: () => [{ top: 900, bottom: 958, left: 0, right: 100 }],
    })
    expect(底部标签栏可见(document)).toBe(false)
  })

  it('全屏阅读把主界面设为 inert 后，即使底部标签栏仍有布局矩形也不可见', () => {
    建标签栏()
    根.inert = true
    expect(底部标签栏可见(document)).toBe(false)
    expect(计算返回去向({ 浮层数: 0 })).toBe('返回上一级')
  })

  it('二级页面将主界面标为不可访问时先返回上一层', () => {
    建标签栏()
    根.setAttribute('aria-hidden', 'true')
    expect(计算返回去向({ 浮层数: 0 })).toBe('返回上一级')
  })

  it('全屏阅读覆盖底部标签栏时按屏幕命中结果判为不可见', () => {
    建标签栏()
    const 阅读层 = document.createElement('section')
    document.body.appendChild(阅读层)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => 阅读层 })
    expect(底部标签栏可见(document)).toBe(false)
    expect(计算返回去向({ 浮层数: 0 })).toBe('返回上一级')
  })

  it('系统全屏元素不包含底部标签栏时先返回上一层', () => {
    建标签栏()
    const 阅读层 = document.createElement('section')
    document.body.appendChild(阅读层)
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: 阅读层 })
    expect(底部标签栏可见(document)).toBe(false)
  })

  it('助手悬浮球只挡住部分按钮时，仍按剩余可见主标签返回桌面', () => {
    const 栏 = 建标签栏()
    const 第一项 = document.createElement('button'),第二项 = document.createElement('button')
    栏.append(第一项, 第二项)
    Object.defineProperty(第一项, 'getClientRects', { value: () => [{ top: 0, bottom: 58, left: 0, right: 40 }] })
    Object.defineProperty(第二项, 'getClientRects', { value: () => [{ top: 0, bottom: 58, left: 60, right: 100 }] })
    const 悬浮球 = document.createElement('div')
    document.body.appendChild(悬浮球)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number) => x < 50 ? 悬浮球 : 第二项 })
    expect(底部标签栏可见(document)).toBe(true)
  })
})

describe('返回键去向', () => {
  it('一级页面且无浮层：回到桌面', () => {
    建标签栏()
    expect(计算返回去向({ 浮层数: 0 })).toBe('回到桌面')
  })

  it('一级页面但有浮层：先关闭浮层', () => {
    建标签栏()
    expect(计算返回去向({ 浮层数: 1 })).toBe('关闭浮层')
  })

  it('编辑器仍显示底部主导航时也直接回桌面', () => {
    建标签栏()
    expect(计算返回去向({ 浮层数: 0 })).toBe('回到桌面')
  })

  it('键盘弹出导致标签栏隐藏时仍按二级页面处理，避免误退出', () => {
    建标签栏('display:none')
    expect(计算返回去向({ 浮层数: 0 })).toBe('返回上一级')
  })

  it('我的、服务、设置等页面以实际底部主导航可见性判定', () => {
    建标签栏()
    expect(计算返回去向({ 浮层数: 0 })).toBe('回到桌面')
    document.querySelector('.seal-mobile-nav')?.remove()
    建标签栏('display:none')
    expect(计算返回去向({ 浮层数: 0 })).toBe('返回上一级')
  })
})
