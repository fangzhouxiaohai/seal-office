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
const binaryText=(text:string)=>{const data=new TextEncoder().encode(text);let result='';for(let i=0;i<data.length;i+=16384)result+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(result)}
export default function CloudAutosave(){
  const store=useAppStore(),{state,refresh,configure}=useCloud(),[dismissed,setDismissed]=useState<string|null>(null),[status,setStatus]=useState<Record<string,string>>({}),latest=useRef(store),seen=useRef(new Map<string,string>()),timers=useRef(new Map<string,ReturnType<typeof setTimeout>>())
  const owner=useRef(state.account?.id);owner.current=state.account?.id
  latest.current=store
  const scheduled=useRef(new Map<string,string>()),cloudIds=useRef(new Map<string,string>()),dismissedIds=useRef(new Set<string>())
  const saveRef=useRef<(id:string,snapshot:string)=>Promise<void>>(async()=>{})
  const ongoing=useRef(new Map<string,{snapshot:string;task:Promise<void>}>())
  useEffect(()=>{for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();scheduled.current.clear();seen.current.clear();cloudIds.current.clear();ongoing.current.clear();setStatus({})},[state.account?.id])
  const current=store.activeWorkspaceTabId||'',editing=['word','table','ppt','pdf'].includes(store.module),dirty=store.workspaceTabs.some(t=>t.id===current&&t.dirty)
  useEffect(()=>{if(!state.account)return;const timer=window.setInterval(()=>{void cloudCall('refresh').then(refresh).catch(()=>{});if(state.account?.enabled&&state.unlocked)void cloudCall('flush').then(refresh).catch(()=>{})},15000);return()=>clearInterval(timer)},[state.account?.id,state.account?.enabled,state.unlocked,refresh])
  useEffect(()=>{
    if(!state.account?.enabled||!state.account.autosave||!state.unlocked){for(const timer of timers.current.values())clearTimeout(timer);timers.current.clear();scheduled.current.clear();return}
    const write=async(id:string,snapshot:string,active:typeof store)=>{
      const doc=active.documents.find(d=>d.id===id),pdf=active.pdfDocuments.find(d=>d.id===id);if(!doc&&!pdf)return
      const accountId=state.account?.id
      try{
        let result:any,name=doc?.name||pdf?.name||'文档.pdf'
        if(pdf){result={成功:true,数据:pdf.data}}
        else if(!doc)return
        else
        if(doc.type==='table'){result=await 桥接.office.writeXlsx(导出为Xlsx(active.表格文档模型[id]??[]));if(!/\.xlsx$/i.test(name))name=name.replace(/\.[^.]+$/,'')+'.xlsx'}
        else if(doc.type==='ppt'){const deck=active.演示文档模型[id];if(!deck)return;const ids=收集演示资源标识(deck),resources=await 桥接.presentationResources.export(ids);if(!resources.成功)throw new Error(resources.错误);result=await 桥接.office.writePptx(构建演示保存模型(deck,resources.条目??[]))}
        else if(/\.(txt|md|html?|json)$/i.test(name)){result={成功:true,数据:binaryText(文字文本输出(name,doc.html,doc.页面设置?.页眉Html,doc.页面设置?.页脚Html))}}
        else{const model=htmlToDocxModel(doc.html,doc.页面设置);if(model.未覆盖.length)throw new Error('文档含无法完整写回的内容，请先另存副本');result=await 桥接.office.writeDocx(model);if(!/\.docx$/i.test(name))name=name.replace(/\.[^.]+$/,'')+'.docx'}
        if(!result?.成功||!result.数据)throw new Error(result?.错误||'文件转换失败')
        const path=pdf?.path||active.文档路径[id]||id,originalName=doc?.name||pdf?.name
        if(owner.current!==accountId)return
        const saved=await cloudCall('save',{linkId:originalName&&name!==originalName?path+'|'+name:path,name,data:result.数据,automatic:true,queueOnly:true})
        if(owner.current!==accountId)return
        seen.current.set(id,snapshot);cloudIds.current.set(id,saved.id);setStatus(previous=>({...previous,[id]:saved.statuses[saved.id]||'离线待同步'}));await refresh()
        void cloudCall('flush').then(refresh).catch(()=>{})
      }catch(e){if(owner.current!==accountId)return;setStatus(previous=>({...previous,[id]:e instanceof Error?e.message:'云端保存失败'}))}
    }
    const save=(id:string,snapshot:string)=>{
      const previous=ongoing.current.get(id)
      if(previous?.snapshot===snapshot)return previous.task
      if(!previous&&seen.current.get(id)===snapshot)return Promise.resolve()
      const active=latest.current,task=(previous?.task||Promise.resolve()).then(()=>write(id,snapshot,active))
      ongoing.current.set(id,{snapshot,task})
      return task.finally(()=>{if(ongoing.current.get(id)?.task===task)ongoing.current.delete(id)})
    }
    saveRef.current=save
    const schedule=(id:string,snapshot:string)=>{if(seen.current.get(id)===snapshot||scheduled.current.get(id)===snapshot)return;if(timers.current.has(id))clearTimeout(timers.current.get(id));scheduled.current.set(id,snapshot);timers.current.set(id,setTimeout(()=>{timers.current.delete(id);scheduled.current.delete(id);void save(id,snapshot)},1800))}
    for(const tab of store.workspaceTabs){if(!tab.dirty&&!seen.current.has(tab.id)&&!scheduled.current.has(tab.id)&&!ongoing.current.has(tab.id))continue;if(tab.type==='pdf'){const pdf=store.pdfDocuments.find(d=>d.id===tab.id);if(pdf?.data)schedule(tab.id,pdf.data);continue}const doc=store.documents.find(d=>d.id===tab.id);if(!doc)continue
      const deck=store.演示文档模型[tab.id]
      const snapshot=tab.type==='table'?JSON.stringify(store.表格文档模型[tab.id]):tab.type==='ppt'?(deck?演示内容快照(deck):''):JSON.stringify([doc.html,doc.页面设置])
      if(snapshot)schedule(tab.id,snapshot)
    }
  },[store.pdfDocuments,store.documents,store.workspaceTabs,store.表格文档模型,store.演示文档模型,state.account?.id,state.account?.enabled,state.account?.autosave,state.unlocked,refresh])
  useEffect(()=>registerCloudFlush(async(targetId)=>{
    if(!state.account?.enabled||!state.account.autosave||!state.unlocked)return
    const changed=new Set(scheduled.current.keys())
    for(const [id,timer] of timers.current)if(!targetId||id===targetId){clearTimeout(timer);timers.current.delete(id);scheduled.current.delete(id)}
    const active=latest.current
    for(const tab of active.workspaceTabs){
      if(targetId&&tab.id!==targetId)continue
      if(!tab.dirty&&!seen.current.has(tab.id)&&!ongoing.current.has(tab.id)&&!changed.has(tab.id))continue
      const doc=active.documents.find(d=>d.id===tab.id),pdf=active.pdfDocuments.find(d=>d.id===tab.id)
      const snapshot=pdf?.data||(tab.type==='table'?JSON.stringify(active.表格文档模型[tab.id]):tab.type==='ppt'?(active.演示文档模型[tab.id]?演示内容快照(active.演示文档模型[tab.id]):''):doc?JSON.stringify([doc.html,doc.页面设置]):'')
      if(snapshot&&seen.current.get(tab.id)!==snapshot)await saveRef.current(tab.id,snapshot)
    }
  }),[state.account?.enabled,state.account?.autosave,state.unlocked])
  useEffect(()=>()=>{for(const timer of timers.current.values())clearTimeout(timer)},[])
  if(!editing)return null
  if(state.account?.autosave)return <div className="seal-cloud-banner" role="status"><span>{state.statuses[cloudIds.current.get(current)||'']||status[current]||'云文档自动保存已开启，内容变动后加密同步'}</span><Button size="small" onClick={()=>{void cloudCall('flush').then(refresh).catch(e=>setStatus(previous=>({...previous,[current]:e.message})))}}>立即同步</Button></div>
  if(!dirty||dismissed===current||dismissedIds.current.has(current))return null
  return <div className="seal-cloud-banner"><span>开启云文档自动保存，在不同设备继续编辑；文件加密上传，由你决定是否开启。</span><Button size="small" onClick={configure}>开启云端能力</Button><Button size="small" type="text" aria-label="关闭云端提示" onClick={()=>{dismissedIds.current.add(current);setDismissed(current)}}>关闭</Button></div>
}
