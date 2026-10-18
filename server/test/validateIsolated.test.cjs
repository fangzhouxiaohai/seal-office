const {test}=require('node:test'),assert=require('node:assert/strict'),{Worker}=require('node:worker_threads')
const {validateIsolated}=require('../validateIsolated.cjs')

test('宿主无相关 workerData 的 Worker 能安全引入公开检查模块',async()=>{
  for(const workerData of [undefined,{unrelated:'host task'},{bytes:undefined,name:'host-owned'}]){
    const result=await new Promise((resolve,reject)=>{
      const worker=new Worker(`const {parentPort}=require('node:worker_threads');const {validateIsolated}=require(${JSON.stringify(require.resolve('../validateIsolated.cjs'))});parentPort.postMessage({type:typeof validateIsolated});`,{eval:true,...(workerData===undefined?{}:{workerData})})
      let message
      worker.once('message',value=>{message=value})
      worker.once('error',reject)
      worker.once('exit',code=>{if(code!==0)reject(new Error('宿主 Worker 异常退出'));else resolve(message)})
    })
    assert.deepEqual(result,{type:'function'})
  }
})

test('带专用任务标记的实际隔离 Worker 仍校验内容并拒绝非法格式',async()=>{
  await validateIsolated(Buffer.from('海豹办公公开文档 0012'),'中文.txt','knowledge')
  await assert.rejects(validateIsolated(Buffer.from('fake executable'),'禁止.exe','knowledge'),/仅接受/)
  await assert.rejects(validateIsolated(Buffer.from('%PDF-1.7 /JavaScript'),'活动.pdf','knowledge'),/活动脚本/)
})
