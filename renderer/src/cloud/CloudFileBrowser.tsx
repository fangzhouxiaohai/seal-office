import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {卡片位置,格式化大小,格式化时间} from './fileInfo'
import {Button,Checkbox,Dropdown,Empty,Tooltip,type MenuProps} from 'antd'
import Icon from '../components/Icon'
import {useSettings} from '../store/settingsStore'
import {原生文档类型} from '../fileFormats'

export interface CloudNode {
  id:string;parent:string|null;kind:string;deleted:number;version:number;updated:number
  /** 当前版本存储字节数与首个版本时间（2.8.0 起由服务端附带；文件夹为 null） */
  bytes?:number|null;created?:number|null
  meta:{name:string;filename?:string;[key:string]:unknown}
}
export const isFolder=(node:CloudNode)=>['folder','library'].includes(node.kind)
export const fileIcon=(node:CloudNode)=>{
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
export interface CloudDragBinding{拖动属性:(id:string)=>Record<string,unknown>;状态类:(id:string)=>string;拖动中:boolean
  /** 文件区根元素：拖动时据此确定横向命中范围与实际纵向滚动容器 */
  区域?:React.RefObject<HTMLDivElement>
  拖动目标?:string|null;拖动原因?:string|null
}

export default function CloudFileBrowser({nodes,selected,onSelect,onOpen,actions,busy,drag,sizes,dropFolder,dropFolderName}:{
  nodes:CloudNode[];selected:string[];onSelect:(ids:string[])=>void;onOpen:(node:CloudNode)=>void
  actions:(node:CloudNode)=>MenuProps['items'];busy:boolean
  /** 节点大小（文件夹为递归汇总）；不传则不显示大小 */
  sizes?:Map<string,{字节:number|null;不完整:boolean}>
  /** 拖放移动绑定：回收站与只读场景不传 */
  drag?:CloudDragBinding
  /** 当前目录（根目录用 __root__）：悬停进入空目录后，空白文件区作为投放目标 */
  dropFolder?:string;dropFolderName?:string
}){
  const {语言}=useSettings()
  const en=语言==='en-US',t=(zh:string,english:string)=>en?english:zh
  const [view,setView]=useState<'grid'|'list'>(()=>{try{return localStorage.getItem('seal-cloud-view')==='list'?'list':'grid'}catch{return 'grid'}})
  const changeView=(next:'grid'|'list')=>{setView(next);try{localStorage.setItem('seal-cloud-view',next)}catch{/* View preference must not block file actions. */}}
  const toggle=(node:CloudNode,checked:boolean)=>onSelect(checked?[...selected.filter(id=>id!==node.id),node.id]:selected.filter(id=>id!==node.id))
  const all=nodes.length>0&&nodes.every(node=>selected.includes(node.id))
  const locale=en?'en-US':'zh-CN'
  const sizeText=(node:CloudNode)=>{const value=sizes?.get(node.id);if(!value)return '—';return 格式化大小(value.字节,locale)+(value.不完整&&isFolder(node)?'+':'')}
  // 网格视图悬停信息卡：悬停或键盘聚焦 300ms 后显示，夹在可视区域内，靠近边缘自动翻转
  const [card,setCard]=useState<{node:CloudNode;left:number;top:number}|null>(null)
  const cardTimer=useRef(0)
  const hideCard=()=>{clearTimeout(cardTimer.current);setCard(null)}
  const showCard=(node:CloudNode,element:HTMLElement)=>{
    if(view!=='grid'||drag?.拖动中)return
    clearTimeout(cardTimer.current)
    cardTimer.current=window.setTimeout(()=>{const rect=element.getBoundingClientRect();const width=Math.min(260,window.innerWidth-16);setCard({node,...卡片位置(rect,{width,height:132},{width:window.innerWidth,height:window.innerHeight})})},300)
  }
  useEffect(()=>{if(!card)return;const close=()=>hideCard();window.addEventListener('scroll',close,true);window.addEventListener('resize',close);return()=>{window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close)}},[card])
  useEffect(()=>()=>clearTimeout(cardTimer.current),[])
  useEffect(()=>{if(drag?.拖动中)hideCard()},[drag?.拖动中])
  const emptyDrop=Boolean(drag?.拖动中&&dropFolder)
  return <div ref={drag?.区域} className={`seal-drive-results ds-list-card${drag?.拖动中?' is-drag-active':''}`}>
    <div className="seal-drive-results-header list-card-toolbar">
      <Checkbox aria-label={t('全选云文件','Select all cloud files')} checked={all} indeterminate={!all&&selected.length>0} onChange={event=>onSelect(event.target.checked?nodes.map(n=>n.id):[])} disabled={!nodes.length||busy}/>
      <span className="seal-drive-result-title">{selected.length?t(`已选择 ${selected.length} 项`,`${selected.length} selected`):t(`全部文件 · ${nodes.length} 项`,`All files · ${nodes.length} items`)}</span>
      <div className="seal-drive-view" role="group" aria-label={t('文件显示方式','File view')}>
        {(['list','grid'] as const).map(mode=><Tooltip key={mode} title={mode==='grid'?t('网格视图','Grid view'):t('列表视图','List view')}><Button aria-label={mode==='grid'?t('网格视图','Grid view'):t('列表视图','List view')} aria-pressed={view===mode} type="text" className={view===mode?'is-active':undefined} icon={<Icon name={mode} size={17}/>} onClick={()=>changeView(mode)}/></Tooltip>)}
      </div>
    </div>
    {!nodes.length?emptyDrop?<div className={`seal-drive-empty seal-drive-empty-drop${drag?.拖动目标===dropFolder?(drag?.拖动原因?' is-drop-invalid':' is-drop-target'):''}`} data-drop-target={dropFolder} data-drop-hint="empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={drag?.拖动目标===dropFolder&&drag?.拖动原因?drag.拖动原因:t(`松开移入『${dropFolderName||''}』`,`Release to move into "${dropFolderName||''}"`)}/></div>:<Empty className="seal-drive-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('此目录暂无文件','This folder is empty')}/>:<>
      {view==='list'?<div className="seal-drive-list-labels" aria-hidden="true"><span>{t('文件名','Name')}</span><span>{t('大小','Size')}</span><span>{t('修改时间','Modified')}</span><span>{t('版本','Version')}</span></div>:null}
      <ul className={`seal-drive-files seal-drive-files--${view}`} aria-label={t('云文件','Cloud files')}>
        {nodes.map(node=><li key={node.id} className={`seal-drive-file${selected.includes(node.id)?' is-selected':''}${drag?drag.状态类(node.id):''}`}
          {...(drag&&!busy?drag.拖动属性(node.id):{})} {...(drag&&isFolder(node)?{'data-drop-target':node.id}:{})}>
          <Checkbox className="seal-drive-file-check" aria-label={t(`选择 ${node.meta.name}`,`Select ${node.meta.name}`)} checked={selected.includes(node.id)} onChange={event=>toggle(node,event.target.checked)} disabled={busy}/>
          <button className="seal-drive-file-open" disabled={busy} onClick={()=>onOpen(node)} title={view==='grid'?undefined:node.meta.name}
            aria-describedby={card?.node.id===node.id?'seal-drive-hover-card':undefined}
            onMouseEnter={event=>showCard(node,event.currentTarget.closest('li')||event.currentTarget)} onMouseLeave={hideCard}
            onFocus={event=>showCard(node,event.currentTarget.closest('li')||event.currentTarget)} onBlur={hideCard}>
            {isFolder(node)?<span className="seal-drive-folder-symbol" data-size={view} aria-hidden="true"/>:<Icon name={fileIcon(node)} variant="mobile" size={view==='grid'?64:34}/>}
            <span className="seal-drive-file-name" translate="no">{node.meta.name}</span>
          </button>
          <span className="seal-drive-file-size">{sizeText(node)}</span>
          <span className="seal-drive-file-date">{格式化时间(node.updated,locale)}</span>
          <span className="seal-drive-file-version">{isFolder(node)?'—':t(`版本 ${node.version}`,`Version ${node.version}`)}</span>
          <Dropdown trigger={['click']} menu={{items:actions(node)}}><Button className="seal-drive-file-more" type="text" disabled={busy} aria-label={t(`更多操作 ${node.meta.name}`,`More actions for ${node.meta.name}`)} icon={<Icon name="more" size={18}/>} /></Dropdown>
        </li>)}
      </ul>
    </>}
    {card?createPortal(<div id="seal-drive-hover-card" role="tooltip" className="seal-drive-hover-card" style={{left:card.left,top:card.top}}>
      <strong translate="no">{card.node.meta.name}</strong>
      <dl>
        <dt>{t('大小','Size')}</dt><dd>{sizeText(card.node)}</dd>
        <dt>{t('创建时间','Created')}</dt><dd>{格式化时间(card.node.created,locale)}</dd>
        <dt>{t('修改时间','Modified')}</dt><dd>{格式化时间(card.node.updated,locale)}</dd>
      </dl>
    </div>,document.body):null}
  </div>
}
