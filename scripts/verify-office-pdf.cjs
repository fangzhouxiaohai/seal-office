const { app } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { PDFDocument } = require('pdf-lib')
const { 转换文档 } = require('../main/office/nativeConversion')
const { 生成docx } = require('../main/office/docxWriter')
const { 写入xlsx } = require('../main/office/xlsxCodec')
const { 写入pptx } = require('../main/office/pptxCodec')
const { 写入兼容文档 } = require('../main/office/compatibleFormats')
const output = path.resolve(__dirname, '../.upgrade-private/office-pdf-third-pass')
const result = { startedAt:new Date().toISOString(),engine:'bundled LibreOffice, isolated profile per job',checks:[],failures:[] }
app.whenReady().then(async()=>{
  fs.mkdirSync(output,{recursive:true})
  try {
    const paragraph=text=>({类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:text,字号:24}]})
    const wordModel={段落:[paragraph('PDF 页一：中文 0012'),{类型:'分页符'},paragraph('PDF 页二：中文 0012')],未覆盖:[]},word=await 生成docx(wordModel)
    const sheet=await 写入xlsx({工作表:[{名称:'PDF 表格',数据:[['PDF 表格 0012','金额'],['中文',123]],页面设置:{方向:'横向',纸张大小:'A4',页边距:'常规'}}]})
    const slides=await 写入pptx({页面尺寸:{宽:960,高:540},幻灯片:[{id:'p1',背景色:'#FFFFFF',文本框:[{id:'t1',x:40,y:50,width:700,height:90,text:'PDF 幻灯片一 0012',字号:24,颜色:'#222222'}]},{id:'p2',背景色:'#EAF2FF',文本框:[{id:'t2',x:40,y:50,width:700,height:90,text:'PDF 幻灯片二 0012',字号:24,颜色:'#222222'}]}]})
    for(const [type,extension,bytes,count,landscape]of (process.argv.includes('--complex-only')?[]:[['word','docx',word,2,false],['table','xlsx',sheet,1,true],['ppt','pptx',slides,2,true]])){
      const started=Date.now(), source=Buffer.from(bytes), pdf=type==='word'?await 写入兼容文档(type,'pdf',wordModel):await 转换文档(bytes,extension,'pdf',type), document=await PDFDocument.load(pdf,{throwOnInvalidObject:true})
      assert.equal(document.getPageCount(),count,type+' page count')
      for(const page of document.getPages())assert.equal(page.getWidth()>page.getHeight(),landscape,type+' orientation')
      assert.deepEqual(bytes,source,type+' source unchanged')
      fs.writeFileSync(path.join(output,type+'.'+extension),bytes);fs.writeFileSync(path.join(output,type+'.pdf'),pdf)
      result.checks.push({type,extension,pages:count,pdfBytes:pdf.length,milliseconds:Date.now()-started,orientation:landscape?'landscape':'portrait'})
      console.log('PASS '+type+' → PDF '+count+' pages')
    }
    for(const name of ['complex-sections','complex-sections-saved']){
    const complexPath=path.resolve(__dirname,'../.upgrade-private/word-v200-final/'+name+'.docx')
    if(fs.existsSync(complexPath)){
      const bytes=fs.readFileSync(complexPath),pdf=await 转换文档(bytes,'docx','pdf','word'),document=await PDFDocument.load(pdf,{throwOnInvalidObject:true}),sizes=document.getPages().map(page=>({width:page.getWidth(),height:page.getHeight()}))
      assert(sizes.some(size=>size.width>size.height),'complex document includes landscape page');assert(sizes.some(size=>size.height>size.width),'complex document includes portrait page')
      assert.equal(document.getPageCount(),5,'odd-page section retains automatically inserted blank page')
      fs.writeFileSync(path.join(output,name+'.pdf'),pdf);result.checks.push({type:'word-'+name,pages:document.getPageCount(),sizes,pdfBytes:pdf.length,retainsOddSectionBlankPage:true})
      console.log('PASS mixed sections → PDF '+document.getPageCount()+' pages')
    }
    }
  }catch(error){result.failures.push(error.stack);console.error(error.stack)}
  result.finishedAt=new Date().toISOString();result.status=result.failures.length?'failed':'passed'
  fs.writeFileSync(path.join(output,process.argv.includes('--complex-only')?'verification-complex-blank-fix.json':'verification.json'),JSON.stringify(result,null,2));app.exit(result.failures.length?1:0)
})
