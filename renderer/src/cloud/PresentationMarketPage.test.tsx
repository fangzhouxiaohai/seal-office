import {fireEvent,render,screen,within} from '@testing-library/react'
import {App as AntdApp} from 'antd'
import {describe,it,expect,vi} from 'vitest'
import PresentationMarketPage from './PresentationMarketPage'
const fixture=vi.hoisted(()=>({createDoc:vi.fn(),call:vi.fn(async()=>({items:[]}))}))
vi.mock('../store',()=>({useAppStore:()=>({createDoc:fixture.createDoc})}))
vi.mock('./CloudProvider',()=>({cloudCall:fixture.call,useCloud:()=>({state:{account:null,unlocked:false},refresh:vi.fn(),configure:vi.fn()})}))
describe('市场预览到编辑链路',()=>{
  it('预览完整九页后创建原生可编辑文稿，包含表格与图表',async()=>{
    fixture.createDoc.mockClear();render(<AntdApp><PresentationMarketPage/></AntdApp>)
    fireEvent.click(screen.getByRole('button',{name:'预览 年度工作总结 · 海湾蓝'}))
    const modal=await screen.findByRole('dialog',{name:'年度工作总结 · 海湾蓝.pptx'})
    expect(within(modal).getByText('第 9 页 · 感谢聆听 · 交流与讨论')).toBeInTheDocument()
    fireEvent.click(within(modal).getByRole('button',{name:'使用并编辑副本'}))
    expect(fixture.createDoc).toHaveBeenCalledOnce();const [type,deck]=fixture.createDoc.mock.calls[0] as any
    expect(type).toBe('ppt');expect(deck.幻灯片列表).toHaveLength(9)
    const objects=deck.幻灯片列表.flatMap((p:any)=>p.对象列表);expect(objects.some((o:any)=>o.类型==='图表')).toBe(true);expect(objects.some((o:any)=>o.类型==='表格')).toBe(true)
  })
})
