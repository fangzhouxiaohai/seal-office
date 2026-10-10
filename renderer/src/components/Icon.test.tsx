import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Icon, { ICON_NAMES } from './Icon'
import { 演示标签 } from '../ppt/ribbonSpecs'
import { 表格标签 } from '../sheet/ribbonSpecs'

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

  it('所有 ribbonSpecs 声明的图标都在 ICON_NAMES 中', () => {
    const 所有标签 = [...演示标签, ...表格标签]
    const 未声明图标: string[] = []
    所有标签.forEach((tab) => {
      tab.groups.forEach((group) => {
        group.items.forEach((item) => {
          const 图标名 = item.icon
          if (!ICON_NAMES.includes(图标名)) {
            未声明图标.push(图标名)
          }
        })
      })
    })
    if (未声明图标.length > 0) {
      expect(未声明图标, `以下图标未声明: ${未声明图标.join(', ')}`).toEqual([])
    }
  })

  it('移动文件图标保留彩色色块与有效裁切范围，多处显示互不串用', () => {
    const { container } = render(<><Icon name="doc-word" variant="mobile"/><Icon name="doc-word" variant="mobile"/></>)
    const 图标 = container.querySelectorAll('svg')
    expect(图标).toHaveLength(2)
    for (const svg of 图标) {
      expect(svg.getAttribute('viewBox')).toBe('0 0 64 64')
      const 裁切 = svg.querySelector('clipPath')!
      const 范围 = 裁切.querySelector('rect')!
      expect(Number(范围.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(范围.getAttribute('height'))).toBeGreaterThan(0)
      expect(svg.querySelector('g[clip-path]')?.getAttribute('clip-path')).toBe(`url(#${裁切.id})`)
      expect(svg.querySelector('rect[fill="#1466F5"]')).not.toBeNull()
    }
    expect(图标[0].querySelector('clipPath')!.id).not.toBe(图标[1].querySelector('clipPath')!.id)
  })

  it('PC 与移动功能图标使用各自的构图，底部导航可选择单色线条', () => {
    const { container } = render(<><Icon name="image" variant="pc"/><Icon name="image" variant="mobile"/><Icon name="cloud" variant="outline" color="#2B6CF6"/></>)
    const 图标 = container.querySelectorAll('svg')
    expect(图标[0]).toHaveAttribute('viewBox','0 0 24 24')
    expect(图标[1]).toHaveAttribute('viewBox','0 0 48 48')
    expect(图标[2]).toHaveAttribute('color','#2B6CF6')
    expect(container.textContent).toBe('')
  })
})
