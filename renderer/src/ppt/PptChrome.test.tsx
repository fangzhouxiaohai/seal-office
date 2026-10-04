import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PptStatusBar } from './PptChrome'
import { 创建演示文稿 } from './deck'
describe('精确缩放状态栏',()=>{
  it('300% 继续放大到310%，小于50%继续缩小且统一限制为10%至400%',()=>{
    const 修改=vi.fn(),{rerender}=render(<PptStatusBar 文稿={创建演示文稿()} 缩放={3} on缩放变化={修改}/>)
    fireEvent.click(screen.getByRole('button',{name:'放大'}));expect(修改).toHaveBeenLastCalledWith(3.1)
    rerender(<PptStatusBar 文稿={创建演示文稿()} 缩放={.2} on缩放变化={修改}/>)
    fireEvent.click(screen.getByRole('button',{name:'缩小'}));expect(修改).toHaveBeenLastCalledWith(.1)
  })
})
