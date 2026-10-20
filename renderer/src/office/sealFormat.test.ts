import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { 写出办公文档 } from './writeDocument'
import { 读取本地文件内容 } from '../fileOpen'
import { 创建工作表, 写入单元格 } from '../sheet/model'
import { 创建演示文稿 } from '../ppt/deck'
const require=createRequire(import.meta.url),codec=require('../../../main/office/sealFormat.js')
const original=window.electronAPI
afterEach(()=>{window.electronAPI=original})
it('真实原生编码经打开链路保留文字、完整工作簿、演示模型且不调用 Office 转换',async()=>{
  const files=new Map<string,string>(),writeDocx=vi.fn()
  window.electronAPI={readFile:async(path:string)=>({成功:true,内容:files.get(path),二进制:true,扩展名:path.split('.').slice(-1)[0],文件指纹:'seal-fingerprint'}),office:{writeDocx,writeSeal:async(type:string,payload:unknown)=>({成功:true,数据:(await codec.writeSeal(type,payload)).toString('base64')}),readSeal:async(extension:string,data:string)=>({成功:true,...await codec.readSeal(extension,Buffer.from(data,'base64'))})}} as any
  const word={html:'<p>𠮷🦭中文 e\u0301</p><p class="wps-insert" data-seal-revision-author="作者">修订文字</p>',页面设置:{页眉Html:'<p>页眉𠮷</p>',页脚Html:'<p>页脚</p>'},警告:['来源中的未覆盖对象']}
  const sheets=[写入单元格(写入单元格(创建工作表('原生公式',10,6),'A1','=SEQUENCE(3,2)'),'D1','𠮷🦭')],deck=创建演示文稿()
  for(const [type,extension,payload]of [['word','sealdoc',word],['table','sealsheet',{工作表列表:sheets}],['ppt','sealshow',{演示文稿:deck,资源条目:[]}]] as const){
    const path='原生测试.'+extension,result=await 写出办公文档(type,path,{},undefined,payload)
    files.set(path,result.数据)
    const opened=await 读取本地文件内容(path)
    expect(opened.类型).toBe(type);expect(opened.文件指纹).toBe('seal-fingerprint')
    if(type==='word'){expect(opened.内容).toContain('𠮷🦭');expect(opened.内容).toContain('data-seal-revision-author');expect(opened.页面设置?.页眉Html).toContain('页眉𠮷');expect(opened.警告).toEqual(word.警告)}
    if(type==='table')expect(opened.工作表列表).toEqual(sheets)
    if(type==='ppt')expect(opened.演示文稿).toEqual(deck)
  }
  expect(writeDocx).not.toHaveBeenCalled()
})
it('原生格式读取仍净化正文与页眉脚中的可执行 HTML',async()=>{
  const data=(await codec.writeSeal('word',{html:'<p>正文𠮷</p><script>alert(1)</script>',页面设置:{页眉Html:'<img src="x" onerror="alert(1)">',页脚Html:'<script>hack()</script>页脚'}})).toString('base64')
  window.electronAPI={readFile:async()=>({成功:true,内容:data,二进制:true,扩展名:'sealdoc'}),office:{readSeal:async(extension:string,input:string)=>({成功:true,...await codec.readSeal(extension,Buffer.from(input,'base64'))})}} as any
  const opened=await 读取本地文件内容('安全.sealdoc')
  expect(opened.内容).not.toContain('<script');expect(opened.内容).toContain('正文𠮷')
  expect(opened.页面设置?.页眉Html).not.toContain('onerror');expect(opened.页面设置?.页脚Html).not.toContain('script')
})
