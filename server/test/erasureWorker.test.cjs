const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto')
const {createLocalCollaborationFixture}=require('./collaborationFixture.cjs'),{runErasureWorker}=require('../deploy/erase-worker.cjs'),{openStore}=require('../store.cjs')
test('分离清理服务仅处理活动删除完成的回执，清理备份后才确认完成',async t=>{
  const f=await createLocalCollaborationFixture(t,{clients:false,env:{SEAL_ERASURE_BACKEND:'systemd'}}),phone='13800111910',a=await f.client(phone),id=a.status().account.id
  await a.save({linkId:'owned',name:'专用清理.txt',data:Buffer.from('不可恢复的云数据').toString('base64')})
  const active=path.join(f.directory,'server'),backups=path.join(f.directory,'backups'),ledger=path.join(active,'account-erasure')
  fs.mkdirSync(backups);fs.cpSync(active,path.join(backups,'snapshot'),{recursive:true})
  f.advance(61000);await a.sendCode(null,'delete-account');await a.deleteAccount({code:f.codes.get(phone),confirm:'永久注销海豹办公账号'})
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal((await a.deletionStatus()).pending,true);assert.equal(fs.existsSync(path.join(ledger,'trigger')),true)
  const bogusId=randomUUID(),bogus={version:1,id:bogusId,userId:f.cloud.db.one('SELECT id FROM users LIMIT 1')?.id||randomUUID(),receiptHash:createHash('sha256').update('isolated-test').digest('hex'),status:'pending',activeErased:false,files:[]}
  fs.writeFileSync(path.join(ledger,bogusId+'.json'),JSON.stringify(bogus))
  const result=await runErasureWorker({ledger,backups,activeDirectory:active})
  assert.equal(result.completed,1);assert.equal(result.pending,1);assert.equal((await a.deletionStatus()).deleted,true)
  const archived=await openStore(path.join(backups,'snapshot'));assert.equal(archived.one('SELECT id FROM users WHERE id=?',[id]),undefined);archived.close()
  assert.equal(JSON.parse(fs.readFileSync(path.join(ledger,bogusId+'.json'),'utf8')).status,'pending')
  // Remove the deliberately incomplete fixture before the cloud fixture's final shutdown.
  fs.unlinkSync(path.join(ledger,bogusId+'.json'))
})
