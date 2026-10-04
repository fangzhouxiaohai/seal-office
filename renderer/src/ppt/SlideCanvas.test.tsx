import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import SlideCanvas from './SlideCanvas'
import { 修改对象 } from './model/objectOperations'
import type { 幻灯片 } from './deck'
const 页面 = (): 幻灯片 => ({ id:'页',title:'测试',版式:'空白',背景色:'#FFFFFF',文本框列表:[],对象列表:[0,1].map(i=>({ id:`图${i}`,类型:'图片',x:i*150,y:10,width:100,height:50,资源标识:'资源' })) })
function 装配({ 提交, 只读=false, 锁定=false, 吸附=false }: { 提交: ReturnType<typeof vi.fn>; 只读?: boolean; 锁定?: boolean; 吸附?: boolean }) {
  const [页,set页]=useState(()=>{const 页=页面(); 页.对象列表![0].锁定=锁定;return 页}),[选中,set选中]=useState<string[]>([])
  return <SlideCanvas 幻灯片={页} 选中框标识={null} 缩放={.5} 编辑框标识={null} 编辑值="" 显示网格线={false} 只读={只读} 吸附={吸附} 选中对象={选中} on选中对象={set选中} 图片地址={{资源:'data:image/png;base64,字节'}} on选中框={()=>{}} on双击框={()=>{}} on编辑值变化={()=>{}} on提交编辑={()=>{}} on拖动框={()=>{}} on文本选择={()=>{}} on对象提交={修改=>{ 提交(修改);set页(当前=>Object.entries(修改).reduce((页,[id,值])=>修改对象(页,[id],值),当前)) }} on图片输入={提交} />
}
describe('画布图片交互',()=>{
  it('拖动期间祖先被锁定后释放鼠标不提交过期修改',()=>{
    const 页=页面();页.对象列表!.push({id:'组',类型:'组合',x:0,y:0,width:100,height:100,子对象标识:['图0']})
    const 提交=vi.fn(),参数={幻灯片:页,选中框标识:null,缩放:1,编辑框标识:null,编辑值:'',显示网格线:false,选中对象:['图0'],on选中框:()=>{},on双击框:()=>{},on编辑值变化:()=>{},on提交编辑:()=>{},on拖动框:()=>{},on文本选择:()=>{},on对象提交:提交}
    const {container,rerender}=render(<SlideCanvas {...参数}/>)
    fireEvent.mouseDown(container.querySelector('[data-对象标识="图0"]')!,{clientX:0,clientY:0})
    fireEvent.mouseMove(window,{clientX:30,clientY:20})
    const 锁定页={...页,对象列表:页.对象列表!.map(项=>项.id==='组'?{...项,锁定:true}:项)}
    rerender(<SlideCanvas {...参数} 幻灯片={锁定页}/>)
    fireEvent.mouseUp(window)
    expect(提交).not.toHaveBeenCalled()
  })
  it('含锁定组合成员的混选禁止整次拖动，成员没有缩放手柄',()=>{
    const 页=页面(); 页.对象列表!.push({id:'锁组',类型:'组合',x:0,y:0,width:100,height:100,子对象标识:['图0'],锁定:true})
    const 提交=vi.fn()
    const {container}=render(<SlideCanvas 幻灯片={页} 选中框标识={null} 缩放={1} 编辑框标识={null} 编辑值="" 显示网格线={false} 选中对象={['图0','图1']} on选中框={()=>{}} on双击框={()=>{}} on编辑值变化={()=>{}} on提交编辑={()=>{}} on拖动框={()=>{}} on文本选择={()=>{}} on对象提交={提交}/> )
    expect(container.querySelector('[data-对象标识="图0"] button')).toBeNull()
    fireEvent.mouseDown(container.querySelector('[data-对象标识="图1"]')!,{clientX:0,clientY:0})
    fireEvent.mouseMove(window,{clientX:80,clientY:60}); fireEvent.mouseUp(window)
    expect(提交).not.toHaveBeenCalled()
  })
  it('多选吸附保持成员间距而不会分别吸附造成位移差',()=>{
    const 提交=vi.fn(),{container}=render(<装配 提交={提交} 吸附/>),图0=container.querySelector('[data-对象标识="图0"]')!,图1=container.querySelector('[data-对象标识="图1"]')!
    fireEvent.mouseDown(图0);fireEvent.mouseUp(window);fireEvent.mouseDown(图1,{ctrlKey:true});fireEvent.mouseUp(window)
    fireEvent.mouseDown(图0);fireEvent.mouseMove(window,{clientX:3,clientY:0});fireEvent.mouseUp(window)
    const 修改=提交.mock.calls[0][0]
    expect(修改.图1.x-修改.图0.x).toBe(150)
  })
  it('多选拖动按显示比例换算，释放鼠标只提交一次',()=>{
    const 提交=vi.fn(),{container}=render(<装配 提交={提交}/>),图0=container.querySelector('[data-对象标识="图0"]')!,图1=container.querySelector('[data-对象标识="图1"]')!
    fireEvent.mouseDown(图0,{clientX:0,clientY:0});fireEvent.mouseUp(window)
    fireEvent.mouseDown(图1,{ctrlKey:true,clientX:0,clientY:0});fireEvent.mouseUp(window)
    fireEvent.mouseDown(图0,{clientX:20,clientY:20})
    fireEvent.mouseMove(window,{clientX:40,clientY:30})
    expect(提交).not.toHaveBeenCalled()
    fireEvent.mouseUp(window)
    expect(提交).toHaveBeenCalledTimes(1)
    expect(提交).toHaveBeenCalledWith({图0:{x:40,y:30},图1:{x:190,y:30}})
  })
  it('缩放手柄与属性几何使用同样的坐标，鼠标离开画布仍完成提交',()=>{
    const 提交=vi.fn(),{container}=render(<装配 提交={提交}/>),图=container.querySelector('[data-对象标识="图0"]')!
    fireEvent.mouseDown(图);fireEvent.mouseUp(window)
    fireEvent.mouseDown(screen.getByRole('button',{name:'调整对象尺寸'}),{clientX:10,clientY:10})
    fireEvent.mouseMove(window,{clientX:30,clientY:20});fireEvent.mouseUp(window)
    expect(提交).toHaveBeenCalledWith({图0:{width:140,height:70}})
  })
  it.each([{只读:true},{锁定:true}])('只读或锁定禁止拖动缩放；只读同时禁止粘贴和拖入',配置=>{
    const 提交=vi.fn(),{container}=render(<装配 提交={提交} {...配置}/>),图=container.querySelector('[data-对象标识="图0"]')!
    fireEvent.mouseDown(图);fireEvent.mouseMove(window,{clientX:50,clientY:50});fireEvent.mouseUp(window)
    expect(提交).not.toHaveBeenCalled()
    expect(screen.queryByRole('button',{name:'调整对象尺寸'})).toBeNull()
    if(配置.只读){fireEvent.drop(container.querySelector('.wps-ppt-stage')!,{dataTransfer:{files:[new File(['字节'],'图.png')]}});expect(提交).not.toHaveBeenCalled()}
  })
})
