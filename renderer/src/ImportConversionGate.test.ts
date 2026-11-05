import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import { Modal } from 'antd'
import { 准备打开本地文件, 注册导入确认弹窗, 通过路径打开文件 } from './fileOpen'

const require=createRequire(import.meta.url),codec=require('../../main/office/sealFormat.js')
const original=window.electronAPI
let unregister:(()=>void)|undefined
afterEach(()=>{unregister?.();unregister=undefined;window.electronAPI=original;vi.restoreAllMocks()})
function fixture(){
  const files=new Map<string,string>([['source.xlsx','ORIGINAL_SOURCE_BYTES']])
  const save=vi.fn(async(path:string,data:string)=>{files.set(path,data);return {成功:true,文件指纹:'converted-fingerprint'}})
  const picker=vi.fn(async()=> 'converted.slxls')
  window.electronAPI={readFile:async(path:string)=>({成功:true,内容:files.get(path),扩展名:path.split('.').pop(),二进制:true,文件指纹:'source-fingerprint'}),saveToFile:save,showSaveDialog:picker,recentAdd:async()=>({成功:true}),office:{
    readXlsx:async()=>({成功:true,工作表列表:[{名称:'说明𠮷🦭',html:'<table><tr><td data-value-type="text">0012</td><td data-formula="SUM(A2:A3)">3</td></tr></table>'}],警告:['外部链接尚不能完整更新']}),
    writeSeal:async(type:string,data:unknown)=>({成功:true,数据:(await codec.writeSeal(type,data)).toString('base64')}),
    readSeal:async(ext:string,data:string)=>({成功:true,...await codec.readSeal(ext,Buffer.from(data,'base64'))}),
  }} as any
  return {files,save,picker}
}
it('取消不完整导入前不创建标签、不弹保存框、不写原文件或副本',async()=>{
  const {files,save,picker}=fixture(),open=vi.fn(),error=vi.fn(),confirm=vi.fn(options=>options.onCancel?.())
  unregister=注册导入确认弹窗(confirm)
  expect(await 通过路径打开文件('source.xlsx',{info:vi.fn(),success:vi.fn()},{error},open)).toBe(false)
  expect(confirm.mock.calls[0][0]).toMatchObject({okText:'查看已识别内容',cancelText:'取消打开'})
  expect(open).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(picker).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled()
  expect([...files]).toEqual([['source.xlsx','ORIGINAL_SOURCE_BYTES']])
})
it('确认后只查看已识别内容，保留来源路径和字节，等待用户主动另存副本',async()=>{
  const {files,save,picker}=fixture(),open=vi.fn()
  unregister=注册导入确认弹窗(options=>options.onOk?.())
  expect(await 通过路径打开文件('source.xlsx',{info:vi.fn(),success:vi.fn()},{error:vi.fn()},open)).toBe(true)
  expect(picker).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled()
  expect(files.get('source.xlsx')).toBe('ORIGINAL_SOURCE_BYTES')
  expect(open.mock.calls[0][2]).toBe('source.xlsx')
  expect(open.mock.calls[0][3]).toContain('外部链接尚不能完整更新')
  expect(open.mock.calls[0][5]).toBe('source-fingerprint')
})
it('保护查看不自动弹出另存对话框，也不生成可能丢失内容的副本',async()=>{
  const {save,picker,files}=fixture();unregister=注册导入确认弹窗(options=>options.onOk?.())
  const 内容=await 准备打开本地文件('source.xlsx')
  expect(内容?.类型).toBe('table')
  expect(内容?.警告).toContain('外部链接尚不能完整更新')
  expect(picker).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled()
  expect([...files]).toEqual([['source.xlsx','ORIGINAL_SOURCE_BYTES']])
})
it('已保存的专属副本保留来源提示但不再要求重复转换',async()=>{
  const {files,picker}=fixture(),confirm=vi.fn()
  files.set('converted.slxls',(await codec.writeSeal('table',{工作表列表:[{id:'s',name:'表',行数:1,列数:1,列宽:[80],行高:[20],合并区域:[],单元格:{}}],警告:['已确认的来源限制']})).toString('base64'))
  unregister=注册导入确认弹窗(confirm)
  expect((await 准备打开本地文件('converted.slxls'))?.类型).toBe('table')
  expect(confirm).not.toHaveBeenCalled();expect(picker).not.toHaveBeenCalled()
})
it('无法解密或解析时取消打开，绝不把部分结果当有效文档',async()=>{
  const {save}=fixture(),confirm=vi.fn(options=>options.onCancel?.())
  window.electronAPI!.office.readXlsx=async()=>({成功:false,错误:'Encrypted workbook requires password'})
  unregister=注册导入确认弹窗(confirm)
  expect(await 准备打开本地文件('source.xlsx')).toBeNull()
  expect(confirm.mock.calls[0][0].title).toContain('文件未打开')
  expect(save).not.toHaveBeenCalled()
  expect(vi.spyOn(Modal,'info')).not.toHaveBeenCalled()
})
