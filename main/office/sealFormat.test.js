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
  it('提前限制解压字节，拒绝伪造的尺寸和循环引用',async()=>{
    const source=Buffer.from(await writeSeal('word',{html:'保真'.repeat(10000)}))
    for(let at=0;at<source.length-46;at++)if(source.readUInt32LE(at)===0x02014b50){const length=source.readUInt16LE(at+28);if(source.subarray(at+46,at+46+length).toString()==='document.json')source.writeUInt32LE(1,at+24)}
    await expect(readSeal('sealdoc',source)).rejects.toThrow()
    const cycle={html:'x'};cycle.self=cycle
    await expect(writeSeal('word',cycle)).rejects.toThrow(/循环/)
  })
})
