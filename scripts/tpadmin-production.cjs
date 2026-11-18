// 后台生产切换状态机。仅导出函数；未接入真实系统命令时不会访问服务器。
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const exists = name => { try { fs.lstatSync(name); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
const digest = data => crypto.createHash('sha256').update(data).digest('hex')

function snapshot(name) {
  if (!exists(name)) return null
  const entries=[]
  function walk(file,relative) {
    const stat=fs.lstatSync(file)
    if(stat.isSymbolicLink())throw new Error('部署目标包含符号链接，拒绝覆盖')
    if(stat.isDirectory()){entries.push([relative,'dir',stat.mode&0o777]);for(const child of fs.readdirSync(file).sort())walk(path.join(file,child),relative?relative+'/'+child:child)}
    else if(stat.isFile())entries.push([relative,'file',stat.mode&0o777,digest(fs.readFileSync(file))])
    else throw new Error('部署目标包含非普通文件')
  }
  walk(name,'')
  return digest(JSON.stringify(entries))
}

function mergeLegacyAssets(oldRoot,newRoot) {
  if(!path.isAbsolute(oldRoot)||!path.isAbsolute(newRoot)||oldRoot===newRoot)throw new Error('旧资源路径无效')
  const files=[]
  function walk(dir,relative='') {
    const stat=fs.lstatSync(dir)
    if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('旧资源目录包含符号链接或无效目录')
    for(const entry of fs.readdirSync(dir).sort()){
      const rel=relative?relative+'/'+entry:entry,src=path.join(dir,entry),st=fs.lstatSync(src)
      if(st.isSymbolicLink())throw new Error('旧资源不允许符号链接')
      if(st.isDirectory())walk(src,rel)
      else if(st.isFile())files.push({src,rel,hash:digest(fs.readFileSync(src))})
      else throw new Error('旧资源存在无效文件')
    }
  }
  if(!exists(oldRoot))return {copied:0,unchanged:0}
  if(!exists(newRoot))fs.mkdirSync(newRoot,{recursive:true})
  if(fs.lstatSync(newRoot).isSymbolicLink()||!fs.lstatSync(newRoot).isDirectory())throw new Error('新资源目录无效')
  walk(oldRoot)
  let copied=0,unchanged=0
  for(const item of files){const target=path.join(newRoot,...item.rel.split('/'));let current=newRoot;for(const part of item.rel.split('/').slice(0,-1)){current=path.join(current,part);if(exists(current)&&(fs.lstatSync(current).isSymbolicLink()||!fs.lstatSync(current).isDirectory()))throw new Error('新资源路径无效')};if(exists(target)){const st=fs.lstatSync(target);if(st.isSymbolicLink()||!st.isFile()||digest(fs.readFileSync(target))!==item.hash)throw new Error('旧资源与新资源存在同名冲突：'+item.rel);unchanged++}}
  for(const item of files){const target=path.join(newRoot,...item.rel.split('/'));if(!exists(target)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(item.src,target,fs.constants.COPYFILE_EXCL);copied++}}
  return {copied,unchanged}
}

function assertLegacyAssets(oldRoot,newRoot) {
  if(!exists(oldRoot))return 0
  if(!exists(newRoot))throw new Error('新资源目录缺失')
  let count=0
  function walk(src,target) {
    const before=fs.lstatSync(src)
    if(before.isSymbolicLink())throw new Error('旧资源不允许符号链接')
    if(!exists(target))throw new Error('旧资源在候选中缺失')
    const after=fs.lstatSync(target)
    if(after.isSymbolicLink())throw new Error('新资源不允许符号链接')
    if(before.isDirectory()){
      if(!after.isDirectory())throw new Error('旧资源路径冲突')
      for(const name of fs.readdirSync(src))walk(path.join(src,name),path.join(target,name))
    }else if(before.isFile()){
      if(!after.isFile()||digest(fs.readFileSync(src))!==digest(fs.readFileSync(target)))throw new Error('旧资源内容冲突')
      count++
    }else throw new Error('旧资源存在无效文件')
  }
  walk(oldRoot,newRoot);return count
}

function deploy({items,id,baseline,frozen,ops,hook=()=>{}}) {
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('部署标识无效')
  const order=['php','fpm','unit','nginx','admin'],seen=new Set(),records=[]
  for(const name of order){
    const item=items?.[name]
    if(!item||!path.isAbsolute(item.active)||!path.isAbsolute(item.candidate))throw new Error('目标路径必须为绝对路径')
    const active=path.resolve(item.active),candidate=path.resolve(item.candidate),previous=active+'.previous-'+id
    if(path.dirname(active)!==path.dirname(candidate))throw new Error('候选和正式路径必须位于同一目录')
    fs.realpathSync(path.dirname(active))
    for(const value of [active,candidate,previous]){const key=process.platform==='win32'?value.toLowerCase():value;if(seen.has(key))throw new Error('部署路径重复');seen.add(key)}
    if(exists(previous))throw new Error('已有部署备份，不能覆盖')
    if(!exists(candidate))throw new Error('部署候选不存在')
    for(const [p,required] of [[candidate,true],[active,false]])if(exists(p)){const st=fs.lstatSync(p);if(st.isSymbolicLink()||(item.directory?!st.isDirectory():!st.isFile()))throw new Error('部署路径类型不匹配') }else if(required)throw new Error('部署候选不存在')
    const current=snapshot(active)
    if(!baseline||!Object.hasOwn(baseline,name)||baseline[name]!==current)throw new Error('正式目标在预检后发生变更')
    if(!frozen||!Object.hasOwn(frozen,name)||frozen[name]!==snapshot(candidate))throw new Error('部署候选与冻结清单不一致')
    records.push({name,active,candidate,previous,hadOriginal:exists(active),backed:false,installed:false})
  }
  for(const method of ['state','reloadUnits','start','stop','enable','disable','nginxTest','nginxReload','privateProbe','publicProbe'])if(typeof ops?.[method]!=='function')throw new Error('缺少部署操作：'+method)
  const before=ops.state();if(typeof before?.active!=='boolean'||typeof before?.enabled!=='boolean')throw new Error('无法读取专用服务原状态')
  let touchedService=false,nginxTouched=false,enableAttempted=false
  const change=name=>{const r=records.find(item=>item.name===name);if(r.hadOriginal){fs.renameSync(r.active,r.previous);r.backed=true}fs.renameSync(r.candidate,r.active);r.installed=true;hook(name)}
  const run=(name,method)=>{ops[method]();hook(name)}
  try {
    if(before.active){ops.stop();touchedService=true}
    change('php');change('fpm');change('unit');touchedService=true
    run('units-reloaded','reloadUnits');run('started','start');run('private-probed','privateProbe')
    nginxTouched=true;change('nginx');run('nginx-tested','nginxTest');run('nginx-reloaded','nginxReload')
    change('admin');run('public-probed','publicProbe');enableAttempted=true;run('enabled','enable')
    return {passed:true,records,before}
  } catch(error) {
    const failures=[];const attempt=(label,fn)=>{try{fn()}catch(e){failures.push(label+': '+e.message)}}
    if(touchedService)attempt('停止候选服务',()=>ops.stop())
    if(enableAttempted&&!before.enabled)attempt('取消候选服务开机启动',()=>ops.disable())
    for(const r of [...records].reverse())attempt('恢复 '+r.name,()=>{
      if(r.installed){if(!exists(r.active)||exists(r.candidate))throw new Error('候选状态变化，拒绝覆盖');fs.renameSync(r.active,r.candidate);r.installed=false}
      if(r.backed){if(exists(r.active)||!exists(r.previous))throw new Error('备份状态变化，拒绝覆盖');fs.renameSync(r.previous,r.active);r.backed=false}
    })
    if(nginxTouched){let valid=false;attempt('验证原 Nginx 配置',()=>{ops.nginxTest();valid=true});if(valid)attempt('重载原 Nginx 配置',()=>ops.nginxReload())}
    if(touchedService){attempt('恢复服务单元',()=>ops.reloadUnits());if(before.enabled)attempt('恢复开机状态',()=>ops.enable());if(before.active)attempt('恢复原服务',()=>ops.start())}
    if(failures.length)throw new AggregateError([error], '部署失败，恢复不完整：'+failures.join('；'))
    throw error
  }
}

module.exports={snapshot,mergeLegacyAssets,assertLegacyAssets,deploy}
