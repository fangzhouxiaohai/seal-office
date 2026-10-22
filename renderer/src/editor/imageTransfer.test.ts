import { expect,it,vi } from 'vitest'
import { installImageTransfer } from './imageTransfer'
import { 在局部投放区 } from '../fileDrop'
it('图片粘贴先于修订文本粘贴处理，移除监听后不再插入；文档拖入仍走打开流程',()=>{
  const root=document.createElement('div');root.dataset.sealImageDropzone='true';root.innerHTML='<p>原文</p>';document.body.append(root)
  const insert=vi.fn(),textPaste=vi.fn();root.addEventListener('paste',textPaste)
  const cleanup=installImageTransfer(root,insert)
  const data={files:[new File(['image'],'x.png',{type:'image/png'})],items:[]} as unknown as DataTransfer
  const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:data})
  root.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true);expect(insert).toHaveBeenCalledTimes(1);expect(textPaste).not.toHaveBeenCalled()
  expect(在局部投放区(root,data)).toBe(true)
  expect(在局部投放区(root,{files:[new File(['doc'],'x.docx')],items:[]} as unknown as DataTransfer)).toBe(false)
  cleanup();root.dispatchEvent(event);expect(insert).toHaveBeenCalledTimes(1);root.remove()
})
