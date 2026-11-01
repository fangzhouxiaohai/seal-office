const JSZip=require('jszip'),path=require('node:path')
const {readSeal,TYPES}=require('./nativeCodec.cjs')
const {解析皮肤文本}=require('./skinFormat.cjs')

const validatePdf=raw=>{if(!raw.subarray(0,8).toString().startsWith('%PDF-'))throw new Error('PDF 文件签名无效');if(/\/(JavaScript|Launch|EmbeddedFile|JS)\b/.test(raw.toString('latin1')))throw new Error('公开 PDF 不能包含活动脚本或嵌入程序')}
const decodeAttribute=value=>value.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi,(_,hex,decimal)=>{const code=parseInt(hex||decimal,hex?16:10);return code<=0x10ffff?String.fromCodePoint(code):''}).replace(/&(colon|Tab|NewLine|amp);/g,(_,name)=>({colon:':',Tab:'\t',NewLine:'\n',amp:'&'})[name])
function validateMarkup(text){
  if(/<\s*(script|iframe|object|embed|base|meta|link|foreignObject)\b|\bon[a-z]+\s*=/i.test(text))throw new Error('公开文档不能包含活动脚本或嵌入程序')
  const normalized=decodeAttribute(text).replace(/[\u0000-\u0020\u007f]/g,'')
  if(/(?:javascript|vbscript|file):|data:(?:text\/html|application\/(?:javascript|x-msdownload))/i.test(normalized)||/expression\(|-moz-binding|behavior:/i.test(normalized))throw new Error('文档包含不安全的外部链接')
}
async function validateNative(payload){
  let count=0
  const visit=async(value,key='',depth=0)=>{
    if(++count>3000000||depth>256)throw new Error('文档结构超出安全限制')
    if(typeof value==='string'){
      if(/html$/i.test(key)||key==='html'){
        validateMarkup(value)
        // 原生文字会保留原始 OOXML 以完整往返；公开时也检查该包，不能夹带宏。
        for(const match of value.matchAll(/\bdata-seal-docx-package\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)){
          const data=match[1]??match[2]??match[3]
          if(!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw new Error('DOCX 原始包无效')
          await validatePublic(Buffer.from(data,'base64'),'source.docx','knowledge')
        }
      }
      if(/^data:image\/svg\+xml[;,]/i.test(value)){
        const comma=value.indexOf(','),header=value.slice(0,comma),body=value.slice(comma+1)
        validateMarkup(/;base64$/i.test(header)?Buffer.from(body,'base64').toString('utf8'):decodeURIComponent(body))
      }
      if(/^(?:src|href|url|uri|链接|地址|路径|来源地址)$/i.test(key))validateMarkup(value)
      return
    }
    if(!value||typeof value!=='object')return
    if(!Array.isArray(value)&&value.类型==='image/svg+xml'&&typeof value.数据==='string')validateMarkup(Buffer.from(value.数据,'base64').toString('utf8'))
    if(Array.isArray(value)){for(const item of value)await visit(item,key,depth+1)}
    else for(const [name,item] of Object.entries(value))await visit(item,name,depth+1)
  }
  await visit(payload)
  if(payload.类型==='pdf')validatePdf(Buffer.from(payload.PDF数据,'base64'))
}

/** 公开文件经过有限解析；不执行宏、脚本或文档嵌入程序。 */
async function validatePublic(raw,name,kind){
  const ext=path.extname(name||'').toLowerCase()
  if(kind==='skin'){
    if(ext!=='.sealskin')throw new Error('公开皮肤须为 .sealskin 文件')
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw)}catch{throw new Error('皮肤文件须为 UTF-8 编码的 JSON')}
    解析皮肤文本(text);return
  }
  const native=TYPES[ext.slice(1)]
  if(!native&&!['.docx','.xlsx','.pptx','.pdf','.txt','.md'].includes(ext)||(kind==='template'&&ext!=='.pptx'&&native!=='ppt'))throw new Error('公开文件仅接受海豹专属文档、DOCX、XLSX、PPTX、PDF、TXT 或 MD；模板须为 SLPPT 或 PPTX')
  if(raw.length===0||raw.length>10*1024*1024)throw new Error('公开文件为空或超过 10 MiB')
  if(native){await validateNative(await readSeal(ext,raw));return}
  if(ext==='.txt'||ext==='.md'){new TextDecoder('utf-8',{fatal:true}).decode(raw);return}
  if(ext==='.pdf'){validatePdf(raw);return}
  if(raw.length<4||raw.readUInt32LE(0)!==0x04034b50)throw new Error('Office 文件签名无效')
  const zip=await JSZip.loadAsync(raw),files=Object.values(zip.files)
  if(files.length>2000)throw new Error('文档部件过多')
  let total=0
  for(const file of files){
    const name=file.unsafeOriginalName||file.name
    if(name.split('/').includes('..')||name.startsWith('/')||name.includes('\\'))throw new Error('文档包含不安全的部件路径')
    if(/vbaProject|\.exe$|\.dll$|\.js$|\.vbs$|\.cmd$|\.bat$|\.ps1$|activeX\//i.test(name))throw new Error('公开文档不能包含宏或可执行内容')
    total+=file._data?.uncompressedSize||0
    if(total>80*1024*1024||(file._data?.uncompressedSize||0)>20*1024*1024)throw new Error('文档解压后超过安全体积限制')
  }
  const required={'.docx':'word/document.xml','.xlsx':'xl/workbook.xml','.pptx':'ppt/presentation.xml'}[ext]
  if(!zip.file('[Content_Types].xml')||!zip.file(required))throw new Error('文档核心部件缺失')
  for(const file of files.filter(f=>/\.(xml|rels)$/.test(f.name))){const text=await file.async('string');if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('文档包含不安全的 XML 声明');if(/TargetMode\s*=\s*["']External["'][^>]*Target\s*=\s*["'](?:file:|javascript:)/i.test(text))throw new Error('文档包含不安全的外部链接')}
}
/** 皮肤封面由客户端按颜色生成 SVG 色板；只接受 SVG data URL 并检查活动内容。 */
function validateSkinCover(cover){
  if(cover===''||cover===undefined)return
  const match=typeof cover==='string'&&/^data:image\/svg\+xml;base64,([A-Za-z0-9+/]+={0,2})$/.exec(cover)
  if(!match||cover.length>64*1024)throw new Error('皮肤封面须为 64 KB 以内的 SVG 色板')
  const svg=Buffer.from(match[1],'base64').toString('utf8')
  if(/<\s*(script|style|image|use|a)\b|href\s*=/i.test(svg))throw new Error('皮肤封面不能包含活动脚本或外部引用')
  try{validateMarkup(svg)}catch{throw new Error('皮肤封面不能包含活动脚本或外部引用')}
}
module.exports={validatePublic,validateSkinCover}
