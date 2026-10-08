const {randomUUID}=require('crypto')
const {检查图片字节}=require('../office/pptx/media')
const color=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)

/** 模型提供区域，原图裁剪提供图片字节；不允许模型产生任意资源链接。 */
async function imagePresentation({data,mime,name},{assistant,nativeImage}){
  const raw=Buffer.from(data||'','base64')
  if(raw.toString('base64')!==data||raw.length===0||raw.length>8*1024*1024)throw new Error('图片编码无效或超过 8 MiB')
  if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('图片格式不支持')
  检查图片字节(raw,mime)
  const image=nativeImage.createFromBuffer(raw),size=image.getSize()
  if(!size.width||!size.height||size.width*size.height>40000000)throw new Error('图片像素过大或无法解码')
  const prompt='将图片重建为可编辑演示对象。使用原图像素坐标，宽='+size.width+'，高='+size.height+'。只返回 {"background":"#FFFFFF","objects":[{"type":"text|shape|image","x":0,"y":0,"width":100,"height":50,"text":"可见文字","size":24,"color":"#000000","bold":false,"fill":"#FFFFFF","shape":"矩形|圆角矩形|椭圆"}]}。文字必须是独立 text；规则图形用 shape；照片及复杂插图用 image 区域，避免把整页作为图片。不要输出重叠的文字和包含相同文字的图片区域。'
  const result=await assistant.对话({用途:'图片转演示',消息:[{角色:'user',内容:prompt,图像:[{类型:mime,数据:data}]}]})
  let layout;try{layout=JSON.parse((result?.内容||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))}catch{throw new Error('模型版式数据不完整，请重试')}
  if(!color(layout.background)||!Array.isArray(layout.objects)||!layout.objects.length||layout.objects.length>200)throw new Error('模型版式数据无效')
  const ratio=960/size.width,height=Math.round(size.height*ratio)
  if(height<160||height>2400)throw new Error('图片比例不适合单页演示，请分段裁剪后转换')
  const slide={id:randomUUID(),title:name||'图片演示',版式:'空白',背景色:layout.background,文本框列表:[],对象列表:[],备注:'由图片识别重建，使用前请核对文字与版式。'}
  const resources=[]
  for(const item of layout.objects){
    const {x,y,width,height:h}=item
    if(!['text','shape','image'].includes(item.type)||![x,y,width,h].every(Number.isFinite)||x<0||y<0||width<=0||h<=0||x+width>size.width+1||y+h>size.height+1)throw new Error('模型返回了越界或无效区域')
    const base={id:randomUUID(),x:x*ratio,y:y*ratio,width:width*ratio,height:h*ratio}
    if(item.type==='text'){
      if(typeof item.text!=='string'||item.text.length>4000||!color(item.color)||!Number.isFinite(item.size)||item.size<=0||item.size>500)throw new Error('识别文字格式无效')
      slide.文本框列表.push({...base,text:item.text,字号:Math.min(96,Math.max(8,item.size*ratio)),颜色:item.color,加粗:Boolean(item.bold),斜体:false,下划线:false,对齐:'left'})
    }else if(item.type==='shape'){
      if(!color(item.fill)||!['矩形','圆角矩形','椭圆'].includes(item.shape))throw new Error('识别图形格式无效')
      slide.对象列表.push({...base,类型:'图形',形状:{种类:item.shape,文本:'',填充:item.fill,线条:item.fill,线宽:0,颜色:'#000000',字号:24,加粗:false}})
    }else{
      const cropped=image.crop({x:Math.floor(x),y:Math.floor(y),width:Math.min(size.width-Math.floor(x),Math.ceil(width)),height:Math.min(size.height-Math.floor(y),Math.ceil(h))}).toPNG()
      const id=require('crypto').createHash('sha256').update(cropped).digest('hex')
      resources.push({标识:id,类型:'image/png',数据:cropped.toString('base64')});slide.对象列表.push({...base,类型:'图片',资源标识:id})
    }
  }
  return {deck:{模型版本:2,id:randomUUID(),name:(name||'图片').replace(/\.[^.]+$/,'')+'.pptx',当前索引:0,页面尺寸:{宽:960,高:height},幻灯片列表:[slide],资源索引:Object.fromEntries(resources.map(r=>[r.标识,{指纹:r.标识,类型:r.类型,字节数:Buffer.from(r.数据,'base64').length}]))},resources}
}
module.exports={imagePresentation}
