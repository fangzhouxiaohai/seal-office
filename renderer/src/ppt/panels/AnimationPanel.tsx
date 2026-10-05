import { 监听播放后台 } from '../playback/background'
import React from 'react'
import { App, Modal } from 'antd'
import { 更新幻灯片, type 幻灯片, type 演示文稿 } from '../deck'
import { 基础切换, 读取切换, 校验播放参数, 应用全部切换 } from '../model/transitions'
import { 基础动画, 校验动画, type 对象动画 } from '../model/animations'
import { 对象允许编辑 } from '../model/objectPermissions'
import { 播放控制器, type 播放快照 } from '../playback/controller'
import { 播放画面 } from '../playback/PlaybackPage'
import type { 图片地址表 } from '../render/SlideObjects'
interface Props { 文稿: 演示文稿; 页: 幻灯片; 选中?: string | null; 只读: boolean; on修改: (文稿: 演示文稿) => void; 图片地址?: 图片地址表 }
function 秒输入({ 名称, 毫秒, on修改 }: { 名称: string; 毫秒: number; on修改: (值:number)=>void }) {
  const [草稿,set草稿]=React.useState<string|null>(null)
  return <label>{名称}<input type="number" min="0" step="0.1" aria-label={名称} value={草稿 ?? 毫秒/1000} onChange={e=>set草稿(e.target.value)} onBlur={()=>{ if(草稿!==null) { on修改(草稿.trim() ? Math.round(Number(草稿)*1000):NaN); set草稿(null) } }} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape')set草稿(null)}}/></label>
}
function 播放预览({ 页, 文稿, 图片地址 }: Pick<Props,'页'|'文稿'|'图片地址'>) {
  const [状态,set状态]=React.useState<播放快照|null>(null), 控制=React.useRef<播放控制器>(), 根=React.useRef<HTMLDivElement>(null), [缩放,set缩放]=React.useState(.7)
  React.useEffect(()=>{
    const c=new 播放控制器({...文稿,循环放映:false,幻灯片列表:[{...页,隐藏:false}]},0,{更新:set状态,翻页:()=>{},结束:()=>{},停止媒体:()=>{}},window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    控制.current=c;c.开始();const 释放后台=监听播放后台(值=>c.后台(值))
    const 尺寸=()=>set缩放(Math.min(.7,(根.current?.clientWidth ?? 672)/960));尺寸();window.addEventListener('resize',尺寸)
    return()=>{c.销毁();释放后台();window.removeEventListener('resize',尺寸)}
  },[页,文稿])
  return <><div ref={根} className="wps-animation-preview" style={{height:540*缩放}}>{状态 && <播放画面 文稿={{...文稿,幻灯片列表:[页]}} 状态={状态} 缩放={缩放} 图片地址={图片地址}/>}</div><div className="wps-ppt-properties__actions"><button type="button" onClick={()=>控制.current?.单击()} disabled={状态?.阶段==='结束'}>播放下一步</button><button type="button" onClick={()=>控制.current?.暂停(!状态?.暂停)} disabled={状态?.阶段==='结束'}>{状态?.暂停?'继续':'暂停'}</button><button type="button" onClick={()=>控制.current?.开始()}>重新预览</button><span aria-live="polite">{状态?.阶段==='结束'?'预览结束':状态?.暂停?'已暂停':'单击播放下一组动画'}</span></div></>
}
export default function AnimationPanel({ 文稿, 页, 选中, 只读, on修改, 图片地址 }: Props) {
  const { modal } = App.useApp(), [预览,set预览]=React.useState(false), 设置=读取切换(页), 换片=页.换片 ?? {单击:true}, 序列=页.动画序列 ?? []
  const 目标=选中 && (页.文本框列表.some(框=>框.id===选中) || 页.对象列表?.some(项=>项.id===选中 && !['组合','媒体'].includes(项.类型) && 对象允许编辑(页,项.id))) ? 选中 : null
  const 提交=(修改:Partial<幻灯片>)=>{ if(只读)return;try{const 新页={...页,...修改};校验播放参数(新页);校验动画(新页);on修改(更新幻灯片(文稿,页.id,修改))}catch(e){modal.error({title:'播放设置失败',content:e instanceof Error?e.message:'参数无效'})} }
  const 改动画=(i:number,修改:Partial<对象动画>)=>提交({动画序列:序列.map((a,j)=>j===i?{...a,...修改}:a)})
  return <aside className="wps-ppt-properties wps-animation-panel" aria-label="切换与动画设置"><h2>切换与动画</h2><fieldset disabled={只读}><legend>当前页切换</legend><label>切换效果<select aria-label="切换效果" value={设置.效果} onChange={e=>提交({切换:{...设置,效果:e.target.value as typeof 设置.效果},过渡效果:undefined})}>{基础切换.map(名称=><option key={名称}>{名称}</option>)}</select></label><秒输入 名称="切换持续时间（秒）" 毫秒={设置.持续毫秒} on修改={持续毫秒=>提交({切换:{...设置,持续毫秒}})}/>
    {['推进','擦除','抽出'].includes(设置.效果) && <label>方向<select aria-label="切换方向" value={设置.方向} onChange={e=>提交({切换:{...设置,方向:e.target.value as typeof 设置.方向}})}>{['左','右','上','下'].map(x=><option key={x}>{x}</option>)}</select></label>}
    {['形状','分割'].includes(设置.效果) && <label>展开方式<select aria-label="展开方式" value={设置.方式} onChange={e=>提交({切换:{...设置,方式:e.target.value as typeof 设置.方式}})}><option value="外">从中心向外</option><option value="内">向中心收拢</option></select></label>}
    {设置.效果==='分割' && <label>分割轴<select aria-label="分割轴" value={设置.轴} onChange={e=>提交({切换:{...设置,轴:e.target.value as typeof 设置.轴}})}><option>水平</option><option>垂直</option></select></label>}
    <label className="wps-animation-check"><input type="checkbox" checked={换片.单击} onChange={e=>提交({换片:{...换片,单击:e.target.checked}})}/>单击鼠标换片</label><label className="wps-animation-check"><input type="checkbox" checked={换片.自动毫秒!==undefined} onChange={e=>提交({换片:{...换片,自动毫秒:e.target.checked?5000:undefined}})}/>自动换片</label>{换片.自动毫秒!==undefined && <秒输入 名称="动画结束后等待（秒）" 毫秒={换片.自动毫秒} on修改={自动毫秒=>提交({换片:{...换片,自动毫秒}})}/>}<p>自动计时从当前页全部动画结束后开始；单击动画仍需手动触发。</p><button type="button" onClick={()=>on修改(应用全部切换(文稿,页))}>将切换和换片时间应用到全部</button></fieldset>
    <fieldset disabled={只读}><legend>放映范围</legend><label className="wps-animation-check"><input type="checkbox" checked={!!页.隐藏} onChange={e=>提交({隐藏:e.target.checked})}/>隐藏当前页</label><label className="wps-animation-check"><input type="checkbox" checked={!!文稿.循环放映} onChange={e=>on修改({...文稿,循环放映:e.target.checked})}/>循环放映</label></fieldset>
    <fieldset disabled={只读}><legend>对象动画顺序</legend><button type="button" disabled={!目标} onClick={()=>目标 && 提交({动画序列:[...序列,{id:crypto.randomUUID(),对象标识:目标,效果:'出现',触发:'单击',持续毫秒:500}]})}>添加对象动画</button>{!目标 && <p>在画布选择一个文本框、图片、图形、表格或图表。</p>}<ol className="wps-animation-list">{序列.map((a,i)=><li key={a.id}><span>{i+1}. {页.文本框列表.find(x=>x.id===a.对象标识)?.text.slice(0,24) || 页.对象列表?.find(x=>x.id===a.对象标识)?.类型}</span><label>效果<select aria-label={`动画${i+1}效果`} value={a.效果} onChange={e=>改动画(i,{效果:e.target.value as 对象动画['效果']})}>{基础动画.map(x=><option key={x}>{x}</option>)}</select></label><label>触发<select aria-label={`动画${i+1}触发`} value={a.触发} onChange={e=>改动画(i,{触发:e.target.value as 对象动画['触发']})}><option value="单击">单击时</option><option value="同时">与上一动画同时</option><option value="之后">上一动画之后</option></select></label><秒输入 名称={`动画${i+1}时长（秒）`} 毫秒={a.持续毫秒} on修改={持续毫秒=>改动画(i,{持续毫秒})}/><div className="wps-ppt-properties__actions">{[-1,1].map(方向=><button type="button" key={方向} disabled={i+方向<0 || i+方向>=序列.length} onClick={()=>{const 新=[...序列];[新[i],新[i+方向]]=[新[i+方向],新[i]];提交({动画序列:新})}}>{方向===-1?'上移':'下移'}</button>)}<button type="button" onClick={()=>提交({动画序列:序列.filter((_,j)=>j!==i)})}>删除动画</button></div></li>)}</ol></fieldset>
    <button type="button" onClick={()=>set预览(true)}>预览当前页切换与动画</button><p>外部办公软件的计时与视觉呈现可能不同；本机预览按上方设置播放。</p><Modal className="wps-animation-dialog" title="当前页播放预览" open={预览} onCancel={()=>set预览(false)} footer={null} width={720} destroyOnHidden>{预览 && <播放预览 页={页} 文稿={文稿} 图片地址={图片地址}/>}</Modal></aside>
}
