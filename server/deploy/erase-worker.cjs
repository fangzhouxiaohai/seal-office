// Runs as a dedicated, filesystem-restricted service. Job data never supplies a path or command.
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto')
const initSqlJs=require('sql.js'),{eraseBackups}=require('../eraseBackups.cjs')
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value)
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
async function runErasureWorker({ledger,backups,activeDirectory}){
  if(!ledger||!backups||!activeDirectory)throw new Error('Erasure service paths must be configured')
  ledger=fs.realpathSync(ledger);activeDirectory=fs.realpathSync(activeDirectory)
  if(ledger===path.parse(ledger).root)throw new Error('Invalid erasure ledger directory')
  const SQL=await initSqlJs(),result={completed:0,pending:0}
  for(const name of fs.readdirSync(ledger).filter(name=>/^[0-9a-f-]{36}\.json$/.test(name))){
    const filename=path.join(ledger,name)
    let fd,record,source,info
    try{
      fd=fs.openSync(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));info=fs.fstatSync(fd)
      if(!info.isFile()||info.size>4*1024*1024)throw new Error('Invalid erasure journal file')
      source=fs.readFileSync(fd);record=JSON.parse(source.toString('utf8'))
    }finally{if(fd!==undefined)fs.closeSync(fd)}
    if(record.version!==1||!uuid(record.id)||record.id+'.json'!==name||!uuid(record.userId)||!/^[a-f0-9]{64}$/.test(record.receiptHash||''))throw new Error('Invalid erasure journal record')
    if(record.status==='complete')continue
    if(record.status!=='pending'||record.activeErased!==true){result.pending++;continue}
    const database=new SQL.Database(fs.readFileSync(path.join(activeDirectory,'seal.sqlite')))
    try{const statement=database.prepare('SELECT id FROM users WHERE id=?');try{statement.bind([record.userId]);if(statement.step()){result.pending++;continue}}finally{statement.free()}}finally{database.close()}
    const files=record.files||[]
    if(!Array.isArray(files)||files.some(file=>!['objects','team-objects','incoming'].includes(file.directory)||!uuid(file.name)))throw new Error('Invalid erasure object list')
    if(files.some(file=>fs.existsSync(path.join(activeDirectory,file.directory,file.name)))){result.pending++;continue}
    await eraseBackups(backups,record.userId,activeDirectory)
    const current=fs.lstatSync(filename)
    if(!current.isFile()||current.isSymbolicLink()||hash(fs.readFileSync(filename))!==hash(source)){result.pending++;continue}
    record.status='complete';record.completed=Date.now();delete record.files
    const temporary=filename+'.worker-'+randomUUID(),output=fs.openSync(temporary,'wx',0o600)
    try{
      fs.writeFileSync(output,JSON.stringify(record));fs.fsyncSync(output)
      if(process.platform!=='win32')fs.fchownSync(output,info.uid,info.gid)
    }finally{fs.closeSync(output)}
    fs.renameSync(temporary,filename);result.completed++
  }
  return result
}
if(require.main===module){
  const [ledger,backups,activeDirectory]=process.argv.slice(2)
  runErasureWorker({ledger,backups,activeDirectory}).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(()=>{process.stderr.write('Account backup erasure remains pending; inspect service configuration and retry\n');process.exitCode=1})
}
module.exports={runErasureWorker}
