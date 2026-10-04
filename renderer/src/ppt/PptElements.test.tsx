import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App as AntdApp } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useAppStore, type AppState } from '../store'
import PptEditor from './PptEditor'
import { 创建演示文稿, type 演示对象 } from './deck'
import { 创建语义图, 创建图形, 创建表格 } from './model/elements'
import { 导出为Html预览 } from './deckExport'
import { 迁移演示文稿 } from './model/migrations'
afterEach(() => { Reflect.deleteProperty(window,'electronAPI'); vi.clearAllMocks() })
async function 装配(语义 = false, 初始对象?: 演示对象[]) {
  const 写入 = vi.fn(async () => ({ 成功: true, 数据: '文件字节' }))
  Object.defineProperty(window,'electronAPI',{ configurable: true, value: { backupLoad: vi.fn(async () => ({成功:true,内容:null})), recentAdd: vi.fn(async () => ({成功:true})), showSaveDialog: vi.fn(async () => 'E:\\Temp\\原生对象.pptx'), saveToFile: vi.fn(async () => ({成功:true})), office: { writePptx: 写入 } } })
  let 状态: AppState
  function 入口() { 状态 = useAppStore(); return <PptEditor/> }
  const 视图 = render(<AntdApp><AppProvider><入口/></AppProvider></AntdApp>)
  await waitFor(() => expect(状态.启动恢复结束).toBe(true))
  const 文稿 = 创建演示文稿('原生对象')
  if (语义) 文稿.幻灯片列表[0].对象列表 = 创建语义图('流程')
  if (初始对象) 文稿.幻灯片列表[0].对象列表 = 初始对象
  act(() => 状态.createDoc('ppt',文稿,初始对象 ? {路径:'E:\\Temp\\审查回归.pptx'} : undefined))
  return { ...视图, 写入, 状态:()=>状态, 读取: () => 状态.演示文档模型[状态.activeDocumentId!] }
}
describe('原生对象编辑入口', () => {
  it('成员自身锁定后经过状态迁移和失选仍可重选解锁，编辑随之恢复', async () => {
    const {container,读取,状态}=await 装配(true)
    const 节点=读取().幻灯片列表[0].对象列表!.find(项=>项.形状?.文本==='开始')!
    const 选画布节点=()=>{fireEvent.mouseDown(container.querySelector(`.wps-ppt-canvas [data-对象标识="${节点.id}"]`)!,{button:0});fireEvent.mouseUp(window)}
    选画布节点()
    await userEvent.click(screen.getByRole('button',{name:'开始'}))
    await userEvent.click(screen.getByRole('button',{name:'锁定'}))
    expect(读取().幻灯片列表[0].对象列表!.find(项=>项.id===节点.id)!.锁定).toBe(true)
    act(()=>状态().更新演示文档模型(状态().activeDocumentId!,迁移演示文稿(JSON.parse(JSON.stringify(读取())))))
    fireEvent.click(container.querySelector('.wps-ppt-canvas')!)
    选画布节点()
    expect(screen.getByRole('button',{name:'开始'})).toBeEnabled()
    await userEvent.click(screen.getByRole('button',{name:'开始'}))
    expect(screen.getByLabelText('图形文字')).toBeDisabled()
    expect(screen.getByLabelText('宽度')).toBeDisabled()
    expect(screen.getByRole('button',{name:'删除'})).toBeDisabled()
    await userEvent.click(screen.getByRole('button',{name:'解锁'}))
    expect(screen.getByLabelText('宽度')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('图形文字'),{target:{value:'恢复编辑'}})
    expect(读取().幻灯片列表[0].对象列表!.find(项=>项.id===节点.id)!.形状!.文本).toBe('恢复编辑')
  })
  it('混选旋转的鼠标和键盘提交被拒绝，保存基线不变', async () => {
    const 列表=[创建图形('矩形'),创建表格(2,2)],{container,读取,状态}=await 装配(false,列表)
    const 原=读取()
    for (const [i,项] of 列表.entries()) { fireEvent.mouseDown(container.querySelector(`.wps-ppt-canvas [data-对象标识="${项.id}"]`)!,{button:0,ctrlKey:i>0});fireEvent.mouseUp(window) }
    const 旋转=screen.getByLabelText('旋转角度')
    expect(旋转).toBeDisabled()
    fireEvent.change(旋转,{target:{value:'37'}});fireEvent.keyDown(旋转,{key:'Enter'});fireEvent.blur(旋转)
    expect(读取()).toBe(原)
    expect(状态().workspaceTabs.find(项=>项.id===状态().activeDocumentId)!.dirty).toBe(false)
  })
  it('锁定组合成员的点击拖动和删除键不改变正文或保存基线，解锁后可编辑', async () => {
    const 列表=创建语义图('流程'),组=列表.find(项=>项.类型==='组合')!,节点=列表.find(项=>项.形状?.文本==='开始')!
    组.锁定=true
    const {container,读取,状态}=await 装配(false,列表),原=读取(),画布节点=container.querySelector(`.wps-ppt-canvas [data-对象标识="${节点.id}"]`)!
    fireEvent.mouseDown(画布节点,{button:0});fireEvent.mouseMove(window,{clientX:80,clientY:80});fireEvent.mouseUp(window)
    expect(screen.getByRole('button',{name:'开始'})).toBeDisabled()
    fireEvent.keyDown(画布节点,{key:'Delete'});fireEvent.keyDown(画布节点,{key:'ArrowRight'})
    expect(读取()).toBe(原)
    expect(状态().workspaceTabs.find(项=>项.id===状态().activeDocumentId)!.dirty).toBe(false)
    await userEvent.click(screen.getByRole('button',{name:'解锁'}))
    await userEvent.click(screen.getByRole('button',{name:'开始'}))
    fireEvent.change(screen.getByLabelText('图形文字'),{target:{value:'已解锁编辑'}})
    expect(读取().幻灯片列表[0].对象列表!.find(项=>项.id===节点.id)!.形状!.文本).toBe('已解锁编辑')
    expect(状态().workspaceTabs.find(项=>项.id===状态().activeDocumentId)!.dirty).toBe(true)
  })
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
