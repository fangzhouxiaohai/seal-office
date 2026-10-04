import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useAppStore, type AppState } from '../store'
import PptEditor from './PptEditor'
import { 创建演示文稿 } from './deck'
import { 创建语义图 } from './model/elements'
import { 导出为Html预览 } from './deckExport'
afterEach(() => { Reflect.deleteProperty(window,'electronAPI'); vi.clearAllMocks() })
async function 装配(语义 = false) {
  const 写入 = vi.fn(async () => ({ 成功: true, 数据: '文件字节' }))
  Object.defineProperty(window,'electronAPI',{ configurable: true, value: { backupLoad: vi.fn(async () => ({成功:true,内容:null})), recentAdd: vi.fn(async () => ({成功:true})), showSaveDialog: vi.fn(async () => 'E:\\Temp\\原生对象.pptx'), saveToFile: vi.fn(async () => ({成功:true})), office: { writePptx: 写入 } } })
  let 状态: AppState
  function 入口() { 状态 = useAppStore(); return <PptEditor/> }
  const 视图 = render(<AntdApp><AppProvider><入口/></AppProvider></AntdApp>)
  await waitFor(() => expect(状态.启动恢复结束).toBe(true))
  const 文稿 = 创建演示文稿('原生对象')
  if (语义) 文稿.幻灯片列表[0].对象列表 = 创建语义图('流程')
  act(() => 状态.createDoc('ppt',文稿))
  return { ...视图, 写入, 读取: () => 状态.演示文档模型[状态.activeDocumentId!] }
}
describe('原生对象编辑入口', () => {
  it('表格插入、修改、合并、撤销与预览导出都使用真实单元格', async () => {
    const {container,读取,写入} = await 装配()
    await userEvent.click(screen.getByRole('tab',{name:'插入'}))
    await userEvent.click(screen.getByRole('button',{name:'表格'}))
    expect(读取().幻灯片列表[0].对象列表).toHaveLength(1)
    const 对象 = 读取().幻灯片列表[0].对象列表![0]
    fireEvent.mouseDown(container.querySelector(`.wps-ppt-canvas [data-对象标识="${对象.id}"]`)!,{button:0})
    fireEvent.mouseUp(window)
    fireEvent.change(screen.getByLabelText('单元格内容'),{target:{value:'季度收入'}})
    await userEvent.click(screen.getByRole('button',{name:'合并单元格'}))
    expect(读取().幻灯片列表[0].对象列表![0].表格!.合并).toHaveLength(1)
    expect(导出为Html预览(读取(),'表格')).toContain('colSpan="2"')
    await userEvent.click(screen.getByRole('tab',{name:'开始'}))
    await userEvent.click(screen.getByRole('button',{name:'撤销'}))
    expect(读取().幻灯片列表[0].对象列表![0].表格!.合并).toHaveLength(0)
    expect(读取().幻灯片列表[0].对象列表![0].表格!.单元格[0][0].文本).toBe('季度收入')
    await userEvent.click(screen.getByRole('button',{name:'保存'}))
    await waitFor(() => expect(写入).toHaveBeenCalled())
  })
  it('组合成员可编辑，节点移动连线同步，删除节点清理连接引用', async () => {
    const {container,读取} = await 装配(true)
    const 节点 = 读取().幻灯片列表[0].对象列表!.find(项 => 项.形状?.文本 === '开始')!
    fireEvent.mouseDown(container.querySelector(`.wps-ppt-canvas [data-对象标识="${节点.id}"]`)!,{button:0}); fireEvent.mouseUp(window)
    await userEvent.click(screen.getByRole('button',{name:'开始'}))
    const x = screen.getByLabelText('水平位置')
    fireEvent.change(x,{target:{value:'191'}}); fireEvent.blur(x)
    const 线 = 读取().幻灯片列表[0].对象列表!.find(项 => 项.连接?.起点.对象 === 节点.id)!
    expect(线.连接!.起点位置.x).toBe(351)
    await userEvent.click(screen.getByRole('button',{name:'撤销'}))
    expect(读取().幻灯片列表[0].对象列表!.find(项 => 项.id === 节点.id)!.x).toBe(120)
    expect(读取().幻灯片列表[0].对象列表!.find(项 => 项.id === 线.id)!.连接!.起点位置.x).toBe(280)
    await userEvent.click(screen.getByRole('button',{name:'重做'}))
    expect(读取().幻灯片列表[0].对象列表!.find(项 => 项.id === 节点.id)!.x).toBe(191)
    fireEvent.change(screen.getByLabelText('图形文字'),{target:{value:'新起点'}})
    expect(导出为Html预览(读取(),'语义图')).toContain('新起点')
    await userEvent.click(screen.getByRole('button',{name:/^删除$/}))
    expect(读取().幻灯片列表[0].对象列表!.some(项 => 项.连接?.起点.对象 === 节点.id)).toBe(false)
  })
})
