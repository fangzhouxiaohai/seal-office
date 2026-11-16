import {useEffect,useRef,useState} from 'react'
import {Button} from 'antd'
import {useAppStore} from '../store'
import {useCloud,cloudCall} from './CloudProvider'
import {htmlToDocxModel} from '../editor/commands'
import {导出为Xlsx} from '../sheet/sheetExport'
import {构建演示保存模型} from '../ppt/saveModel'
import {收集演示资源标识,演示内容快照} from '../ppt/model/migrations'
import {桥接} from '../ipc/bridge'
import {registerCloudFlush} from './autosaveLifecycle'
import {文字文本输出} from '../editor/exportDoc'
import {getFileBinding} from '../collaboration/fileAccess'
import {注册云端重试,设置云端状态,type 云端状态} from './cloudStatus'
const binaryText=(text:string)=>{const data=new TextEncoder().encode(text);let result='';for(let i=0;i<data.length;i+=16384)result+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(result)}
const 常规同步状态 = new Set(['离线待同步', '加密上传中', '云端已保存'])
/** 把服务端状态与本地错误合并成徽标上的一句短语 */
function 徽标状态(标识:string,错误?:string,同步状态?:string):云端状态{
  if(错误)return {文档标识:标识,文本:'同步失败',级别:'错误',可重试:true,详情:错误}
  if(同步状态==='云端已保存')return {文档标识:标识,文本:'云端已保存',级别:'正常',可重试:false}
  if(同步状态==='加密上传中')return {文档标识:标识,文本:'正在同步',级别:'进行中',可重试:false}
  if(同步状态==='离线待同步')return {文档标识:标识,文本:'待同步',级别:'进行中',可重试:false}
  if(同步状态&&!常规同步状态.has(同步状态))return {文档标识:标识,文本:'同步失败',级别:'错误',可重试:true}
  return {文档标识:标识,文本:'云端已开启',级别:'正常',可重试:false}
}
export default function CloudAutosave({ 简洁模式 = false, 状态徽标 = false }: { 简洁模式?: boolean; 状态徽标?: boolean } = {}){
  const store=useAppStore(),{state,refresh,configure}=useCloud(),[dismissed,setDismissed]=useState<string|null>(null),[status,setStatus]=useState<Record<string,string>>({}),latest=useRef(store),seen=useRef(new Map<string,string>()),timers=useRef(new Map<string,ReturnType<typeof setTimeout>>())
  const owner=useRef(state.account?.id);owner.current=state.account?.id
  const [draftErrors,setDraftErrors]=useState<Record<string,string>>({})
  const [saveErrors,setSaveErrors]=useState<Record<string,string>>({})
  const [syncErrors,setSyncErrors]=useState<Record<string,string>>({})
  latest.current=store
  const scheduled=useRef(new Map<string,string>()),cloudIds=useRef(new Map<string,string>()),dismissedIds=useRef(new Set<string>())
  const lastDraftVersion=useRef(store.草稿版本??0)
  const snapshotFor=(active:typeof store,id:string)=>{
    const tab=active.workspaceTabs.find(t=>t.id===id),doc=active.documents.find(d=>d.id===id),pdf=active.pdfDocuments.find(d=>d.id===id)
    if(pdf)return pdf.data?JSON.stringify([pdf.data,pdf.警告??[]]):''
    if(tab?.type==='table')return JSON.stringify([active.表格文档模型[id],doc?.警告??[]])
    if(tab?.type==='ppt')return active.演示文档模型[id]?JSON.stringify([演示内容快照(active.演示文档模型[id]),doc?.警告??[]]):''
    return doc?JSON.stringify([doc.html,doc.页面设置,doc.警告??[]]):''
  }
  const prepare=(active:typeof store,id:string)=>{
    const result=active.准备编辑草稿?.(id)
    if(result&&!result.成功){setDraftErrors(previous=>({...previous,[id]:result.错误}));return null}
    setDraftErrors(previous=>{if(!previous[id])return previous;const next={...previous};delete next[id];return next})
    return result?.成功?{...active,表格文档模型:{...active.表格文档模型,...result.表格文档模型},演示文档模型:{...active.演示文档模型,...result.演示文档模型}}:active
  }
  const saveRef=useRef<(id:string,snapshot:string)=>Promise<void>>(async()=>{})
  const ongoing=useRef(new Map<string,{snapshot:string;task:Promise<void>}>())
  useEffect(()=>{for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();scheduled.current.clear();seen.current.clear();cloudIds.current.clear();ongoing.current.clear();setStatus({});setDraftErrors({});setSaveErrors({});setSyncErrors({})},[state.account?.id])
  const current=store.activeWorkspaceTabId||'',editing=['word','table','ppt','pdf'].includes(store.module),dirty=store.workspaceTabs.some(t=>t.id===current&&t.dirty)
  useEffect(()=>{if(!state.account)return;const timer=window.setInterval(()=>{void cloudCall('refresh').then(refresh).catch(()=>{});if(state.account?.enabled&&state.unlocked)void cloudCall('flush').then(refresh).catch(()=>{})},15000);return()=>clearInterval(timer)},[state.account?.id,state.account?.enabled,state.unlocked,refresh])
  useEffect(()=>{
    if(!state.account?.enabled||!state.account.autosave||!state.unlocked){for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();scheduled.current.clear();return}
    const write=async(id:string,snapshot:string,active:typeof store)=>{
      const doc=active.documents.find(d=>d.id===id),pdf=active.pdfDocuments.find(d=>d.id===id);if(!doc&&!pdf)return
      if(getFileBinding(pdf?.path||active.文档路径[id]||doc?.来源路径||''))return
      const accountId=state.account?.id
      try{
        let result:any,name=doc?.name||pdf?.name||'文档.pdf'
        if(pdf){result=/\.spdf$/i.test(name)?await 桥接.office.writeSeal('pdf',{PDF数据:pdf.data,警告:pdf.警告??[]}):{成功:true,数据:pdf.data}}
        else if(!doc)return
        else
        if(doc.type==='word'&&/\.(sldoc|sealdoc)$/i.test(name)){result=await 桥接.office.writeSeal('word',{html:doc.html,页面设置:doc.页面设置,警告:doc.警告??[]})}
        else if(doc.type==='table'&&/\.(slxls|sealsheet)$/i.test(name)){result=await 桥接.office.writeSeal('table',{工作表列表:active.表格文档模型[id]??[],警告:doc.警告??[]})}
        else if(doc.type==='ppt'&&/\.(slppt|sealshow)$/i.test(name)){const deck=active.演示文档模型[id];if(!deck)return;const resources=await 桥接.presentationResources.export(收集演示资源标识(deck));if(!resources.成功)throw new Error(resources.错误);result=await 桥接.office.writeSeal('ppt',{演示文稿:deck,资源条目:resources.条目??[],警告:doc.警告??[]})}
        else if(doc.type==='table'){result=await 桥接.office.writeXlsx(导出为Xlsx(active.表格文档模型[id]??[]));if(!/\.xlsx$/i.test(name))name=name.replace(/\.[^.]+$/,'')+'.xlsx'}
        else if(doc.type==='ppt'){const deck=active.演示文档模型[id];if(!deck)return;const ids=收集演示资源标识(deck),resources=await 桥接.presentationResources.export(ids);if(!resources.成功)throw new Error(resources.错误);result=await 桥接.office.writePptx(构建演示保存模型(deck,resources.条目??[]))}
        else if(/\.(txt|md|html?|json)$/i.test(name)){result={成功:true,数据:binaryText(文字文本输出(name,doc.html,doc.页面设置?.页眉Html,doc.页面设置?.页脚Html))}}
        else{const model=htmlToDocxModel(doc.html,doc.页面设置);if(model.未覆盖.length)throw new Error('文档含无法完整写回的内容，请先另存副本');result=await 桥接.office.writeDocx(model);if(!/\.docx$/i.test(name))name=name.replace(/\.[^.]+$/,'')+'.docx'}
        if(!result?.成功||!result.数据)throw new Error(result?.错误||'文件转换失败')
        const path=pdf?.path||active.文档路径[id]||id,originalName=doc?.name||pdf?.name
        // 开启云端自动保存时先把这份快照写回本机文件，再上传云端。
        // 本机写入失败或文件已被其他程序修改时停止上传，避免云端与本机内容不一致。
        const 本地路径=pdf?.path||active.文档路径[id]||doc?.来源路径
        if(本地路径&&桥接.可用){
          const 指纹=pdf?.文件指纹??doc?.文件指纹
          const 本地=await 桥接.saveToFile(本地路径,result.数据,'二进制',指纹)
          if(!本地?.成功)throw new Error(本地?.错误||'本机文件保存失败，已暂停云端同步')
          if(本地.文件指纹)active.更新文件指纹?.(id,本地.文件指纹)
          // 本机文件已写入与快照一致的内容，保存标记应在此时清除；
          // 写入期间若又有新修改（快照已不同）则保留未保存状态。
          if(snapshotFor(latest.current,id)===snapshot){
            try{
              if(pdf){const 保存PDF=active.保存PDF文档;if(typeof 保存PDF==='function'&&pdf.path)保存PDF(id,pdf.path,pdf.data??'',pdf.文件指纹,pdf.警告)}
              else if(doc){const 模型=doc.type==='table'?latest.current.表格文档模型[id]:doc.type==='ppt'?latest.current.演示文档模型[id]:undefined;active.markDocumentSaved?.(id,doc.html,模型===undefined?undefined:JSON.stringify(模型),{页面设置:doc.页面设置})}
            }catch{}
          }
        }
        if(owner.current!==accountId)return
        const 链接标识=originalName&&name!==originalName?path+'|'+name:path
        const 参数={linkId:链接标识,name,data:result.数据,automatic:true,queueOnly:true}
        let saved=await cloudCall('save',参数)
        if(owner.current!==accountId)return
        let 同步结果=await cloudCall('flush')
        // 云端文件已被删除时，旧节点映射无法再上传；清掉映射后按新文件重新上传一次，
        // 本地内容照常保留，不会一直停在“上传失败”。
        if(同步结果?.errors?.some((项:{error?:string})=>String(项?.error||'').includes('云文件不存在或已删除'))){
          await cloudCall('forget',{linkId:链接标识})
          if(owner.current!==accountId)return
          saved=await cloudCall('save',参数)
          if(owner.current!==accountId)return
          同步结果=await cloudCall('flush')
        }
        if(owner.current!==accountId)return
        const 状态表=同步结果?.statuses??{}
        seen.current.set(id,snapshot);cloudIds.current.set(id,saved.id);setStatus(previous=>({...previous,[id]:状态表[saved.id]||'离线待同步'}))
        setSaveErrors(previous=>{if(!previous[id])return previous;const next={...previous};delete next[id];return next})
        await refresh()
      }catch(e){if(owner.current!==accountId)return;setSaveErrors(previous=>({...previous,[id]:e instanceof Error?e.message:'云端保存失败'}))}
    }
    const save=(id:string,_requestedSnapshot:string)=>{
      const active=prepare(latest.current,id)
      if(!active)return Promise.resolve()
      const snapshot=snapshotFor(active,id)
      if(!snapshot)return Promise.resolve()
      const previous=ongoing.current.get(id)
      if(previous?.snapshot===snapshot)return previous.task
      if(!previous&&seen.current.get(id)===snapshot)return Promise.resolve()
      const task=(previous?.task||Promise.resolve()).then(()=>write(id,snapshot,active))
      ongoing.current.set(id,{snapshot,task})
      return task.finally(()=>{if(ongoing.current.get(id)?.task===task)ongoing.current.delete(id)})
    }
    saveRef.current=save
    const schedule=(id:string,snapshot:string)=>{if(seen.current.get(id)===snapshot||scheduled.current.get(id)===snapshot)return;if(timers.current.has(id))clearTimeout(timers.current.get(id));scheduled.current.set(id,snapshot);timers.current.set(id,setTimeout(()=>{timers.current.delete(id);scheduled.current.delete(id);void save(id,snapshot)},1800))}
    const draftChanged=(store.草稿版本??0)!==lastDraftVersion.current;lastDraftVersion.current=store.草稿版本??0
    for(const tab of store.workspaceTabs){const draftPending=draftChanged&&tab.id===store.activeWorkspaceTabId&&['table','ppt'].includes(tab.type);if(!draftPending&&!tab.dirty&&!seen.current.has(tab.id)&&!scheduled.current.has(tab.id)&&!ongoing.current.has(tab.id))continue
      const snapshot=snapshotFor(store,tab.id)+(draftPending?`|draft:${store.草稿版本}`:'')
      if(snapshot)schedule(tab.id,snapshot)
    }
  },[store.pdfDocuments,store.documents,store.workspaceTabs,store.表格文档模型,store.演示文档模型,store.草稿版本,state.account?.id,state.account?.enabled,state.account?.autosave,state.unlocked,refresh])
  useEffect(()=>registerCloudFlush(async(targetId)=>{
    if(!state.account?.enabled||!state.account.autosave||!state.unlocked)return
    const changed=new Set(scheduled.current.keys())
    for(const [id,timer] of timers.current)if(!targetId||id===targetId){clearTimeout(timer);timers.current.delete(id);scheduled.current.delete(id)}
    const source=latest.current
    for(const tab of source.workspaceTabs){
      if(targetId&&tab.id!==targetId)continue
      const active=prepare(source,tab.id)
      if(!active)continue
      const snapshot=snapshotFor(active,tab.id),draftChanged=snapshot!==snapshotFor(source,tab.id)
      if(!draftChanged&&!tab.dirty&&!seen.current.has(tab.id)&&!ongoing.current.has(tab.id)&&!changed.has(tab.id))continue
      if(snapshot&&seen.current.get(tab.id)!==snapshot)await saveRef.current(tab.id,snapshot)
    }
  }),[state.account?.enabled,state.account?.autosave,state.unlocked])
  useEffect(()=>()=>{for(const timer of timers.current.values())clearTimeout(timer)},[])
  const 立即同步=async()=>{
    const accountId=owner.current
    if(!state.account?.enabled||!state.unlocked){setSyncErrors(previous=>({...previous,[current]:'云空间尚未启用或解锁，请先完成设置后再同步'}));return}
    try{
      // 先重做当前快照；空上传队列成功不能代表失败的本机快照已经保存。
      await saveRef.current(current,snapshotFor(latest.current,current))
      if(owner.current!==accountId)return
      await cloudCall('flush');await refresh()
      if(owner.current!==accountId)return
      setSyncErrors(previous=>{if(!previous[current])return previous;const next={...previous};delete next[current];return next})
    }catch(e){if(owner.current===accountId)setSyncErrors(previous=>({...previous,[current]:e instanceof Error?e.message:'云端同步失败'}))}
  }
  const 绑定文件 = Boolean(getFileBinding(store.pdfDocuments.find(doc=>doc.id===current)?.path||store.文档路径[current]||store.documents.find(doc=>doc.id===current)?.来源路径||''))
  const 同步状态 = state.statuses[cloudIds.current.get(current)||'']||status[current]
  const 错误 = draftErrors[current]||saveErrors[current]||syncErrors[current]||(同步状态&&!常规同步状态.has(同步状态)?同步状态:undefined)
  const 自动保存开启 = Boolean(state.account?.autosave)
  const 同步引用 = useRef(立即同步)
  同步引用.current = 立即同步
  // 桌面端编辑器：状态改由功能区标签行的圆角徽标显示，不再占用编辑区顶部一行
  useEffect(()=>{
    if(状态徽标&&editing&&!绑定文件&&自动保存开启) 设置云端状态(徽标状态(current,错误,同步状态))
    else 设置云端状态(null)
  },[状态徽标,editing,绑定文件,自动保存开启,current,错误,同步状态])
  useEffect(()=>{
    if(!状态徽标)return
    注册云端重试(()=>{void 同步引用.current()})
    return ()=>注册云端重试(null)
  },[状态徽标])
  useEffect(()=>()=>设置云端状态(null),[])
  if(绑定文件)return null
  if(状态徽标)return null
  if(!editing)return null
  if(state.account?.autosave){
    if(简洁模式&&!错误)return null
    return <div className="seal-cloud-banner" role="status"><span>{错误||同步状态||'云文档自动保存已开启，先保存本机文件再加密同步'}</span><Button size="small" onClick={()=>{void 立即同步()}}>立即同步</Button></div>
  }
  if(简洁模式||!dirty||dismissed===current||dismissedIds.current.has(current))return null
  return <div className="seal-cloud-banner"><span>开启云文档自动保存，在不同设备继续编辑；文件加密上传，由你决定是否开启。</span><Button size="small" onClick={configure}>开启云端能力</Button><Button size="small" type="text" aria-label="关闭云端提示" onClick={()=>{dismissedIds.current.add(current);setDismissed(current)}}>关闭</Button></div>
}