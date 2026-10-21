import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App as AntdApp, ConfigProvider } from 'antd'
import { AppProvider, useAppStore } from '../store'
import DocEditor from './DocEditor'
import { 读取本地文件内容 } from '../fileOpen'

const require = createRequire(import.meta.url)
const codec = require('../../../main/office/sealFormat.js')
const original = window.electronAPI
afterEach(() => { window.electronAPI = original })

it.each(['sldoc','sealdoc'])('已保存的 %s 文字重开、连续修改再保存后清除未保存标记，真实字节包含最新内容', async extension => {
  const files = new Map<string, string>()
  const file = 'C:/seal/带图片文字.' + extension
  const payload = { html:'<p>原文𠮷🦭</p><p><img width="120" height="80" style="float:right;object-fit:cover" src="data:image/png;base64,iVBORw0KGgo=" alt="测试图片"></p>', 页面设置:{纸张:'A4',纸张方向:'纵向',页边距:'常规',分栏:'一栏',水印:'无',页面边框:'无',页面颜色:'无',文字方向:'横排',...(extension==='sldoc'?{页眉Html:'',页脚Html:''}:{})} }
  files.set(file, (await codec.writeSeal('word', payload)).toString('base64'))
  const save = vi.fn(async (path:string, bytes:Uint8Array, _format?:string, _fingerprint?:string) => { files.set(path,Buffer.from(bytes).toString('base64'));return {成功:true,文件指纹:'saved-fingerprint'} })
  window.electronAPI = { app:{getVersion:async()=> '2.1.0'}, settings:{get:async()=>({成功:true,值:false})}, recentList:async()=>[], recentAdd:async()=>({成功:true}), readFile:async(path:string)=>({成功:true,二进制:true,扩展名:path.split('.').pop(),内容:files.get(path),文件指纹:'initial-fingerprint'}), saveToFile:save,
    office:{readSeal:async(ext:string,data:string)=>({成功:true,...await codec.readSeal(ext,Buffer.from(data,'base64'))}),writeSeal:async(type:string,data:any)=>({成功:true,数据:(await codec.writeSeal(type,data)).toString('base64')})} } as any
  function Entry(){const store=useAppStore();return <><button onClick={async()=>{const content=await 读取本地文件内容(file);store.createDoc('word',content.内容,{路径:file,页面设置:content.页面设置,文件指纹:content.文件指纹})}}>打开原生文字</button><output data-testid="saved-state">{JSON.stringify({documents:store.documents,tabs:store.workspaceTabs})}</output></>}
  const {container}=render(<ConfigProvider button={{autoInsertSpace:false}}><AntdApp><AppProvider><Entry/><DocEditor/></AppProvider></AntdApp></ConfigProvider>)
  fireEvent.click(screen.getByText('打开原生文字'))
  await screen.findByText('原文𠮷🦭')
  const root=container.querySelector('.wps-editor-canvas__content') as HTMLElement
  await act(async()=>{root.querySelector('p')!.textContent='修改后𠮷🦭与 e\u0301 العربية';fireEvent.input(root)})
  fireEvent.click(screen.getByRole('button',{name:'保存'}))
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
  await waitFor(()=>expect(JSON.parse(screen.getByTestId('saved-state').textContent!).tabs[0].dirty).toBe(false))
  const restored=await codec.readSeal(extension,Buffer.from(files.get(file)!,'base64'))
  expect(restored.html).toContain('修改后𠮷🦭与 e\u0301 العربية')
  expect(restored.html).toContain('data:image/png;base64,iVBORw0KGgo=')
  expect(restored.html).toContain('float:right;object-fit:cover')
  await act(async()=>{root.querySelector('p')!.textContent='第二次保存的修改𰻞';fireEvent.input(root)})
  fireEvent.click(screen.getByRole('button',{name:'保存'}))
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(2))
  await waitFor(()=>expect(JSON.parse(screen.getByTestId('saved-state').textContent!).tabs[0].dirty).toBe(false))
  expect((await codec.readSeal(extension,Buffer.from(files.get(file)!,'base64'))).html).toContain('第二次保存的修改𰻞')
  expect(save.mock.calls[1][3]).toBe('saved-fingerprint')
})
