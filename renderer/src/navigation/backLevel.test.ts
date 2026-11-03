// 移动端返回键层级判定的规则测试。
//
// 用户要求（2.5.1 计划 P0-1）：「只要当前是一级页面（能看到底部 tab），
// 按返回键就回桌面；进入不显示底部 tab 的二级页面，返回键才是返回上一页。」
// 因此判定不能依赖 errorText / workspaceReady，而要看页面层级与浮层状态。
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
})

describe('返回键去向', () => {
  it('一级页面且无浮层：回到桌面', () => {
    建标签栏()
    expect(计算返回去向({ 模块: 'home', 浮层数: 0 })).toBe('回到桌面')
  })

  it('一级页面但有浮层：先关闭浮层', () => {
    建标签栏()
    expect(计算返回去向({ 模块: 'home', 浮层数: 1 })).toBe('关闭浮层')
  })

  it('编辑器等二级页面：返回上一页', () => {
    建标签栏()
    expect(计算返回去向({ 模块: 'word', 浮层数: 0 })).toBe('返回上一级')
    expect(计算返回去向({ 模块: 'table', 浮层数: 0 })).toBe('返回上一级')
    expect(计算返回去向({ 模块: 'ppt', 浮层数: 0 })).toBe('返回上一级')
    expect(计算返回去向({ 模块: 'pdf', 浮层数: 0 })).toBe('返回上一级')
  })

  it('键盘弹出导致标签栏隐藏时仍按二级页面处理，避免误退出', () => {
    建标签栏('display:none')
    expect(计算返回去向({ 模块: 'home', 浮层数: 0 })).toBe('返回上一级')
  })

  it('设置与帮助页属于二级页面', () => {
    建标签栏()
    expect(计算返回去向({ 模块: 'settings', 浮层数: 0 })).toBe('返回上一级')
    expect(计算返回去向({ 模块: 'help', 浮层数: 0 })).toBe('返回上一级')
  })
})
