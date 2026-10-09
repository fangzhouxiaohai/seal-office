import FileUploadButton from '../components/FileUploadButton'
import {useEffect,useRef,useState} from 'react'
import {App,Button,Input,Modal,Select,Tag} from 'antd'
import {cloudCall,useCloud} from './CloudProvider'
import {readUpload} from './fileData'
import {通过路径打开文件} from '../fileOpen'
import {useAppStore} from '../store'
interface Node {id:string;parent:string|null;kind:string;deleted:number;version:number;meta:{name:string;[k:string]:any};updated:number}
export default function CloudFilesPage({trash=false}:{trash?:boolean}){
  const cloud=useCloud(),store=useAppStore(),{modal,message}=App.useApp(),[nodes,setNodes]=useState<Node[]>([]),[parent,setParent]=useState<string|null>(null),[search,setSearch]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[versions,setVersions]=useState<{node:Node;items:any[]}|null>(null),[pending,setPending]=useState<any[]>([])
  const context=useRef('');context.current=JSON.stringify([cloud.state.account?.id,cloud.state.account?.enabled,cloud.state.unlocked,trash])
  const load=async()=>{const key=context.current;try{const items=await cloudCall('list'),queue=await cloudCall('pending');if(key!==context.current)return;setNodes(items);setPending(queue);setError('');await cloud.refresh()}catch(e){if(key===context.current)setError(e instanceof Error?e.message:'读取失败')}}
  useEffect(()=>{setNodes([]);setPending([]);setVersions(null);setParent(null);if(cloud.state.account?.enabled&&cloud.state.unlocked)void load()},[cloud.state.account?.id,cloud.state.account?.enabled,cloud.state.unlocked,trash])
  const run=async(task:()=>Promise<any>)=>{setBusy(true);try{await task();await load()}catch(e){modal.error({title:'云文件操作失败',content:e instanceof Error?e.message:'操作失败'})}finally{setBusy(false)}}
  const nameDialog=(title:string,initial:string,task:(name:string)=>Promise<any>)=>{
    let name=initial,submitting=false
    const dialog=modal.confirm({title,content:<Input aria-label={title} defaultValue={initial} maxLength={120} onChange={e=>name=e.target.value}/>,onOk:(close:()=>void)=>{
      if(submitting)return
      if(!name.trim()){message.warning('名称不能为空，请输入后继续');return}
      submitting=true;setBusy(true);dialog.update({okButtonProps:{loading:true},cancelButtonProps:{disabled:true}})
      void (async()=>{try{await task(name.trim());await load();close()}
        catch(e){message.error(e instanceof Error?e.message:'操作失败，请重试')}
        finally{submitting=false;setBusy(false);dialog.update({okButtonProps:{loading:false},cancelButtonProps:{disabled:false}})}})()
    }})
  }
  const download=(node:Node,open=false,version?:string)=>run(async()=>{const r=await cloudCall('download',{id:node.id,version});if(open&&r.path){const opened=await 通过路径打开文件(r.path,message,modal,(type,content,path,warnings,page,fingerprint)=>store.createDoc(type,content,{路径:path,警告:warnings,页面设置:page,文件指纹:fingerprint}));if(opened)store.refreshRecents()}else if(!r.cancelled)message.success('文件已下载')})
  if(!cloud.state.account?.enabled||!cloud.state.unlocked)return <div className="seal-cloud-empty"><h1>{trash?'云空间回收站':'我的云空间'}</h1><p>开通加密云空间后管理文件与目录，每账号 300 MB。</p><Button type="primary" onClick={cloud.configure}>{cloud.state.account?.enabled?'解锁云空间':'登录并开通云空间'}</Button></div>
  const shown=nodes.filter(n=>Boolean(n.deleted)===trash&&(search?n.meta.name?.toLowerCase().includes(search.toLowerCase()):n.parent===parent))
  return <section className="seal-cloud-page"><header><h1>{trash?'云空间回收站':'我的云空间'}</h1><span>{((cloud.state.account.used||0)/1000000).toFixed(2)} / 300 MB</span></header>
    <div className="seal-cloud-actions"><Button loading={busy} onClick={()=>void load()}>刷新</Button><Button disabled={!parent} onClick={()=>setParent(nodes.find(n=>n.id===parent)?.parent||null)}>上级目录</Button><Button onClick={()=>setParent(null)}>根目录</Button>{!trash?<><Button onClick={()=>nameDialog('新建目录','',name=>cloudCall('folder',{name,parent}))}>新建目录</Button><FileUploadButton disabled={busy} multiple onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';void run(async()=>{for(const file of files)await cloudCall('save',{linkId:crypto.randomUUID(),name:file.name,data:await readUpload(file),parent});message.success('文件已加密处理，请检查同步状态')})}}>上传文件</FileUploadButton></>:null}<Input.Search enterButton="搜索" aria-label="搜索云文件" placeholder="搜索文件名" style={{maxWidth:260}} value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {error?<p className="seal-cloud-error">{error}</p>:null}
    {pending.length?<div className="seal-cloud-card"><h2>待同步文件（已在本机加密保留）</h2><Button loading={busy} onClick={()=>void run(()=>cloudCall('flush'))}>重试同步</Button>{pending.map(p=><p key={p.id}>{p.name} · {p.status} <Button onClick={()=>void run(()=>cloudCall('exportPending',{id:p.id}))}>导出本机副本</Button>{p.status==='版本冲突'?<Button onClick={()=>void run(()=>cloudCall('keepConflict',{id:p.id}))}>保留为冲突副本</Button>:null}<Button danger onClick={()=>modal.confirm({title:'清除这条待同步记录？',content:'此操作会删除本机加密待同步副本。请先导出需要的内容；已保存的云端版本与原本地文件不受影响。',onOk:()=>run(()=>cloudCall('discardPending',{id:p.id}))})}>清除记录</Button></p>)}</div>:null}
    <p>当前目录：{parent?nodes.find(n=>n.id===parent)?.meta.name:'根目录'} · 回收站保留 30 天</p>
    <div className="seal-cloud-list">{shown.map(node=><article className="seal-cloud-card" key={node.id}><Tag>{['folder','library'].includes(node.kind)?'目录':node.kind==='knowledge'?'知识文件':'文件'}</Tag><h3>{node.meta.name}</h3><p>{new Date(node.updated).toLocaleString()} · 版本 {node.version}</p>
      {trash?<><Button onClick={()=>void run(()=>cloudCall('restore',{id:node.id}))}>恢复</Button><Button danger onClick={()=>modal.confirm({title:'彻底删除此项及其全部子项？',content:'删除后不能恢复，历史版本也会删除。',okButtonProps:{danger:true},onOk:()=>run(()=>cloudCall('remove',{id:node.id,destroy:true}))})}>彻底删除</Button></>:<>
        {['folder','library'].includes(node.kind)?<Button type="primary" onClick={()=>setParent(node.id)}>进入目录</Button>:<><Button type="primary" onClick={()=>void download(node,true)}>打开</Button><Button onClick={()=>void download(node)}>下载</Button><Button onClick={()=>void run(async()=>setVersions({node,items:(await cloudCall('versions',{id:node.id})).items}))}>历史版本</Button><Button onClick={()=>void run(()=>cloudCall('copy',{id:node.id}))}>复制</Button></>}
        <Button onClick={()=>nameDialog('重命名',node.meta.name,name=>cloudCall('update',{id:node.id,changes:{name}}))}>重命名</Button><Button onClick={()=>{let target:string|null=node.parent;modal.confirm({title:'移动到目录',content:<Select style={{width:'100%'}} defaultValue={node.parent||'root'} onChange={v=>target=v==='root'?null:v} options={[{value:'root',label:'根目录'},...nodes.filter(n=>n.kind==='folder'&&!n.deleted&&n.id!==node.id).map(n=>({value:n.id,label:n.meta.name}))]}/>,onOk:()=>run(()=>cloudCall('update',{id:node.id,changes:{parent:target}}))})}}>移动</Button><Button danger onClick={()=>modal.confirm({title:'移入回收站？',onOk:()=>run(()=>cloudCall('remove',{id:node.id}))})}>删除</Button>
      </>}</article>)}</div>{!shown.length?<p>此目录暂无文件。</p>:null}
    <Modal open={Boolean(versions)} title="历史版本" footer={null} onCancel={()=>setVersions(null)}>
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
