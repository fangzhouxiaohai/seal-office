import { useState } from 'react'
import { App, Button, Input, Select } from 'antd'
import { useAppStore } from '../../renderer/src/store'
import { 保存全部文档 } from '../../renderer/src/editor/saveAll'
import Icon from '../../renderer/src/components/Icon'
import { NAV_GROUPS, NEW_DOC_ENTRIES, navigationAvailable } from '../../renderer/src/navConfig'
import { searchCatalog, type ToolEntry } from './toolCatalog'
import { ToolTile } from './MobileToolPanels'
import { useToolLauncher } from './useToolLauncher'

function NativeExport() {
  const store=useAppStore(), { message, modal }=App.useApp()
  const [selected,setSelected]=useState<string>(), [exporting,setExporting]=useState(false)
  const docs=store.documents.filter(doc=>['word','table','ppt'].includes(doc.type??'word'))
  const doc=docs.find(doc=>doc.id===selected)||docs.find(doc=>doc.id===store.activeDocumentId)||docs[0]
  async function exportNative() {
    if(!doc||exporting) return
    setExporting(true)
    try {
      const type=(doc.type??'word') as 'word'|'table'|'ppt'
      const extension={word:'sldoc',table:'slxls',ppt:'slppt'}[type]
      const result=await 保存全部文档([{标识:doc.id,名称:doc.name.replace(/\.[^.]+$/,'')+'.'+extension,类型:type,路径:null,html:doc.html,页面设置:doc.页面设置,表格模型:store.表格文档模型[doc.id],演示模型:store.演示文档模型[doc.id],警告:doc.警告,来源路径:doc.来源路径}])
      if(result.失败.length) throw new Error(result.失败[0].原因)
      if(result.已保存.length) message.success('海豹格式副本已保存，可在“首页 → 本机”查看或通过系统导出分享')
    } catch(error) { modal.error({title:'导出失败', content:error instanceof Error ? error.message : '海豹格式导出失败'}) }
    finally { setExporting(false) }
  }
  return <section className="seal-export-info" aria-label="海豹专属格式"><h2>海豹专属格式</h2>
    <p>将已打开的文字、表格、演示文档保存为保留编辑模型与资源的副本。</p>
    <Select aria-label="选择要导出海豹格式的文档" style={{width:'100%',marginBottom:12}} value={doc?.id} disabled={exporting} placeholder="先新建或打开一个文档" onChange={setSelected} options={docs.map(doc=>({label:doc.name,value:doc.id}))}/>
    <Button block loading={exporting} disabled={!doc} onClick={()=>void exportNative()}>导出海豹格式副本</Button>
  </section>
}

