const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process')
const initSqlJs=require('sql.js'),{eraseRecords}=require('./eraseRecords.cjs')
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value)
function removeBlobs(root,files){
  for(const file of files){if(!['objects','incoming','team-objects'].includes(file.directory)||!uuid(file.name))throw new Error('Invalid erasure object identity');const filename=path.join(root,file.directory,file.name);try{const info=fs.lstatSync(filename);if(!info.isFile()||info.isSymbolicLink())throw new Error('Invalid erasure object type');fs.unlinkSync(filename)}catch(error){if(error.code!=='ENOENT')throw error}}
}
function acquireLock(root){
  const filename=path.join(root,'.seal-erasure.lock'),token=randomUUID()
  for(let attempt=0;attempt<2;attempt++){
    try{const fd=fs.openSync(filename,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd)}finally{fs.closeSync(fd)};return()=>{if(JSON.parse(fs.readFileSync(filename,'utf8')).token===token)fs.unlinkSync(filename)}}
    catch(error){
      if(error.code!=='EEXIST')throw error
      let owner;try{owner=JSON.parse(fs.readFileSync(filename,'utf8'))}catch{if(Date.now()-fs.statSync(filename).mtimeMs<900000)throw new Error('Backup erasure lock requires retry');fs.unlinkSync(filename);continue}
      if(!Number.isInteger(owner.pid)||owner.pid<=0)throw new Error('Invalid backup erasure lock')
      try{process.kill(owner.pid,0)}catch(probe){if(probe.code==='ESRCH'){fs.unlinkSync(filename);continue}throw probe}
      throw new Error('Another backup erasure is running')
    }
  }
  throw new Error('Cannot acquire backup erasure lock')
}
async function eraseBackups(root,userId,activeDirectory){
  if(!uuid(userId))throw new Error('Invalid erasure account')
  if(!root)return {databases:0,archives:0}
  root=fs.realpathSync(root)
  if(root===path.parse(root).root)throw new Error('Backup erasure cannot target a filesystem root')
  if(activeDirectory){const live=fs.realpathSync(activeDirectory);if(live===root||live.startsWith(root+path.sep))throw new Error('Backup root cannot contain the active database')}
  const release=acquireLock(root)
  try{
  const cleanTemporary=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const name=path.resolve(directory,entry.name)
    if(!name.startsWith(root+path.sep))throw new Error('Erasure cleanup containment failure')
    if(entry.isDirectory()&&entry.name.startsWith('.seal-erasure-stage-')){if(fs.realpathSync(name)!==name)throw new Error('Invalid erasure staging path');fs.rmSync(name,{recursive:true,force:true});continue}
    if(entry.isDirectory())cleanTemporary(name)
    else if(entry.isFile()&&/^(seal\.sqlite|.+\.tar\.gz)\.erase-[0-9a-f-]{36}$/.test(entry.name))fs.unlinkSync(name)
  }}
  cleanTemporary(root)
  const SQL=await initSqlJs(),counts={databases:0,archives:0}
  const walk=directory=>{const files=[];for(const entry of fs.readdirSync(directory,{withFileTypes:true})){if(entry.name.startsWith('.seal-erasure-stage-'))continue;const name=path.join(directory,entry.name);if(entry.isSymbolicLink())throw new Error('Backup symlinks require maintenance before account deletion');if(entry.isDirectory())files.push(...walk(name));else if(entry.isFile())files.push(name)}return files}
  const database=filename=>{
    const raw=new SQL.Database(fs.readFileSync(filename)),query=(sql,params=[])=>{const statement=raw.prepare(sql);try{statement.bind(params);const result=[];while(statement.step())result.push(statement.getAsObject());return result}finally{statement.free()}}
    try{const secretFile=path.join(path.dirname(filename),'otp.secret'),liveSecret=activeDirectory&&path.join(activeDirectory,'otp.secret'),secret=fs.existsSync(secretFile)?fs.readFileSync(secretFile):liveSecret&&fs.existsSync(liveSecret)?fs.readFileSync(liveSecret):undefined;const files=eraseRecords({query,run:(sql,params=[])=>raw.run(sql,params)},userId,secret);removeBlobs(path.dirname(filename),files);raw.run('VACUUM');const temporary=filename+'.erase-'+randomUUID();fs.writeFileSync(temporary,Buffer.from(raw.export()),{mode:0o600,flag:'wx'});fs.renameSync(temporary,filename);counts.databases++}finally{raw.close()}
  }
  const invoke=args=>execFileSync('tar',args,{timeout:180000,maxBuffer:32*1024*1024,encoding:'utf8',stdio:['ignore','pipe','pipe']})
  for(const filename of walk(root)){
    if(/\.tar\.gz\.partial$/.test(filename))throw new Error('Backup archive creation is still in progress')
    if(path.basename(filename)==='seal.sqlite'){database(filename);continue}
    if(!filename.endsWith('.tar.gz'))continue
    const names=invoke(['-tzf',filename]).split(/\r?\n/).filter(Boolean)
    if(!names.some(name=>/(^|\/)seal\.sqlite$/.test(name))) {
      if(names.some(name=>/(^|\/)(objects|team-objects|incoming)\//.test(name)))throw new Error('Cloud object archive without database requires maintenance')
      continue
    }
    if(names.some(name=>name.startsWith('/')||/^[A-Za-z]:|[\x00-\x1f\\]/.test(name)||name.split('/').includes('..')))throw new Error('Unsafe backup archive path')
    if(invoke(['-tvzf',filename]).split(/\r?\n/).filter(Boolean).some(line=>!['-','d'].includes(line[0])))throw new Error('Backup archive contains links or special files')
    const stage=fs.mkdtempSync(path.join(root,'.seal-erasure-stage-')),temporary=filename+'.erase-'+randomUUID()
    fs.chmodSync(stage,0o700)
    try{
      invoke(['-xzf',filename,'-C',stage,'--no-same-owner','--no-same-permissions'])
      for(const candidate of walk(stage))if(path.basename(candidate)==='seal.sqlite')database(candidate)
      invoke(['-czf',temporary,'-C',stage,'.']);fs.chmodSync(temporary,0o600);fs.renameSync(temporary,filename);counts.archives++
    }finally{
      if(!path.resolve(stage).startsWith(root+path.sep))throw new Error('Erasure staging containment failure')
      fs.rmSync(stage,{recursive:true,force:true});try{fs.unlinkSync(temporary)}catch(error){if(error.code!=='ENOENT')throw error}
    }
  }
  return counts
  }finally{release()}
}
if(require.main===module)eraseBackups(process.argv[2],process.argv[3],process.argv[4]).then(result=>process.stdout.write(JSON.stringify(result))).catch(()=>{process.stderr.write('Backup erasure did not complete; retry required');process.exitCode=1})
module.exports={eraseBackups,removeBlobs}
