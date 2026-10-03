import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SlideshowView from './SlideshowView'
import { 添加幻灯片, 创建演示文稿 } from './deck'

describe('本机幻灯片切换', () => {
  it('翻页到有推进效果的页面时重新播放进入过渡', () => {
    const 文稿 = 添加幻灯片(创建演示文稿())
    文稿.幻灯片列表[1].过渡效果 = '推进'
    const 放映 = () => {
      const [索引, set索引] = React.useState(0)
      return <SlideshowView 文稿={文稿} 当前索引={索引} on翻页={set索引} on退出={vi.fn()} />
    }
    const { container } = render(<放映 />)
    expect(container.querySelector('.wps-slideshow__page--push')).toBeNull()
    fireEvent.click(screen.getByRole('dialog', { name: '幻灯片放映' }))
    expect(container.querySelector('.wps-slideshow__page--push')).not.toBeNull()
  })
})
