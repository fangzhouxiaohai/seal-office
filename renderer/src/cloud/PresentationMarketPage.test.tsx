import {fireEvent,render,screen,within} from '@testing-library/react'
import {createRequire} from 'node:module'
import {创建演示文稿,创建文本框} from '../ppt/deck'
import {App as AntdApp} from 'antd'
import {beforeEach,describe,it,expect,vi} from 'vitest'
import PresentationMarketPage from './PresentationMarketPage'
const fixture=vi.hoisted(()=>({restore:vi.fn(async()=>({成功:true})),createDoc:vi.fn(),call:vi.fn(async()=>({items:[]}))}))
vi.mock('../ipc/bridge',()=>({桥接:{office:{readSeal:async(extension:string,data:string)=>{const {createRequire}=await import('node:module');const codec=createRequire(import.meta.url)('../../../main/office/sealFormat.js');return {成功:true,...await codec.readSeal(extension,Buffer.from(data,'base64'))}}},presentationResources:{restore:fixture.restore,read:vi.fn(async()=>({成功:true,数据:'AA=='}))}}}))
vi.mock('../store',()=>({useAppStore:()=>({createDoc:fixture.createDoc})}))
vi.mock('./CloudProvider',()=>({cloudCall:fixture.call,useCloud:()=>({state:{account:null,unlocked:false},refresh:vi.fn(),configure:vi.fn()})}))
beforeEach(()=>{fixture.restore.mockClear();fixture.createDoc.mockClear();fixture.call.mockClear()})
describe('市场预览到编辑链路',()=>{
  it('SLPPT 模板上传经真实专属codec预览、使用副本并保留样式和来源记录',async()=>{
    const native=createRequire(import.meta.url)('../../../main/office/sealFormat.js'),deck=创建演示文稿('测试模板.slppt'),warnings=['来源格式转换记录']
    deck.幻灯片列表[0].文本框列表=[{...创建文本框(40,40,600,100,'模板𠮷🦭'),颜色:'#123456',加粗:true}]
    const bytes=await native.writeSeal('ppt',{演示文稿:deck,资源条目:[],警告:warnings}),file=new File([bytes],'测试模板.slppt');Object.defineProperty(file,'arrayBuffer',{value:async()=>Uint8Array.from(bytes).buffer})
    const view=render(<AntdApp><PresentationMarketPage/></AntdApp>),input=view.container.querySelector<HTMLInputElement>('input[type="file"][accept*=".slppt"]')!
    expect(input).toBeTruthy();fireEvent.change(input,{target:{files:[file]}})
    const modal=await screen.findByRole('dialog',{name:'测试模板.slppt'},{timeout:8000});expect(within(modal).getByText('来源格式转换记录')).toBeInTheDocument()
    fireEvent.click(within(modal).getByRole('button',{name:'使用并编辑副本'}))
    expect(fixture.createDoc).toHaveBeenCalledWith('ppt',expect.objectContaining({幻灯片列表:expect.arrayContaining([expect.objectContaining({文本框列表:[expect.objectContaining({text:'模板𠮷🦭',颜色:'#123456',加粗:true})]})])}),{名称:'测试模板.slppt',警告:warnings})
  })
  it('精选用途离线搜索并应用学术答辩，创建包含研究图表的九页文稿',async()=>{
    fixture.createDoc.mockClear();fixture.call.mockClear();fixture.restore.mockClear();render(<AntdApp><PresentationMarketPage/></AntdApp>)
    fireEvent.click(screen.getByRole('button',{name:'学术答辩'}))
    fireEvent.change(screen.getByRole('searchbox',{name:'搜索演示模板'}),{target:{value:'研究 证据'}})
    fireEvent.click(screen.getByRole('button',{name:'预览 学术答辩'}))
    const modal=await screen.findByRole('dialog',{name:'学术答辩.pptx'})
    expect(within(modal).getByText('第 9 页 · 下一步行动')).toBeInTheDocument()
    fireEvent.click(within(modal).getByRole('button',{name:'使用并编辑副本'}))
    const [,deck]=fixture.createDoc.mock.calls[0] as any
    expect(deck.幻灯片列表).toHaveLength(9);expect(fixture.restore).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({类型:'image/png'})]));expect(fixture.call).not.toHaveBeenCalled()
    expect(deck.幻灯片列表[4].对象列表.some((item:any)=>item.图表?.标题==='不同条件下的示例测量')).toBe(true)
  })
  it('预览完整九页后创建原生可编辑文稿，包含表格与图表',async()=>{
    fixture.createDoc.mockClear();render(<AntdApp><PresentationMarketPage/></AntdApp>)
    fireEvent.click(screen.getByRole('button',{name:'预览 年度工作总结 · 海湾蓝'}))
    const modal=await screen.findByRole('dialog',{name:'年度工作总结 · 海湾蓝.pptx'})
    expect(within(modal).getByText('第 9 页 · 感谢聆听 · 交流与讨论')).toBeInTheDocument()
    fireEvent.click(within(modal).getByRole('button',{name:'使用并编辑副本'}))
    expect(fixture.createDoc).toHaveBeenCalledOnce();const [type,deck]=fixture.createDoc.mock.calls[0] as any
    expect(fixture.restore).toHaveBeenCalledOnce();expect(deck.资源索引).toBeDefined();expect(type).toBe('ppt');expect(deck.幻灯片列表).toHaveLength(9)
    const objects=deck.幻灯片列表.flatMap((p:any)=>p.对象列表);expect(objects.some((o:any)=>o.类型==='图表')).toBe(true);expect(objects.some((o:any)=>o.类型==='表格')).toBe(true)
  })
})
