import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import GridView from './GridView'
import RichCellText from './RichCellText'
import { 创建工作表, 设置格式, 写入单元格 } from './model'

const 基础属性 = {
  选区: { 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 0 } }, 编辑地址: null, 编辑值: '',
  on选中: vi.fn(), on双击: vi.fn(), on编辑值变化: vi.fn(), on提交编辑: vi.fn(),
  on取消编辑: vi.fn(), on选中整列: vi.fn(), on选中整行: vi.fn(), on全选: vi.fn(),
}

describe('网格可见范围与来源显示', () => {
  it('初始挂载量由视口决定，横向滚动后保留冻结格并显示远端数据', () => {
    const 表 = 写入单元格(创建工作表('宽表', 50, 200), 'GR2', '远端内容')
    const { container } = render(<GridView {...基础属性} 工作表={表} 冻结={{ 行: 1, 列: 1 }} />)
    expect(container.querySelectorAll('.wps-sheet__cell').length).toBeLessThan(1500)
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    fireEvent.scroll(网格, { target: { scrollLeft: 190 * 88 } })
    expect(container.querySelector('[data-地址="GR2"]')).toHaveTextContent('远端内容')
    expect(container.querySelector('[data-地址="A1"]')).not.toBeNull()
    expect(container.querySelectorAll('.wps-sheet__cell').length).toBeLessThan(1500)
  })

  it('视口与合并区域相交时保留视口外的左上锚点', () => {
    const 表 = 写入单元格(创建工作表('合并', 50, 200), 'A2', '跨视口标题')
    表.合并区域 = ['A2:GR2']
    const { container } = render(<GridView {...基础属性} 工作表={表} />)
    fireEvent.scroll(container.querySelector('.wps-sheet')!, { target: { scrollLeft: 150 * 88 } })
    expect(container.querySelector('[data-地址="A2"]')).toHaveTextContent('跨视口标题')
    expect(container.querySelector('[data-地址="EU2"]')).toBeNull()
  })

  it('键盘或名称框选中远端单元格后滚动并挂载目标', () => {
    const 表 = 写入单元格(创建工作表('远端', 50, 200), 'GR40', '目标')
    const { container, rerender } = render(<GridView {...基础属性} 工作表={表} />)
    const 位置 = { 行: 39, 列: 199 }
    rerender(<GridView {...基础属性} 工作表={表} 选区={{ 起点: 位置, 终点: 位置 }} />)
    expect(container.querySelector('[data-地址="GR40"]')).toHaveTextContent('目标')
    expect((container.querySelector('.wps-sheet') as HTMLElement).scrollLeft).toBeGreaterThan(0)
  })

  it('点数字号按点渲染，显式边框不会与基础网格叠成双线', () => {
    const 表 = 设置格式(创建工作表('格式', 2, 2), 'A1', { 字号: 12, 边框: { 上: true, 下: true, 左: true, 右: true } })
    const { container } = render(<GridView {...基础属性} 工作表={表} />)
    const 单元 = container.querySelector('[data-地址="A1"]') as HTMLElement
    expect(单元.style.fontSize).toBe('12pt')
    expect(单元.style.borderRightColor).toBe('transparent')
    expect(单元.style.boxShadow).toContain('#000000')
  })

  it('缩小字体按文字实际宽度适配，可换行单元格保持原字号', () => {
    const 宽度 = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200)
    const 单元 = { 原始值: '长标题', 显示值: '长标题', 格式: { 字号: 12, 缩小字体填充: true } }
    try {
      const { container, rerender } = render(<RichCellText cell={单元} availableWidth={100} />)
      expect((container.querySelector('.wps-sheet__fit-text') as HTMLElement)?.style.zoom).toBe('0.5')
      rerender(<RichCellText cell={{ ...单元, 格式: { ...单元.格式, 自动换行: true } }} availableWidth={100} />)
      expect(container.querySelector('.wps-sheet__fit-text')).toBeNull()
    } finally { 宽度.mockRestore() }
  })

  it('相邻单元格共享的显式细边框仅绘制一次，邻格网格线让位', () => {
    let 表 = 设置格式(创建工作表('边框', 2, 3), 'A1:B1', { 边框: { 上: true, 下: true, 左: true, 右: true } })
    表 = 设置格式(表, 'C2', { 边框: { 左: true } })
    const { container } = render(<GridView {...基础属性} 工作表={表} />)
    expect((container.querySelector('[data-地址="B1"]') as HTMLElement).style.boxShadow).not.toContain('inset 1px 0 0 0')
    expect((container.querySelector('[data-地址="B2"]') as HTMLElement).style.borderRightColor).toBe('transparent')
  })

  it('旧专属格式的四十四行一万六千三百八十四列仍只挂载可见格', () => {
    const 表 = 写入单元格(创建工作表('旧大范围', 44, 16384), 'XFD39', '远端真实内容')
    const { container, rerender } = render(<GridView {...基础属性} 工作表={表} />)
    expect(container.querySelectorAll('.wps-sheet__cell').length).toBeLessThan(1500)
    const 位置 = { 行: 38, 列: 16383 }
    rerender(<GridView {...基础属性} 工作表={表} 选区={{ 起点: 位置, 终点: 位置 }} />)
    expect(container.querySelector('[data-地址="XFD39"]')).toHaveTextContent('远端真实内容')
    expect(container.querySelectorAll('.wps-sheet__cell').length).toBeLessThan(1500)
    expect(表.列数).toBe(16384)
  })

  it('滚动时保留正在编辑的视口外单元格与草稿输入框', () => {
    const { container } = render(<GridView {...基础属性} 工作表={创建工作表('草稿', 50, 200)} 编辑地址="A1" 编辑值="未提交草稿" />)
    fireEvent.scroll(container.querySelector('.wps-sheet')!, { target: { scrollLeft: 150 * 88 } })
    expect(container.querySelector('[data-地址="A1"] input')).toHaveValue('未提交草稿')
    expect(基础属性.on提交编辑).not.toHaveBeenCalled()
  })

  it('合并区域下边与右边采用外围子格的边框颜色', () => {
    let 表 = 写入单元格(创建工作表('外围边框', 3, 4), 'A1', '合并内容')
    表 = 设置格式(表, 'A1', { 边框: { 上: true, 左: true } })
    表 = 设置格式(表, 'C2', { 边框: { 下: true, 右: true }, 边框颜色: { 下: '#112233', 右: '#445566' } })
    表.合并区域 = ['A1:C2']
    const { container } = render(<GridView {...基础属性} 工作表={表} />)
    const 阴影 = (container.querySelector('[data-地址="A1"]') as HTMLElement).style.boxShadow
    expect(阴影).toContain('inset 0 -1px 0 0 #112233')
    expect(阴影).toContain('inset -1px 0 0 0 #445566')
  })

  it('整行整列和全选保留当前视口，单格导航继续跟随', () => {
    const 表 = 创建工作表('全选', 44, 16384)
    const { container, rerender } = render(<GridView {...基础属性} 工作表={表} />)
    const 网格 = container.querySelector('.wps-sheet') as HTMLElement
    rerender(<GridView {...基础属性} 工作表={表} 选区={{ 起点: { 行: 0, 列: 0 }, 终点: { 行: 0, 列: 16383 } }} />)
    expect(网格.scrollLeft).toBe(0)
    rerender(<GridView {...基础属性} 工作表={表} 选区={{ 起点: { 行: 0, 列: 0 }, 终点: { 行: 43, 列: 0 } }} />)
    expect(网格.scrollTop).toBe(0)
    rerender(<GridView {...基础属性} 工作表={表} 选区={{ 起点: { 行: 0, 列: 0 }, 终点: { 行: 43, 列: 16383 } }} />)
    expect(网格.scrollLeft).toBe(0)
    expect(网格.scrollTop).toBe(0)
  })

  it('非活动拆分窗格在共享选区变化时保留独立滚动位置', () => {
    const 表 = 创建工作表('拆分', 50, 200)
    const { container, rerender } = render(<GridView {...基础属性} 工作表={表} 跟随选区={false} />)
    const 位置 = { 行: 39, 列: 199 }
    rerender(<GridView {...基础属性} 工作表={表} 跟随选区={false} 选区={{ 起点: 位置, 终点: 位置 }} />)
    expect((container.querySelector('.wps-sheet') as HTMLElement).scrollLeft).toBe(0)
    expect((container.querySelector('.wps-sheet') as HTMLElement).scrollTop).toBe(0)
  })
})
