import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingState from './LoadingState'

describe('统一加载动画', () => {
  it('以 status 角色播报加载文字，并带品牌动画', () => {
    render(<LoadingState 文字="正在读取云空间…" />)
    const 状态 = screen.getByRole('status')
    expect(状态.textContent).toContain('正在读取云空间…')
    expect(状态.getAttribute('aria-busy')).toBe('true')
    expect(状态.querySelector('.seal-loading__mark')).toBeTruthy()
  })

  it('默认文字为正在加载，并支持紧凑尺寸', () => {
    render(<LoadingState 紧凑 />)
    expect(screen.getByRole('status').textContent).toContain('正在加载…')
    expect(screen.getByRole('status').className).toContain('seal-loading--compact')
  })
})
