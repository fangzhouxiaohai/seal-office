import { expect,it } from 'vitest'
import { 规范化字号标记,读取字号磅值 } from './fontSize'

it('精确字号只修改选区中的标记，保留选区外的大字号与其他格式',()=>{
  const root=document.createElement('div');root.innerHTML='<p><font size="7" style="color:red">选区外</font><font size="7" style="font-weight:bold">选区内</font></p>';document.body.append(root)
  const span=root.querySelectorAll('font')[1],range=document.createRange();range.selectNodeContents(span)
  window.getSelection()?.removeAllRanges();window.getSelection()?.addRange(range)
  规范化字号标记(root,10.5)
  expect(span.style.fontSize).toBe('10.5pt');expect(span.style.fontWeight).toBe('bold')
  expect(root.querySelector('font')?.getAttribute('size')).toBe('7')
  expect(window.getSelection()?.toString()).toBe('选区内');root.remove()
})
it('字号读取使用文本的实际 CSS 大小，查看缩放不改变磅值',()=>{
  const root=document.createElement('div');root.style.zoom='1.25';root.innerHTML='<p style="font-size:32px">字号</p>';document.body.append(root)
  const range=document.createRange();range.selectNodeContents(root.firstElementChild!)
  window.getSelection()?.removeAllRanges();window.getSelection()?.addRange(range)
  expect(读取字号磅值(root)).toBe(24);root.remove()
})
