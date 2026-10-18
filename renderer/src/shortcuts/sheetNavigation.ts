import { 生成地址, 解析地址, type 单元格位置 } from '../sheet/address'
import type { Sheet } from '../sheet/model'
export interface SheetKeyboardContext {
  sheet: Sheet
  selection: { 起点: 单元格位置; 终点: 单元格位置 }
  select: (selection: SheetKeyboardContext['selection']) => void
  edit: (value: string) => void
  clear: () => void
  pageRows?: number
}
/** Selection-only navigation. Editing/clearing still pass the editor's protection and spill guards. */
export function executeSheetNavigation(command: string, context: SheetKeyboardContext): boolean {
  if (!command.startsWith('navigation.')) return false
  const {sheet,selection,select}=context, parts=command.split('.'), action=parts[1]
  const clamp=(point:单元格位置)=>({行:Math.max(0,Math.min(sheet.行数-1,point.行)),列:Math.max(0,Math.min(sheet.列数-1,point.列))})
  const set=(point:单元格位置,extend=false)=>{const target=clamp(point);select({起点:extend?selection.起点:target,终点:target})}
  if(action==='home'){set({行:0,列:0});return true}
  if(action==='end'){
    const end={行:0,列:0}
    for(const [address,cell]of Object.entries(sheet.单元格))if(cell.原始值!==''||cell.溢出锚点){const point=解析地址(address);if(point){end.行=Math.max(end.行,point.行);end.列=Math.max(end.列,point.列)}}
    set(end);return true
  }
  if(action==='edit'){context.edit(sheet.单元格[生成地址(selection.起点.行,selection.起点.列)]?.原始值??'');return true}
  if(action==='clear'){context.clear();return true}
  if(action==='pageUp'||action==='pageDown'){set({...selection.起点,行:selection.起点.行+(action==='pageUp'?-1:1)*Math.max(1,context.pageRows??20)});return true}
  const steps:Record<string,[number,number]>={up:[-1,0],down:[1,0],left:[0,-1],right:[0,1]},step=steps[parts[2]]
  if(!step||!['move','extend','edge','extendEdge'].includes(action))return false
  const extend=action==='extend'||action==='extendEdge', point={...(extend?selection.终点:selection.起点)}
  const inside=(row:number,column:number)=>row>=0&&row<sheet.行数&&column>=0&&column<sheet.列数
  const has=(row:number,column:number)=>{if(!inside(row,column))return false;const cell=sheet.单元格[生成地址(row,column)];return !!cell&&(cell.原始值!==''||!!cell.溢出锚点)}
  if(action==='edge'||action==='extendEdge'){
    const contiguous=has(point.行,point.列)&&has(point.行+step[0],point.列+step[1])
    while(inside(point.行+step[0],point.列+step[1])){
      if(contiguous&&!has(point.行+step[0],point.列+step[1]))break
      point.行+=step[0];point.列+=step[1]
      if(!contiguous&&has(point.行,point.列))break
    }
  }else{point.行+=step[0];point.列+=step[1]}
  set(point,extend);return true
}
