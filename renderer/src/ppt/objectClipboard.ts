import type { 幻灯片 } from './deck'
import { 删除对象, 修改对象 } from './model/objectOperations'
import { 要求对象可编辑 } from './model/objectPermissions'
export function deleteSlideSelection(page: 幻灯片, selection: readonly string[]): 幻灯片 {
  const objects=(page.对象列表??[]).filter(item=>selection.includes(item.id)).map(item=>item.id)
  const result=objects.length?删除对象(page,objects):page
  return {...result,文本框列表:result.文本框列表.filter(item=>!selection.includes(item.id)),动画序列:result.动画序列?.filter(item=>!selection.includes(item.对象标识))}
}
export function nudgeSlideSelection(page: 幻灯片, selection: readonly string[], dx: number, dy: number): 幻灯片 {
  const objects=(page.对象列表??[]).filter(item=>selection.includes(item.id))
  要求对象可编辑(page,objects.map(item=>item.id))
  let result=page
  for(const object of objects)result=修改对象(result,[object.id],{x:object.x+dx,y:object.y+dy})
  return {...result,文本框列表:result.文本框列表.map(item=>selection.includes(item.id)?{...item,x:item.x+dx,y:item.y+dy}:item)}
}
/** Clone an object subgraph and its attached endpoints without sharing nested state or ids. */
export function copySlideSelection(page: 幻灯片, selection: readonly string[]): 幻灯片 {
  const selected = new Set(selection), objects = page.对象列表 ?? []
  const include = (id: string, visiting = new Set<string>()) => {
    if (visiting.has(id)) throw new Error('对象引用出现循环')
    const object = objects.find(item => item.id === id)
    if (!object) return
    const next = new Set(visiting);next.add(id)
    for (const child of object.子对象标识 ?? []) { selected.add(child);include(child,next) }
    if(object.连接)for(const end of [object.连接.起点,object.连接.终点])if(!selected.has(end.对象)){selected.add(end.对象);include(end.对象,next)}
  }
  for(const id of selection)include(id)
  return JSON.parse(JSON.stringify({...page,文本框列表:page.文本框列表.filter(item=>selected.has(item.id)),对象列表:objects.filter(item=>selected.has(item.id)),动画序列:page.动画序列?.filter(item=>selected.has(item.对象标识))}))
}
export function pasteSlideSelection(page: 幻灯片, source: 幻灯片, offset = 16): { page: 幻灯片; selected: string[] } {
  const copied:幻灯片=JSON.parse(JSON.stringify(source)), all=[...copied.文本框列表,...copied.对象列表??[]]
  const mapping=new Map(all.map(item=>[item.id,crypto.randomUUID()]))
  for(const item of all){item.id=mapping.get(item.id)!;item.x+=offset;item.y+=offset}
  for(const object of copied.对象列表??[]){
    if(object.子对象标识)object.子对象标识=object.子对象标识.map(id=>mapping.get(id)!)
    if(object.连接){object.连接.起点.对象=mapping.get(object.连接.起点.对象)!;object.连接.终点.对象=mapping.get(object.连接.终点.对象)!}
  }
  const children=new Set((copied.对象列表??[]).flatMap(item=>item.子对象标识??[]))
  return {page:{...page,文本框列表:[...page.文本框列表,...copied.文本框列表],对象列表:[...page.对象列表??[],...copied.对象列表??[]],动画序列:[...page.动画序列??[],...copied.动画序列?.map(item=>({...item,id:crypto.randomUUID(),对象标识:mapping.get(item.对象标识)!}))??[]]},selected:all.filter(item=>!children.has(item.id)).map(item=>item.id)}
}
