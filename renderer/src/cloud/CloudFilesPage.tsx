import FileUploadButton from '../components/FileUploadButton'
import {useEffect,useRef,useState} from 'react'
import {App,Button,Dropdown,Input,Modal,Select,Tag,Tooltip,type MenuProps} from 'antd'
import {cloudCall,useCloud} from './CloudProvider'
import {readUpload} from './fileData'
import {通过路径打开文件} from '../fileOpen'
import {useAppStore} from '../store'
import Icon from '../components/Icon'
import CloudFileBrowser,{isFolder,type CloudNode as Node} from './CloudFileBrowser'
import {useSettings} from '../store/settingsStore'
import './drive.css'
export default function CloudFilesPage({trash=false}:{trash?:boolean}){
  const cloud=useCloud(),store=useAppStore(),{modal,message}=App.useApp(),[nodes,setNodes]=useState<Node[]>([]),[parent,setParent]=useState<string|null>(null),[search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[versions,setVersions]=useState<{node:Node;items:any[]}|null>(null),[pending,setPending]=useState<any[]>([])
  const {语言}=useSettings(),en=语言==='en-US',t=(zh:string,english:string)=>en?english:zh
  const [selected,setSelected]=useState<string[]>([]),[sort,setSort]=useState('updated')
  const context=useRef('');context.current=JSON.stringify([cloud.state.account?.id,cloud.state.account?.enabled,cloud.state.unlocked,trash])
  const load=async()=>{const key=context.current;try{const items=await cloudCall('list'),queue=await cloudCall('pending');if(key!==context.current)return;setNodes(items);setPending(queue);setError('');await cloud.refresh()}catch(e){if(key===context.current)setError(e instanceof Error?e.message:'读取失败')}}
  useEffect(()=>{setNodes([]);setPending([]);setVersions(null);setParent(null);if(cloud.state.account?.enabled&&cloud.state.unlocked)void load()},[cloud.state.account?.id,cloud.state.account?.enabled,cloud.state.unlocked,trash])
  useEffect(()=>{setSelected([])},[parent,search,trash,cloud.state.account?.id])
  useEffect(()=>{setSelected(previous=>previous.filter(id=>nodes.some(node=>node.id===id&&Boolean(node.deleted)===trash)))},[nodes,trash])
  useEffect(()=>{
    const back=(event:Event)=>{if(parent&&!document.querySelector('.ant-modal-wrap:not([style*="display: none"])')){event.preventDefault();setParent(nodes.find(n=>n.id===parent)?.parent||null);setSearch('')}}
    window.addEventListener('seal-before-native-back',back)
    return()=>window.removeEventListener('seal-before-native-back',back)
  },[parent,nodes])
  const run=async(task:()=>Promise<any>)=>{setBusy(true);try{await task();await load()}catch(e){modal.error({title:'云文件操作失败',content:e instanceof Error?e.message:'操作失败'})}finally{setBusy(false)}}
  const nameDialog=(title:string,initial:string,task:(name:string)=>Promise<any>)=>{
    let name=initial,submitting=false
    const dialog=modal.confirm({title,centered:true,content:<Input aria-label={title} defaultValue={initial} maxLength={120} onChange={e=>name=e.target.value}/>,onOk:(close:()=>void)=>{
      if(submitting)return
      if(!name.trim()){message.warning('名称不能为空，请输入后继续');return}
      submitting=true;setBusy(true);dialog.update({okButtonProps:{loading:true},cancelButtonProps:{disabled:true}})
      void (async()=>{try{await task(name.trim());await load();close()}
        catch(e){message.error(e instanceof Error?e.message:'操作失败，请重试')}
        finally{submitting=false;setBusy(false);dialog.update({okButtonProps:{loading:false},cancelButtonProps:{disabled:false}})}})()
    }})
  }
  const download=(node:Node,open=false,version?:string)=>run(async()=>{const r=await cloudCall('download',{id:node.id,version});if(open&&r.path){const opened=await 通过路径打开文件(r.path,message,modal,(type,content,path,warnings,page,fingerprint)=>store.createDoc(type,content,{路径:path,警告:warnings,页面设置:page,文件指纹:fingerprint}));if(opened)store.refreshRecents()}else if(!r.cancelled)message.success('文件已下载')})
  if(!cloud.state.account?.enabled||!cloud.state.unlocked)return <section className="seal-drive seal-drive-welcome"><div className="seal-drive-welcome-icon"><Icon name="cloud" variant="mobile" size={64}/></div><h1>{trash?t('云空间回收站','Cloud recycle bin'):t('我的云空间','My cloud space')}</h1><p>{t('文件随身，安全同步','Your files, securely synced')}</p><span>{t('登录并开通加密云空间，管理文件和文件夹','Sign in to manage your encrypted files and folders')}</span><Button type="primary" onClick={cloud.configure}>{cloud.state.account?.enabled?t('解锁云空间','Unlock cloud space'):t('登录并开通云空间','Sign in and enable cloud space')}</Button></section>
  const shown=nodes.filter(n=>Boolean(n.deleted)===trash&&(trash||search?n.meta.name?.toLowerCase().includes(search.toLowerCase()):n.parent===parent)).sort((a,b)=>Number(isFolder(b))-Number(isFolder(a))||(sort==='name'?a.meta.name.localeCompare(b.meta.name,en?'en':'zh'):sort==='oldest'?a.updated-b.updated:b.updated-a.updated))
  const ancestors:Node[]=[],seen=new Set<string>();let cursor=parent
  while(cursor&&!seen.has(cursor)){seen.add(cursor);const node=nodes.find(n=>n.id===cursor);if(!node)break;ancestors.unshift(node);cursor=node.parent}
  const isDescendant=(id:string,ancestor:string)=>{const seen=new Set<string>();let current:string|null=id;while(current&&!seen.has(current)){if(current===ancestor)return true;seen.add(current);current=nodes.find(n=>n.id===current)?.parent||null}return false}
  const move=(node:Node)=>{let target:string|null=node.parent;modal.confirm({title:t('移动到文件夹','Move to folder'),centered:true,content:<Select aria-label={t('目标文件夹','Destination folder')} style={{width:'100%'}} defaultValue={node.parent||'root'} onChange={v=>target=v==='root'?null:v} options={[{value:'root',label:t('全部文件','All files')},...nodes.filter(n=>isFolder(n)&&!n.deleted&&!isDescendant(n.id,node.id)).map(n=>({value:n.id,label:n.meta.name}))]}/>,onOk:()=>run(()=>cloudCall('update',{id:node.id,changes:{parent:target}}))})}
  const remove=(items:Node[],destroy=false)=>modal.confirm({title:destroy?t('彻底删除所选文件？','Permanently delete selected files?'):t('移入回收站？','Move to recycle bin?'),centered:true,content:destroy?t('删除后不能恢复，文件夹内的子项与历史版本也会删除。','Folders, their contents, and version history cannot be recovered.'):t('文件夹内的子项也将移入回收站，可在 30 天内恢复。','Folders and their contents can be restored from the recycle bin for 30 days.'),okButtonProps:{danger:true},onOk:()=>run(async()=>{const roots=items.filter(node=>!items.some(ancestor=>ancestor.id!==node.id&&isDescendant(node.id,ancestor.id)));for(const node of roots)await cloudCall('remove',{id:node.id,...(destroy?{destroy:true}:{})});setSelected([])})})
  const actions=(node:Node):MenuProps['items']=>trash?[
    {key:'restore',label:t('恢复','Restore'),onClick:()=>void run(()=>cloudCall('restore',{id:node.id}))},
    {key:'destroy',label:t('彻底删除','Delete permanently'),danger:true,onClick:()=>remove([node],true)}
  ]:[
    {key:'open',label:isFolder(node)?t('打开文件夹','Open folder'):t('打开','Open'),onClick:()=>isFolder(node)?setParent(node.id):void download(node,true)},
    ...(!isFolder(node)?[
      {key:'download',label:t('下载','Download'),onClick:()=>void download(node)},
      {key:'versions',label:t('历史版本','Version history'),onClick:()=>void run(async()=>setVersions({node,items:(await cloudCall('versions',{id:node.id})).items}))},
      {key:'copy',label:t('复制','Copy'),onClick:()=>void run(()=>cloudCall('copy',{id:node.id}))}
    ]:[]),
    {type:'divider'},
    {key:'rename',label:t('重命名','Rename'),onClick:()=>nameDialog(t('重命名','Rename'),node.meta.name,name=>cloudCall('update',{id:node.id,changes:{name}}))},
    {key:'move',label:t('移动','Move'),onClick:()=>move(node)},
    {key:'remove',label:t('删除','Delete'),danger:true,onClick:()=>remove([node])}
  ]
  const quota=cloud.state.account.quota||300000000,used=cloud.state.account.used||0,selection=shown.filter(n=>selected.includes(n.id))
  return <section className="seal-cloud-page seal-drive ds-page-shell"><header className="seal-drive-header ds-page-header"><h1>{trash?t('云空间回收站','Cloud recycle bin'):t('我的云空间','My cloud space')}</h1><div className="seal-drive-capacity ds-page-header-extra"><Icon name="cloud" size={16}/><span>{(used/1000000).toFixed(2)} / {quota/1000000} MB</span><div role="progressbar" aria-label={t('云空间用量','Cloud storage usage')} aria-valuenow={Math.round(used/quota*100)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${Math.min(100,used/quota*100)}%`}}/></div></div></header>
    <div className="seal-drive-toolbar ds-card-toolbar ds-card-toolbar-inline">
      <div className="seal-drive-primary-actions">{!trash?<><FileUploadButton type="primary" disabled={busy} multiple onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void run(async()=>{for(const file of files)await cloudCall('save',{linkId:crypto.randomUUID(),name:file.name,data:await readUpload(file),parent});message.success(t('文件已加密处理，请检查同步状态','Files encrypted; check sync status'))})}}>{t('上传文件','Upload files')}</FileUploadButton><Button disabled={busy} icon={<Icon name="folder" size={16}/>} onClick={()=>nameDialog(t('新建文件夹','New folder'),'',name=>cloudCall('folder',{name,parent}))}>{t('新建文件夹','New folder')}</Button></>:<span className="seal-drive-trash-note">{t('回收站保留 30 天','Files kept for 30 days')}</span>}</div>
      <div className="seal-drive-toolbar-end"><Input allowClear className="seal-drive-search" prefix={<Icon name="search" size={16}/>} aria-label={t('搜索云文件','Search cloud files')} placeholder={t('搜索文件名','Search file names')} value={search} onChange={e=>setSearch(e.target.value)}/><Dropdown trigger={['click']} menu={{selectable:true,selectedKeys:[sort],items:[{key:'updated',label:t('最近修改','Recently modified')},{key:'oldest',label:t('最早修改','Oldest modified')},{key:'name',label:t('按名称排序','Sort by name')}],onClick:({key})=>setSort(key)}}><Button aria-label={t('排序','Sort')} icon={<Icon name="sort" size={17}/>}/></Dropdown><Tooltip title={t('刷新','Refresh')}><Button loading={busy} aria-label={t('刷新云文件','Refresh cloud files')} icon={<Icon name="retry" size={17}/>} onClick={()=>void run(async()=>{})}/></Tooltip></div>
    </div>
    <nav className="seal-drive-path" aria-label={t('文件夹路径','Folder path')}><Button type="text" disabled={!parent||Boolean(search)} aria-label={t('上级目录','Parent folder')} icon={<Icon name="arrow-left" size={16}/>} onClick={()=>setParent(nodes.find(n=>n.id===parent)?.parent||null)}/><button onClick={()=>{setParent(null);setSearch('')}}>{trash?t('回收站','Recycle bin'):t('全部文件','All files')}</button>{search?<><span>/</span><strong>{t('搜索结果','Search results')}</strong></>:ancestors.map(n=><span className="seal-drive-crumb" key={n.id}><span>/</span><button translate="no" onClick={()=>setParent(n.id)}>{n.meta.name}</button></span>)}</nav>
    {selected.length?<div className="seal-drive-selection"><span>{t(`已选择 ${selected.length} 项`,`${selected.length} selected`)}</span>{trash?<Button disabled={busy} onClick={()=>void run(async()=>{for(const n of selection)await cloudCall('restore',{id:n.id});setSelected([])})}>{t('恢复','Restore')}</Button>:<Button disabled={busy||!selection.length||selection.some(isFolder)} onClick={()=>void run(async()=>{for(const n of selection)await cloudCall('download',{id:n.id})})}>{t('下载','Download')}</Button>}<Button danger disabled={busy} onClick={()=>remove(selection,trash)}>{trash?t('彻底删除','Delete permanently'):t('删除','Delete')}</Button><Button type="text" onClick={()=>setSelected([])}>{t('取消选择','Clear selection')}</Button></div>:null}
    {error?<p className="seal-cloud-error">{error}</p>:null}
    {pending.length?<div className="seal-cloud-card"><h2>待同步文件（已在本机加密保留）</h2><Button loading={busy} onClick={()=>void run(()=>cloudCall('flush'))}>重试同步</Button>{pending.map(p=><p key={p.id}>{p.name} · {p.status} <Button onClick={()=>void run(()=>cloudCall('exportPending',{id:p.id}))}>导出本机副本</Button>{p.status==='版本冲突'?<Button onClick={()=>void run(()=>cloudCall('keepConflict',{id:p.id}))}>保留为冲突副本</Button>:null}<Button danger onClick={()=>modal.confirm({title:'清除这条待同步记录？',content:'此操作会删除本机加密待同步副本。请先导出需要的内容；已保存的云端版本与原本地文件不受影响。',onOk:()=>run(()=>cloudCall('discardPending',{id:p.id}))})}>清除记录</Button></p>)}</div>:null}
    <CloudFileBrowser nodes={shown} selected={selected} onSelect={setSelected} busy={busy} onOpen={node=>trash?setSelected([node.id]):isFolder(node)?setParent(node.id):void download(node,true)} actions={actions}/>
    <Modal open={Boolean(versions)} centered title={t('历史版本','Version history')} footer={null} onCancel={()=>setVersions(null)}>
      {versions?.items.map(v=><p key={v.id}>
        版本 {v.version} · {new Date(v.created).toLocaleString()} · {(v.bytes/1000).toFixed(1)} KB
        <Button onClick={()=>void download(versions.node,false,v.id)}>下载此版本</Button>
        {v.version!==versions.node.version?<Button danger onClick={()=>modal.confirm({
          title:'永久删除此历史版本？',content:'删除后释放相应云空间，无法恢复。',
          onOk:()=>run(async()=>{
            await cloudCall('removeVersion',{id:v.id})
            setVersions({...versions,items:(await cloudCall('versions',{id:versions.node.id})).items})
          })
        })}>删除旧版本</Button>:<Tag>当前版本</Tag>}
      </p>)}
    </Modal>
  </section>
}
