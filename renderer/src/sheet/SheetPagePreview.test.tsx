import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SheetPagePreview from './SheetPagePreview'
import { 创建工作表, 设置页面设置, 写入单元格 } from './model'

describe('表格页面布局预览', () => {
  it('按纸张的可用宽高分页且保留末页内容', () => {
    let 表 = 创建工作表('分页测试', 50, 10)
    表 = 写入单元格(表, 'J50', '末页内容')
    表 = 设置页面设置(表, { 纸张大小: 'A5', 方向: '横向' })
    const { container } = render(<SheetPagePreview 工作表={表} />)
    expect(container.querySelectorAll('.wps-sheet-print-preview__paper')).toHaveLength(6)
    expect(screen.getByRole('region', { name: '页面布局预览' })).toHaveTextContent('末页内容')
    expect(container.querySelector('.wps-sheet-print-preview__paper:last-child')).toHaveTextContent('末页内容')
  })
})