/** 宽屏网页版仍使用原有工作台入口。 */
export function WideWebServices() {
  const store=useAppStore(), {message}=App.useApp(), [query,setQuery]=useState('')
  const term=query.trim().toLocaleLowerCase()
  const groups=[
    {title:'常用工具',keys:['scan','receipt','pdf','mindmap','flow','multitable','design','notes','calendar','database']},
    {title:'协作与资料',keys:['my-cloud','shared','team','knowledge','tag','device','trash','market','skins']},
    {title:'应用与设置',keys:['document','settings','help']},
  ]
  const docAliases={word:'Word 文档',table:'Excel 工作簿',ppt:'PPT 幻灯片',pdf:'PDF 阅读'}
  const docs=NEW_DOC_ENTRIES.filter(doc=>(doc.label+' '+docAliases[doc.key]).toLocaleLowerCase().includes(term))
  const matched=groups.map(group=>({...group,items:NAV_GROUPS.flat().filter(item=>item.implemented&&navigationAvailable(item.key)&&group.keys.includes(item.key)&&(item.label+' '+item.key).toLowerCase().includes(term))})).filter(group=>group.items.length)
  const assistant=!term||/助手|智能|\bai\b/i.test(term), native=!term||/海豹|专属|格式/.test(term)
  const go=(key:string)=>{if(key==='settings')store.showSettings();else if(key==='help')store.showHelp();else if(key==='pdf')store.createDoc('pdf');else store.handleNav(key,text=>message.info(text))}
  return <section className="seal-mobile-services" aria-label="全部办公服务">
    <Input.Search aria-label="搜索办公服务" placeholder="搜索工具或功能" allowClear value={query} onChange={e=>setQuery(e.target.value)}/>
    {docs.length>0&&<><h2>新建文档</h2><div className="seal-mobile-create">{docs.map(doc=><button key={doc.key} data-document-type={doc.key} onClick={()=>store.createDoc(doc.key)}><Icon name={doc.icon} size={32}/>{({word:'文字',table:'表格',ppt:'演示',pdf:'PDF'})[doc.key]}</button>)}</div></>}
    {matched.map(group=><section key={group.title}><h2>{group.title}</h2><div className="seal-mobile-function-grid">{group.items.map(item=><button key={item.key} data-nav-key={item.key} onClick={()=>go(item.key)}><Icon name={item.icon} size={29}/>{item.key==='document'?'应用文档空间':item.label}</button>)}</div></section>)}
    {assistant&&<section><h2>智能助手</h2><button className="seal-mobile-assistant-entry" onClick={()=>window.dispatchEvent(new Event('seal-open-assistant'))}><Icon name="ai" size={28}/>对话与文档助手</button></section>}
    {native&&<NativeExport/>}
    {!docs.length&&!matched.length&&!assistant&&!native&&<p role="status">未找到匹配的办公服务，试试“脑图”“PDF”或“团队”。</p>}
  </section>
}

export default function MobileServices({onOpen}:{onOpen?:(entry:ToolEntry)=>void}={}) {
  const launcher=useToolLauncher(), [query,setQuery]=useState(''), [team,setTeam]=useState(false)
  const [expanded,setExpanded]=useState<string[]>([])
  const groups=searchCatalog(query,team), searching=Boolean(query.trim())
  const showExport=searching ? /海豹|专属|格式/.test(query) : !team
  const open=onOpen || launcher.open
  return <section className="seal-mobile-services seal-tool-catalog" aria-label="全部办公服务">
    <Input className="seal-tool-search" type="search" aria-label="搜索办公服务" prefix={<Icon name="search" size={18}/>} placeholder="搜索服务或工具" allowClear value={query} onChange={event=>setQuery(event.target.value)}/>
    {!searching&&<div className="seal-tool-tabs" role="group" aria-label="服务分类">
      <button type="button" aria-pressed={!team} onClick={()=>setTeam(false)}>效率工具</button>
      <button type="button" aria-pressed={team} onClick={()=>setTeam(true)}>团队服务</button>
    </div>}
    {groups.map((group,index)=>{
      const canExpand=!searching && group.items.length>4, isExpanded=expanded.includes(group.title)
      return <section className="seal-tool-group" key={group.title} aria-labelledby={'seal-tool-group-'+index}>
        <header><h2 id={'seal-tool-group-'+index}>{group.title}</h2>
          {canExpand&&<button type="button" className="seal-tool-more" aria-label={(isExpanded?'收起':'展开')+group.title} aria-expanded={isExpanded} aria-controls={'seal-tool-list-'+index} onClick={()=>setExpanded(list=>isExpanded?list.filter(name=>name!==group.title):[...list,group.title])}>{isExpanded?'收起':'更多'}</button>}
        </header>
        <div id={'seal-tool-list-'+index} className={'seal-tool-grid '+(group.title==='新建文档'?'seal-mobile-create':'seal-mobile-function-grid')} data-collapsed={canExpand && !isExpanded}>
          {group.items.map(entry=><ToolTile key={entry.id} entry={entry} primary={group.title!=='快速创建'} onOpen={open}/>)}
        </div>
      </section>
    })}
    {showExport&&<NativeExport/>}
    {!groups.length&&!showExport&&<p className="seal-tool-empty" role="status">未找到匹配的服务，可尝试“扫描”“PDF”或“团队”。</p>}
  </section>
}
