import {桥接} from '../ipc/bridge'
import {载入PDF} from '../pdf/pdfLoader'
export const toBase64=(data:Uint8Array)=>{let result='';for(let i=0;i<data.length;i+=16384)result+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(result)}
export async function readUpload(file:File,max=300000000){if(file.size>max)throw new Error(`文件超过 ${(max/1000000).toFixed(1)} MB 限制`);return toBase64(new Uint8Array(await file.arrayBuffer()))}
export interface Passage {location:string;text:string}
const plain=(html:string)=>new DOMParser().parseFromString(html,'text/html').body.textContent||''
function collect(value:any,key=''):string{if(typeof value==='string')return ['text','文本','value','值','原始值','显示值','批注','html','备注','名称','标签','title','标题','分类','label','labels','单元格'].includes(key)&&value.length<50000&&!value.startsWith('data:')?value:'';if(typeof value==='number'&&['value','值','数值','values','原始值','显示值'].includes(key))return String(value);if(Array.isArray(value))return value.map(v=>collect(v,key)).join(' ');if(!value||typeof value!=='object')return '';return Object.entries(value).filter(([k])=>!['资源索引','数据','图片','文件指纹'].includes(k)).map(([k,v])=>collect(v,k)).join(' ')}
export async function pdfImages(data:string){
  const load=await 载入PDF(data),images:{location:string;data:string;mime:string}[]=[]
  try{if(load.文档.numPages>30)throw new Error('本次识别最多 30 页，请先提取需要的页面');for(let i=1;i<=load.文档.numPages;i++){
    const page=await load.文档.getPage(i),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1600/Math.max(base.width,base.height))})
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height)
    const context=canvas.getContext('2d');if(!context)throw new Error('扫描页无法渲染')
    await page.render({canvas,canvasContext:context,viewport}).promise
    images.push({location:`第 ${i} 页`,mime:'image/png',data:canvas.toDataURL('image/png').split(',')[1]});canvas.width=canvas.height=0
  }}finally{load.关闭()}return images
}
export async function extractUpload(name:string,data:string,ocr?:(images:{location:string;data:string;mime:string}[])=>Promise<Passage[]>):Promise<Passage[]>{
  const ext=name.split('.').pop()?.toLowerCase()
  if(['txt','md','csv'].includes(ext||'')){const raw=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),text=new TextDecoder('utf-8',{fatal:true}).decode(raw);return text.split(/\n\s*\n/).filter(Boolean).map((text,i)=>({location:`第 ${i+1} 段`,text}))}
  if(ext==='pdf'){const load=await 载入PDF(data),result:Passage[]=[];try{for(let i=1;i<=load.文档.numPages;i++){const page=await load.文档.getPage(i),text=await page.getTextContent();result.push({location:`第 ${i} 页`,text:text.items.map(item=>'str'in item?item.str:'').join(' ')})}}finally{load.关闭()}if(ocr&&result.some(p=>!p.text.trim())){const images=(await pdfImages(data)).filter(image=>!result.find(p=>p.location===image.location)?.text.trim()),recognized=await ocr(images);for(const passage of recognized){const index=result.findIndex(p=>p.location===passage.location);if(index>=0)result[index]=passage}}return result}
  if(ext==='docx'){const r=await 桥接.office.readDocx(data);if(!r.成功)throw new Error(r.错误||'文字文档解析失败');const html=r.html||r.内容||'';return [{location:'正文',text:plain(html)}]}
  if(ext==='xlsx'){const r=await 桥接.office.readXlsx(data);if(!r.成功)throw new Error(r.错误||'表格解析失败');return (r.工作表列表||[]).map((sheet:any,i:number)=>({location:sheet.name||sheet.名称||`工作表 ${i+1}`,text:sheet.html?plain(sheet.html):Object.values(sheet.单元格||{}).map(v=>collect(v)).join(' ')}))}
  if(ext==='pptx'){const r=await 桥接.office.readPptx(data);if(!r.成功)throw new Error(r.错误||'演示解析失败');const deck=r.演示文稿||r.模型||r;return (deck.幻灯片列表||[]).map((slide:any,i:number)=>({location:`第 ${i+1} 页`,text:[slide.title,slide.备注,...(slide.文本框列表||[]).map((n:any)=>n.text),...(slide.对象列表||[]).map(collect)].filter(Boolean).join('\n')}))}
  throw new Error('此格式暂无法安全提取内容，请转换为 DOCX、XLSX、PPTX、PDF、TXT 或 MD')
}
export function retrieval(passages:Passage[],question:string,limit=8){const terms=[...new Set(question.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]{1,2}/g)||[])];return passages.map(p=>({...p,score:terms.reduce((n,w)=>n+(p.text.toLowerCase().includes(w)?w.length:0),0)})).sort((a,b)=>b.score-a.score).slice(0,limit)}
