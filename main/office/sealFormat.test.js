const JSZip=require('jszip'),{writeSeal,readSeal}=require('./sealFormat')
const word={html:'<p>𠮷𰻞🦭e\u0301 العربية 日本語</p><span data-seal-docx-package="原包字节">保留修订</span>',页面设置:{页眉Html:'<p>页眉</p>',分节:[{纸张宽:210}]},可选:undefined,数值:[NaN,Infinity,-Infinity,-0]}
describe('海豹原生格式容器',()=>{
  it.each([['word','sealdoc',word],['table','sealsheet',{工作表列表:[{name:'公式',单元格:{A1:{原始值:'=SEQUENCE(3,2)',显示值:'1',动态数组:true},B1:{原始值:'𠮷🦭',格式:{字体:'宋体'}}},原包:'UEsDBA=='}]}],['ppt','sealshow',{演示文稿:{幻灯片列表:[{id:'slide',文本框列表:[{text:'图片与𠮷🦭'}],对象列表:[{type:'drawing',original:'保留对象'}]}]},资源条目:[{标识:'asset',数据:'AAECAw=='}]}]])('保留 %s 全模型、Unicode 与来源数据',async(type,extension,payload)=>{
    const output=await writeSeal(type,payload),opened=await readSeal(extension,output)
    expect(opened).toEqual({...payload,类型:type})
    const zip=await JSZip.loadAsync(output)
    expect(Object.keys(zip.files)).toEqual(['mimetype','manifest.json','document.json'])
    expect((await zip.file('manifest.json').async('string'))).toContain('seal-office')
  })
  it('拒绝错误扩展、未来版本、截断、额外路径和损坏的内容摘要',async()=>{
    const source=await writeSeal('word',word)
    await expect(readSeal('sealsheet',source)).rejects.toThrow(/扩展名/)
    await expect(readSeal('sealdoc',source.subarray(0,source.length-1))).rejects.toThrow()
    for(const mode of ['version','hash','path']){
      const zip=await JSZip.loadAsync(source),manifest=JSON.parse(await zip.file('manifest.json').async('string'))
      if(mode==='version')manifest.version=999
      if(mode==='hash')manifest.document.sha256='0'.repeat(64)
      if(mode==='path')zip.file('unexpected/entry','x')
      zip.file('manifest.json',JSON.stringify(manifest))
      await expect(readSeal('sealdoc',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}))).rejects.toThrow()
    }
  })
  it.each([['word','sldoc','sealdoc',word],['table','slxls','sealsheet',{工作表列表:[{name:'预算.最终',单元格:{A1:{原始值:'=SEQUENCE(2,2)'},B4:{原始值:'001𠮷🦭'}}}]}],['ppt','slppt','sealshow',{演示文稿:{幻灯片列表:[{id:'一',备注:'𠮷🦭'}]},资源条目:[{标识:'图片',数据:'AAECAw=='}]}]])('新旧 %s 扩展读写同一完整模型',async(type,current,legacy,payload)=>{
    const bytes=await writeSeal(type,payload)
    const next=await readSeal(current,bytes)
    expect(next).toEqual({...payload,类型:type})
    expect(await readSeal(legacy,bytes)).toEqual(next)
    expect(await readSeal(current,await writeSeal(type,next))).toEqual(next)
  })
  it('保留文档实际使用的嵌入字体并校验大小与 SHA-256',async()=>{
    const {createHash}=require('crypto'),font=Buffer.from([0,1,0,0,0,0,0,1,0,0,0,0])
    const resource={标识:'system-0123456789abcdefabcd',名称:'仿宋_GB2312',家族:'仿宋_GB2312',别名:['FangSong_GB2312'],样式:'Regular',字重:400,斜体:false,格式:'ttf',文件大小:font.length,数据:font.toString('base64'),数据指纹:createHash('sha256').update(font).digest('hex')}
    const payload={html:'<p style="font-family:仿宋_GB2312">正文</p>',字体格式:1,字体资源:[resource]}
    const opened=await readSeal('sldoc',await writeSeal('word',payload))
    expect(opened.字体资源).toEqual([resource])
    await expect(writeSeal('word',{...payload,字体资源:[{...resource,文件大小:1}]})).rejects.toThrow(/字体数据/)
    await expect(writeSeal('word',{...payload,字体资源:[{...resource,数据指纹:'0'.repeat(64)}]})).rejects.toThrow(/指纹/)
    await expect(writeSeal('word',{...payload,字体格式:2})).rejects.toThrow(/版本/)
  })
  it('SPDF 保留完整 PDF 字节，并拒绝非 PDF 及不规范的 base64',async()=>{
    const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create()
    pdf.addPage([321,456]);pdf.setTitle('原始版式𠮷🦭')
    const data=Buffer.from(await pdf.save()).toString('base64')
    const reopened=await readSeal('spdf',await writeSeal('pdf',{PDF数据:data}))
    expect(reopened.PDF数据).toBe(data)
    expect((await PDFDocument.load(Buffer.from(reopened.PDF数据,'base64'))).getPage(0).getSize()).toEqual({width:321,height:456})
    await expect(writeSeal('pdf',{PDF数据:Buffer.from('not a pdf').toString('base64')})).rejects.toThrow()
    await expect(writeSeal('pdf',{PDF数据:data+'!!'})).rejects.toThrow()
    await expect(readSeal('sldoc',await writeSeal('pdf',{PDF数据:data}))).rejects.toThrow(/扩展名/)
  })
  it('提前限制解压字节，拒绝伪造的尺寸和循环引用',async()=>{
    const source=Buffer.from(await writeSeal('word',{html:'保真'.repeat(10000)}))
    for(let at=0;at<source.length-46;at++)if(source.readUInt32LE(at)===0x02014b50){const length=source.readUInt16LE(at+28);if(source.subarray(at+46,at+46+length).toString()==='document.json')source.writeUInt32LE(1,at+24)}
    await expect(readSeal('sealdoc',source)).rejects.toThrow()
    const cycle={html:'x'};cycle.self=cycle
    await expect(writeSeal('word',cycle)).rejects.toThrow(/循环/)
  })
})
