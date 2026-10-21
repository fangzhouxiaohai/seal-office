import {useState} from 'react'
import {Button,Checkbox,Dropdown,Empty,Tooltip,type MenuProps} from 'antd'
import Icon from '../components/Icon'
import {useSettings} from '../store/settingsStore'
import {原生文档类型} from '../fileFormats'

export interface CloudNode {
  id:string;parent:string|null;kind:string;deleted:number;version:number;updated:number
  meta:{name:string;filename?:string;[key:string]:unknown}
}
export const isFolder=(node:CloudNode)=>['folder','library'].includes(node.kind)
const fileIcon=(node:CloudNode)=>{
  if(isFolder(node))return 'folder'
  const extension=(node.meta.filename||node.meta.name).split('.').pop()?.toLowerCase()
  const native=原生文档类型(extension||'')
  if(native)return {word:'doc-word',table:'doc-table',ppt:'doc-ppt',pdf:'doc-pdf'}[native]
  if(extension==='pdf')return 'doc-pdf'
  if(['ppt','pptx','odp'].includes(extension||''))return 'doc-ppt'
  if(['xls','xlsx','csv','ods'].includes(extension||''))return 'doc-table'
  if(['doc','docx','txt','md','odt'].includes(extension||''))return 'doc-word'
  return 'doc-empty'
}

// Adapted from the toolbar-list pattern: one toolbar, file results, contextual actions.
// Existing product tokens stay scoped to this browser rather than changing the app shell.
export default function CloudFileBrowser({nodes,selected,onSelect,onOpen,actions,busy}:{
  nodes:CloudNode[];selected:string[];onSelect:(ids:string[])=>void;onOpen:(node:CloudNode)=>void
  actions:(node:CloudNode)=>MenuProps['items'];busy:boolean
}){
  const {语言}=useSettings()
  const en=语言==='en-US',t=(zh:string,english:string)=>en?english:zh
  const [view,setView]=useState<'grid'|'list'>(()=>{try{return localStorage.getItem('seal-cloud-view')==='list'?'list':'grid'}catch{return 'grid'}})
  const changeView=(next:'grid'|'list')=>{setView(next);try{localStorage.setItem('seal-cloud-view',next)}catch{/* View preference must not block file actions. */}}
  const toggle=(node:CloudNode,checked:boolean)=>onSelect(checked?[...selected.filter(id=>id!==node.id),node.id]:selected.filter(id=>id!==node.id))
  const all=nodes.length>0&&nodes.every(node=>selected.includes(node.id))
  return <div className="seal-drive-results ds-list-card">
    <div className="seal-drive-results-header list-card-toolbar">
      <Checkbox aria-label={t('全选云文件','Select all cloud files')} checked={all} indeterminate={!all&&selected.length>0} onChange={event=>onSelect(event.target.checked?nodes.map(n=>n.id):[])} disabled={!nodes.length||busy}/>
      <span className="seal-drive-result-title">{selected.length?t(`已选择 ${selected.length} 项`,`${selected.length} selected`):t(`全部文件 · ${nodes.length} 项`,`All files · ${nodes.length} items`)}</span>
      <div className="seal-drive-view" role="group" aria-label={t('文件显示方式','File view')}>
        {(['list','grid'] as const).map(mode=><Tooltip key={mode} title={mode==='grid'?t('网格视图','Grid view'):t('列表视图','List view')}><Button aria-label={mode==='grid'?t('网格视图','Grid view'):t('列表视图','List view')} aria-pressed={view===mode} type="text" className={view===mode?'is-active':undefined} icon={<Icon name={mode} size={17}/>} onClick={()=>changeView(mode)}/></Tooltip>)}
      </div>
    </div>
    {!nodes.length?<Empty className="seal-drive-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('此目录暂无文件','This folder is empty')}/>:<>
      {view==='list'?<div className="seal-drive-list-labels" aria-hidden="true"><span>{t('文件名','Name')}</span><span>{t('修改时间','Modified')}</span><span>{t('版本','Version')}</span></div>:null}
      <ul className={`seal-drive-files seal-drive-files--${view}`} aria-label={t('云文件','Cloud files')}>
        {nodes.map(node=><li key={node.id} className={`seal-drive-file${selected.includes(node.id)?' is-selected':''}`}>
          <Checkbox className="seal-drive-file-check" aria-label={t(`选择 ${node.meta.name}`,`Select ${node.meta.name}`)} checked={selected.includes(node.id)} onChange={event=>toggle(node,event.target.checked)} disabled={busy}/>
          <button className="seal-drive-file-open" disabled={busy} onClick={()=>onOpen(node)} title={node.meta.name}>
            {isFolder(node)?<span className="seal-drive-folder-symbol" data-size={view} aria-hidden="true"/>:<Icon name={fileIcon(node)} variant="mobile" size={view==='grid'?64:34}/>}
            <span className="seal-drive-file-name" translate="no">{node.meta.name}</span>
          </button>
          <span className="seal-drive-file-date">{new Date(node.updated).toLocaleString(en?'en-US':'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
          <span className="seal-drive-file-version">{isFolder(node)?'—':t(`版本 ${node.version}`,`Version ${node.version}`)}</span>
          <Dropdown trigger={['click']} menu={{items:actions(node)}}><Button className="seal-drive-file-more" type="text" disabled={busy} aria-label={t(`更多操作 ${node.meta.name}`,`More actions for ${node.meta.name}`)} icon={<Icon name="more" size={18}/>} /></Dropdown>
        </li>)}
      </ul>
    </>}
  </div>
}
