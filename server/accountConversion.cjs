const { validateConversion, bodyLimit, maximumBytes } = require('./converter/index.cjs')
const { validatePdf } = require('./converter/pdf.cjs')
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})}
function createAccountConversion({db,converter,clock,timeoutMs=100000}){
  const limits=new Map();let active=0
  const authorize=(userId,sessionHash)=>{if(!db.one('SELECT hash FROM sessions WHERE hash=? AND user_id=? AND expires>?',[sessionHash,userId,clock()]))fail(401,'登录已过期或设备会话已撤销');if(!db.one('SELECT enabled FROM users WHERE id=?',[userId])?.enabled)fail(403,'请先开通云空间')}
  async function handle({route,method,req,res,user,session,json,reply}){
    if(!route.startsWith('/v1/conversion/'))return false
    authorize(user.id,session.hash)
    if(route!=='/v1/conversion/capabilities'&&route!=='/v1/conversion/convert')fail(404,'账号转换接口不存在')
    if(route.endsWith('/capabilities')&&method!=='GET'||route.endsWith('/convert')&&method!=='POST')fail(405,'账号转换请求方法无效')
    for(const [id,item]of limits)if(clock()-item.start>=60000&&!item.active)limits.delete(id)
    const limit=limits.get(user.id)||{start:clock(),count:0,active:0,capabilities:0};limits.set(user.id,limit)
    if(route.endsWith('/convert')){if(limit.count>=6||limit.active>=1||active>=4)fail(429,'账号转换达到每分钟6次或并发上限，请稍后重试');limit.count++;limit.active++;active++}
    else if(++limit.capabilities>60)fail(429,'转换能力查询过于频繁，请稍后重试')
    const controller=new AbortController(),abort=error=>{if(!controller.signal.aborted)controller.abort(error)}
    const disconnected=()=>{if(!res.writableEnded)abort(Object.assign(new Error('文档转换已取消'),{status:499}))}
    req.once('aborted',disconnected);res.once('close',disconnected)
    const deadline=setTimeout(()=>abort(Object.assign(new Error('文档转换超时，原文件未修改'),{status:504})),timeoutMs)
    const revoked=setInterval(()=>{try{authorize(user.id,session.hash)}catch(error){abort(error)}},100);revoked.unref()
    try{
      if(route.endsWith('/capabilities')){const info=await converter.accountCapabilities(controller.signal);authorize(user.id,session.hash);reply(info);return true}
      if(Number(req.headers['content-length'])>bodyLimit)fail(413,'文档转换最多支持20 MiB')
      const input=await json(bodyLimit)
      if(input.consent!==true)fail(400,'请确认本次文档正文上传转换授权')
      if(typeof input.data==='string'&&Buffer.from(input.data,'base64').length>maximumBytes)fail(413,'文档转换最多支持20 MiB')
      let checked;try{checked=validateConversion(input)}catch(error){fail(400,error.message)}
      authorize(user.id,session.hash)
      if(controller.signal.aborted)throw controller.signal.reason
      const result=await converter.accountConvert({inputFormat:checked.inputFormat,outputFormat:checked.outputFormat,type:checked.type,data:checked.data},controller.signal)
      authorize(user.id,session.hash);if(controller.signal.aborted)throw controller.signal.reason
      if(result.outputFormat!==input.outputFormat||typeof result.data!=='string'||result.data.length>Math.ceil(maximumBytes/3)*4)fail(502,'转换工作进程返回的文件无效')
      const output=Buffer.from(result.data,'base64');if(!output.length||output.length>maximumBytes||output.toString('base64')!==result.data)fail(502,'转换结果无效或超过20 MiB')
      if(input.outputFormat==='pdf'){try{await validatePdf(output)}catch{fail(502,'转换工作进程没有返回有效 PDF')}}
      reply({outputFormat:result.outputFormat,data:result.data});return true
    }finally{clearTimeout(deadline);clearInterval(revoked);req.off('aborted',disconnected);res.off('close',disconnected);if(route.endsWith('/convert')){limit.active--;active--}}
  }
  return {handle}
}
module.exports={createAccountConversion}
