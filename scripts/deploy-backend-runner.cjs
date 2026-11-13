// 云服务独立候选与回滚；禁止修改后台、站点配置、原数据和 previous-release。
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { switchBackend } = require('./deploy-backend-only.cjs')
const SITE = '/www/wwwroot/seal.xingmasoft.com'
const sha = data => crypto.createHash('sha256').update(data).digest('hex')
function compatibleLock(a,b) {
  function normalized(value) {
    const obj=structuredClone(value)
    if (!obj || typeof obj!=='object' || !obj.packages || !obj.packages['']) throw new Error('依赖锁文件格式无效')
    delete obj.version;delete obj.packages[''].version
    const sort=x=>Array.isArray(x)?x.map(sort):x && typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x
    return JSON.stringify(sort(obj))
  }
  return normalized(a)===normalized(b)
}
function validRelative(value) { return typeof value === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) && !value.split('/').some(x => x === '.' || x === '..') }
function files(root) {
  const output=[]
  function walk(dir, prefix='') {
    for (const name of fs.readdirSync(dir).sort()) {
      if (!prefix && name === 'node_modules') continue
      const rel=prefix ? prefix+'/'+name : name, full=path.join(dir,name), stat=fs.lstatSync(full)
      if (stat.isSymbolicLink()) throw new Error('候选包含符号链接：'+rel)
      if (stat.isDirectory()) walk(full,rel)
      else if (stat.isFile()) output.push(rel)
      else throw new Error('候选包含不支持的文件：'+rel)
    }
  }
  walk(root); return output
}
function verifyFrozen(root, manifest) {
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('候选清单为空')
  const expected=new Map()
  for (const item of manifest) {
    if (!validRelative(item.path) || item.path === 'node_modules' || item.path.startsWith('node_modules/') || !/^[a-f0-9]{64}$/.test(item.sha256) || expected.has(item.path)) throw new Error('候选清单路径或摘要无效')
    expected.set(item.path,item.sha256)
  }
  const actual=files(root)
  if (actual.some(name=>!expected.has(name)) || actual.length!==expected.size) throw new Error('候选有额外或缺失文件')
  for (const name of actual) if (sha(fs.readFileSync(path.join(root,name)))!==expected.get(name)) throw new Error('候选摘要不一致：'+name)
  return true
}
function target(root, rel) {
  if (!/^releases\/[A-Za-z0-9_.-]+$/.test(rel)) throw new Error('云服务候选路径无效')
  const result=path.join(root,rel)
  if (fs.realpathSync(result)!==result) throw new Error('云服务候选不能是符号链接')
  return result
}
function current(root) {
  const actual=fs.realpathSync(path.join(root,'current')), rel=path.relative(root,actual).replaceAll('\\','/')
  if (!/^releases\/[A-Za-z0-9_.-]+$/.test(rel)) throw new Error('当前云服务指针不在版本目录')
  return rel
}
function atomicSwitch(root, expected, next) {
  const nextPath=target(root,next)
  if (current(root)!==expected) throw new Error('云服务指针已变化')
  const temp=path.join(root,'.seal-current-'+crypto.randomUUID())
  fs.symlinkSync(nextPath,temp,'dir')
  try { if (current(root)!==expected) throw new Error('云服务指针已变化'); fs.renameSync(temp,path.join(root,'current')) }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
}
function treeDigest(root) {
  const lines=[]
  function walk(full, rel) {
    let st
    try { st=fs.lstatSync(full) } catch (e) { if (e.code==='ENOENT') { lines.push(rel+':missing');return } throw e }
    if (st.isSymbolicLink()) { lines.push(rel+':link:'+fs.readlinkSync(full));return }
    if (st.isDirectory()) { lines.push(rel+':dir'); for(const n of fs.readdirSync(full).sort())walk(path.join(full,n),rel+'/'+n);return }
    if (st.isFile()) { lines.push(rel+':file:'+sha(fs.readFileSync(full)));return }
    throw new Error('保护路径含特殊文件：'+full)
  }
  walk(root,'');return sha(lines.join('\n'))
}
const PROTECTED = [SITE+'/admin',SITE+'/seal-admin-php',SITE+'/webcurrent',SITE+'/previous-release', '/etc/systemd/system/seal-admin-php.service','/www/server/panel/vhost/nginx/seal.xingmasoft.com.conf','/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com']
function assertSystemd(props,cwd,expected,networkSame=true) {
  if(props.ActiveState!=='active'||!/^[1-9]\d*$/.test(props.MainPID||'')||props.FragmentPath!=='/etc/systemd/system/seal-cloud.service'||!networkSame)throw new Error('仅支持同网络命名空间下运行中的单机 systemd 云服务')
  if(cwd!==expected)throw new Error('systemd 云服务运行目录与 current 不一致')
}
function verifySystemd() {
  const text=execFileSync('systemctl',['show','seal-cloud','--property=MainPID','--property=ActiveState','--property=FragmentPath'],{encoding:'utf8',timeout:10000})
  const props=Object.fromEntries(text.trim().split('\n').map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)]}))
  const pid=props.MainPID
  if(!/^[1-9]\d*$/.test(pid||''))throw new Error('单机 systemd 云服务进程不可用')
  assertSystemd(props,fs.realpathSync('/proc/'+pid+'/cwd'),fs.realpathSync(SITE+'/current'),fs.readlinkSync('/proc/'+pid+'/ns/net')===fs.readlinkSync('/proc/self/ns/net'))
}
function baseline() { verifySystemd();return { current:current(SITE), protected:Object.fromEntries(PROTECTED.map(p=>[p,treeDigest(p)])) } }
function assertBaseline(expected) { if (JSON.stringify(baseline())!==JSON.stringify(expected)) throw new Error('服务器基线或受保护对象发生变化，拒绝操作') }
async function candidateVerify(dir, version) {
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'seal-backend-candidate-'))
  let cloud
  try {
    cloud=await require(path.join(dir,'index.cjs')).createCloud({directory:scratch,env:{},sms:{configured:false,send:async()=>{throw new Error('隔离环境禁止发送短信')}}})
    await new Promise((resolve,reject)=>cloud.server.listen(0,'127.0.0.1',resolve).once('error',reject))
    const port=cloud.server.address().port
    for (const uri of ['/v1/capabilities',...['windows','linux','macos','android','harmony','web'].map(p=>`/v1/updates/latest?platform=${p}&version=${encodeURIComponent(version)}`)]) {
      const r=await fetch('http://127.0.0.1:'+port+uri,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('候选接口检查失败：'+uri)
      const value=await r.json();if(uri.includes('/updates/') && typeof value.hasUpdate!=='boolean')throw new Error('候选更新接口协议无效')
    }
  } finally { if(cloud)await cloud.close();fs.rmSync(scratch,{recursive:true,force:true}) }
}
async function waitReady(check,{timeout=30000,interval=500}={}) {
  const deadline=Date.now()+timeout
  let last
  while(Date.now()<deadline) {
    const controller=new AbortController(),remaining=deadline-Date.now()
    let timer
    try {
      const limit=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('就绪探针超时'))},remaining)})
      return await Promise.race([check(controller.signal),limit])
    } catch(error) { last=error }
    finally { clearTimeout(timer);controller.abort() }
    if(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(interval,deadline-Date.now())))
  }
  throw new Error('等待云服务就绪超时：'+(last?.message||'服务不可用'))
}
async function probe(version, options={}) {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0') throw new Error('禁止关闭 TLS 验证')
  const base='https://seal.xingmasoft.com', fetcher=options.fetcher || fetch, hashes={}
  const parts=version.split('-')[0].split('.').map(Number), previous=parts[2]>0 ? `${parts[0]}.${parts[1]}.${parts[2]-1}` : version
  const updatePaths=['windows','linux','macos','android','harmony','web'].flatMap(p=>(options.recovery?[version]:[version,previous]).map(v=>`/api/v1/updates/latest?platform=${p}&version=${encodeURIComponent(v)}`))
  for (const [uri,status] of [['/',200],['/office/',200],['/share/',200],['/seal-admin/profile',401],['/api/v1/admin/overview',401],['/api/v1/capabilities',200],...updatePaths.map(p=>[p,200])]) {
    const r=await fetcher(base+uri,{redirect:'error',signal:options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000)})
    if(r.status!==status)throw new Error('公网只读探针失败：'+uri+' '+r.status)
    if(uri.includes('/updates/')){const obj=await r.json();if(typeof obj.hasUpdate!=='boolean')throw new Error('公网更新接口协议无效');hashes[uri]=sha(JSON.stringify(obj))}
    else if(uri==='/api/v1/capabilities'){const obj=await r.json();if(obj.version!==1)throw new Error('公网能力接口协议无效')}
    else {
      const bytes=Buffer.from(await r.arrayBuffer())
      if(uri==='/' && options.homeHash && sha(bytes)!==options.homeHash)throw new Error('公网后台首页与现有后台不一致')
      if(['/', '/office/', '/share/'].includes(uri) && !/text\/html/i.test(r.headers.get('content-type')||''))throw new Error('公网网页响应类型无效：'+uri)
    }
  }
  return hashes
}
async function run(payload) {
  if(payload.mode==='baseline') return {passed:true,baseline:baseline()}
  if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(payload.version || ''))throw new Error('版本号无效')
  const candidate=target(SITE,payload.candidate)
  if(payload.mode==='stage') {
    assertBaseline(payload.baseline);verifyFrozen(candidate,payload.manifest)
    const previous=target(SITE,payload.baseline.current)
    if(!compatibleLock(JSON.parse(fs.readFileSync(path.join(previous,'package-lock.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(candidate,'package-lock.json'),'utf8'))))throw new Error('依赖锁文件不一致，不能复用线上依赖')
    if(fs.existsSync(path.join(candidate,'node_modules')))throw new Error('候选依赖目录已经存在')
    fs.cpSync(path.join(previous,'node_modules'),path.join(candidate,'node_modules'),{recursive:true,errorOnExist:true,force:false,verbatimSymlinks:true})
    for(const name of files(candidate).filter(x=>x.endsWith('.cjs')))execFileSync('/usr/local/bin/node',['--check',path.join(candidate,name)],{timeout:10000})
    await candidateVerify(candidate,payload.version);verifyFrozen(candidate,payload.manifest);assertBaseline(payload.baseline)
    return {passed:true,stageOnly:true,nodeModulesHash:treeDigest(path.join(candidate,'node_modules'))}
  }
  if(payload.mode==='deploy') {
    assertBaseline(payload.baseline);verifyFrozen(candidate,payload.manifest)
    if(treeDigest(path.join(candidate,'node_modules'))!==payload.nodeModulesHash)throw new Error('候选依赖发生变化')
    await candidateVerify(candidate,payload.version)
    const homeHash=sha(fs.readFileSync(path.join(SITE,'admin/index.html'))), previousResponses=await probe(payload.version,{homeHash})
    verifyFrozen(candidate,payload.manifest)
    if(treeDigest(path.join(candidate,'node_modules'))!==payload.nodeModulesHash)throw new Error('候选依赖发生变化')
    assertBaseline(payload.baseline)
    await switchBackend(payload.baseline.current,payload.candidate,{
      current:()=>current(SITE), switchTo:next=>atomicSwitch(SITE,next===payload.candidate ? payload.baseline.current : payload.candidate,next),
      restart:()=>execFileSync('systemctl',['restart','seal-cloud'],{timeout:90000}),
      verify:async()=>waitReady(async signal=>{execFileSync('systemctl',['is-active','--quiet','seal-cloud'],{timeout:3000});const recovery=current(SITE)===payload.baseline.current;const after=await probe(payload.version,{homeHash,signal,recovery});if(Object.keys(after).some(key=>after[key]!==previousResponses[key]))throw new Error('公网更新接口结果发生意外变化');if(JSON.stringify(baseline().protected)!==JSON.stringify(payload.baseline.protected))throw new Error('受保护对象发生变化')}),
    })
    return {passed:true,previous:payload.baseline.current,current:payload.candidate}
  }
  throw new Error('部署阶段无效')
}
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>run(JSON.parse(input)).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1}))}
module.exports={verifyFrozen,atomicSwitch,treeDigest,compatibleLock,probe,assertSystemd,waitReady}
