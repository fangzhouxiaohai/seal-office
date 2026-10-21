import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {桥接} from '../ipc/bridge'
import {AI身份提示事件,检查AI身份,requireAIIdentity,type AI身份提示} from './aiIdentity'
import {cloudCall} from './CloudProvider'
const verified={成功:true,数据:{accountId:'isolated-verified-account',verified:true,method:'phone'}}
const denied={成功:false,错误:'请先登录并完成手机号验证',状态码:401,code:'AI_IDENTITY_REQUIRED',需要登录:true}
let calls:string[],events:AI身份提示[],invoke:ReturnType<typeof vi.fn>,generation:ReturnType<typeof vi.fn>,onPrompt:(event:Event)=>void
beforeEach(()=>{
  calls=[];events=[];onPrompt=event=>events.push((event as CustomEvent<AI身份提示>).detail);window.addEventListener(AI身份提示事件,onPrompt)
  invoke=vi.fn(async(action:string)=>{calls.push(action);return action==='requireAIIdentity'?denied:{成功:true,数据:{answer:'fixture-only'}}})
  generation=vi.fn(async()=>({成功:true,数据:{accepted:true}}))
  window.electronAPI={cloud:{invoke},ai:{chat:generation,getConfig:generation,cancel:generation,guide:generation,submitToolResult:generation},presentationAi:{translate:generation,proofread:generation,speak:generation,generateScript:generation,narrate:generation,validateTranslation:generation,probeService:generation},presentationGeneration:{outline:generation,pages:generation,singlePage:generation,beautify:generation,diagram:generation,validateCandidates:generation,assets:{semanticSearch:generation,list:generation}},presentationCapture:{recognize:generation},office:{readSeal:generation}} as any
})
afterEach(()=>{window.removeEventListener(AI身份提示事件,onPrompt);Reflect.deleteProperty(window,'electronAPI')})
it('所有生成适配器匿名时先打开登录原因，实际生成接口一个也不调用',async()=>{
  const callsToTry=[()=>桥接.ai.chat({消息:[],文档上下文:''}),()=>桥接.presentationAi.translate({} as any),()=>桥接.presentationAi.proofread({} as any),()=>桥接.presentationAi.speak({文本:'fixture'}),()=>桥接.presentationAi.generateScript({} as any),()=>桥接.presentationAi.narrate({讲稿:[]}),()=>桥接.presentationGeneration.outline({} as any),()=>桥接.presentationGeneration.pages({} as any),()=>桥接.presentationGeneration.singlePage({} as any),()=>桥接.presentationGeneration.beautify({} as any),()=>桥接.presentationGeneration.diagram({} as any),()=>桥接.presentationGeneration.assets.semanticSearch({请求标识:'fixture',查询:'fixture'}),()=>桥接.presentationCapture.recognize('fixture','image/png')]
  for(const call of callsToTry)expect(await call()).toMatchObject({成功:false,需要登录:true,code:'AI_IDENTITY_REQUIRED'})
  expect(generation).not.toHaveBeenCalled();expect(invoke).toHaveBeenCalledTimes(callsToTry.length);expect(events).toHaveLength(callsToTry.length);expect(events.every(event=>event.loginRequired&&event.reason.includes('无需开通云空间'))).toBe(true)
})
it('已验证账号无需开云空间，逐次在线核验且不向模型添加手机号或身份字段',async()=>{
  invoke.mockResolvedValue(verified);const input={消息:[{角色:'user' as const,内容:'保留原始输入𠮷🦭'}],文档上下文:'本机内容'}
  expect((await 桥接.ai.chat(input)).成功).toBe(true);expect(generation).toHaveBeenCalledWith(input);expect(generation.mock.calls[0][0]).toBe(input)
  expect(JSON.stringify(generation.mock.calls[0])).not.toContain('accountId');expect(events).toHaveLength(0)
  invoke.mockResolvedValue(denied);expect((await 桥接.ai.chat(input)).成功).toBe(false);expect(generation).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledTimes(2)
})
it('网络/服务失败保持真实错误并阻止请求，不误说未登录',async()=>{
  invoke.mockResolvedValue({成功:false,错误:'身份服务器暂时不可用',状态码:503,code:'SERVICE_UNAVAILABLE'})
  expect(await 桥接.presentationGeneration.diagram({} as any)).toEqual({成功:false,错误:'身份服务器暂时不可用',状态码:503,code:'SERVICE_UNAVAILABLE'})
  expect(generation).not.toHaveBeenCalled();expect(events).toHaveLength(0)
  expect(await requireAIIdentity()).toBe(false);expect(events).toEqual([expect.objectContaining({loginRequired:false,error:'身份服务器暂时不可用'})])
})
it('能力配置、取消、引导、工具回传和本地校验不要求重新登录',async()=>{
  await 桥接.ai.getConfig();await 桥接.ai.cancel('running');await 桥接.ai.guide('running','继续');await 桥接.ai.submitToolResult({请求标识:'running',调用标识:'tool',成功:true});await 桥接.presentationAi.validateTranslation([],[]);await 桥接.presentationAi.probeService('翻译');await 桥接.presentationGeneration.validateCandidates([],[],{});await 桥接.presentationGeneration.assets.list();await 桥接.office.readSeal('sldoc','fixture')
  expect(invoke).not.toHaveBeenCalled();expect(events).toHaveLength(0);expect(generation).toHaveBeenCalledTimes(9)
})
it.each(['question','imagePresentation','ocrImage'])('云端 %s 生成入口同样先核验，取消不发送正文',async(action)=>{
  await expect(cloudCall(action,{正文:'不可发送'})).rejects.toMatchObject({code:'AI_IDENTITY_REQUIRED'});expect(calls).toEqual(['requireAIIdentity']);expect(generation).not.toHaveBeenCalled()
})
it('旧服务缺少验证证明或传输异常时禁止生成',async()=>{
  invoke.mockResolvedValue({成功:true,数据:{account:{identityVerified:true}}});expect((await 检查AI身份()).成功).toBe(false);expect(generation).not.toHaveBeenCalled()
  invoke.mockRejectedValue(new Error('network offline'));expect(await 检查AI身份()).toMatchObject({成功:false,错误:'network offline',code:'AI_IDENTITY_UNAVAILABLE'})
})
