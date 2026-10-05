import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { App as AntdApp } from 'antd'
import * as 元素 from './model/elements'
import { 创建幻灯片, 创建演示文稿 } from './deck'
import { 校验当前Pptx写入能力 } from './model/migrations'
import { 导出为Html预览 } from './deckExport'
import ChartDataPanel from './panels/ChartDataPanel'

const 原样式 = window.getComputedStyle
beforeEach(()=>{vi.spyOn(window,'getComputedStyle').mockImplementation(节点=>原样式(节点))})
afterEach(()=>{vi.restoreAllMocks()})

describe('图表数据与统一预览',()=>{
  it('提供可编辑图表创建与严格校验能力',()=>{
    expect(元素).toHaveProperty('创建图表')
    const 对象=元素.创建图表('柱状图'),稿=创建演示文稿();稿.幻灯片列表[0].对象列表=[对象]
    expect(()=>校验当前Pptx写入能力(稿)).not.toThrow()
    const 原=JSON.stringify(对象)
    expect(()=>元素.修改图表(对象,{...对象.图表!,系列:[{...对象.图表!.系列[0],数值:[NaN]}]})).toThrow(/图表/)
    expect(JSON.stringify(对象)).toBe(原)
  })
  it('系列增删保留已有标识，最后系列与无效饼图被拒绝',()=>{
    const 对象=元素.创建图表('柱状图'),加=元素.添加图表系列(对象),标识=对象.图表!.系列[0].id
    expect(加.图表!.系列[0].id).toBe(标识)
    const 删=元素.删除图表系列(加,标识)
    expect(删.图表!.系列[0].id).not.toBe(标识)
    expect(()=>元素.删除图表系列(删,删.图表!.系列[0].id)).toThrow(/至少/)
    expect(()=>元素.修改图表(加,{...加.图表!,种类:'饼图'})).toThrow(/饼图/)
  })
  it('三类图表导出复用矢量渲染且包含稳定系列标识',()=>{
    for(const 种类 of ['柱状图','折线图','饼图'] as const){
      const 对象=元素.创建图表(种类),稿=创建演示文稿();稿.幻灯片列表=[{...创建幻灯片('空白'),对象列表:[对象]}]
      const html=导出为Html预览(稿,'季度数据')
      expect(html).toContain(`data-chart-type="${种类}"`)
      expect(html).toContain(`data-series-id="${对象.图表!.系列[0].id}"`)
      expect(html).not.toContain('NaN')
    }
  })
  it('数据面板无效数值弹窗且保持原图，合法编辑一次提交',()=>{
    const 对象=元素.创建图表('柱状图'),替换=vi.fn()
    render(<AntdApp><ChartDataPanel 对象={对象} 禁用={false} on替换={替换}/></AntdApp>)
    fireEvent.change(screen.getByLabelText('第1行第1系列数值'),{target:{value:'错误'}})
    fireEvent.click(screen.getByRole('button',{name:'应用图表数据'}))
    expect(替换).not.toHaveBeenCalled()
    expect(screen.getByText(/请输入有效数值/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('第1行第1系列数值'),{target:{value:'123.5'}})
    fireEvent.click(screen.getByRole('button',{name:'应用图表数据'}))
    expect(替换).toHaveBeenCalledTimes(1)
    expect(替换.mock.calls[0][0].图表.系列[0].数值[0]).toBe(123.5)
  })
})
