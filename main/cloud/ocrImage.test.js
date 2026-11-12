const {ocrImage}=require('./ocrImage')
const data=require('fs').readFileSync(require('path').join(__dirname,'../../renderer/src/editor/__fixtures__/office-image.png')).toString('base64')
const nativeImage={createFromBuffer:()=>({getSize:()=>({width:100,height:100})})}
describe('扫描页识别授权和返回校验',()=>{
  it('没有单次同意不向现有 AI 服务发送图片',async()=>{
    const assistant={对话:vi.fn()};await expect(ocrImage({data,mime:'image/png',consent:false},{assistant,nativeImage})).rejects.toThrow('授权');expect(assistant.对话).not.toHaveBeenCalled()
  })
  it('识别结果必须是有效文字，不执行返回的操作或脚本',async()=>{
    const assistant={对话:vi.fn(async()=>({内容:'```json\n{"text":"扫描原文"}\n```'}))}
    expect(await ocrImage({data,mime:'image/png',consent:true},{assistant,nativeImage})).toEqual({text:'扫描原文'})
    assistant.对话.mockResolvedValue({内容:'{"operations":["delete"]}'})
    await expect(ocrImage({data,mime:'image/png',consent:true},{assistant,nativeImage})).rejects.toThrow('有效文字')
  })
})
describe('单据识别的表格抄录要求',()=>{
  it('layout 为 table 时要求按 Markdown 竖线表格逐行抄录，默认请求保持原有提示',async()=>{
    const assistant={对话:vi.fn(async()=>({内容:'{"text":"| 品名 | 数量 |"}'}))}
    await ocrImage({data,mime:'image/png',consent:true,layout:'table'},{assistant,nativeImage})
    expect(assistant.对话.mock.calls[0][0].消息[0].内容).toMatch(/Markdown 竖线表格/)
    await ocrImage({data,mime:'image/png',consent:true},{assistant,nativeImage})
    expect(assistant.对话.mock.calls[1][0].消息[0].内容).not.toMatch(/Markdown/)
  })
})
