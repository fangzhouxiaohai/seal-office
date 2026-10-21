/** UI preflight only. The host repeats this check at the actual AI request. */
export const AI身份提示事件='seal-ai-identity-required'
export const AI登录原因='使用 AI 功能前，请先登录已完成手机号短信验证的海豹办公账号。无需开通云空间。'
export interface AI身份失败 {成功:false;数据?:undefined;错误:string;状态码?:number;code?:string;需要登录?:boolean;已取消?:boolean}
export interface AI身份通过 {成功:true;数据:{accountId:string;verified:true;method:'phone'}}
export interface AI身份提示 {reason:string;error:string;loginRequired:boolean}
export function 提示AI身份(reason=AI登录原因,error=AI登录原因,loginRequired=true){window.dispatchEvent(new CustomEvent<AI身份提示>(AI身份提示事件,{detail:{reason,error,loginRequired}}))}
export async function 检查AI身份(reason=AI登录原因):Promise<AI身份通过|AI身份失败>{
  let result:any
  try{
    const api=window.electronAPI?.cloud
    if(!api)return {成功:false,错误:'当前环境无法核验 AI 账号，请重新打开应用后重试',code:'AI_IDENTITY_UNAVAILABLE'}
    // Deliberately call the raw account API: importing cloudCall here would
    // recurse when question/image/OCR themselves pass through the same gate.
    result=await api.invoke('requireAIIdentity',{})
  }catch(error){return {成功:false,错误:error instanceof Error?error.message:'AI 账号核验暂时不可用，请检查网络后重试',code:'AI_IDENTITY_UNAVAILABLE'}}
  if(result?.成功&&result.数据?.verified===true&&result.数据.method==='phone'&&typeof result.数据.accountId==='string'&&result.数据.accountId)return result as AI身份通过
  if(result?.成功)return {成功:false,错误:'账号服务未提供有效的 AI 身份核验，请稍后重试',code:'AI_IDENTITY_UNAVAILABLE'}
  const status=result?.状态码??result?.status,code=result?.code??result?.代码
  const loginRequired=result?.需要登录===true||code==='AI_IDENTITY_REQUIRED'||status===401||status===403
  const failure:AI身份失败={成功:false,错误:result?.错误||'AI 账号核验暂时不可用，请检查网络后重试',...(typeof status==='number'?{状态码:status}:{}),...(typeof code==='string'?{code}:{}),...(loginRequired?{需要登录:true,已取消:true}:{})}
  if(loginRequired)提示AI身份(reason,failure.错误)
  return failure
}
/** Opening login never resumes a generation automatically. The draft is retried explicitly. */
export async function requireAIIdentity(reason=AI登录原因):Promise<boolean>{
  const result=await 检查AI身份(reason)
  if(!result.成功&&!result.需要登录)提示AI身份(reason,result.错误,false)
  return result.成功
}
export async function 认证AI调用<T>(action:()=>Promise<T>,reason=AI登录原因):Promise<T|AI身份失败>{
  const identity=await 检查AI身份(reason)
  if(!identity.成功)return identity
  const result:any=await action()
  // A logout/revocation between preflight and the host's request must return to
  // login too; none of the account identity is appended to model input.
  if(result?.成功===false&&(result.需要登录||result.code==='AI_IDENTITY_REQUIRED'||result.状态码===401||result.状态码===403))提示AI身份(reason,result.错误)
  return result
}
