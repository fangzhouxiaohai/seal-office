const fs=require('fs'),path=require('path'),http=require('http'),https=require('https')
const {randomBytes,randomUUID,createHash}=require('crypto')
const {seal,unseal,recoveryKey}=require('./crypto')
const {createCollaboration}=require('./collaboration')
const {createRealtime}=require('./realtime')
const documentFormats=require('../documentFormats.json')
const DEFAULT_URL='https://seal.xingmasoft.com/api'
const CHUNK=1024*1024
const digest=data=>createHash('sha256').update(data).digest('hex')
function normalizeUrl(value){
  let url;try{url=new URL(value)}catch{throw new Error('服务器地址无效')}
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw new Error('服务器须使用 HTTPS；本机测试可使用 HTTP')
  return url.toString().replace(/\/$/,'')
}
function createService({directory,safeStorage,transport,defaultUrl=DEFAULT_URL,mergeUpdates,deferUnlock=false}={}){
  const secureFile=path.join(directory,'cloud.secure'),outbox=path.join(directory,'cloud-outbox')
  fs.mkdirSync(outbox,{recursive:true})
  let state={url:normalizeUrl(defaultUrl),token:null,account:null,owner:null,root:null,recoveryPending:null,links:{},statuses:{}}
  const locks=new Map(),saveLocks=new Map(),active=new Set();let epoch=0
  function durableWrite(filename,data){const temp=filename+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temp,filename)}
  // macOS 仅在用户恢复云会话后读取加密凭据；本机文档和被动状态检查不访问钥匙串。
  let sessionLoaded=!deferUnlock||!fs.existsSync(secureFile)
  function restoreSession(){
    if(fs.existsSync(secureFile)){
      if(!safeStorage?.isEncryptionAvailable())throw new Error('系统安全存储不可用，无法读取云端会话')
      try{state={...state,...JSON.parse(safeStorage.decryptString(fs.readFileSync(secureFile)))}}catch{throw new Error('无法解锁本机云会话，原记录已保留；请允许钥匙串访问后重试')}
    }
    state.owner=state.owner||state.account?.id||null
    sessionLoaded=true
    return status()
  }
  if(sessionLoaded)restoreSession()
  const referencedBlobs=new Set(fs.readdirSync(outbox).filter(n=>n.endsWith('.json')).map(n=>{try{return JSON.parse(fs.readFileSync(path.join(outbox,n),'utf8')).blob}catch{throw new Error('待同步记录损坏，请先备份本机数据')}}))
  for(const filename of fs.readdirSync(outbox))if(filename.endsWith('.bin')&&!referencedBlobs.has(filename))fs.unlinkSync(path.join(outbox,filename))
  function persist(){
    if(!sessionLoaded)throw new Error('请先恢复本机云会话，原加密记录保持不变')
    if(!safeStorage?.isEncryptionAvailable())throw new Error('系统安全存储不可用，无法保存云端密钥')
    durableWrite(secureFile,safeStorage.encryptString(JSON.stringify(state)))
  }
  const root=()=>{if(!state.root)throw new Error('云空间密钥尚未就绪，请重新连接云空间');return Buffer.from(state.root,'base64')}
  function spaceReady() { return Boolean(state.root && state.account?.enabled && (!state.account.keyRevision || state.account.keyRevision === state.keyRevision)) }
  function status(){return {sessionLocked:!sessionLoaded,url:state.url,account:state.account,unlocked:spaceReady(),statuses:{...state.statuses},pending:fs.readdirSync(outbox).filter(n=>n.endsWith('.json')).length,deletionPending:Boolean(state.deletionReceipt),...(state.account&&state.recoveryPending?{recoveryPending:state.recoveryPending}:{})}}
  async function request(route,{method='GET',data,binary=false,headers={},timeout=30000}={}){
    const url=new URL(state.url+route),payload=Buffer.isBuffer(data)?data:data===undefined?null:Buffer.from(JSON.stringify(data))
    const head={...(state.token?{Authorization:'Bearer '+state.token}:{}),...(payload?{'Content-Type':Buffer.isBuffer(data)?'application/octet-stream':'application/json','Content-Length':payload.length}:{}),...headers}
    if(transport){
      const controller=new AbortController(),req={destroy:()=>controller.abort()};active.add(req)
      try{return await transport(url.toString(),{method,headers:head,body:payload,binary,signal:controller.signal,timeout})}
      catch(error){if(error.status===401&&state.token&&head.Authorization==='Bearer '+state.token){state.token=null;state.root=null;state.account=null;epoch++;for(const pending of active)pending.destroy();persist()}throw error}
      finally{active.delete(req)}
    }
    return new Promise((resolve,reject)=>{
      const req=(url.protocol==='https:'?https:http).request(url,{method,headers:head},res=>{
        const chunks=[];let size=0
        res.on('data',chunk=>{size+=chunk.length;if(size>310000000){req.destroy(new Error('服务器响应过大'));return}chunks.push(chunk)})
        res.on('error',reject);res.on('end',()=>{const raw=Buffer.concat(chunks);let result;try{result=JSON.parse(raw.toString())}catch{result=null}
          if(res.statusCode<200||res.statusCode>=300){const error=Object.assign(new Error(result?.error||'云服务请求失败'),{status:res.statusCode,data:result});if(res.statusCode===401&&state.token&&head.Authorization==='Bearer '+state.token){state.token=null;state.root=null;state.account=null;epoch++;persist()}reject(error)}else if(binary)resolve(raw);else if(result)resolve(result);else reject(new Error('服务器响应格式不正确'))
        })
      });active.add(req);req.on('close',()=>active.delete(req));req.on('error',reject);req.setTimeout(timeout,()=>req.destroy(new Error('云端连接超时，已保留本地待同步数据')));if(payload)req.write(payload);req.end()
    })
  }
  const requireSpace=()=>{if(state.deletionReceipt)throw new Error('账号正在确认注销，请先查看注销进度');if(!state.token||!state.account?.enabled)throw new Error('请先登录并开通云空间');if(!spaceReady())throw new Error('请重新连接云空间以同步密钥')}
  const encodeMeta=(id,meta)=>seal(root(),Buffer.from(JSON.stringify(meta)),`seal-meta:${id}`).toString('base64')
  const decodeMeta=n=>({...n,meta:JSON.parse(unseal(root(),Buffer.from(n.meta,'base64'),`seal-meta:${n.id}`).toString())})
  function guardAccount(expected, started) {
    if (epoch !== started || state.account?.id !== expected.id) throw new Error('当前账号已切换，请重试')
  }
  function cacheSpaceKey(key, revision) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key) || !Number.isSafeInteger(revision) || revision <= 0) throw new Error('云空间密钥响应无效')
    if (state.root && state.root !== key && pending().length) throw new Error('还有使用原密钥的待同步文件，请先导出本机副本')
    if (state.root && state.root !== key) {
      epoch++; for (const req of active) req.destroy()
      state.links = {}; state.statuses = {}; state.shareKeys = {}
    }
    state.root = key
    state.keyRevision = revision
    state.account = { ...state.account, keyRevision: revision }
    state.recoveryPending = null
    persist()
  }
  async function syncSpaceKey(recovery) {
    const expected = state.account, started = epoch
    if (!expected?.enabled || expected.keyRecovery !== 1) return
    if (!expected.keyRevision && !state.root) return
    if (expected.keyRevision && state.root && expected.keyRevision === state.keyRevision) return
    if (!expected.keyRevision) {
      const account = await request('/v1/space/key', { method:'POST', data:{ key:state.root, envelope:expected.envelope, ...(recovery ? { recovery } : {}) } })
      guardAccount(expected, started)
      state.account = account
    }
    const { key, revision } = await request('/v1/space/key')
    guardAccount(expected, started)
    // A concurrent refresh may already have cached a newer revision.
    if (!state.root || (state.keyRevision ?? 0) <= revision) cacheSpaceKey(key, revision)
  }
  async function refresh() {
    if (!state.token) return status()
    const started = epoch
    const account = await request('/v1/me')
    guardAccount(account, started)
    if (state.account?.autosave && !account.autosave) { epoch++; for (const req of active) req.destroy() }
    state.account = account
    if (!account.enabled) {
      if (pending().length) throw new Error('云空间已停用，本机待同步文件仍可导出')
      state.root = null; state.keyRevision = 0; state.recoveryPending = null; state.links = {}; state.statuses = {}
    } else {
      await syncSpaceKey(state.recoveryPending)
    }
    persist()
    return status()
  }
  async function requireAIIdentity(){
    const required=(status=401,message='使用 AI 功能前请先登录并完成手机号验证')=>Object.assign(new Error(message),{status,code:'AI_IDENTITY_REQUIRED'})
    if(!state.token||!state.account||state.deletionReceipt)throw required()
    const token=state.token,accountId=state.account.id,startedEpoch=epoch
    let identity
    try{identity=await request('/v1/ai/identity')}
    catch(error){if(error.status===401||error.status===403)throw required(error.status,error.message);throw error}
    if(startedEpoch!==epoch||token!==state.token||accountId!==state.account?.id)throw required()
    if(identity?.verified!==true||identity.accountId!==accountId||identity.method!=='phone')throw required(403,'请先使用手机号短信验证登录，再使用 AI 功能')
    return {accountId,verified:true,method:'phone'}
  }
  async function list(){requireSpace();const result=await request('/v1/nodes');return result.items.map(item=>decodeMeta({...item,parent:item.parent??null}))}
  async function createNode(meta,kind='file',parent=null){
    requireSpace();const id=randomUUID(),fileKey=randomBytes(32)
    const details={...meta,key:seal(root(),fileKey,`seal-key:${id}`).toString('base64')}
    const item=await request('/v1/nodes',{method:'POST',data:{id,kind,parent,meta:encodeMeta(id,details)}});return {...item,meta:details}
  }
  const keyFor=n=>unseal(root(),Buffer.from(n.meta.key,'base64'),`seal-key:${n.id}`)
  const clearOutbox=()=>{for(const name of fs.readdirSync(outbox))fs.unlinkSync(path.join(outbox,name))}
  async function flushItem(queue){
    const localEpoch=epoch;if(!spaceReady()||!state.token)return
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
  async function 丢弃已删除节点的记录(linkId){
    // 云端文件被删除后，旧链接（节点标识、加密密钥与待同步队列）都无法再上传；
    // 清掉它们才能按新文件重新加密上传，本地内容不会一直卡在“上传失败”。
    const link=state.links[linkId]
    if(!link)return
    delete state.links[linkId]
    const queueFile=path.join(outbox,link.id+'.json')
    try{
      const q=JSON.parse(fs.readFileSync(queueFile,'utf8'))
      if(q.upload){try{await request(`/v1/uploads/${q.upload}`,{method:'DELETE'})}catch{}}
      fs.unlinkSync(queueFile)
      fs.unlinkSync(path.join(outbox,q.blob))
    }catch(error){if(error.code!=='ENOENT')throw error}
    delete state.statuses[link.id]
    persist()
  }
  async function forget(linkId){
    // 供客户端在“云端文件已被删除”后清除旧节点映射，下一次保存会按新文件重新上传。
    if(typeof linkId!=='string'||!linkId)throw new Error('文件链接标识无效')
    await 丢弃已删除节点的记录(linkId)
    return status()
  }
  async function save(input){
    if(typeof input.linkId!=='string'||!input.linkId)throw new Error('文件链接标识无效')
    const 执行=async()=>{const previous=saveLocks.get(input.linkId)||Promise.resolve(),task=previous.catch(()=>{}).then(()=>saveContent(input));saveLocks.set(input.linkId,task);try{return await task}finally{if(saveLocks.get(input.linkId)===task)saveLocks.delete(input.linkId)}}
    try{return await 执行()}
    catch(error){
      // 云端文件已不存在（被删除或从回收站清空）时，按新文件重新上传一次。
      if(error&&error.status===404){await 丢弃已删除节点的记录(input.linkId);return 执行()}
      throw error
    }
  }
  async function download(id,versionId){const nodes=await list(),node=nodes.find(n=>n.id===id);if(!node||node.deleted)throw new Error('文件不存在');const versions=await request(`/v1/nodes/${id}/versions`);const v=versionId?versions.items.find(v=>v.id===versionId):versions.items[0];if(!v)throw new Error('文件还没有已保存的版本');const raw=await request(`/v1/versions/${v.id}`,{binary:true});return {name:node.meta.filename||node.meta.name,data:unseal(keyFor(node),raw,`seal-data:${id}`).toString('base64'),version:v.version}}
  function pending(){return fs.readdirSync(outbox).filter(n=>n.endsWith('.json')).map(filename=>{const q=JSON.parse(fs.readFileSync(path.join(outbox,filename),'utf8')),link=Object.values(state.links).find(l=>l.id===q.id);return {id:q.id,name:link?.meta?.name||'待同步文件',status:state.statuses[q.id]||'离线待同步',automatic:q.automatic}})}
  function queuePath(id){if(typeof id!=='string'||!/^[0-9a-f-]{36}$/.test(id))throw new Error('待同步文件标识无效');return path.join(outbox,id+'.json')}
  function pendingFile(id){const q=JSON.parse(fs.readFileSync(queuePath(id),'utf8')),link=Object.values(state.links).find(l=>l.id===id);if(!link?.meta||!state.root)throw new Error('待同步文件密钥不可用，请保留本机记录并恢复云空间');return {name:link.meta.filename||link.meta.name,data:unseal(keyFor({id,meta:link.meta}),fs.readFileSync(path.join(outbox,q.blob)),`seal-data:${id}`).toString('base64')}}
  async function keepConflict(id){
    requireSpace();if(locks.has(id))throw new Error('请等待当前同步结束');const queueFile=queuePath(id),q=JSON.parse(fs.readFileSync(queueFile,'utf8')),entries=Object.entries(state.links).filter(([,l])=>l.id===id),link=entries[0]?.[1];if(!link)throw new Error('待同步文件不存在')
    const file=pendingFile(id),ext=path.extname(file.name),name=path.basename(file.name,ext)+' 冲突副本'+ext
    const result=await save({linkId:randomUUID(),name,filename:name,data:file.data,kind:link.kind,parent:link.parent,text:link.meta.text,cover:link.meta.cover,template:link.meta.template})
    const replacement=Object.values(state.links).find(l=>l.id===result.id)
    for(const [key]of entries)state.links[key]=replacement
    if(q.upload){try{await request(`/v1/uploads/${q.upload}`,{method:'DELETE'})}catch{}}
    fs.unlinkSync(queueFile);fs.unlinkSync(path.join(outbox,q.blob));delete state.statuses[id];persist();return result
  }
  function requireEmptyOutbox(){if(state.deletionReceipt)throw new Error('请先查看并完成注销进度');if(pending().length)throw new Error('还有待同步文件，请先同步、保留冲突副本或导出并清除待同步记录，再退出账号或切换服务器')}
  const collaboration=createCollaboration({request,requireSpace,root,getState:()=>state,persist,list,keyFor,invalidateSession:()=>{epoch++;for(const req of active)req.destroy();state.token=null;state.root=null;state.account=null;persist()}})
  const realtime=createRealtime({directory,request,root,getState:()=>state,requireSpace,resolve:collaboration.resolveRealtime,persist,mergeUpdates,list})
  async function authenticate(route, credentials){
    state.deviceId||=randomUUID()
    const result=await request(route,{method:'POST',data:{...credentials,deviceId:state.deviceId,deviceName:'海豹办公设备'}})
    const same=state.owner===result.account.id
    if(!same&&pending().length){try{await request('/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+result.token}})}catch{}throw new Error('本机还有原账号的待同步数据，请先登录原账号处理')}
    const legacyChanged = same && state.account?.envelope && result.account.envelope !== state.account.envelope && !result.account.keyRevision
    if (legacyChanged && pending().length) throw new Error('原云空间已变化，请先导出待同步文件')
    epoch++;state.token=result.token;state.account=result.account;state.owner=result.account.id
    if(legacyChanged){state.root=null;state.keyRevision=0;state.recoveryPending=null;state.links={};state.statuses={};state.shareKeys={}}
    if(!same){state.root=null;state.keyRevision=0;state.recoveryPending=null;state.links={};state.statuses={};state.shareKeys={};clearOutbox()}
    persist()
    await syncSpaceKey(state.recoveryPending).catch(() => {})
    return status()
  }
  function finishAccountDeletion(){
    if(state.owner&&state.owner!==state.deletionOwner||state.account&&state.account.id!==state.deletionOwner)return
    epoch++;for(const req of active)req.destroy();state.token=null;state.account=null;state.owner=null;state.root=null;state.recoveryPending=null;state.links={};state.statuses={};state.shareKeys={};clearOutbox();persist()
  }
  async function rejectStaleRealtimeBinary(id){
    const caps=await request('/v1/capabilities',{headers:{Authorization:''}})
    if(caps.realtime!==1)return
    const binding=await realtime.realtimeNodeBinding({id})
    if(binding&&(await realtime.realtimeSnapshot({binding})).initialized)throw new Error('此文件正在实时共同编辑，请先下载最新协作文件并上传为独立副本，再复制或公开发布；原实时内容保持不变')
  }
  const service={
    resumeSession:()=>sessionLoaded?status():restoreSession(),
    ...collaboration,
    ...realtime,
    // 分享链接模块需要解封文件密钥。keyFor 接收节点对象（依赖 meta.key），
    // 对外暴露前统一校验，避免传入标识字符串时静默算出错误密钥。
    keyFor(node){if(!node||typeof node!=='object'||!node.id||!node.meta||!node.meta.key)throw new Error('云文件密钥不可用，请重新同步后再试');return keyFor(node)},
    async conversionCapabilities(){if(!state.token||!state.account)throw new Error('请先登录云账号');if(!state.account.enabled)throw new Error('请先开通云空间');const c=await request('/v1/capabilities',{headers:{Authorization:''}});if(c.accountConversion!==1)throw new Error('当前云服务器尚未支持账号文档转换，请联系维护人员升级');return request('/v1/conversion/capabilities')},
    async convertDocument(input){if(!state.token||!state.account)throw new Error('请先登录云账号');if(!state.account.enabled)throw new Error('请先开通云空间');if(!input||input.consent!==true)throw new Error('请确认本次文档正文上传转换授权');const source=documentFormats.find(f=>f.extension===input.inputFormat),target=documentFormats.find(f=>f.extension===input.outputFormat),standard={word:'docx',table:'xlsx',ppt:'pptx'};if(!standard[input.type]||!source||!target||(source.type!==input.type&&source.extension!=='xml')||(target.type!==input.type&&target.extension!=='pdf')||target.readOnlySource||!target.outputFilter&&target.extension!==standard[input.type]&&target.extension!=='pdf'||['xml','mhtml','prn'].includes(target.outputFilter))throw new Error('转换格式不受支持');if(typeof input.data!=='string'||input.data.length>Math.ceil(20*1024*1024/3)*4)throw new Error('文档转换最多支持20 MiB');const raw=Buffer.from(input.data,'base64');if(!raw.length||raw.length>20*1024*1024||raw.toString('base64')!==input.data)throw new Error('转换文件数据无效或超过20 MiB');const c=await request('/v1/capabilities',{headers:{Authorization:''}});if(c.accountConversion!==1)throw new Error('当前云服务器尚未支持账号文档转换，请联系维护人员升级');return request('/v1/conversion/convert',{method:'POST',data:{inputFormat:input.inputFormat,outputFormat:input.outputFormat,type:input.type,data:input.data,consent:true},timeout:110000})},
    status,refresh,requireAIIdentity,list,save,flush,forget,download,request,pending,pendingFile,keepConflict,
    async discardPending(id){requireSpace();if(locks.has(id))throw new Error('请等待当前同步结束');const file=queuePath(id),q=JSON.parse(fs.readFileSync(file,'utf8'));if(q.upload){try{await request(`/v1/uploads/${q.upload}`,{method:'DELETE'})}catch(error){if(error.status!==404)throw error}}fs.unlinkSync(file);fs.unlinkSync(path.join(outbox,q.blob));delete state.statuses[id];persist();return status()},
    async linkFile(id,localPath,data,version){const node=(await list()).find(n=>n.id===id);if(!node)throw new Error('云文件不存在');state.links[localPath]={id,meta:node.meta,created:true,version,digest:digest(Buffer.from(data,'base64')),parent:node.parent,kind:node.kind};persist()},
    async replaceTemplate(id,data){const node=(await list()).find(n=>n.id===id&&!n.deleted);if(!node||!node.meta.template)throw new Error('请选择自己的演示模板');const pubs=(await request('/v1/publications')).items;if(pubs.some(p=>p.node_id===id&&['pending','approved'].includes(p.status)))throw new Error('请先撤回此模板的公开申请，再替换版本并重新审核');const linkId='template:'+id;state.links[linkId]={id,meta:node.meta,created:true,version:node.version,digest:null,parent:node.parent,kind:node.kind};persist();return save({linkId,name:node.meta.name,data,template:true})},
    async setServer(url){requireEmptyOutbox();if(state.recoveryPending)throw new Error('请先安全保存并确认恢复密钥');const target=normalizeUrl(url);const old=state.url;state.url=target;try{const c=await request('/v1/capabilities',{headers:{Authorization:''}});if(c.version!==1)throw new Error('服务器版本不兼容')}catch(e){state.url=old;throw e}epoch++;for(const req of active)req.destroy();state={url:target,token:null,account:null,owner:null,root:null,recoveryPending:null,links:{},statuses:{}};clearOutbox();persist();return status()},
    sendCode:(phone,purpose='login')=>request('/v1/auth/code',{method:'POST',data:{phone,purpose}}),
    login:(phone,code)=>authenticate('/v1/auth/login',{phone,code}),
    loginPassword:(phone,password)=>authenticate('/v1/auth/password-login',{phone,password}),
    async setPassword(input){const result=await request('/v1/auth/password',{method:'POST',data:input});state.account=result.account;persist();return status()},
    async deleteAccount(input){
      if(state.deletionReceipt)throw new Error('还有未完成的注销清理，请先查看注销进度')
      requireEmptyOutbox();if(saveLocks.size||locks.size)throw new Error('请等待当前文件同步结束，再注销账号')
      const receipt=randomUUID()+'.'+randomBytes(32).toString('base64url')
      state.deletionReceipt=receipt;state.deletionOwner=state.account?.id;persist()
      try{await request('/v1/auth/delete-account',{method:'POST',data:{code:input.code,confirm:input.confirm,receipt}})}
      catch(error){if(error.status&&error.status>=400&&error.status<500){state.deletionReceipt=null;state.deletionOwner=null;persist()}throw error}
      finishAccountDeletion();return status()
    },
    async deletionStatus(){
      if(!state.deletionReceipt)return {deleted:true,pending:false}
      let result;try{result=await request('/v1/auth/deletion-status',{method:'POST',data:{receipt:state.deletionReceipt},headers:{Authorization:''}})}catch(error){if(error.status===404){state.deletionReceipt=null;state.deletionOwner=null;persist();throw new Error('注销请求尚未被服务器接受，请重新验证并提交')}throw error}
      finishAccountDeletion();if(result.deleted){state.deletionReceipt=null;state.deletionOwner=null;persist()}return result
    },
    async logout(){requireEmptyOutbox();if(state.recoveryPending)throw new Error('请先安全保存并确认恢复密钥');try{await request('/v1/auth/logout',{method:'POST'})}finally{epoch++;for(const req of active)req.destroy();state.token=null;state.account=null;state.owner=null;state.root=null;state.links={};state.statuses={};clearOutbox();persist()}return status()},
    async enable(consent) {
      const expected = state.account, started = epoch
      if (!expected) throw new Error('请先登录')
      if (consent !== true) throw new Error('请先同意云服务协议')
      if (expected.enabled) return refresh()
      if (expected.keyRecovery === 1) {
        const account = await request('/v1/space/enable', { method:'POST', data:{ consent:true, agreementVersion:expected.agreementVersion } })
        guardAccount(expected, started)
        state.account = account
        await syncSpaceKey()
        return status()
      }
      const recovery = randomBytes(32).toString('hex'), key = randomBytes(32)
      const envelope = seal(recoveryKey(recovery, expected.id), key, `seal-root:${expected.id}`).toString('base64')
      const account = await request('/v1/space/enable', { method:'POST', data:{ consent:true, agreementVersion:'2026-10-08', envelope } })
      guardAccount(expected, started)
      state.account = account
      if (account.envelope !== envelope) return refresh()
      state.root = key.toString('base64')
      state.recoveryPending = recovery
      persist()
      return { ...status(), recovery }
    },
    ackRecovery(){requireSpace();state.recoveryPending=null;persist();return status()},
    async unlock(recovery) {
      if (state.account?.keyRevision) return refresh()
      if (!state.account?.envelope) throw new Error('请先开通云空间')
      const key = unseal(recoveryKey(recovery, state.account.id), Buffer.from(state.account.envelope, 'base64'), `seal-root:${state.account.id}`)
      state.root = key.toString('base64')
      persist()
      await syncSpaceKey(recovery)
      return status()
    },
    async resetSpaceKey(code) {
      const expected = state.account, started = epoch
      if (!expected?.enabled || !expected.keyRevision) throw new Error('请先完成云空间密钥迁移')
      const { key, revision } = await request('/v1/space/key/reset', { method:'POST', data:{ code } })
      guardAccount(expected, started)
      cacheSpaceKey(key, revision)
      return status()
    },
    async setAutosave(enabled){if(!state.account?.enabled)throw new Error('请先开通云空间');if(enabled)root();await request('/v1/space/autosave',{method:'POST',data:{enabled}});state.account.autosave=enabled;if(!enabled){epoch++;for(const req of active)req.destroy()}persist();return status()},
    async purge(code){const result=await request('/v1/space/purge',{method:'POST',data:{code,confirm:'清空并停用云空间'}});epoch++;for(const req of active)req.destroy();state.root=null;state.recoveryPending=null;state.account={...state.account,enabled:false,autosave:false,envelope:null,used:0};state.links={};state.statuses={};clearOutbox();persist();return {...result,...status()}},
    folder:(name,parent,kind='folder')=>createNode({name},kind,parent),
    async update(id,changes){const node=(await list()).find(n=>n.id===id);if(!node)throw new Error('文件不存在');const meta={...node.meta,...changes};delete meta.parent;if(changes.name&&node.kind==='file'){const ext=path.extname(node.meta.filename||node.meta.name);meta.filename=/^\.(?:sealmind|sealflow)$/i.test(ext)?changes.name.replace(/\.(?:sealmind|sealflow)$/i,'')+ext:path.extname(changes.name)?changes.name:changes.name+ext}const result=await request(`/v1/nodes/${id}`,{method:'PATCH',data:{parent:changes.parent===undefined?node.parent:changes.parent,meta:encodeMeta(id,meta)}});for(const link of Object.values(state.links))if(link.id===id){link.meta=meta;link.parent=result.parent}persist();return result},
    // 批量移动：服务端整批事务，只改父级；部分项无法移动时整批不写，并逐项说明原因
    async move(ids,parent=null){requireSpace();if(!Array.isArray(ids)||!ids.length)throw new Error('请选择要移动的文件或文件夹')
      try{const result=await request('/v1/nodes/move',{method:'POST',data:{ids,parent:parent??null}});for(const item of result.items)for(const link of Object.values(state.links))if(link.id===item.id)link.parent=item.parent;persist();return result}
      catch(error){const failures=error?.data?.failures;if(!Array.isArray(failures)||failures.length<2)throw error;const names=new Map((await list().catch(()=>[])).map(n=>[n.id,n.meta?.name||n.id]));throw Object.assign(new Error(error.message+'：'+failures.map(f=>`${names.get(f.id)||String(f.id).slice(0,8)}（${f.error}）`).join('；')),{status:error.status})}},
    remove:(id,destroy=false)=>request(`/v1/nodes/${id}${destroy?'/destroy':''}`,{method:'DELETE'}),
    restore:id=>request(`/v1/nodes/${id}/restore`,{method:'POST'}),
    versions:id=>request(`/v1/nodes/${id}/versions`),
    removeVersion:id=>request(`/v1/versions/${id}`,{method:'DELETE'}),
    async copy(id,parent){await rejectStaleRealtimeBinary(id);const node=(await list()).find(n=>n.id===id);if(!node||['folder','library'].includes(node.kind))throw new Error('请选择文件复制');const file=await download(id),ext=path.extname(file.name),filename=path.basename(file.name,ext)+' 副本'+ext;return save({linkId:randomUUID(),name:node.meta.name+' 副本',filename,data:file.data,kind:node.kind,parent:parent??node.parent,text:node.meta.text,cover:node.meta.cover,template:node.meta.template})},
    async publish(id,kind,consent,category){if(consent!==true)throw new Error('请确认公开授权');await rejectStaleRealtimeBinary(id);const node=(await list()).find(n=>n.id===id),file=await download(id);return request('/v1/publications',{method:'POST',data:{nodeId:id,kind,consent:true,title:node.meta.name,name:file.name,data:file.data,text:node.meta.text||'',cover:node.meta.cover||'',category:category&&category!=='all'?category:node.meta.category||'',description:[node.meta.description,node.meta.license].filter(Boolean).join(' · ')}})}
  }
  // 未恢复时禁止任何私有操作覆盖加密记录，也不因后台轮询触发系统授权。
  for(const [name,operation] of Object.entries(service)){
    if(['status','resumeSession','realtimeCapabilities'].includes(name)||typeof operation!=='function')continue
    service[name]=function(...args){
      if(!sessionLoaded){
        if(name==='request'&&(args[1]?.method??'GET')==='GET'&&/^\/v1\/(?:capabilities$|updates\/latest(?:\?|$)|public(?:\/|\?|$))/.test(args[0]))return operation.apply(service,args)
        if(name==='refresh'||name==='flush')return Promise.resolve(name==='flush'?{errors:[],...status()}:status())
        throw Object.assign(new Error('请先在账号入口恢复本机云会话'),{code:'CLOUD_SESSION_LOCKED'})
      }
      return operation.apply(service,args)
    }
  }
  return service
}
module.exports={createService,normalizeUrl,DEFAULT_URL}
