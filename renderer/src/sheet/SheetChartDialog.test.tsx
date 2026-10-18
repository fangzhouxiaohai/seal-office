import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import SheetChartDialog from './SheetChartDialog'
import { 创建工作表, 写入单元格 } from './model'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const makeSheet = () => {
  let sheet = 创建工作表('真实数据')
  for (const [address,value] of [['A1','地区'],['B1','收入'],['A2','华北'],['B2','120']]) sheet=写入单元格(sheet,address,value)
  return sheet
}
const selection={起点:{行:0,列:0},终点:{行:1,列:1}}
it('数据无效时禁止插入，说明当前为图表图片', () => {
  render(<SheetChartDialog sheet={创建工作表('空表')} selection={selection} onClose={()=>{}} onInsert={()=>{}} />)
  expect(screen.getByRole('button',{name:/插入图表图片/})).toBeDisabled()
  expect(screen.getByText(/原始数据保留/)).toBeInTheDocument()
})
it('取消正在绘制的图表后，迟到的图片回调不会插入或修改工作表', async () => {
  let pending: {onload?:()=>void}|undefined
  vi.stubGlobal('Image',class { onload?:()=>void;set src(_value:string){pending=this} })
  const insert=vi.fn(),close=vi.fn()
  render(<ConfigProvider button={{autoInsertSpace:false}}><SheetChartDialog sheet={makeSheet()} selection={selection} onClose={close} onInsert={insert} /></ConfigProvider>)
  fireEvent.click(screen.getByRole('button',{name:'插入图表图片'}))
  expect(pending).toBeDefined()
  fireEvent.click(screen.getByRole('button',{name:'取消'}))
  await act(async()=>{pending?.onload?.();await Promise.resolve()})
  expect(close).toHaveBeenCalledOnce();expect(insert).not.toHaveBeenCalled()
})
it('有效数据生成实际 PNG 图片，保留尺寸与格式', async () => {
  let pending: {onload?:()=>void}|undefined
  vi.stubGlobal('Image',class { onload?:()=>void;set src(_value:string){pending=this} })
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({fillStyle:'',fillRect:vi.fn(),drawImage:vi.fn()} as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,cG5nLWZpeHR1cmU=')
  const insert=vi.fn()
  render(<ConfigProvider button={{autoInsertSpace:false}}><SheetChartDialog sheet={makeSheet()} selection={selection} onClose={()=>{}} onInsert={insert} /></ConfigProvider>)
  fireEvent.click(screen.getByRole('button',{name:'插入图表图片'}))
  await act(async()=>{pending?.onload?.();await Promise.resolve()})
  expect(insert).toHaveBeenCalledWith({格式:'png',数据:'cG5nLWZpeHR1cmU=',宽:480,高:260})
})
