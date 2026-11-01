import { useState } from 'react'
import { App, Button, Input, Select } from 'antd'
import Icon from '../../renderer/src/components/Icon'
import { NAV_GROUPS,navigationAvailable } from '../../renderer/src/navConfig'
import { useAppStore } from '../../renderer/src/store'
import { 保存全部文档 } from '../../renderer/src/editor/saveAll'
export default function MobileServices(){
  const store=useAppStore(),{message}=App.useApp(),[query,setQuery]=useState('')
  const [selected,setSelected]=useState<string>(),[exporting,setExporting]=useState(false)
  const documents=store.documents.filter(doc=>['word','table','ppt'].includes(doc.type??'word')),document=documents.find(doc=>doc.id===selected)||documents.find(doc=>doc.id===store.activeDocumentId)||documents[0]
  const exportNative=async()=>{
    if(!document||exporting)return;setExporting(true)
    try{
      const extension=({word:'sldoc',table:'slxls',ppt:'slppt'} as Record<string,string>)[document.type??'word']
      const result=await 保存全部文档([{标识:document.id,名称:document.name.replace(/\.[^.]+$/,'')+'.'+extension,类型:(document.type??'word') as 'word'|'table'|'ppt',路径:null,html:document.html,页面设置:document.页面设置,表格模型:store.表格文档模型[document.id],演示模型:store.演示文档模型[document.id],警告:document.警告,来源路径:document.来源路径}])
      if(result.失败.length)throw new Error(result.失败[0].原因)
      if(result.已保存.length)message.success('海豹格式副本已保存，可在“首页 → 本机”查看或通过系统导出分享')
    }catch(error){message.error(error instanceof Error?error.message:'海豹格式导出失败')}finally{setExporting(false)}
  }
  const open=(key:string)=>{if(key==='settings')store.showSettings();else if(key==='help')store.showHelp();else if(key==='pdf')store.createDoc('pdf');else store.handleNav(key,text=>message.info(text))}
  const groups=[{title:'常用工具',keys:['pdf','mindmap','flow','multitable','design','notes','calendar','database']},{title:'协作与资料',keys:['my-cloud','shared','team','knowledge','tag','device','trash','market','skins']},{title:'应用与设置',keys:['document','settings','help']}]
  const items=NAV_GROUPS.flat().filter(item=>item.implemented&&navigationAvailable(item.key))
  const createEntries=([{key:'word',label:'文字',icon:'doc-word',aliases:'Word 文档'},{key:'table',label:'表格',icon:'doc-table',aliases:'Excel 工作簿'},{key:'ppt',label:'演示',icon:'doc-ppt',aliases:'PPT 幻灯片'},{key:'pdf',label:'PDF',icon:'doc-pdf',aliases:'PDF 阅读'}] as const).filter(item=>(item.label+' '+item.aliases).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const nativeMatch=!query||/海豹|专属|格式/.test(query),assistantMatch=!query||/助手|智能|\bai\b/i.test(query)
  return <section className="seal-mobile-services" aria-label="全部办公服务">
    <Input.Search aria-label="搜索办公服务" placeholder="搜索工具或功能" allowClear value={query} onChange={event=>setQuery(event.target.value)}/>
    {createEntries.length>0&&<><h2>新建文档</h2><div className="seal-mobile-create">{createEntries.map(item=><button key={item.key} data-document-type={item.key} onClick={()=>store.createDoc(item.key)}><Icon name={item.icon} size={32}/><span>{item.label}</span></button>)}</div></>}
    {groups.map(group=>{const matches=items.filter(item=>group.keys.includes(item.key)&&(item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())||item.key.includes(query.trim().toLowerCase())));return matches.length?<section key={group.title}><h2>{group.title}</h2><div className="seal-mobile-function-grid">{matches.map(item=><button key={item.key} data-nav-key={item.key} onClick={()=>open(item.key)}><Icon name={item.icon} size={29}/><span>{item.key==='document'?'应用文档空间':item.label}</span></button>)}</div></section>:null})}
    {assistantMatch&&<section><h2>智能助手</h2><button className="seal-mobile-assistant-entry" onClick={()=>window.dispatchEvent(new Event('seal-open-assistant'))}><Icon name="ai" size={28}/><span>对话与文档助手</span></button></section>}
    {nativeMatch&&<section aria-label="海豹专属格式"><h2>海豹专属格式</h2><p>完整保存文字 .sldoc、表格 .slxls、演示 .slppt 的编辑模型与资源；PDF 页面处理支持 .spdf。仍可导出常用 Office 和 PDF 格式。</p><Select aria-label="选择要导出海豹格式的文档" style={{width:'100%',marginBottom:12}} value={document?.id} disabled={exporting} placeholder="先新建或打开一个文档" onChange={setSelected} options={documents.map(doc=>({label:doc.name,value:doc.id}))}/><Button block loading={exporting} disabled={!document} onClick={()=>void exportNative()}>导出海豹格式副本</Button></section>}
    {query&&!createEntries.length&&!nativeMatch&&!assistantMatch&&!items.some(item=>groups.some(group=>group.keys.includes(item.key))&&(item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())||item.key.includes(query.trim().toLowerCase())))&&<p role="status">未找到匹配的办公服务，试试“脑图”“PDF”或“团队”。</p>}
  </section>
}
