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
