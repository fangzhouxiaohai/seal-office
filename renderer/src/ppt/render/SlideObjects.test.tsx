import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SlideObjects } from './SlideObjects'
import type { 幻灯片 } from '../deck'
describe('统一只读对象渲染', () => {
  it('使用真实图片资源、裁剪和旋转且不添加编辑控件', () => {
    const 页: 幻灯片 = { id: '页', title: '测试', 版式: '空白', 背景色: '#FFFFFF', 文本框列表: [], 对象列表: [{ id: '图片', 类型: '图片', x: 10, y: 20, width: 300, height: 200, 旋转: 30, 裁剪: { 左: .25, 上: 0, 右: .25, 下: 0 }, 资源标识: '资源' }] }
    const { container } = render(<SlideObjects 幻灯片={页} 图片地址={{ 资源: 'data:image/png;base64,真实字节' }} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,真实字节')
    expect(screen.getByRole('img').style.width).toBe('200%')
    expect(container.querySelector('[data-对象标识="图片"]')).toHaveStyle({ transform: 'rotate(30deg)' })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
