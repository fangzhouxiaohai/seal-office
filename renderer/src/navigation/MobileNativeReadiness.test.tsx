import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { App } from 'antd'
import MobileNavigation from '../../../mobile/web/navigation'

// 根测试配置只加载导航组件，由测试声明模拟宿主注入的接口。
declare global {
  interface Window {
    sealNative?: { token: string; platform: string }
    uni?: { webView?: { postMessage: (input: { data: unknown }) => void } }
  }
}

vi.mock('../store', () => {
  const 工作区 = { module: 'word', navKey: 'document', activeWorkspaceTabId: '文件', workspaceTabs: [{ id: '文件', dirty: true }] }
  return { useAppStore: () => 工作区 }
})
vi.mock('../../../mobile/web/home', () => ({ mobileSection: (导航: string) => 导航 }))

const 上报 = vi.fn()
const 帧队列 = new Map<number, FrameRequestCallback>()
let 帧序号 = 0

beforeEach(() => {
  上报.mockClear()
  帧队列.clear()
  window.sealNative = { platform: 'android', token: '原生工作区测试' }
  window.uni = { webView: { postMessage: 上报 } }
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(回调 => {
    帧队列.set(++帧序号, 回调)
    return 帧序号
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(序号 => { 帧队列.delete(序号) })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.hidden ? [] : [new DOMRect(0, 0, 360, 44)]) as unknown as DOMRectList
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete window.sealNative
  delete window.uni
})

function 绘制一帧() {
  const 当前帧 = [...帧队列.values()]
  帧队列.clear()
  act(() => 当前帧.forEach(回调 => 回调(performance.now())))
}

function 工作区(样式: '首页' | '完整' | '简洁', 加载中 = false) {
  return <App>
    {加载中 && <div className="startup-screen" />}
    <div className="wps-app" data-module={样式 === '首页' ? 'home' : 'word'} data-compact-workspace={样式 === '简洁' ? 'true' : undefined}>
      {样式 === '简洁' ? <nav className="wps-workspace-navigation" /> : <header className="wps-titlebar" />}
    </div>
    <MobileNavigation />
  </App>
}

it.each(['首页', '完整', '简洁'] as const)('%s工作区绘制后向原生宿主上报状态', 样式 => {
  render(工作区(样式))
  绘制一帧()
  expect(上报).not.toHaveBeenCalled()
  绘制一帧()
  expect(上报).toHaveBeenCalledOnce()
  expect(上报).toHaveBeenCalledWith({ data: { action: 'state', token: '原生工作区测试', backToDesktop: true, unsaved: 1 } })
})

it('启动占位消失前不上报，且两帧之间恢复占位时重新等待', () => {
  const view = render(工作区('完整', true))
  绘制一帧()
  绘制一帧()
  expect(上报).not.toHaveBeenCalled()

  view.rerender(工作区('完整'))
  window.dispatchEvent(new Event('seal-native-ready'))
  绘制一帧()
  view.rerender(工作区('完整', true))
  绘制一帧()
  expect(上报).not.toHaveBeenCalled()

  view.rerender(工作区('完整'))
  window.dispatchEvent(new Event('seal-native-ready'))
  绘制一帧()
  绘制一帧()
  expect(上报).toHaveBeenCalledOnce()
})
