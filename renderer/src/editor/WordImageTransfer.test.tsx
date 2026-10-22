import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import DocEditor from './DocEditor'
const require = createRequire(import.meta.url)
const png = readFileSync(require.resolve('./__fixtures__/office-image.png'))
const original = window.electronAPI
afterEach(()=>{window.electronAPI=original;vi.unstubAllGlobals();vi.restoreAllMocks()})
it.each(['paste','drop'])('正文 %s 图片更新文档模型，可以撤销重做；无效图片保持原文',async type=>{
  vi.stubGlobal('Image',class {naturalWidth=160;naturalHeight=80;onload?:()=>void;set src(_:string){queueMicrotask(()=>this.onload?.())}})
  window.electronAPI={settings:{get:async()=>({成功:true,值:false})},recentList:async()=>[]} as any
  let store:ReturnType<typeof useAppStore>
  function Harness(){store=useAppStore();return <DocEditor/>}
  const {container}=render(<ConfigProvider button={{autoInsertSpace:false}}><AntdApp><AppProvider><Harness/></AppProvider></AntdApp></ConfigProvider>)
  await act(async()=>{store.createDoc('word','<p>正文</p>',{名称:'插图.sldoc'})})
  const root=container.querySelector('.wps-editor-canvas__content') as HTMLElement
  Object.defineProperty(root,'clientWidth',{value:600})
  const range=document.createRange();range.selectNodeContents(root.querySelector('p')!);range.collapse(false)
  window.getSelection()!.removeAllRanges();window.getSelection()!.addRange(range)
  const send=(file:File)=>{
    const event=new Event(type,{bubbles:true,cancelable:true})
    Object.defineProperty(event,type==='paste'?'clipboardData':'dataTransfer',{value:{files:[file],items:[]}})
    fireEvent(root,event)
  }
  await act(async()=>{ await new Promise(resolve=>setTimeout(resolve,30)) })
  send(new File([png],'图片.png',{type:'image/png'}))
  await waitFor(()=>expect(root.querySelector('img')).not.toBeNull())
  expect(root.textContent).toBe('正文')
  expect(store!.documents.find(d=>d.type==='word')?.html).toContain('data:image/png;base64,')
  await act(async()=>{ await new Promise(resolve=>setTimeout(resolve,30)) })
  fireEvent.click(screen.getByRole('button',{name:'撤销'}))
  await waitFor(()=>expect(root.querySelector('img')).toBeNull())
  fireEvent.click(screen.getByRole('button',{name:'重做'}))
  await waitFor(()=>expect(root.querySelector('img')).not.toBeNull())
  const before=root.innerHTML
  send(new File(['not png'],'伪图片.png',{type:'image/png'}))
  await screen.findAllByText('图片插入失败')
  expect(root.innerHTML).toBe(before)
})
