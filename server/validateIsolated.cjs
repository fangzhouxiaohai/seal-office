const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads')
const validationTask='seal-office:public-validation:v1'
// 此模块也会被宿主自己的 Worker 引入；仅执行本模块明确创建的检查任务。
if(!isMainThread&&workerData?.task===validationTask){require('./publicValidation.cjs').validatePublic(Buffer.from(workerData.bytes),workerData.name,workerData.kind).then(()=>parentPort.postMessage({ok:true})).catch(error=>parentPort.postMessage({error:error.message}))}
function validateIsolated(bytes,name,kind){return new Promise((resolve,reject)=>{
  const worker=new Worker(__filename,{workerData:{task:validationTask,bytes,name,kind},resourceLimits:{maxOldGenerationSizeMb:160,maxYoungGenerationSizeMb:32}})
  const timer=setTimeout(()=>{void worker.terminate();reject(new Error('公开文件检查超时，请减少文件复杂度'))},15000)
  const done=()=>clearTimeout(timer)
  worker.once('message',result=>{done();void worker.terminate();result.ok?resolve():reject(new Error(result.error||'公开文件未通过检查'))})
  worker.once('error',()=>{done();reject(new Error('公开文件检查失败，请检查文件结构'))})
  worker.once('exit',code=>{done();if(code!==0)reject(new Error('公开文件检查进程已结束'))})
})}
module.exports={validateIsolated}
