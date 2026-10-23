const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
module.exports=async function({win,evaluate,output,checks}){
  const pause=()=>new Promise(r=>setTimeout(r,120)),until=async(code,label)=>{for(let i=0;i<160;i++){if(await evaluate(code))return;await pause()}throw Error(label)}
  const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('富文本预算');book.addWorksheet('空表')
  const margins={left:.75,right:.75,top:1,bottom:1,header:.5,footer:.5};sheet.pageSetup.margins=margins
  sheet.getCell('A1').value={richText:[{text:'中文项目：',font:{name:'宋体',size:11,charset:134}},{text:'001𠮷',font:{name:'宋体',size:16,bold:true,color:{argb:'FFCC0000'}}}]}
  sheet.getCell('A1').alignment={horizontal:'general',indent:0,shrinkToFit:false};sheet.getColumn(1).width=6
  const base64=Buffer.from(await book.xlsx.writeBuffer()).toString('base64')
  await evaluate(`window.__sync={save:window.electronAPI.saveToFile,open:window.electronAPI.showOpenDialog,saved:[]};window.electronAPI.saveToFile=async(...args)=>{const r=await window.__sync.save(...args);window.__sync.saved.push({path:args[0],success:r.成功});return r};true`)
  const open=async(name,bytes)=>{
    await evaluate(`(async()=>{const a=window.electronAPI,p=await a.showSaveDialog(${JSON.stringify(name)});const r=await a.saveToFile(p,${JSON.stringify(bytes)},'二进制');if(!r.成功)throw Error(r.错误);window.__sync.file=p;a.showOpenDialog=async()=>p;(document.querySelector('.seal-mobile-nav [aria-label="返回首页"]')||document.querySelector('.wps-global-tabs__home'))?.click();})()`)
    await until(`!!document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]')||!!document.querySelector('.wps-homesidebar__actions button:nth-child(2)')`,'首页文件入口')
    await evaluate(`(document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]')||document.querySelector('.wps-homesidebar__actions button:nth-child(2)')).click()`)
  }
  const save=async(selector)=>{
    await evaluate(`window.__sync.saved=[];document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))`)
    await until(`window.__sync.saved.some(r=>r.success)`,'实际保存文件')
  }
  try{
    win.setContentSize(390,844);await open('移动富文本.xlsx',base64)
    await until(`document.querySelector('[data-地址="A1"]')?.textContent.includes('001𠮷')`,'完整Unicode富文本导入')
    assert.equal(await evaluate(`!!document.querySelector('.ant-modal-confirm-warning')`),false)
    const before=await evaluate(`document.querySelector('[data-地址="A1"]').getBoundingClientRect().width`)
    await evaluate(`document.querySelector('[aria-label="自适应列宽"]').click()`);await pause()
    assert.ok(await evaluate(`document.querySelector('[data-地址="A1"]').getBoundingClientRect().width>${before}`))
    await save('.wps-sheet')
    const result=await evaluate(`(async()=>{const a=window.electronAPI,r=await a.readFile(window.__sync.file);return a.office.readXlsx(r.内容)})()`)
    assert(result.成功);assert.deepEqual(result.警告,[]);assert.equal(result.工作表列表.length,2)
    assert.deepEqual(result.工作表列表[0].页面设置.自定义页边距,margins)
    assert.equal(result.工作表列表[0].元数据.单元格富文本.A1.map(r=>r.文本).join(''),'中文项目：001𠮷')
    const raw=await evaluate(`(async()=>{const r=await window.electronAPI.readFile(window.__sync.file);return r.内容})()`),reopened=new ExcelJS.Workbook();await reopened.xlsx.load(Buffer.from(raw,'base64'))
    assert.equal(reopened.worksheets[0].getCell('A1').value.richText[0].font.charset,134)
    assert.ok(reopened.worksheets[0].getColumn(1).width>6)
    for(const width of[360,390,820]){win.setContentSize(width,844);await pause();assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`))}
    checks.push('真实XLSX富文本/中文字符集/自定义页边距/空工作表导入、列宽自适应并保存重开；360/390/820px')
    const word=await evaluate(`window.electronAPI.office.writeSeal('word',{html:'<p>图片插入𠮷</p>'})`);assert(word.成功)
    win.setContentSize(390,844);await open('移动图片.sldoc',word.数据)
    await until(`!!document.querySelector('.wps-editor-canvas__content')||[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&b.textContent==='编辑')`,'手机阅读或编辑入口')
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent==='编辑')?.click()`)
    await until(`!!document.querySelector('.wps-editor-canvas__content[contenteditable="true"]')`,'原生文字正文')
    for(const kind of['paste','drop']){
      await evaluate(`(()=>{const e=document.querySelector('.wps-editor-canvas__content');e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);const c=document.createElement('canvas');c.width=160;c.height=80;c.getContext('2d').fillRect(0,0,160,80);const d=new DataTransfer();d.items.add(new File([Uint8Array.from(atob(c.toDataURL().split(',')[1]),c=>c.charCodeAt(0))],'插图.png',{type:'image/png'}));e.dispatchEvent(${kind==='paste'?`new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:d})`:`new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:d})`})})()`)
      const count=kind==='paste'?1:2;await until(`document.querySelectorAll('.wps-editor-canvas__content img').length===${count}`,'图片实际插入')
      await evaluate(`document.querySelector('.wps-editor-canvas__content').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);await pause()
      assert.equal(await evaluate(`document.querySelectorAll('.wps-editor-canvas__content img').length`),count-1)
      await evaluate(`document.querySelector('.wps-editor-canvas__content').dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true}))`);await pause()
      assert.equal(await evaluate(`document.querySelectorAll('.wps-editor-canvas__content img').length`),count)
    }
    await save('.wps-editor-canvas__content')
    const native=await evaluate(`(async()=>{const a=window.electronAPI,r=await a.readFile(window.__sync.file);return a.office.readSeal('sldoc',r.内容)})()`)
    assert(native.成功);assert.equal((JSON.stringify(native).match(/data:image\/png;base64/g)||[]).length,2)
    await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'format-editing-mobile.png'),image.toPNG()))
    checks.push('真实粘贴和拖入PNG、图片解码、撤销重做、SLDOC写盘再读保留两张图片和Unicode正文')
  }finally{await evaluate(`window.electronAPI.saveToFile=window.__sync.save;window.electronAPI.showOpenDialog=window.__sync.open;true`)}
}
