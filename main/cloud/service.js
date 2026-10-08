const fs=require('fs'),path=require('path'),http=require('http'),https=require('https')
const {randomBytes,randomUUID,createHash}=require('crypto')
const {seal,unseal,recoveryKey}=require('./crypto')
const DEFAULT_URL='https://seal.xingmasoft.com/api'
const CHUNK=1024*1024
const digest=data=>createHash('sha256').update(data).digest('hex')
function normalizeUrl(value){
  let url;try{url=new URL(value)}catch{throw new Error('服务器地址无效')}
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw new Error('服务器须使用 HTTPS；本机测试可使用 HTTP')
  return url.toString().replace(/\/$/,'')
}
function createService({directory,safeStorage,transport}={}){
  const secureFile=path.join(directory,'cloud.secure'),outbox=path.join(directory,'cloud-outbox')
  fs.mkdirSync(outbox,{recursive:true})
  let state={url:DEFAULT_URL,token:null,account:null,owner:null,root:null,recoveryPending:null,links:{},statuses:{}}
  const locks=new Map(),saveLocks=new Map(),active=new Set();let epoch=0
  function durableWrite(filename,data){const temp=filename+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temp,filename)}
  if(fs.existsSync(secureFile)){
    if(!safeStorage?.isEncryptionAvailable())throw new Error('系统安全存储不可用，无法读取云端会话')
    try{state={...state,...JSON.parse(safeStorage.decryptString(fs.readFileSync(secureFile)))}}catch{throw new Error('云端本机安全记录损坏，请通过设置重新登录')}
  }
  state.owner=state.owner||state.account?.id||null
  const referencedBlobs=new Set(fs.readdirSync(outbox).filter(n=>n.endsWith('.json')).map(n=>{try{return JSON.parse(fs.readFileSync(path.join(outbox,n),'utf8')).blob}catch{throw new Error('待同步记录损坏，请先备份本机数据')}}))
  for(const filename of fs.readdirSync(outbox))if(filename.endsWith('.bin')&&!referencedBlobs.has(filename))fs.unlinkSync(path.join(outbox,filename))
  function persist(){
    if(!safeStorage?.isEncryptionAvailable())throw new Error('系统安全存储不可用，无法保存云端密钥')
    durableWrite(secureFile,safeStorage.encryptString(JSON.stringify(state)))
  }
  const root=()=>{if(!state.root)throw new Error('请先输入恢复密钥解锁云空间');return Buffer.from(state.root,'base64')}
  function status(){return {url:state.url,account:state.account,unlocked:Boolean(state.root&&state.account),statuses:{...state.statuses},pending:fs.readdirSync(outbox).filter(n=>n.endsWith('.json')).length,...(state.account&&state.recoveryPending?{recoveryPending:state.recoveryPending}:{})}}
  async function request(route,{method='GET',data,binary=false,headers={}}={}){
    const url=new URL(state.url+route),payload=Buffer.isBuffer(data)?data:data===undefined?null:Buffer.from(JSON.stringify(data))
    const head={...(state.token?{Authorization:'Bearer '+state.token}:{}),...(payload?{'Content-Type':Buffer.isBuffer(data)?'application/octet-stream':'application/json','Content-Length':payload.length}:{}),...headers}
    if(transport)return transport(url.toString(),{method,headers:head,body:payload,binary})
    return new Promise((resolve,reject)=>{
      const req=(url.protocol==='https:'?https:http).request(url,{method,headers:head},res=>{
        const chunks=[];let size=0
        res.on('data',chunk=>{size+=chunk.length;if(size>310000000){req.destroy(new Error('服务器响应过大'));return}chunks.push(chunk)})
        res.on('error',reject);res.on('end',()=>{const raw=Buffer.concat(chunks);let result;try{result=JSON.parse(raw.toString())}catch{result=null}
          if(res.statusCode<200||res.statusCode>=300){const error=Object.assign(new Error(result?.error||'云服务请求失败'),{status:res.statusCode});if(res.statusCode===401){state.token=null;state.root=null;state.account=null;epoch++;persist()}reject(error)}else if(binary)resolve(raw);else if(result)resolve(result);else reject(new Error('服务器响应格式不正确'))
        })
      });active.add(req);req.on('close',()=>active.delete(req));req.on('error',reject);req.setTimeout(30000,()=>req.destroy(new Error('云端连接超时，已保留本地待同步数据')));if(payload)req.write(payload);req.end()
    })
  }
  const requireSpace=()=>{if(!state.token||!state.account?.enabled)throw new Error('请先登录并开通云空间');root()}
  const encodeMeta=(id,meta)=>seal(root(),Buffer.from(JSON.stringify(meta)),`seal-meta:${id}`).toString('base64')
  const decodeMeta=n=>({...n,meta:JSON.parse(unseal(root(),Buffer.from(n.meta,'base64'),`seal-meta:${n.id}`).toString())})
  async function refresh(){if(state.token){const account=await request('/v1/me');if(state.account?.autosave&&!account.autosave){epoch++;for(const req of active)req.destroy()}state.account=account;if(!account.enabled){state.root=null;state.recoveryPending=null;state.links={};state.statuses={};clearOutbox()}persist()}return status()}
  async function list(){requireSpace();const result=await request('/v1/nodes');return result.items.map(decodeMeta)}
  async function createNode(meta,kind='file',parent=null){
    requireSpace();const id=randomUUID(),fileKey=randomBytes(32)
    const details={...meta,key:seal(root(),fileKey,`seal-key:${id}`).toString('base64')}
    const item=await request('/v1/nodes',{method:'POST',data:{id,kind,parent,meta:encodeMeta(id,details)}});return {...item,meta:details}
  }
  const keyFor=n=>unseal(root(),Buffer.from(n.meta.key,'base64'),`seal-key:${n.id}`)
  const clearOutbox=()=>{for(const name of fs.readdirSync(outbox))fs.unlinkSync(path.join(outbox,name))}
  async function flushItem(queue){
    const localEpoch=epoch;if(!state.account?.enabled||!state.root||!state.token)return
    if(queue.automatic&&!state.account.autosave)return
    state.statuses[queue.id]='加密上传中'
    try{
      if(queue.create){try{await request('/v1/nodes',{method:'POST',data:queue.create})}catch(e){if(e.status!==409)throw e;const found=(await request('/v1/nodes')).items.find(n=>n.id===queue.id);if(!found)throw e}queue.create=null;const filename=path.join(outbox,queue.id+'.json'),latest=JSON.parse(fs.readFileSync(filename,'utf8'));latest.create=null;durableWrite(filename,JSON.stringify(latest));for(const link of Object.values(state.links))if(link.id===queue.id)link.created=true;persist()}
      const raw=fs.readFileSync(path.join(outbox,queue.blob))
      let upload=null
      const persistQueue=()=>{const filename=path.join(outbox,queue.id+'.json'),latest=JSON.parse(fs.readFileSync(filename,'utf8'));if(latest.blob===queue.blob)durableWrite(filename,JSON.stringify(queue))}
      if(queue.upload){try{upload=await request(`/v1/uploads/${queue.upload}`)}catch(error){if(error.status!==404)throw error;queue.upload=null;persistQueue()}}
      if(!upload){upload=await request('/v1/uploads',{method:'POST',data:{nodeId:queue.id,bytes:raw.length,expected:queue.expected,automatic:queue.automatic}});queue.upload=upload.id;persistQueue()}
      for(let offset=upload.offset;offset<raw.length;){if(epoch!==localEpoch||!state.account?.enabled||(queue.automatic&&!state.account.autosave))throw new Error('自动上传已关闭');const result=await request(`/v1/uploads/${upload.id}`,{method:'PUT',data:raw.subarray(offset,offset+CHUNK),headers:{'X-Seal-Offset':offset}});offset=result.offset}
      const result=upload.committed?upload:await request(`/v1/uploads/${upload.id}/commit`,{method:'POST'})
      if(epoch!==localEpoch)return
      const latest=JSON.parse(fs.readFileSync(path.join(outbox,queue.id+'.json'),'utf8'))
      if(latest.blob===queue.blob){fs.unlinkSync(path.join(outbox,queue.id+'.json'));fs.unlinkSync(path.join(outbox,queue.blob))}
      else {latest.expected=result.version;latest.upload=null;durableWrite(path.join(outbox,queue.id+'.json'),JSON.stringify(latest));fs.unlinkSync(path.join(outbox,queue.blob))}
      state.statuses[queue.id]=latest.blob===queue.blob?'云端已保存':'离线待同步';if(state.account)state.account.used=result.used
      for(const link of Object.values(state.links))if(link.id===queue.id){link.version=result.version;link.digest=queue.digest;link.created=true}
      persist()
    }catch(error){state.statuses[queue.id]=error.status===409?'版本冲突':error.status===413?'云空间不足':error.status?'上传失败：'+error.message:'离线待同步';persist();throw error}
  }
  async function flush(){
    const errors=[]
    for(const name of fs.readdirSync(outbox).filter(n=>n.endsWith('.json'))){const q=JSON.parse(fs.readFileSync(path.join(outbox,name),'utf8'));if(locks.has(q.id))continue;const task=flushItem(q);locks.set(q.id,task);try{await task}catch(e){errors.push({id:q.id,error:e.message})}finally{locks.delete(q.id)}}
    return {errors,...status()}
  }
  async function saveContent({linkId,name,filename=name,template=false,data,kind='file',parent=null,text='',cover='',category='',description='',license='',automatic=false,queueOnly=false}){
    requireSpace();if(automatic&&!state.account.autosave)throw new Error('云文档自动保存已关闭')
    const raw=Buffer.from(data,'base64');if(raw.toString('base64')!==data)throw new Error('文件数据无效');if(kind==='knowledge'&&raw.length>10*1024*1024)throw new Error('知识文件最多 10 MiB')
    let link=state.links[linkId],node
    if(link){if(link.meta)node={id:link.id,meta:link.meta};else node=(await list()).find(n=>n.id===link.id&&!n.deleted);if(!node)link=null}
    if(!link){const id=randomUUID(),fileKey=randomBytes(32),meta={name,filename,template,text,cover,category,description,license,key:seal(root(),fileKey,`seal-key:${id}`).toString('base64')};node={id,meta};link={id,version:0,digest:null,meta,created:false,parent,kind};state.links[linkId]=link;persist()}
    const contentDigest=digest(raw);if(link.digest===contentDigest&&!fs.existsSync(path.join(outbox,link.id+'.json')))return {id:link.id,unchanged:true,...status()}
    if(!queueOnly&&locks.has(link.id)){try{await locks.get(link.id)}catch{}}
    const encrypted=seal(keyFor(node),raw,`seal-data:${node.id}`),blob=randomUUID()+'.bin'
    durableWrite(path.join(outbox,blob),encrypted)
    const queue={id:node.id,blob,expected:link.version,digest:contentDigest,automatic,upload:null,create:link.created===false?{id:node.id,kind:link.kind,parent:link.parent,meta:encodeMeta(node.id,node.meta)}:null}
    const queueFile=path.join(outbox,node.id+'.json'),old=fs.existsSync(queueFile)?JSON.parse(fs.readFileSync(queueFile,'utf8')):null
    durableWrite(queueFile,JSON.stringify(queue));state.statuses[node.id]='离线待同步';persist()
    if(old&&!locks.has(node.id)){if(old.upload){try{await request(`/v1/uploads/${old.upload}`,{method:'DELETE'})}catch{}}try{fs.unlinkSync(path.join(outbox,old.blob))}catch{}}
    if(!queueOnly)await flush();return {id:node.id,...status()}
  }
  async function save(input){
    if(typeof input.linkId!=='string'||!input.linkId)throw new Error('文件链接标识无效')
    const previous=saveLocks.get(input.linkId)||Promise.resolve(),task=previous.catch(()=>{}).then(()=>saveContent(input))
    saveLocks.set(input.linkId,task)
    try{return await task}finally{if(saveLocks.get(input.linkId)===task)saveLocks.delete(input.linkId)}
  }
  async function download(id,versionId){const nodes=await list(),node=nodes.find(n=>n.id===id);if(!node||node.deleted)throw new Error('文件不存在');const versions=await request(`/v1/nodes/${id}/versions`);const v=versionId?versions.items.find(v=>v.id===versionId):versions.items[0];if(!v)throw new Error('文件还没有已保存的版本');const raw=await request(`/v1/versions/${v.id}`,{binary:true});return {name:node.meta.filename||node.meta.name,data:unseal(keyFor(node),raw,`seal-data:${id}`).toString('base64'),version:v.version}}
  function pending(){return fs.readdirSync(outbox).filter(n=>n.endsWith('.json')).map(filename=>{const q=JSON.parse(fs.readFileSync(path.join(outbox,filename),'utf8')),link=Object.values(state.links).find(l=>l.id===q.id);return {id:q.id,name:link?.meta?.name||'待同步文件',status:state.statuses[q.id]||'离线待同步',automatic:q.automatic}})}
  function queuePath(id){if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw new Error('待同步文件标识无效');return path.join(outbox,id+'.json')}
  function pendingFile(id){requireSpace();const q=JSON.parse(fs.readFileSync(queuePath(id),'utf8')),link=Object.values(state.links).find(l=>l.id===id);if(!link?.meta)throw new Error('待同步文件密钥不可用，请保留本机记录并输入恢复密钥');return {name:link.meta.filename||link.meta.name,data:unseal(keyFor({id,meta:link.meta}),fs.readFileSync(path.join(outbox,q.blob)),`seal-data:${id}`).toString('base64')}}
  async function keepConflict(id){
    requireSpace();if(locks.has(id))throw new Error('请等待当前同步结束');const queueFile=queuePath(id),q=JSON.parse(fs.readFileSync(queueFile,'utf8')),entries=Object.entries(state.links).filter(([,l])=>l.id===id),link=entries[0]?.[1];if(!link)throw new Error('待同步文件不存在')
    const file=pendingFile(id),ext=path.extname(file.name),name=path.basename(file.name,ext)+' 冲突副本'+ext
    const result=await save({linkId:randomUUID(),name,filename:name,data:file.data,kind:link.kind,parent:link.parent,text:link.meta.text,cover:link.meta.cover,template:link.meta.template})
    const replacement=Object.values(state.links).find(l=>l.id===result.id)
    for(const [key]of entries)state.links[key]=replacement
    if(q.upload){try{await request(`/v1/uploads/${q.upload}`,{method:'DELETE'})}catch{}}
    fs.unlinkSync(queueFile);fs.unlinkSync(path.join(outbox,q.blob));delete state.statuses[id];persist();return result
  }
  function requireEmptyOutbox(){if(pending().length)throw new Error('还有待同步文件，请先同步、保留冲突副本或导出并清除待同步记录，再退出账号或切换服务器')}
  return {
    status,refresh,list,save,flush,download,request,pending,pendingFile,keepConflict,
    async discardPending(id){requireSpace();if(locks.has(id))throw new Error('请等待当前同步结束');const file=queuePath(id),q=JSON.parse(fs.readFileSync(file,'utf8'));if(q.upload){try{await request(`/v1/uploads/${q.upload}`,{method:'DELETE'})}catch(error){if(error.status!==404)throw error}}fs.unlinkSync(file);fs.unlinkSync(path.join(outbox,q.blob));delete state.statuses[id];persist();return status()},
    async linkFile(id,localPath,data,version){const node=(await list()).find(n=>n.id===id);if(!node)throw new Error('云文件不存在');state.links[localPath]={id,meta:node.meta,created:true,version,digest:digest(Buffer.from(data,'base64')),parent:node.parent,kind:node.kind};persist()},
    async replaceTemplate(id,data){const node=(await list()).find(n=>n.id===id&&!n.deleted);if(!node||!node.meta.template)throw new Error('请选择自己的演示模板');const pubs=(await request('/v1/publications')).items;if(pubs.some(p=>p.node_id===id&&['pending','approved'].includes(p.status)))throw new Error('请先撤回此模板的公开申请，再替换版本并重新审核');const linkId='template:'+id;state.links[linkId]={id,meta:node.meta,created:true,version:node.version,digest:null,parent:node.parent,kind:node.kind};persist();return save({linkId,name:node.meta.name,data,template:true})},
    async setServer(url){requireEmptyOutbox();if(state.recoveryPending)throw new Error('请先安全保存并确认恢复密钥');const target=normalizeUrl(url);const old=state.url;state.url=target;try{const c=await request('/v1/capabilities',{headers:{Authorization:''}});if(c.version!==1)throw new Error('服务器版本不兼容')}catch(e){state.url=old;throw e}epoch++;for(const req of active)req.destroy();state={url:target,token:null,account:null,owner:null,root:null,recoveryPending:null,links:{},statuses:{}};clearOutbox();persist();return status()},
    sendCode:(phone,purpose='login')=>request('/v1/auth/code',{method:'POST',data:{phone,purpose}}),
    async login(phone,code){const result=await request('/v1/auth/login',{method:'POST',data:{phone,code}});const same=state.owner===result.account.id;if(!same&&pending().length)throw new Error('本机还有原账号的待同步数据，请先登录原账号处理');epoch++;state.token=result.token;state.account=result.account;state.owner=result.account.id;if(!same){state.root=null;state.recoveryPending=null;state.links={};state.statuses={};clearOutbox()}persist();return status()},
    async logout(){requireEmptyOutbox();if(state.recoveryPending)throw new Error('请先安全保存并确认恢复密钥');try{await request('/v1/auth/logout',{method:'POST'})}finally{epoch++;for(const req of active)req.destroy();state.token=null;state.account=null;state.owner=null;state.root=null;state.links={};state.statuses={};clearOutbox();persist()}return status()},
    async enable(consent){if(!state.account)throw new Error('请先登录');if(consent!==true)throw new Error('请先同意云服务协议');if(state.account.enabled)return status();const recovery=randomBytes(32).toString('hex'),key=randomBytes(32);const envelope=seal(recoveryKey(recovery,state.account.id),key,`seal-root:${state.account.id}`).toString('base64');state.account=await request('/v1/space/enable',{method:'POST',data:{consent:true,agreementVersion:'2026-10-08',envelope}});state.root=key.toString('base64');state.recoveryPending=recovery;persist();return {...status(),recovery}},
    ackRecovery(){requireSpace();state.recoveryPending=null;persist();return status()},
    async unlock(recovery){if(!state.account?.envelope)throw new Error('请先开通云空间');const key=unseal(recoveryKey(recovery,state.account.id),Buffer.from(state.account.envelope,'base64'),`seal-root:${state.account.id}`);state.root=key.toString('base64');persist();return status()},
    async setAutosave(enabled){if(!state.account?.enabled)throw new Error('请先开通云空间');if(enabled)root();await request('/v1/space/autosave',{method:'POST',data:{enabled}});state.account.autosave=enabled;if(!enabled){epoch++;for(const req of active)req.destroy()}persist();return status()},
    async purge(code){const result=await request('/v1/space/purge',{method:'POST',data:{code,confirm:'清空并停用云空间'}});epoch++;for(const req of active)req.destroy();state.root=null;state.recoveryPending=null;state.account={...state.account,enabled:false,autosave:false,envelope:null,used:0};state.links={};state.statuses={};clearOutbox();persist();return {...result,...status()}},
    folder:(name,parent,kind='folder')=>createNode({name},kind,parent),
    async update(id,changes){const node=(await list()).find(n=>n.id===id);if(!node)throw new Error('文件不存在');const meta={...node.meta,...changes};delete meta.parent;if(changes.name&&node.kind==='file'){const ext=path.extname(node.meta.filename||node.meta.name);meta.filename=path.extname(changes.name)?changes.name:changes.name+ext}const result=await request(`/v1/nodes/${id}`,{method:'PATCH',data:{parent:changes.parent===undefined?node.parent:changes.parent,meta:encodeMeta(id,meta)}});for(const link of Object.values(state.links))if(link.id===id){link.meta=meta;link.parent=result.parent}persist();return result},
    remove:(id,destroy=false)=>request(`/v1/nodes/${id}${destroy?'/destroy':''}`,{method:'DELETE'}),
    restore:id=>request(`/v1/nodes/${id}/restore`,{method:'POST'}),
    versions:id=>request(`/v1/nodes/${id}/versions`),
    removeVersion:id=>request(`/v1/versions/${id}`,{method:'DELETE'}),
    async copy(id,parent){const node=(await list()).find(n=>n.id===id);if(!node||['folder','library'].includes(node.kind))throw new Error('请选择文件复制');const file=await download(id),ext=path.extname(file.name),filename=path.basename(file.name,ext)+' 副本'+ext;return save({linkId:randomUUID(),name:node.meta.name+' 副本',filename,data:file.data,kind:node.kind,parent:parent??node.parent,text:node.meta.text,cover:node.meta.cover,template:node.meta.template})},
    async publish(id,kind,consent,category){if(consent!==true)throw new Error('请确认公开授权');const node=(await list()).find(n=>n.id===id),file=await download(id);return request('/v1/publications',{method:'POST',data:{nodeId:id,kind,consent:true,title:node.meta.name,name:file.name,data:file.data,text:node.meta.text||'',cover:node.meta.cover||'',category:category&&category!=='all'?category:node.meta.category||'',description:[node.meta.description,node.meta.license].filter(Boolean).join(' · ')}})}
  }
}
module.exports={createService,normalizeUrl,DEFAULT_URL}
