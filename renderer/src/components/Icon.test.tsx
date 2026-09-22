import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Icon, { ICON_NAMES } from './Icon'

describe('图标集', () => {
  it('登记的每个图标都能渲染出图形内容', () => {
    ICON_NAMES.forEach((名称) => {
      const 结果 = render(<Icon name={名称} />)
      const 图形 = 结果.container.querySelector('svg')
      expect(图形, `图标 ${名称} 未渲染出 svg`).not.toBeNull()
      expect(图形?.childElementCount ?? 0, `图标 ${名称} 没有图形内容`).toBeGreaterThan(0)
      结果.unmount()
    })
  })

  it('不同图标渲染出的内容互不相同', () => {
    const 首页 = render(<Icon name="home" />).container.innerHTML
    const 星标 = render(<Icon name="star" />).container.innerHTML
    const 表格 = render(<Icon name="doc-table" />).container.innerHTML
    expect(首页).not.toBe(星标)
    expect(首页).not.toBe(表格)
    expect(星标).not.toBe(表格)
  })

  it('渲染为 svg 元素', () => {
    const { container } = render(<Icon name="home" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('默认尺寸为 16，可覆盖', () => {
    const { container: 默认 } = render(<Icon name="star" />)
    expect(默认.querySelector('svg')).toHaveAttribute('width', '16')

    const { container: 自定义 } = render(<Icon name="star" size={20} />)
    expect(自定义.querySelector('svg')).toHaveAttribute('width', '20')
  })

  it('传入自定义颜色时生效', () => {
    const { container } = render(<Icon name="doc-word" color="#2B6CF6" />)
    expect(container.querySelector('svg')).toHaveAttribute('color', '#2B6CF6')
  })

  it('未知图标名称回落为占位图标而不是空白', () => {
    const 未知 = render(<Icon name="不存在的图标" />).container.innerHTML
    const 占位 = render(<Icon name="doc-empty" />).container.innerHTML
    expect(未知).toBe(占位)
  })
})
