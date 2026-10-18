import {useState} from 'react'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import RibbonTabs from '../editor/ribbon/RibbonTabs'
import RibbonPanel from '../editor/ribbon/RibbonPanel'
import type {RibbonTabSpec} from '../editor/ribbon/tabSpecs'
import {dispatchShortcut} from './shortcuts'

it('字体快捷键切换至原有菜单并派发用户选定参数，保留选择回调',async()=>{
  const select=vi.fn(),capture=vi.fn(),fallback=vi.fn()
  const tabs:RibbonTabSpec[]=[{key:'start',label:'开始',groups:[]},{key:'insert',label:'插入',groups:[{name:'字体',items:[{kind:'dropdown',commandId:'font.name',label:'字体',icon:'font',options:['Arial','思源宋体']}]}]}]
  function Entry(){const [active,setActive]=useState('start');return <><RibbonTabs activeKey={active} onChange={setActive} tabs={tabs}/><RibbonPanel activeKey={active} tabs={tabs} onCommand={select} onDropdownOpen={capture}/></>}
  render(<Entry/>)
  const event=new KeyboardEvent('keydown',{key:'f',ctrlKey:true,shiftKey:true,cancelable:true})
  expect(dispatchShortcut(event,'word',fallback)).toBe(true)
  expect(event.defaultPrevented).toBe(true)
  await waitFor(()=>expect(screen.getByRole('tab',{name:'插入'})).toHaveAttribute('aria-selected','true'))
  const option=await screen.findByText('思源宋体')
  fireEvent.click(option)
  expect(capture).toHaveBeenCalled();expect(select).toHaveBeenCalledWith('font.name','思源宋体');expect(fallback).not.toHaveBeenCalled()
})
