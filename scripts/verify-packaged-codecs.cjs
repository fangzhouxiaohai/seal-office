// Run with Electron: electron scripts/verify-packaged-codecs.cjs <app.asar> <report-directory>
// Tests packaged backend modules with real files. This does not automate app UI.
const {app,nativeImage}=require('electron')
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const archive=path.resolve(process.argv[2]),output=path.resolve(process.argv[3])
app.setPath('userData',path.join(output,'profile'))
app.whenReady().then(async()=>{
  const checks=[]
  try{
    fs.mkdirSync(output,{recursive:true})
    const load=name=>require(path.join(archive,name))
    const integrity=load('main/integrity.js').检查安装目录(archive)
    assert.equal(integrity.完整,true);checks.push(`完整性清单：${integrity.检查文件数} 个文件`)
    assert.equal(load('package.json').version,require('../package.json').version)
    const png=nativeImage.createFromBuffer(Buffer.from([0,0,255,255]),{width:1,height:1}).toPNG().toString('base64')
    const paragraph=text=>({类型:'段落',文字:[{文本:text}]})
    const model={段落:[paragraph('海豹办公成品文件测试'),{类型:'段落',文字:[{文本:'',图片:{数据:png,格式:'png',宽:48,高:48,说明:'正文图片'}}]}],页眉:[paragraph('海豹办公页眉')],页脚:[paragraph('页脚联系信息')]}
    const word=await load('main/office/docxWriter.js').生成docx(model)
    fs.writeFileSync(path.join(output,'verify.docx'),word)
    const doc=await load('main/office/docxReader.js').读取docx(word)
    assert.deepEqual(doc.警告,[]);assert.match(doc.html,/data:image\/png;base64/)
    assert.match(doc.页面设置.页眉Html,/海豹办公页眉/);assert.match(doc.页面设置.页脚Html,/页脚联系信息/)
    checks.push('DOCX：正文图片、页眉与页脚保存重开')
    const ExcelJS=load('node_modules/exceljs'),book=new ExcelJS.Workbook()
    const sheet=book.addWorksheet('销售');sheet.addRow(['产品','金额']);sheet.addRow(['海豹',300]);sheet.addRow(['合计',{formula:'SUM(B2:B2)',result:300}])
    sheet.addImage(book.addImage({base64:png,extension:'png'}),{tl:{col:3,row:0},ext:{width:32,height:32}})
    book.addWorksheet('说明').addRow(['第二张工作表'])
    const xlsx=await book.xlsx.writeBuffer();fs.writeFileSync(path.join(output,'verify.xlsx'),Buffer.from(xlsx))
    const table=await load('main/office/xlsxCodec.js').读取xlsx(xlsx)
    assert.equal(table.工作表列表.length,2);assert.equal(table.工作表列表[0].元数据.图片.length,1);assert.deepEqual(table.警告,[])
    checks.push('XLSX：多表、公式及图片导入')
    const xlsxCodec=load('main/office/xlsxCodec.js')
    const format={字体:'Arial',字号:15,加粗:true,斜体:true,下划线:true,字体颜色:'#C00000',填充颜色:'#FFFF00',水平对齐:'center',垂直对齐:'middle',自动换行:true,边框:{上:true,下:true,左:true,右:true},边框颜色:{上:'#336699',下:'#336699',左:'#336699',右:'#336699'}}
    let workbookModel={工作表:[{名称:'格式回归',数据:[[{文字:[{文本:'标题'}],格式:format},{文字:[{文本:'金额'}]}],[{文字:[{文本:'项目'}]},{公式:'SUM(100,200)',结果:300,格式:{数字格式:'数值',小数位:2}}]],列宽:[196,140],行高:[40,32],冻结:{行:1,列:1},图片:[{数据:png,格式:'png',列:3,行:0,宽:32,高:32}],页面设置:{方向:'横向',纸张大小:'A4',页边距:'常规'}}]}
    for(let cycle=1;cycle<=3;cycle++){
      const bytes=await xlsxCodec.写入xlsx(workbookModel),imported=await xlsxCodec.读取xlsx(bytes)
      assert.deepEqual(imported.警告,[])
      const entry=imported.工作表列表[0],meta=entry.元数据
      assert.deepEqual(meta.单元格格式.A1,format);assert.equal(meta.图片.length,1)
      assert.deepEqual(meta.冻结,{行:1,列:1});assert.equal(meta.列宽[0],196);assert.equal(meta.行高[0],40)
      const raw=new ExcelJS.Workbook();await raw.xlsx.load(bytes);assert.equal(raw.worksheets[0].getCell('B2').value.formula,'SUM(100,200)')
      const data=Array.from({length:2},(_,row)=>Array.from({length:2},(_,col)=>{
        const cell=raw.worksheets[0].getCell(row+1,col+1),style=meta.单元格格式[cell.address]
        return cell.value?.formula?{公式:cell.value.formula,结果:cell.value.result,格式:style}:{文字:[{文本:cell.text}],格式:style}
      }))
      workbookModel={工作表:[{名称:entry.名称,数据:data,列宽:[meta.列宽[0],meta.列宽[1]],行高:[meta.行高[0],meta.行高[1]],冻结:meta.冻结,图片:meta.图片,页面设置:entry.页面设置}]}
      fs.writeFileSync(path.join(output,`formatted-${cycle}.xlsx`),bytes)
    }
    checks.push('XLSX：字号、字体、颜色、填充、边框、对齐、行列尺寸、冻结、公式及图片连续三次保存重开')
    const resourceId=require('crypto').createHash('sha256').update(Buffer.from(png,'base64')).digest('hex')
    const slides=Array.from({length:3},(_,i)=>({id:'page-'+i,背景色:'#FFFFFF',文本框:[{id:'text-'+i,text:'海豹演示 '+(i+1),x:30,y:40,width:300,height:60,字号:24,颜色:'#000000'}],对象列表:[{id:'image-'+i,类型:'图片',x:30,y:180,width:48,height:48,资源标识:resourceId}]}))
    const pptx=await load('main/office/pptxCodec.js').写入pptx({幻灯片:slides,资源条目:[{标识:resourceId,类型:'image/png',数据:png}]});fs.writeFileSync(path.join(output,'verify.pptx'),pptx)
    const presentation=await load('main/office/pptxCodec.js').读取pptx(pptx)
    assert.equal(presentation.演示文稿.幻灯片列表.length,3);assert.deepEqual(presentation.警告,[])
    checks.push('PPTX：三页文字与图片导入')
    let presentationModel={幻灯片:slides.map(slide=>({...slide,备注:'备注 & <内容>',文本框:slide.文本框.map(text=>({...text,字体:'Arial',字号:28,加粗:true,斜体:true,下划线:true,颜色:'#C00000',对齐:'center'}))})),资源条目:[{标识:resourceId,类型:'image/png',数据:png}]}
    for(let cycle=1;cycle<=3;cycle++){
      const bytes=await load('main/office/pptxCodec.js').写入pptx(presentationModel),imported=await load('main/office/pptxCodec.js').读取pptx(bytes)
      assert.deepEqual(imported.警告,[]);assert.equal(imported.演示文稿.幻灯片列表.length,3)
      imported.演示文稿.幻灯片列表.forEach((slide,i)=>{
        const text=slide.文本框列表[0];assert.equal(text.text,'海豹演示 '+(i+1));assert.equal(text.字号,28);assert.equal(text.加粗,true);assert.equal(text.斜体,true);assert.equal(text.下划线,true);assert.equal(text.颜色,'#C00000');assert.equal(text.对齐,'center');assert.equal(slide.备注,'备注 & <内容>');assert.equal(slide.对象列表.filter(object=>object.类型==='图片').length,1)
      })
      presentationModel={...imported.演示文稿,资源条目:imported.资源条目};fs.writeFileSync(path.join(output,`formatted-${cycle}.pptx`),bytes)
    }
    checks.push('PPTX：三页文字字号、字体格式、颜色、对齐、图片及备注连续三次保存重开')
    const {PDFDocument}=load('node_modules/pdf-lib')
    const pdfDoc=await PDFDocument.create();for(let i=0;i<3;i++)pdfDoc.addPage().drawText('Seal Office page '+(i+1),{x:40,y:700})
    let pdf=Buffer.from(await pdfDoc.save()),tools=load('main/pdf/pdfTools.js')
    pdf=await tools.编辑页面(pdf,{类型:'text',页码:1,x:40,y:40,文字:'Release verified',字号:12,颜色:'#000000'})
    pdf=await tools.旋转页面(pdf,[2],90);pdf=await tools.插入空白页(pdf,2);pdf=await tools.删除页面(pdf,[4])
    assert.equal((await PDFDocument.load(pdf)).getPageCount(),3)
    fs.writeFileSync(path.join(output,'verify.pdf'),pdf);checks.push('PDF：文字编辑、旋转、插入及删除页面保存重开')
    const preview=await load('main/pdfExport.js').createPdfFromHtml('<html><body><h1>Seal Office print preview</h1><p>Header, body and footer</p><img width="48" src="data:image/png;base64,'+png+'"></body></html>')
    assert.ok((await PDFDocument.load(preview)).getPageCount()>0);fs.writeFileSync(path.join(output,'print-preview.pdf'),preview)
    checks.push('打印预览：成品模块生成真实 PDF')
    const report={version:load('package.json').version,passed:true,checks}
    fs.writeFileSync(path.join(output,'packaged-codecs.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
    app.exit(0)
  }catch(error){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'packaged-codecs.json'),JSON.stringify({passed:false,checks,error:error.message},null,2));console.error(error);app.exit(1)}
})
