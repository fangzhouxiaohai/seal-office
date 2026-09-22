// 测试环境补桩：jsdom 未实现 matchMedia 与 ResizeObserver，
// Ant Design 的响应式与尺寸监听依赖二者，缺失会导致组件渲染抛错。
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// 关闭 globals 后 Testing Library 无法自动注册清理钩子，
// 若不显式清理，前一个用例的 DOM 会残留并造成重复匹配。
afterEach(() => {
  cleanup()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverStub,
})

// jsdom 未实现 execCommand，补一个恒返回 false 的空实现。
// 这样依赖它的命令在测试中仍会走到提示分支，不会因方法缺失而中断；
// 真实的富文本插入行为由运行窗口验证，而不是在 jsdom 中假装可用。
if (typeof document.execCommand !== 'function') {
  Object.defineProperty(document, 'execCommand', {
    writable: true,
    value: () => false,
  })
}
