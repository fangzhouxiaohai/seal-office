import {cloudCall} from './CloudProvider'
import type {Passage} from './fileData'
export async function recognizeScans(modal:any,images:{location:string;data:string;mime:string}[]):Promise<Passage[]>{
  const agreed=await new Promise<boolean>(resolve=>modal.confirm({title:'识别扫描件中的文字？',content:<p>文件中有 {images.length} 页没有文字层。确认后将这些页面图片发送给当前配置的 AI 服务识别，处理期间该服务可读取图片内容。识别结果请对照原文校对。</p>,okText:'同意并识别',cancelText:'取消上传',onOk:()=>resolve(true),onCancel:()=>resolve(false)}))
  if(!agreed)throw new Error('已取消扫描件在线识别，原文件未上传')
  const result:Passage[]=[];for(const image of images){const r=await cloudCall('ocrImage',{...image,consent:true});result.push({location:image.location+'（识别）',text:r.text})}
  // Retain the original page location for merging and citation jumps.
  return result.map((p,i)=>({...p,location:images[i].location,text:'[扫描识别，请核对]\n'+p.text}))
}
