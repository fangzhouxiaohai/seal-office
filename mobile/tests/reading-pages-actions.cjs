const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib')

// Self-created local documents only. Native CDP touch input exercises browser
// scroll snap; dispatching a synthetic DOM scroll event would not test swiping.
module.exports=async function readingPagesActions({win,evaluate,output,checks}){
  const wait=(ms=180)=>new Promise(resolve=>setTimeout(resolve,ms))
  const until=async(code,label)=>{for(let i=0;i<100;i++){if(await evaluate(code))return;await wait(100)}throw new Error(label)}
  const cdp=win.webContents.debugger,owned=!cdp.isAttached();if(owned)cdp.attach('1.3')
  const offscreen=typeof win.webContents.isOffscreen==='function'&&win.webContents.isOffscreen()
  const command=(method,params)=>cdp.sendCommand(method,params)
  const size=async width=>{win.setContentSize(width,844);await command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await wait(250)}
  const swipe=async selector=>{
    const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`)
    const y=rect.y+Math.min(rect.h*.5,250),from=rect.x+rect.w*.85,to=rect.x+rect.w*.15
    if(offscreen){win.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(from),y:Math.round(y),deltaX:to-from,deltaY:0,canScroll:true});await wait(650);return}
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y,id:1}]})
    for(let i=1;i<=12;i++){await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*i/12,y,id:1}]});await wait(18)}
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(650)
  }
  const pinch=async(selector,factor)=>{
    const rect=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}})()`),x=rect.x+rect.w/2,y=rect.y+Math.min(rect.h/2,220),distance=50
    if(offscreen){await evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)}),emit=(type,d)=>{const touches=type==='touchend'?[]:[new Touch({identifier:1,target,clientX:${x}-d,clientY:${y}}),new Touch({identifier:2,target,clientX:${x}+d,clientY:${y}})];target.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches}))};emit('touchstart',${distance});emit('touchmove',${distance*factor});emit('touchend',0)})()`);await wait(350);return}
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-distance,y,id:1},{x:x+distance,y,id:2}]})
    for(let i=1;i<=8;i++){const d=distance*(1+(factor-1)*i/8);await command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]});await wait(24)}
    await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(350)
  }
  const shot=async name=>{fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,name),(await win.capturePage()).toPNG())}
  // Hidden mobile chrome must be revealed through its UI event before using a
  // toolbar; calling .click() on hidden buttons would bypass the new contract.
  const reveal=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))`);await until(`document.querySelector(${JSON.stringify(selector)}).closest('[data-reading-controls]')?.dataset.readingControls==='visible'`,'Double click must reveal mobile reading chrome')}
  const open=async filename=>{await evaluate(`window.electronAPI.showOpenDialog=async()=>${JSON.stringify(filename)};(async()=>{document.querySelector('.seal-mobile-nav [aria-label="返回首页"]').click();for(let i=0;i<100&&!document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]');i++)await new Promise(resolve=>setTimeout(resolve,20));document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]').click()})()`)}
  try{
    // Offscreen Electron cannot present an OS fullscreen surface. Exercise the
    // supported WebView/denied-permission viewport fallback deterministically.
    await evaluate(`window.__readingRequestFullscreen=HTMLElement.prototype.requestFullscreen;HTMLElement.prototype.requestFullscreen=function(){return Promise.reject(new DOMException('Synthetic WebView denies fullscreen','NotAllowedError'))};true`)
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await size(390)
    const wordTitle='全屏阅读触控验收'+Date.now()
    const word=await evaluate(`(async()=>{const api=window.electronAPI;const model={段落:[{类型:'段落',级别:1,对齐:'左',列表:'无',文字:[{文本:${JSON.stringify(wordTitle)}}]},...Array.from({length:60},(_,i)=>({类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:'第'+(i+1)+'段。手机阅读按屏幕重排，左右滑动翻页，双指缩放后继续阅读。正文、原始字号和页面设置保持完整。'.repeat(3),字号:12}]}))],未覆盖:[]};const result=await api.office.writeDocx(model);if(!result.成功)throw new Error(result.错误);const file=await api.showSaveDialog(${JSON.stringify(wordTitle+'.docx')},'word');const saved=await api.saveToFile(file,result.数据,'二进制');if(!saved.成功)throw new Error(saved.错误);return file})()`)
    await open(word);await until(`document.querySelector('.wps-editor-canvas__content')?.textContent.includes(${JSON.stringify(wordTitle)})`,'Word local document must open')
    const original=await evaluate(`document.querySelector('.wps-editor-canvas__content').innerHTML`)
    await evaluate(`window.__readingOriginal=document.querySelector('.wps-editor-canvas__content');document.querySelector('[aria-label="全屏左右翻页阅读"]').click()`)
    await until(`Number(document.querySelector('.seal-word-reader__viewport')?.dataset.readingPages)>2`,'Word must have real fragmented screen pages')
    const initial=await evaluate(`({pages:Number(document.querySelector('.seal-word-reader__viewport').dataset.readingPages),page:Number(document.querySelector('.seal-word-reader__viewport').dataset.readingPage),fullscreen:document.querySelector('.seal-word-reader').dataset.fullscreen})`)
    assert.equal(await evaluate(`document.querySelector('.seal-word-reader').dataset.readingControls`),'hidden','Word mobile fullscreen controls start hidden')
    await swipe('.seal-word-reader__viewport')
    const page=await evaluate(`Number(document.querySelector('.seal-word-reader__viewport').dataset.readingPage)`);assert.ok(page>initial.page,'Native horizontal touch must advance a real Word reading page '+JSON.stringify(await evaluate(`(()=>{const v=document.querySelector('.seal-word-reader__viewport');return {left:v.scrollLeft,scrollWidth:v.scrollWidth,width:v.clientWidth,pages:v.dataset.readingPages,action:getComputedStyle(v).touchAction}})()`)))
    const before=await evaluate(`Number(document.querySelector('.seal-word-reader__viewport').dataset.readingZoom)`)
    await evaluate(`(()=>{const r=document.querySelector('.seal-word-reader__viewport').getBoundingClientRect();window.__readingAnchor=document.caretRangeFromPoint(r.left+r.width/2,r.top+Math.min(r.height/2,220))?.cloneRange()})()`)
    await pinch('.seal-word-reader__viewport',1.5)
    const after=await evaluate(`Number(document.querySelector('.seal-word-reader__viewport').dataset.readingZoom)`);assert.ok(after>before*1.3,'Word two-finger pinch must change document zoom')
    const anchor=await evaluate(`(()=>{const a=window.__readingAnchor?.getBoundingClientRect(),v=document.querySelector('.seal-word-reader__viewport').getBoundingClientRect();return a?{left:a.left,top:a.top,viewportLeft:v.left,viewportRight:v.right,viewportTop:v.top,viewportBottom:v.bottom}:null})()`)
    assert.ok(anchor&&anchor.left>=anchor.viewportLeft-1&&anchor.left<=anchor.viewportRight+1&&anchor.top>=anchor.viewportTop-1&&anchor.top<=anchor.viewportBottom+1,'Word pinch preserves the touched text in the visible reading page: '+JSON.stringify(anchor))
    await pinch('.seal-word-reader__viewport',.75);assert.ok(await evaluate(`Number(document.querySelector('.seal-word-reader__viewport').dataset.readingZoom)<${after}`),'Word pinch inward reduces zoom')
    const widths=[]
    for(const width of[360,390,820]){await size(width);const bounds=await evaluate(`(()=>{const r=document.querySelector('.seal-word-reader').getBoundingClientRect(),v=document.querySelector('.seal-word-reader__viewport');return {left:r.left,right:r.right,width:innerWidth,height:v.clientHeight,pages:Number(v.dataset.readingPages),scroll:document.documentElement.scrollWidth}})()`);assert.ok(bounds.left>=0&&bounds.right<=width+1&&bounds.height>150&&bounds.pages>1&&bounds.scroll<=width+1,JSON.stringify(bounds));widths.push({width,...bounds});await shot('word-fullscreen-pages-'+width+'.png')}
    await size(390)
    const zoom=await evaluate(`document.querySelector('.seal-word-reader__viewport').dataset.readingZoom`)
    await reveal('.seal-word-reader__viewport')
    await evaluate(`document.querySelector('.seal-word-reader [aria-label="切换连续阅读"]').click()`);await wait()
    assert.ok(await evaluate(`(()=>{const v=document.querySelector('.seal-word-reader__viewport--continuous');return v&&v.scrollHeight>v.clientHeight})()`),'Word full-screen continuous mode remains available')
    await evaluate(`document.querySelector('.seal-word-reader [aria-label="切换左右翻页"]').click()`);await wait()
    const savedPage=await evaluate(`document.querySelector('.seal-word-reader__viewport').dataset.readingPage`)
    await reveal('.seal-word-reader__viewport')
    await evaluate(`document.querySelector('.seal-word-reader [aria-label="退出全屏阅读"]').click()`);await wait()
    assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content')===window.__readingOriginal`),true)
    assert.equal(await evaluate(`document.querySelector('.wps-editor-canvas__content').innerHTML`),original,'Word full-screen pagination/zoom never edits source HTML')
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`),'全屏左右翻页阅读','Word exit restores focus')
    await evaluate(`document.querySelector('[aria-label="全屏左右翻页阅读"]').click()`);await wait()
    assert.equal(await evaluate(`document.querySelector('.seal-word-reader__viewport').dataset.readingZoom`),zoom,'Word reopening restores reading zoom')
    assert.equal(await evaluate(`document.querySelector('.seal-word-reader__viewport').dataset.readingPage`),savedPage,'Word reopening restores reading page')
    await evaluate(`window.dispatchEvent(new Event('seal-before-native-back',{cancelable:true}))`);await wait()
    assert.equal(await evaluate(`!!document.querySelector('.seal-word-reader')`),false,'Native Back closes Word reader')
    checks.push('Word全屏按屏重排真实阅读页、'+(offscreen?'离屏原生横向wheel/DOM双指（Chrome另验真触控）':'CDP真单指横向翻页/双指缩放')+'、360/390/820px、返回焦点及重入进度，原正文节点和HTML完整保留')

    const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica)
    // Hidden mobile chrome gives the page the full viewport. Use a tall page
    // so the 1.5x gesture actually overflows both axes before checking anchors.
    for(let i=1;i<=3;i++){const p=pdf.addPage([600,1200]);p.drawText('Reading page '+i,{x:60,y:720,size:32,font});p.drawRectangle({x:70,y:450,width:220,height:160,color:rgb(.15*i,.3,.7)})}
    const data=Buffer.from(await pdf.save()).toString('base64'),pdfFile=await evaluate(`(async()=>{const api=window.electronAPI,file=await api.showSaveDialog('全屏PDF触控验收.pdf','pdf');const result=await api.saveToFile(file,${JSON.stringify(data)},'二进制');if(!result.成功)throw new Error(result.错误);return file})()`)
    await open(pdfFile);await until(`document.querySelector('.pdf-viewer__counter')?.textContent.includes('共 3 页')&&!!document.querySelector('.pdf-viewer__canvas')?.width`,'PDF real three-page canvas must load')
    assert.equal(await evaluate(`Array.from(document.querySelector('.pdf-viewer').querySelectorAll('span')).some(n=>n.textContent==='连续滚动')`),false)
    const oldZoom=await evaluate(`document.querySelector('.pdf-viewer__zoom').textContent`)
    await evaluate(`document.querySelector('.pdf-viewer [aria-label="全屏左右翻页阅读"]').click()`);await wait(450)
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__stage').dataset.viewMode`),'pages')
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer--fullscreen').dataset.readingControls`),'hidden','PDF mobile fullscreen controls start hidden')
    await swipe('.pdf-viewer__stage')
    assert.match(await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),/第 [23] 页/,'PDF native touch swipe must advance physical page '+JSON.stringify(await evaluate(`(()=>{const s=document.querySelector('.pdf-viewer__stage'),p=document.querySelector('[data-pdf-slide]'),r=s.getBoundingClientRect();return {left:s.scrollLeft,scroll:s.scrollWidth,width:s.clientWidth,slideWidth:p.clientWidth,slideScroll:p.scrollWidth,slideLeft:p.scrollLeft,rect:{x:r.x,y:r.y,w:r.width,h:r.height},root:getComputedStyle(document.querySelector('.pdf-viewer__pages')).flexDirection}})()`)))
    const physical=await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),active=Number(physical.match(/第 (\d+)/)[1])
    await pinch('[data-pdf-slide="'+active+'"]',1.5)
    const bigger=await evaluate(`parseFloat(document.querySelector('.pdf-viewer__zoom').textContent)`);assert.ok(bigger>parseFloat(oldZoom)*1.3,'PDF pinch zoom')
    const pdfAnchor=await evaluate(`(()=>{const p=document.querySelector('[data-pdf-slide="${active}"]');return {left:p.scrollLeft,top:p.scrollTop}})()`);assert.ok(pdfAnchor.left>0&&pdfAnchor.top>0,'PDF pinch keeps the touched region anchored by scrolling the enlarged physical page')
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),physical,'PDF zoom retains physical page')
    for(const width of[360,390,820]){await size(width);const bounds=await evaluate(`(()=>{const r=document.querySelector('.pdf-viewer--fullscreen').getBoundingClientRect(),s=document.querySelector('.pdf-viewer__stage');return {left:r.left,right:r.right,height:s.clientHeight,width:innerWidth}})()`);assert.ok(bounds.left>=0&&bounds.right<=width+1&&bounds.height>150,JSON.stringify(bounds));assert.equal(await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),physical,'PDF resize preserves physical page');await shot('pdf-fullscreen-pages-'+width+'.png')}
    await size(390);await reveal('.pdf-viewer__stage');await evaluate(`document.querySelector('.pdf-viewer [aria-label="退出全屏阅读"]').click()`);await wait(450)
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__stage').dataset.viewMode`),'continuous')
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__zoom').textContent`),oldZoom,'PDF exit restores original zoom')
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),physical,'PDF exit maps the current physical page back to continuous reading '+JSON.stringify(await evaluate(`(()=>{const s=document.querySelector('.pdf-viewer__stage');return {top:s.scrollTop,height:s.clientHeight,scrollHeight:s.scrollHeight,width:s.clientWidth,pages:Array.from(document.querySelectorAll('[data-pdf-page]')).map(p=>({top:p.getBoundingClientRect().top,height:p.clientHeight})),stageTop:s.getBoundingClientRect().top}})()`)))
    assert.equal(await evaluate(`document.activeElement?.getAttribute('aria-label')`),'全屏左右翻页阅读')
    await evaluate(`document.querySelector('.pdf-viewer [aria-label="切换左右翻页"]').click()`);await wait()
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),physical,'PDF explicit page mode retains current physical page')
    await evaluate(`document.querySelector('.pdf-viewer [aria-label="切换连续阅读"]').click()`);await wait()
    assert.equal(await evaluate(`document.querySelector('.pdf-viewer__counter').textContent`),physical,'PDF explicit continuous mode retains current physical page')
    checks.push('PDF真实三页'+(offscreen?'离屏原生横向wheel/DOM双指（Chrome另验真触控）':'CDP真单指横滑/双指文档缩放')+'保持页码、360/390/820px全屏、返回连续阅读和原缩放；删除可见连续滚动文案保留可访问切换')
    return {host:offscreen?'Electron OSR wheel+DOM pinch':'CDP native touchscreen',word:{initial,swipePage:page,zoomBefore:before,zoomAfter:after,anchor,widths},pdf:{pages:3,swipePage:physical,zoomBefore:oldZoom,zoomAfter:bigger,anchor:pdfAnchor}}
  }finally{await evaluate(`if('__readingRequestFullscreen' in window){HTMLElement.prototype.requestFullscreen=window.__readingRequestFullscreen;delete window.__readingRequestFullscreen}delete window.__readingOriginal;delete window.__readingAnchor`);await command('Emulation.clearDeviceMetricsOverride',{});await command('Emulation.setTouchEmulationEnabled',{enabled:false});if(owned)cdp.detach();win.setContentSize(390,844)}
}
