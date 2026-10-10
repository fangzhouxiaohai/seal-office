import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import SheetToolbar from './SheetToolbar'

it('中文输入法确认候选时不提交单元格，正式回车才保存内容', () => {
  const 公式提交 = vi.fn(), 地址提交 = vi.fn()
  render(<SheetToolbar 地址文本="A1" 公式值="" on地址提交={地址提交} on公式提交={公式提交} />)
  const 公式 = screen.getByRole('textbox', { name: '公式栏' })
  fireEvent.change(公式, { target: { value: '采购金额' } })
  fireEvent.keyDown(公式, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(公式, { key: 'Enter', keyCode: 229 })
  expect(公式提交).not.toHaveBeenCalled()
  fireEvent.keyDown(公式, { key: 'Enter', isComposing: false, keyCode: 13 })
  expect(公式提交).toHaveBeenCalledWith('采购金额')
  const 地址 = screen.getByRole('textbox', { name: '名称框' })
  fireEvent.change(地址, { target: { value: 'B2' } })
  fireEvent.keyDown(地址, { key: 'Enter', isComposing: true })
  expect(地址提交).not.toHaveBeenCalled()
  fireEvent.keyDown(地址, { key: 'Enter', keyCode: 13 })
  expect(地址提交).toHaveBeenCalledWith('B2')
})
