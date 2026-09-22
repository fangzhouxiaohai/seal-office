import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Icon, { ICON_NAMES } from './Icon'

describe('图标集', () => {
  it('登记了全部需要的图标名称', () => {
    const 需要 = [
      'home', 'clock', 'star', 'share', 'cloud', 'users', 'pdf', 'mindmap',
      'flow', 'settings', 'help', 'search', 'grid', 'list', 'sort', 'more',
      'arrow-left', 'doc-word', 'doc-table', 'doc-ppt', 'doc-pdf',
    ]
    需要.forEach((名称) => {
      expect(ICON_NAMES).toContain(名称)
    })
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

  it('未知图标名称渲染占位而不抛错', () => {
    const { container } = render(<Icon name="不存在的图标" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
