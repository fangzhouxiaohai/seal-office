import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Footer from './Footer'

describe('底部状态栏', () => {
  it('展示文档总数与星标数', () => {
    render(<Footer total={12} starred={5} />)
    expect(screen.getByText('共 12 个文档')).toBeInTheDocument()
    expect(screen.getByText('其中星标 5 个')).toBeInTheDocument()
  })

  it('展示版本号', () => {
    render(<Footer total={0} starred={0} />)
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument()
  })
})
