const {test}=require('node:test'),assert=require('node:assert/strict'),JSZip=require('jszip')
const {validatePublic}=require('../publicValidation.cjs')
const {writeSeal}=require('../nativeCodec.cjs')
test('公开格式、文件签名、宏、路径、XML 实体和解压大小检查',async()=>{
  await assert.rejects(validatePublic(Buffer.from('exe'),'x.exe','knowledge'))
  await assert.rejects(validatePublic(Buffer.from('fake'),'x.pdf','knowledge'))
  await assert.rejects(validatePublic(Buffer.from('%PDF-1.7 /JavaScript'),'x.pdf','knowledge'))
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types/>');zip.file('ppt/presentation.xml','<p:presentation/>')
  await validatePublic(await zip.generateAsync({type:'nodebuffer'}),'x.pptx','template')
  zip.file('ppt/vbaProject.bin','macro');await assert.rejects(validatePublic(await zip.generateAsync({type:'nodebuffer'}),'x.pptx','template'))
  zip.remove('ppt/vbaProject.bin');zip.file('ppt/presentation.xml','<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><a/>');await assert.rejects(validatePublic(await zip.generateAsync({type:'nodebuffer'}),'x.pptx','template'))
})

test('四种原生格式及三种旧扩展可公开，演示原生模板不必转成 PPTX',async()=>{
  const payloads={word:{html:'<h1>𠮷 中文 🦭</h1><svg><rect width="4" height="2"/></svg>'},table:{工作表列表:[{名称:'完整数据',单元格:{A1:{值:'00123'},B1:{公式:'=SEQUENCE(2)'}}}]},ppt:{演示文稿:{幻灯片列表:[{title:'海豹模板𠮷'}]},资源条目:[]},pdf:{PDF数据:Buffer.from('%PDF-1.7\nunchanged bytes').toString('base64')}}
  for(const [type,extensions] of Object.entries({word:['sldoc','sealdoc'],table:['slxls','sealsheet'],ppt:['slppt','sealshow'],pdf:['spdf']})){
    const raw=await writeSeal(type,payloads[type])
    for(const ext of extensions)await validatePublic(raw,'原生文件.'+ext,type==='ppt'?'template':'knowledge')
  }
  await assert.rejects(validatePublic(await writeSeal('word',payloads.word),'x.sldoc','template'),/模板须为/)
})

test('原生容器类型、完整性和嵌套 PDF 活动内容同样校验',async()=>{
  const raw=await writeSeal('word',{html:'<p>正文</p>'})
  await assert.rejects(validatePublic(raw,'wrong.slxls','knowledge'),/扩展名与文档类型/)
  const zip=await JSZip.loadAsync(raw);zip.file('document.json','{"data":{"html":"改过"},"special":[]}')
  await assert.rejects(validatePublic(await zip.generateAsync({type:'nodebuffer'}),'corrupt.sldoc','knowledge'))
  await assert.rejects(validatePublic(await writeSeal('pdf',{PDF数据:Buffer.from('%PDF-1.7 /Launch').toString('base64')}),'unsafe.spdf','knowledge'),/活动脚本/)
})

test('原生 HTML、SVG、链接和保留的 OOXML 包不能夹带活动内容',async()=>{
  for(const html of ['<script>alert(1)</script>','<img src="x" onerror="alert(1)">','<a href="java&#115;cript&colon;alert(1)">x</a>','<img src="file:///secret">']){
    await assert.rejects(validatePublic(await writeSeal('word',{html}),'unsafe.sldoc','knowledge'))
  }
  const svg=Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64')
  await assert.rejects(validatePublic(await writeSeal('ppt',{演示文稿:{幻灯片列表:[]},资源条目:[{类型:'image/svg+xml',数据:svg}]}),'unsafe.slppt','template'),/活动脚本/)
  const zip=new JSZip();zip.file('[Content_Types].xml','<Types/>');zip.file('word/document.xml','<w:document/>');zip.file('word/vbaProject.bin','macro')
  const source=(await zip.generateAsync({type:'nodebuffer'})).toString('base64')
  for(const attr of [`"${source}"`,source])await assert.rejects(validatePublic(await writeSeal('word',{html:`<div data-seal-docx-package=${attr}></div>`}),'unsafe.sldoc','knowledge'),/宏或可执行/)
})
