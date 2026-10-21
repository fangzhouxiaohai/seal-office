const JSZip = require('jszip')
const { createHash } = require('crypto')
// Version 1 containers remain readable under their original extensions.
const TYPES = { sldoc:'word', slxls:'table', slppt:'ppt', spdf:'pdf', sealdoc:'word', sealsheet:'table', sealshow:'ppt' }
const MIME = 'application/vnd.seal-office.document+zip'
const LIMIT = 100 * 1024 * 1024
const hash = value => createHash('sha256').update(value).digest('hex')
const crcTable=Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0})
const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0}
const reject = message => { throw new Error('海豹文档：' + message) }
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)
function validatePayload(type,payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))reject('文档数据无效')
  if(payload.警告!==undefined&&(!Array.isArray(payload.警告)||!payload.警告.every(item=>typeof item==='string')))reject('导入提示结构无效')
  if(type==='word'&&typeof payload.html==='string')return
  if(type==='table'&&Array.isArray(payload.工作表列表)&&payload.工作表列表.length>0)return
  if(type==='ppt'&&payload.演示文稿&&Array.isArray(payload.演示文稿.幻灯片列表)&&Array.isArray(payload.资源条目))return
  if(type==='pdf'&&typeof payload.PDF数据==='string'&&payload.PDF数据.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(payload.PDF数据)){
    const bytes=Buffer.from(payload.PDF数据,'base64')
    if(bytes.subarray(0,5).toString('ascii')==='%PDF-'&&bytes.toString('base64')===payload.PDF数据)return
  }
  reject('文档类型与内容不匹配')
}
// Explicit tags preserve values JSON normally drops, including formula cache sentinels.
function pack(value){
  const special=[],parents=new Set();let count=0
  function visit(item,location){
    if(++count>3000000||location.length>256)reject('文档结构超出限制')
    if(item===undefined||typeof item==='number'&&(!Number.isFinite(item)||Object.is(item,-0))){special.push({path:location,value:item===undefined?'undefined':Number.isNaN(item)?'NaN':item===Infinity?'Infinity':item===-Infinity?'-Infinity':'-0'});return null}
    if(item===null||['string','number','boolean'].includes(typeof item))return item
    if(typeof item!=='object'||parents.has(item))reject('文档包含无法保存的循环引用或数据类型')
    if(!Array.isArray(item)&&Object.getPrototypeOf(item)!==Object.prototype&&Object.getPrototypeOf(item)!==null)reject('文档包含非标准对象')
    parents.add(item)
    const result=Array.isArray(item)?Array.from(item,(entry,index)=>visit(entry,[...location,index])):Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,visit(entry,[...location,key])]))
    parents.delete(item);return result
  }
  return Buffer.from(JSON.stringify({data:visit(value,[]),special}),'utf8')
}
function unpack(raw){
  let doc;try{doc=JSON.parse(raw.toString('utf8'))}catch{reject('内容数据损坏')}
  if(!doc||!Array.isArray(doc.special)||doc.special.length>3000000)reject('内容结构损坏')
  const values={undefined:undefined,NaN:NaN,Infinity:Infinity,'-Infinity':-Infinity,'-0':-0}
  for(const entry of doc.special){
    if(!entry||!Array.isArray(entry.path)||!entry.path.length||entry.path.length>256||!own(values,entry.value))reject('特殊值记录损坏')
    let target=doc.data
    for(const key of entry.path.slice(0,-1)){if(!target||typeof target!=='object'||!own(target,key))reject('特殊值路径损坏');target=target[key]}
    const key=entry.path[entry.path.length-1]
    if(!target||typeof target!=='object'||!['string','number'].includes(typeof key)||!own(target,key)||target[key]!==null)reject('特殊值目标损坏')
    Object.defineProperty(target,key,{value:values[entry.value],enumerable:true,configurable:true,writable:true})
  }
  return doc.data
}
function validateArchive(raw){
  if(!Buffer.isBuffer(raw)||raw.length<22||raw.length>LIMIT)reject('文件为空或超过 100 MiB')
  let end=-1
  for(let at=raw.length-22;at>=Math.max(0,raw.length-65557);at--)if(raw.readUInt32LE(at)===0x06054b50&&at+22+raw.readUInt16LE(at+20)===raw.length){end=at;break}
  if(end<0||raw.readUInt16LE(end+4)!==0||raw.readUInt16LE(end+6)!==0||raw.readUInt16LE(end+8)!==3||raw.readUInt16LE(end+10)!==3)reject('压缩容器结构不正确')
  const offset=raw.readUInt32LE(end+16),size=raw.readUInt32LE(end+12),names=new Map(),ranges=[];let at=offset,total=0
  if(offset+size!==end)reject('压缩目录损坏')
  for(let i=0;i<3;i++){
    if(at+46>end||raw.readUInt32LE(at)!==0x02014b50)reject('压缩条目损坏')
    const flags=raw.readUInt16LE(at+8),method=raw.readUInt16LE(at+10),compressed=raw.readUInt32LE(at+20),expanded=raw.readUInt32LE(at+24),nameLength=raw.readUInt16LE(at+28),extra=raw.readUInt16LE(at+30),comment=raw.readUInt16LE(at+32),local=raw.readUInt32LE(at+42)
    const next=at+46+nameLength+extra+comment,name=raw.subarray(at+46,at+46+nameLength).toString('utf8')
    if(next>end||flags&1||![0,8].includes(method)||!['mimetype','manifest.json','document.json'].includes(name)||names.has(name)||expanded>LIMIT||(total+=expanded)>LIMIT)reject('条目类型、大小或路径无效')
    if(name==='manifest.json'&&expanded>65536)reject('清单超出大小限制')
    if(local+30>offset||raw.readUInt32LE(local)!==0x04034b50||raw.readUInt16LE(local+6)!==flags||raw.readUInt16LE(local+8)!==method||raw.readUInt16LE(local+26)!==nameLength)reject('条目头损坏')
    const start=local+30+nameLength+raw.readUInt16LE(local+28),finish=start+compressed
    if(finish>offset||raw.subarray(local+30,local+30+nameLength).toString('utf8')!==name)reject('条目范围损坏')
    if(name==='mimetype'&&(local!==0||method!==0||expanded!==Buffer.byteLength(MIME)))reject('文件标识损坏')
    ranges.push([local,finish]);names.set(name,{expanded,crc:raw.readUInt32LE(at+16)});at=next
  }
  ranges.sort((a,b)=>a[0]-b[0]);if(at!==end||ranges.some((range,i)=>i&&range[0]<ranges[i-1][1]))reject('压缩条目重叠')
  return names
}
function boundedEntry(zip,name,record){return new Promise((resolve,rejectEntry)=>{
  const chunks=[],stream=zip.file(name).internalStream('uint8array');let size=0,failed=false
  stream.on('data',chunk=>{if(failed)return;size+=chunk.length;if(size>record.expanded){failed=true;stream.pause();rejectEntry(new Error('海豹文档：解压内容超过声明大小'));return}chunks.push(Buffer.from(chunk))})
  stream.on('error',error=>{if(!failed){failed=true;rejectEntry(error)}})
  stream.on('end',()=>{if(failed)return;const bytes=Buffer.concat(chunks);if(size!==record.expanded||crc32(bytes)!==record.crc)return rejectEntry(new Error('海豹文档：压缩内容校验失败'));resolve(bytes)})
  stream.resume()
})}
async function writeSeal(type,payload){
  if(!Object.values(TYPES).includes(type))reject('不支持的文档类型')
  validatePayload(type,payload);const document=pack(payload)
  if(document.length>LIMIT-8192)reject('文档数据超过 100 MiB')
  const zip=new JSZip()
  zip.file('mimetype',MIME,{compression:'STORE'})
  zip.file('manifest.json',JSON.stringify({format:'seal-office',version:1,type,encoding:'seal-json-1',document:{path:'document.json',bytes:document.length,sha256:hash(document)}}))
  zip.file('document.json',document)
  const output=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}})
  if(output.length>LIMIT)reject('生成文件超过 100 MiB');return output
}
async function readSeal(extension,raw){
  const expected=TYPES[String(extension).replace(/^\./,'').toLowerCase()];if(!expected)reject('不支持的扩展名')
  const records=validateArchive(raw)
  let zip;try{zip=await JSZip.loadAsync(raw)}catch{reject('压缩数据校验失败')}
  if((await boundedEntry(zip,'mimetype',records.get('mimetype'))).toString('utf8')!==MIME)reject('文件标识不正确')
  let manifest;try{manifest=JSON.parse((await boundedEntry(zip,'manifest.json',records.get('manifest.json'))).toString('utf8'))}catch{reject('清单损坏')}
  if(manifest.format!=='seal-office'||manifest.version!==1||manifest.encoding!=='seal-json-1')reject('文档版本不受支持，请升级海豹办公后重试')
  if(manifest.type!==expected||manifest.document?.path!=='document.json')reject('扩展名与文档类型不一致')
  const document=await boundedEntry(zip,'document.json',records.get('document.json'))
  if(document.length!==manifest.document.bytes||hash(document)!==manifest.document.sha256)reject('内容完整性校验失败')
  const payload=unpack(document);validatePayload(expected,payload);return {...payload,类型:expected}
}
module.exports={writeSeal,readSeal,TYPES}
