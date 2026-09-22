import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableGridPicker from './TableGridPicker'

describe('表格网格选择器', () => {
  it('未打开时不渲染内容', () => {
    const { container } = render(
      <TableGridPicker open={false} onClose={() => {}} onPick={() => {}} />
    )
    expect(container.querySelector('.wps-grid-picker')).toBeNull()
  })

  it('渲染默认 8 乘 8 的网格', () => {
    const { container } = render(
      <TableGridPicker open onClose={() => {}} onPick={() => {}} />
    )
    expect(container.querySelectorAll('.wps-grid-picker__cell')).toHaveLength(64)
  })

  it('悬停单元格时展示当前行列数', async () => {
    render(<TableGridPicker open onClose={() => {}} onPick={() => {}} />)
    const 单元格列表 = document.querySelectorAll('.wps-grid-picker__cell')
    fireEvent.mouseEnter(单元格列表[2 * 8 + 3])
    expect(screen.getByText('4 列 × 3 行')).toBeInTheDocument()
  })

  it('点击单元格回传所选行列数', async () => {
    const 选择 = vi.fn()
    render(<TableGridPicker open onClose={() => {}} onPick={选择} />)
    const 单元格列表 = document.querySelectorAll('.wps-grid-picker__cell')
    await userEvent.click(单元格列表[1 * 8 + 4])
    expect(选择).toHaveBeenCalledWith(2, 5)
  })

  it('点击取消按钮回传关闭事件', async () => {
    const 关闭 = vi.fn()
    render(<TableGridPicker open onClose={关闭} onPick={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(关闭).toHaveBeenCalledTimes(1)
  })

  it('初始提示引导用户选择行列数', () => {
    render(<TableGridPicker open onClose={() => {}} onPick={() => {}} />)
    expect(screen.getByText(/请选择表格行列数/)).toBeInTheDocument()
  })

  it('可自定义网格上限', () => {
    const { container } = render(
      <TableGridPicker open onClose={() => {}} onPick={() => {}} maxRows={3} maxCols={4} />
    )
    expect(container.querySelectorAll('.wps-grid-picker__cell')).toHaveLength(12)
  })
})
