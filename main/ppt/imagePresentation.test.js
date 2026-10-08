const {imagePresentation}=require('./imagePresentation')
const png=require('fs').readFileSync(require('path').join(__dirname,'../../renderer/src/editor/__fixtures__/office-image.png'))
const image={getSize:()=>({width:960,height:540}),crop:vi.fn(()=>({toPNG:()=>png}))}
const nativeImage={createFromBuffer:()=>image}
const assistantFor=layout=>({对话:vi.fn(async()=>({内容:JSON.stringify(layout)}))})
const input={data:png.toString('base64'),mime:'image/png',name:'原图.png'}
describe('图片重建原生对象',()=>{
  it('文本、图形和复杂区域分别创建，图片字节来自原图裁剪',async()=>{
    const result=await imagePresentation(input,{nativeImage,assistant:assistantFor({background:'#FFFFFF',objects:[{type:'text',x:10,y:10,width:100,height:40,text:'原图文字',size:24,color:'#000000'},{type:'shape',x:20,y:60,width:90,height:80,shape:'椭圆',fill:'#2266AA'},{type:'image',x:200,y:100,width:200,height:100}]})})
    const page=result.deck.幻灯片列表[0]
    expect(page.文本框列表[0].text).toBe('原图文字');expect(page.对象列表.map(o=>o.类型)).toEqual(['图形','图片'])
    expect(result.resources[0].数据).toBe(png.toString('base64'));expect(page.对象列表[1].资源标识).toBe(result.resources[0].标识)
    expect(image.crop).toHaveBeenCalledWith({x:200,y:100,width:200,height:100})
    const {写入pptx,读取pptx}=require('../office/pptxCodec')
    const opened=await 读取pptx(await 写入pptx({...result.deck,资源条目:result.resources}))
    expect(opened.警告).toEqual([]);expect(opened.演示文稿.幻灯片列表[0].文本框列表[0].text).toBe('原图文字')
    expect(opened.资源条目[0].数据).toBe(png.toString('base64'))
  })
  it('拒绝越界对象和任意远程资源链接',async()=>{
    await expect(imagePresentation(input,{nativeImage,assistant:assistantFor({background:'#FFFFFF',objects:[{type:'image',x:950,y:0,width:80,height:10,url:'https://untrusted.invalid'}]})})).rejects.toThrow('越界')
  })
  it('无效文件在 AI 请求前拒绝',async()=>{
    const assistant=assistantFor({});await expect(imagePresentation({...input,data:'abc'},{nativeImage,assistant})).rejects.toThrow('编码')
    expect(assistant.对话).not.toHaveBeenCalled()
  })
})
