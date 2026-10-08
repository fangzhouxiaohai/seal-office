const JSZip=require('jszip'),path=require('node:path')

/** 公开文件经过有限解析；不执行宏、脚本或文档嵌入程序。 */
async function validatePublic(raw,name,kind){
  const ext=path.extname(name||'').toLowerCase()
  if(!['.docx','.xlsx','.pptx','.pdf','.txt','.md'].includes(ext)||(kind==='template'&&ext!=='.pptx'))throw new Error('公开文件仅接受 DOCX、XLSX、PPTX、PDF、TXT 或 MD；模板须为 PPTX')
  if(raw.length===0||raw.length>10*1024*1024)throw new Error('公开文件为空或超过 10 MiB')
  if(ext==='.txt'||ext==='.md'){new TextDecoder('utf-8',{fatal:true}).decode(raw);return}
  if(ext==='.pdf'){if(!raw.subarray(0,8).toString().startsWith('%PDF-'))throw new Error('PDF 文件签名无效');if(/\/(JavaScript|Launch|EmbeddedFile|JS)\b/.test(raw.toString('latin1')))throw new Error('公开 PDF 不能包含活动脚本或嵌入程序');return}
  if(raw.readUInt32LE(0)!==0x04034b50)throw new Error('Office 文件签名无效')
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
module.exports={validatePublic}
