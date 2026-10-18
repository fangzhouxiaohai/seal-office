import { expect,it,vi,afterEach } from 'vitest'
import { webcrypto } from 'node:crypto'
import { 创建演示文稿 } from './deck'
import { 创建语义图,创建图形 } from './model/elements'
import { copySlideSelection,pasteSlideSelection,nudgeSlideSelection,deleteSlideSelection } from './objectClipboard'
afterEach(()=>{vi.unstubAllGlobals()})
it('对象复制重建组、连接线和动画引用，深层修改不污染来源',()=>{
  vi.stubGlobal('crypto',webcrypto)
  const page=创建演示文稿('复制').幻灯片列表[0];page.对象列表=创建语义图('流程')
  const group=page.对象列表.find(item=>item.类型==='组合')!,before=JSON.stringify(page)
  const snapshot=copySlideSelection(page,[group.id]),result=pasteSlideSelection(page,snapshot)
  const oldIds=new Set(page.对象列表.map(item=>item.id)),cloned=result.page.对象列表!.filter(item=>!oldIds.has(item.id)),newIds=new Set(cloned.map(item=>item.id))
  expect(cloned.length).toBe(page.对象列表.length)
  for(const item of cloned){for(const id of item.子对象标识??[])expect(newIds.has(id)).toBe(true);if(item.连接)for(const end of [item.连接.起点,item.连接.终点])expect(newIds.has(end.对象)).toBe(true)}
  cloned.find(item=>item.形状)!.形状!.文本='副本'
  expect(JSON.stringify(page)).toBe(before)
  expect(result.selected).toEqual([cloned.find(item=>item.类型==='组合')!.id])
})
it('混合文本与绘图一次微移/删除，任何锁定对象使整个操作被拒绝',()=>{
  const page=创建演示文稿('编辑').幻灯片列表[0],text=page.文本框列表[0],shape=创建图形('矩形');page.对象列表=[shape]
  const result=nudgeSlideSelection(page,[text.id,shape.id],10,-1)
  expect(result.文本框列表[0]).toMatchObject({x:text.x+10,y:text.y-1});expect(result.对象列表![0]).toMatchObject({x:shape.x+10,y:shape.y-1})
  expect(deleteSlideSelection(result,[text.id,shape.id]).文本框列表.some(item=>item.id===text.id)).toBe(false)
  shape.锁定=true
  expect(()=>nudgeSlideSelection(page,[text.id,shape.id],1,0)).toThrow('锁定')
  expect(()=>deleteSlideSelection(page,[text.id,shape.id])).toThrow('锁定')
  expect(page.文本框列表[0].x).toBe(text.x)
})
