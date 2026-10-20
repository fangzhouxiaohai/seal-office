const fs=require('node:fs'),path=require('node:path'),{randomBytes,randomUUID,createHash,timingSafeEqual}=require('node:crypto'),{execFile}=require('node:child_process')
const {eraseRecords}=require('./eraseRecords.cjs'),{removeBlobs}=require('./eraseBackups.cjs')
const digest=value=>createHash('sha256').update(value).digest('hex')
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})}
async function createAccountErasure({db,directory,env,clock,verifyCode}){
  const secret=fs.readFileSync(path.join(directory,'otp.secret'))
  const ledger=path.resolve(env.SEAL_ERASURE_DIR||path.join(directory,'account-erasure'))
  fs.mkdirSync(ledger,{recursive:true,mode:0o700})
  const jobs=new Map();let queue=Promise.resolve(),closed=false
  const store=record=>{
    const filename=path.join(ledger,record.id+'.json'),temporary=filename+'.tmp',fd=fs.openSync(temporary,'w',0o600)
    try{fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
    fs.renameSync(temporary,filename)
  }
  const apply=record=>{
    // Preserve the deletion intent and object identities before committing database removal.
    const files=eraseRecords({query:db.query,run:()=>{}},record.userId,secret)
    const combined=new Map([...(record.files||[]),...files].map(file=>[file.directory+'/'+file.name,file]))
    record.files=[...combined.values()];record.status='pending';record.activeErased=false;store(record)
    db.transaction(()=>eraseRecords(db,record.userId,secret));removeBlobs(directory,record.files);db.compact()
    record.activeErased=true;store(record)
  }
  const schedule=record=>{
    if(jobs.has(record.id)||closed)return
    const work=queue.catch(()=>{}).then(async()=>{
      try{
        apply(record)
        if(env.SEAL_ERASURE_BACKEND==='systemd'){
          fs.writeFileSync(path.join(ledger,'trigger'),String(clock()),{mode:0o600})
          return
        }
        if(env.SEAL_BACKUP_DIR)await new Promise((resolve,reject)=>execFile(process.execPath,[path.join(__dirname,'eraseBackups.cjs'),env.SEAL_BACKUP_DIR,record.userId,directory],{timeout:15*60000,maxBuffer:1024*1024,windowsHide:true},error=>error?reject(error):resolve()))
        record.status='complete';record.completed=clock();delete record.files;store(record)
      }catch{record.status='pending';store(record);console.error('Account erasure requires a maintenance retry; deletion intent retained')}
      finally{jobs.delete(record.id)}
    })
    jobs.set(record.id,work);queue=work
  }
  // A restored database is filtered before the HTTP server can accept any login.
  for(const file of fs.readdirSync(ledger).filter(name=>/^[0-9a-f-]{36}\.json$/.test(name))){
    const record=JSON.parse(fs.readFileSync(path.join(ledger,file),'utf8'))
    if(record.version!==1||!/^[0-9a-f-]{36}$/.test(record.id)||!/^[0-9a-f-]{36}$/.test(record.userId))throw new Error('Invalid account erasure journal')
    apply(record);schedule(record)
  }
  const retry=setInterval(()=>{for(const file of fs.readdirSync(ledger).filter(name=>/^[0-9a-f-]{36}\.json$/.test(name))){const record=JSON.parse(fs.readFileSync(path.join(ledger,file),'utf8'));if(record.status!=='complete')schedule(record)}},60000);retry.unref()
  async function handle({route,method,json,reply,user,session}){
    if(method!=='POST'||!['/v1/auth/delete-account','/v1/auth/deletion-status'].includes(route))return false
    const input=await json(4096)
    if(route.endsWith('/deletion-status')){
      const match=/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(input.receipt||'')
      if(!match)fail(404,'注销记录不存在')
      let record;try{record=JSON.parse(fs.readFileSync(path.join(ledger,match[1]+'.json'),'utf8'))}catch{fail(404,'注销记录不存在')}
      if(typeof record.receiptHash!=='string'||!timingSafeEqual(Buffer.from(digest(match[2]),'hex'),Buffer.from(record.receiptHash,'hex')))fail(404,'注销记录不存在')
      reply({deleted:record.status==='complete',pending:record.status!=='complete'});return true
    }
    let supplied
    if(input.receipt!==undefined){
      supplied=/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(input.receipt)
      if(!supplied)fail(400,'注销请求标识无效')
      const previous=path.join(ledger,supplied[1]+'.json')
      if(fs.existsSync(previous)){
        const record=JSON.parse(fs.readFileSync(previous,'utf8'))
        if(!timingSafeEqual(Buffer.from(digest(supplied[2]),'hex'),Buffer.from(record.receiptHash,'hex')))fail(409,'注销请求标识冲突')
        if(record.status!=='complete')schedule(record)
        reply({pending:record.status!=='complete',deleted:record.status==='complete',receipt:input.receipt});return true
      }
    }
    if(!user||!session||!db.one('SELECT hash FROM sessions WHERE hash=? AND expires>?',[session.hash,clock()]))fail(401,'请先登录')
    if(input.confirm!=='永久注销海豹办公账号')fail(400,'请输入“永久注销海豹办公账号”以确认')
    verifyCode(user.phone,'delete-account',input.code)
    const id=supplied?.[1]||randomUUID(),key=supplied?.[2]||randomBytes(32).toString('base64url'),record={version:1,id,userId:user.id,receiptHash:digest(key),created:clock(),status:'pending'}
    store(record);apply(record);schedule(record)
    reply({pending:true,deleted:false,receipt:id+'.'+key});return true
  }
  return {handle,close:async()=>{closed=true;clearInterval(retry);await queue},ledger}
}
module.exports={createAccountErasure}
