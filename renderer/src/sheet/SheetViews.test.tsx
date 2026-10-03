import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GridView, { type 选区范围 } from './GridView'
import SheetToolbar from './SheetToolbar'
import { 创建工作表, 写入单元格 } from './model'

const 构造工作表 = () => {
  const 表 = 创建工作表('测试', 3, 3)
  return 写入单元格(写入单元格(表, 'A1', '10'), 'B2', '=A1*2')
}

const 默认选区: 选区范围 = { 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } }

const 渲染网格 = (覆盖: Partial<React.ComponentProps<typeof GridView>> = {}) =>
  render(
    <GridView
      工作表={构造工作表()}
      选区={默认选区}
      编辑地址={null}
      编辑值=""
      on选中={() => {}}
      on双击={() => {}}
      on编辑值变化={() => {}}
      on提交编辑={() => {}}
      on取消编辑={() => {}}
      on选中整列={() => {}}
      on选中整行={() => {}}
      on全选={() => {}}
      {...覆盖}
    />
  )

describe('表格网格', () => {
  it('渲染列标与行号', () => {
    渲染网格()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('按行列数渲染单元格', () => {
    const { container } = 渲染网格()
    expect(container.querySelectorAll('.wps-sheet__cell')).toHaveLength(9)
  })

  it('展示单元格的显示值', () => {
    渲染网格()
    expect(screen.getByText('10')).toBeInTheDocument()
    // B2 为公式 =A1*2，重算后显示 20
    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('选中单元格带选中样式', () => {
    const { container } = 渲染网格({
      选区: { 起点: { 行: 0, 列: 0 }, 终点: { 行: 1, 列: 1 } },
    })
    expect(container.querySelectorAll('.wps-sheet__cell--selected')).toHaveLength(4)
  })

  it('单击单元格回传位置与是否扩展选区', async () => {
    const 选中 = vi.fn()
    const { container } = 渲染网格({ on选中: 选中 })
    const 单元格 = container.querySelector('[data-地址="B2"]') as HTMLElement
    await userEvent.click(单元格)
    expect(选中).toHaveBeenCalledWith({ 行: 1, 列: 1 }, false)
  })

  it('按住 Shift 单击回传扩展标记', async () => {
    const 选中 = vi.fn()
    const { container } = 渲染网格({ on选中: 选中 })
    const 单元格 = container.querySelector('[data-地址="C3"]') as HTMLElement
    fireEvent.mouseDown(单元格, { button: 0, shiftKey: true })
    expect(选中).toHaveBeenCalledWith({ 行: 2, 列: 2 }, true)
  })

  it('双击单元格回传地址', async () => {
    const 双击 = vi.fn()
    const { container } = 渲染网格({ on双击: 双击 })
    const 单元格 = container.querySelector('[data-地址="A1"]') as HTMLElement
    fireEvent.doubleClick(单元格)
    expect(双击).toHaveBeenCalledWith('A1')
  })

  it('编辑态渲染输入框并回传输入内容', async () => {
    const 变化 = vi.fn()
    渲染网格({ 编辑地址: 'A1', 编辑值: '草稿', on编辑值变化: 变化 })
    const 输入框 = screen.getByDisplayValue('草稿')
    await userEvent.type(输入框, 'x')
    expect(变化).toHaveBeenCalled()
  })

  it('编辑态回车触发提交，Esc 触发取消', async () => {
    const 提交 = vi.fn()
    const 取消 = vi.fn()
    渲染网格({ 编辑地址: 'A1', 编辑值: '草稿', on提交编辑: 提交, on取消编辑: 取消 })
    const 输入框 = screen.getByDisplayValue('草稿')
    await userEvent.type(输入框, '{Enter}')
    expect(提交).toHaveBeenCalled()
    await userEvent.type(输入框, '{Escape}')
    expect(取消).toHaveBeenCalled()
  })

  it('点击列标、行号与角落分别回传整列、整行与全选', async () => {
    const 整列 = vi.fn()
    const 整行 = vi.fn()
    const 全选 = vi.fn()
    const { container } = 渲染网格({ on选中整列: 整列, on选中整行: 整行, on全选: 全选 })
    await userEvent.click(screen.getByText('B'))
    expect(整列).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByText('2'))
    expect(整行).toHaveBeenCalledWith(1)
    await userEvent.click(container.querySelector('.wps-sheet__corner') as HTMLElement)
    expect(全选).toHaveBeenCalledTimes(1)
  })
})

describe('名称框与公式栏', () => {
  it('名称框展示当前地址', () => {
    render(<SheetToolbar 地址文本="B2" 公式值="" on地址提交={() => {}} on公式提交={() => {}} />)
    expect(screen.getByDisplayValue('B2')).toBeInTheDocument()
  })

  it('公式栏展示当前原始值', () => {
    render(<SheetToolbar 地址文本="A1" 公式值="=SUM(A1:A3)" on地址提交={() => {}} on公式提交={() => {}} />)
    expect(screen.getByDisplayValue('=SUM(A1:A3)')).toBeInTheDocument()
  })

  it('名称框回车回传地址', async () => {
    const 提交 = vi.fn()
    render(<SheetToolbar 地址文本="A1" 公式值="" on地址提交={提交} on公式提交={() => {}} />)
    const 输入框 = screen.getByLabelText('名称框')
    await userEvent.clear(输入框)
    await userEvent.type(输入框, 'C5{Enter}')
    expect(提交).toHaveBeenCalledWith('C5')
  })

  it('公式栏回车回传公式', async () => {
    const 提交 = vi.fn()
    render(<SheetToolbar 地址文本="A1" 公式值="" on地址提交={() => {}} on公式提交={提交} />)
    const 输入框 = screen.getByLabelText('公式栏')
    await userEvent.type(输入框, '=1+2{Enter}')
    expect(提交).toHaveBeenCalledWith('=1+2')
  })

  it('外部地址变化时名称框同步更新', () => {
    const { rerender } = render(
      <SheetToolbar 地址文本="A1" 公式值="" on地址提交={() => {}} on公式提交={() => {}} />
    )
    rerender(<SheetToolbar 地址文本="D4" 公式值="" on地址提交={() => {}} on公式提交={() => {}} />)
    expect(screen.getByDisplayValue('D4')).toBeInTheDocument()
  })
})

describe('表格选区反向扩展', () => {
  it('反向选区（终点在起点上方）仍高亮全部覆盖的单元格', () => {
    const { container } = 渲染网格({
      选区: { 起点: { 行: 2, 列: 2 }, 终点: { 行: 0, 列: 0 } },
    })
    expect(container.querySelectorAll('.wps-sheet__cell--selected')).toHaveLength(9)
  })

  it('反向选区（终点在起点左侧）仍高亮覆盖单元格', () => {
    const { container } = 渲染网格({
      选区: { 起点: { 行: 1, 列: 2 }, 终点: { 行: 1, 列: 0 } },
    })
    expect(container.querySelectorAll('.wps-sheet__cell--selected')).toHaveLength(3)
  })
})

describe('表格边框渲染', () => {
  it('带边框配置的单元格渲染内阴影', () => {
    const 表 = 写入单元格(构造工作表(), 'A1', '带框')
    const 带框表 = {
      ...表,
      单元格: {
        ...表.单元格,
        A1: { ...表.单元格.A1, 格式: { ...表.单元格.A1.格式, 边框: { 上: true, 下: true, 左: true, 右: true } } },
      },
    }
    const { container } = 渲染网格({ 工作表: 带框表 })
    const 单元 = container.querySelector('[data-地址="A1"]') as HTMLElement
    expect(单元.style.boxShadow).toContain('inset')
  })

  it('无边框配置的单元格无内阴影', () => {
    const { container } = 渲染网格()
    const 单元 = container.querySelector('[data-地址="A1"]') as HTMLElement
    expect((单元.style.boxShadow ?? '') === '').toBe(true)
  })
})
