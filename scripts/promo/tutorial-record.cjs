// Record actual production UI input into isolated demonstration storage.
// Only file-picker selection and a denied fullscreen host are fixtures; codecs,
// editing, formula evaluation, save/reopen, reading and diagram models are real.
const {app,BrowserWindow,net}=require('electron')
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {spawn,spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),version=require('../../package.json').version
const plan=require('../../docs/promo/current-storyboard.json'),out=path.join(root,'release/promo'),work=path.join(out,'work-'+version+'-tutorial')
const voices=JSON.parse(fs.readFileSync(path.join(work,'voice.json'),'utf8')).clips
const requested=process.argv.find(a=>a.startsWith('--platform='))?.split('=')[1]
const probe=process.argv.find(a=>a.startsWith('--probe='))?.split('=')[1]
const ffmpeg=spawnSync('python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8',windowsHide:true}).stdout.trim()
assert(fs.existsSync(ffmpeg),'FFmpeg runtime missing')
app.setPath('userData',path.join(work,'profile-'+process.pid));app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1')
if(!global.fetch)global.fetch=net.fetch.bind(net)
const pause=ms=>new Promise(r=>setTimeout(r,ms)),sha=p=>require('node:crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const mobileRoot=fs.realpathSync(process.env.SEAL_PROMO_ANDROID_ROOT||path.join(root,'release/v'+version+'/mobile-web/android-cloud-source/static/office'))
const webRoot=path.join(root,'mobile/unpackage/web'),snapshot=JSON.parse(fs.readFileSync(path.resolve(mobileRoot,'../../snapshot-info.json'),'utf8'))
assert.equal(snapshot.platform,'android');assert.equal(snapshot.version,version)
assert.equal(sha(path.join(mobileRoot,'office.js')),snapshot.files.find(f=>f.path==='static/office/office.js').sha256)
const visible="e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden]')&&!e.closest('.ant-modal-wrap[style*=\"display: none\"]')"
const sel=s=>`[...document.querySelectorAll(${JSON.stringify(s)})].filter(${visible})[0]`
const btn=(label,scope='document')=>`[...${scope}.querySelectorAll('button,[role="tab"]')].filter(${visible}).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.textContent.replace(/\\s/g,'')===${JSON.stringify(label.replace(/\s/g,''))})`
app.on('window-all-closed',()=>{})
app.whenReady().then(async()=>{let server,win,recording,loop,encoder
try{
 fs.mkdirSync(work,{recursive:true})
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({version:1,collaboration:1,realtime:1,diagramRealtime:1,passwordAuth:1,accountDeletion:1,sms:false}));return}
  const base=u.pathname.startsWith('/android/')?mobileRoot:webRoot,file=path.resolve(base,'.'+decodeURIComponent(u.pathname).replace(/^\/(?:pc|android)\//,'/').replace(/\/$/,'/index.html'))
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)
 });await new Promise(r=>server.listen(0,'127.0.0.1',r))
 for(const platform of requested?[requested]:['pc','android']){
  assert(['pc','android'].includes(platform));const mobile=platform==='android',width=mobile?432:1600,height=mobile?708:820,base=mobile?mobileRoot:webRoot
  const build=JSON.parse(fs.readFileSync(base+'/build-info.json','utf8'));assert.equal(build.desktopVersion,version)
  const entry=mobile?'office.js':fs.readFileSync(base+'/index.html','utf8').match(/src="\.\/(assets\/index-[^"]+\.js)"/)[1]
  win=new BrowserWindow({show:mobile,title:'海豹办公 · 操作教程录制',useContentSize:true,width,height,webPreferences:{partition:'tutorial-'+platform+'-'+process.pid,offscreen:!mobile,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.setContentSize(width,height);win.removeMenu()
  const wc=win.webContents,errors=[],assertions=[],actions=[],steps=[];let frame=null,frames=0,activeStep=null,running=false,cursor={x:width*.55,y:height*.58}
  wc.setFrameRate(30);wc.on('paint',(_event,_dirty,image)=>{const size=image.getSize();if(size.width===width&&size.height===height)frame=image.toBitmap()})
  let captureBusy=false;const captureTimer=mobile?setInterval(async()=>{if(captureBusy||!win||win.isDestroyed())return;captureBusy=true;try{const image=await win.capturePage(),size=image.getSize();if(size.width===width&&size.height===height)frame=image.toBitmap()}catch{}finally{captureBusy=false}},50):null
  wc.on('console-message',(_event,level,message)=>{if(level>=3)errors.push(message)})
  wc.on('will-prevent-unload',e=>e.preventDefault());wc.session.on('will-download',(_e,item)=>item.cancel())
  const ev=async code=>{const value=await wc.executeJavaScript(`(async()=>{try{return{value:await(${code})}}catch(e){return{error:e.stack}}})()`,true);if(value.error)throw Error(value.error+'\n'+code.slice(0,180));return value.value}
  const until=async(code,label,timeout=20000)=>{const begin=Date.now();while(Date.now()-begin<timeout){if(await ev(code))return;await pause(100)}throw Error('UI condition: '+label)}
  const check=async(code,label)=>{assert(await ev(code),label);assertions.push({step:activeStep,label,passed:true,frame:frames})}
  const log=(type,data={})=>actions.push({step:activeStep,type,frame:frames,seconds:frames/20,...data})
  await win.loadURL('http://127.0.0.1:'+server.address().port+'/'+platform+'/');await until(`!!window.electronAPI&&!!document.querySelector('.wps-app')`,'production app ready')
  if(mobile){wc.debugger.attach('1.3');await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})}
  await ev(`(()=>{
    const style=document.createElement('style');style.textContent=
      '#tutorial-overlay{position:fixed;inset:0;z-index:2147483647;pointer-events:none!important;contain:strict}' +
      '#tutorial-target{position:absolute;border:2px solid #a855f7;border-radius:7px;box-shadow:0 0 0 2px #c084fc55,0 0 14px 5px #a855f780,inset 0 0 5px #a855f71a;opacity:0;transition:opacity .18s;pointer-events:none}' +
      '.tutorial-current-target{outline:2px solid #a855f7!important;outline-offset:2px!important;box-shadow:0 0 0 2px #c084fc55,0 0 14px 5px #a855f770!important}' +
      '#tutorial-cursor{position:absolute;width:26px;height:32px;filter:drop-shadow(0 2px 2px #30104d66);transform:translate(0px,0px)}' +
      '.tutorial-ring{position:absolute;width:28px;height:28px;margin:-14px;border:2px solid #a855f7;border-radius:50%;box-shadow:0 0 12px #a855f7;animation:tutorial-click .9s ease-out forwards}' +
      '.tutorial-touch{position:absolute;width:24px;height:24px;margin:-12px;background:#a855f733;border:2px solid #a855f7;border-radius:50%;box-shadow:0 0 13px #a855f7}' +
      '@keyframes tutorial-click{from{transform:scale(.45);opacity:.95}to{transform:scale(2.2);opacity:0}}' +
      '@media(prefers-reduced-motion:reduce){.tutorial-ring{animation:none;opacity:.5}#tutorial-target{transition:none}}';document.head.append(style);
    const overlay=document.createElement('div');overlay.id='tutorial-overlay';overlay.setAttribute('aria-hidden','true');overlay.innerHTML='<div id="tutorial-target"></div><div id="tutorial-cursor"><svg width="26" height="32" viewBox="0 0 26 32"><path d="M3 2L3 25L9 20L14 30L19 27L14 18L23 17Z" fill="white" stroke="#7e22ce" stroke-width="2.2" stroke-linejoin="round"/></svg></div>';document.body.append(overlay);
    window.__tutorialCursor=(x,y)=>{document.getElementById('tutorial-cursor').style.transform='translate('+x+'px,'+y+'px)'};
    window.__tutorialRing=(x,y)=>{const ring=document.createElement('i');ring.className='tutorial-ring';ring.style.left=x+'px';ring.style.top=y+'px';overlay.append(ring);setTimeout(()=>ring.remove(),1000)};
    window.__tutorialFocus=(rect)=>{const t=document.getElementById('tutorial-target');if(!rect){t.style.opacity='0';return};Object.assign(t.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',opacity:'1'})};
    window.__tutorialMark=(element)=>{document.querySelectorAll('.tutorial-current-target').forEach(n=>n.classList.remove('tutorial-current-target'));window.__tutorialFocus(null);if(element)element.classList.add('tutorial-current-target')};
    document.addEventListener('input',event=>{if(!(event.target instanceof Element)||!event.target.closest('.wps-editor-canvas__content'))return;const node=getSelection()?.anchorNode,element=node instanceof Element?node:node?.parentElement;window.__tutorialMark(element?.closest('p,h1,h2,h3,h4,li')||event.target)},true);
    window.__tutorialTouches=(points)=>{overlay.querySelectorAll('.tutorial-touch').forEach(n=>n.remove());for(const p of points){const n=document.createElement('i');n.className='tutorial-touch';n.style.left=p.x+'px';n.style.top=p.y+'px';overlay.append(n)}};
    window.__tutorialSaveCalls=[];const a=window.electronAPI,save=a.saveToFile.bind(a),dialog=a.showSaveDialog.bind(a);
    a.showSaveDialog=async(...args)=>dialog(window.__tutorialSaveName||args[0],...args.slice(1));
    a.saveToFile=async(...args)=>{const r=await save(...args);window.__tutorialSaveCalls.push({path:args[0],success:r.成功});return r};
    return true
  })()`)
  const fixture=await ev(`(async()=>{const a=window.electronAPI,out={},sheet=await a.office.writeXlsx({工作表:[{名称:'项目预算',数据:[['项目','数量','单价','预算'],['设计资料',3,120,360],['产品演示',2,480,960],['渠道培训',4,260,1040],['合计','','','']]}]}),word=await a.office.writeDocx({段落:[{类型:'段落',级别:1,对齐:'左',列表:'无',文字:[{文本:'每周工作计划 · 阅读示例',加粗:true}]},...Array.from({length:22},(_,i)=>({类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:(i+1)+'．整理项目资料，核对预算，准备团队汇报。明确本周目标，记录具体行动，逐项跟进完成情况。',字号:14}]}))],未覆盖:[]});for(const [id,result,name]of [['sheet',sheet,'项目预算.xlsx'],['reading',word,'阅读示例.docx']]){if(!result.成功)throw Error(result.错误);const p=await a.showSaveDialog(name),r=await a.saveToFile(p,result.数据,'二进制');if(!r.成功)throw Error(r.错误);out[id]=p}window.__tutorialSaveCalls=[];return out})()`)
  const focus=async(expr,label,scroll=true)=>{
    const rect=await ev(`(()=>{const e=${expr};if(!e)throw Error('Missing target: '+${JSON.stringify(label)});if(e.disabled)throw Error('Disabled: '+${JSON.stringify(label)});${scroll?"e.scrollIntoView({block:'nearest',inline:'nearest'});":''}const r=e.getBoundingClientRect(),x=Math.max(2,r.left),y=Math.max(2,r.top),right=Math.min(innerWidth-2,r.right),bottom=Math.min(innerHeight-2,r.bottom);if(right<=x||bottom<=y)throw Error('Target outside viewport: '+${JSON.stringify(label)});const rect={x:x-2,y:y-2,width:right-x+4,height:bottom-y+4};window.__tutorialMark(e);return {...rect,cx:(x+right)/2,cy:(y+bottom)/2}})()`)
    log('highlight',{label,rect});return rect
  }
  const move=async(x,y,ms=350)=>{const from={...cursor},count=Math.max(2,Math.ceil(ms/35));for(let i=1;i<=count;i++){const k=i/count,t=k*k*(3-2*k);cursor={x:from.x+(x-from.x)*t,y:from.y+(y-from.y)*t};await ev(`window.__tutorialCursor(${cursor.x},${cursor.y})`);wc.sendInputEvent({type:'mouseMove',x:Math.round(cursor.x),y:Math.round(cursor.y)});await pause(ms/count)}}
  const tap=async(expr,label,count=1)=>{const r=await focus(expr,label);await move(r.cx,r.cy);await pause(180);await ev(`window.__tutorialRing(${r.cx},${r.cy})`);for(let i=0;i<count;i++){wc.sendInputEvent({type:'mouseDown',x:Math.round(r.cx),y:Math.round(r.cy),button:'left',clickCount:i+1});await pause(65);wc.sendInputEvent({type:'mouseUp',x:Math.round(r.cx),y:Math.round(r.cy),button:'left',clickCount:i+1});if(count>1)await pause(75)}log(count>1?'double-click':'click',{label,x:r.cx,y:r.cy});await pause(330)}
  const click=label=>tap(btn(label),label)
  const key=async(keyCode,modifiers=[])=>{const textEnter=keyCode==='Enter'&&await ev(`Boolean(document.activeElement?.isContentEditable)`);wc.sendInputEvent({type:'keyDown',keyCode,modifiers});if(textEnter)wc.sendInputEvent({type:'char',keyCode:'\r'});wc.sendInputEvent({type:'keyUp',keyCode,modifiers});await pause(120)}
  const type=async(expr,text,label,replace=false)=>{await tap(expr,label);if(replace){await key('A',['control']);await key('Backspace')}else if(await ev(`Boolean((${expr}).isContentEditable)`))await key('End',['control']);log('typing-start',{label,text});for(const c of text){if(c==='\n')await key('Enter');else{await wc.insertText(c);await pause(/[\u4e00-\u9fff]/.test(c)?65:90)}}log('typing',{label,text});await pause(280)}
  const home=async()=>{await tap(sel(mobile?'.seal-mobile-nav [aria-label="返回首页"]':'.wps-global-tabs__home'),'返回首页');await pause(250)}
  const newWord=async()=>{await home();if(mobile){await click('服务');await tap(sel('[data-document-type="word"]'),'新建文字文档')}else{await tap(sel('.wps-homesidebar__actions button:first-child'),'新建');await tap(`[...document.querySelectorAll('.wps-newdoc-option')].find(e=>e.querySelector('strong')?.textContent==='文字文档')`,'文字文档')};await until(`!!document.querySelector('.wps-editor-canvas__content')`,'new word')}
  const openFile=async(pathname,kind)=>{await home();await ev(`(()=>{window.electronAPI.showOpenDialog=async()=>${JSON.stringify(pathname)};return true})()`);await tap(mobile?btn('导入文件'):sel('.wps-homesidebar__actions button:nth-child(2)'),'打开 '+kind);await until(kind==='sheet'?`!!document.querySelector('[aria-label="公式栏"]')`:`!!document.querySelector('.wps-editor-canvas__content')`,'open '+kind);await pause(350);if(await ev(`!!(${btn('我知道了')})`))await click('我知道了')}
  const save=async(name,saveAs=false)=>{const prior=await ev(`window.__tutorialSaveCalls.length`);await ev(`window.__tutorialSaveName=${JSON.stringify(name)}`);await click(saveAs?'另存为':'保存');await until(`window.__tutorialSaveCalls.length>${prior}&&window.__tutorialSaveCalls.at(-1).success`,'actual save succeeded');await pause(400);const value=await ev(`window.__tutorialSaveCalls.at(-1)`);assertions.push({step:activeStep,label:'native format save succeeded',passed:true,path:value.path});return value.path}
  const nav=async(keyName,label)=>{await home();if(mobile){await click('服务');await tap(sel('[data-nav-key="'+keyName+'"]'),label)}else await click(label);await pause(250)}
  const createProject=async(name,kind='脑图')=>{await click('新建'+kind+'项目');await until(`!!document.querySelector('#diagram-project-name')`,'project name');await type(sel('#diagram-project-name'),name,'项目名称',true);await click('创建项目');await until(`!!document.querySelector('[data-diagram-editor]')`,'project editor')}
  const templatePreview=async()=>{await home();await click(mobile?'模板':'演示模板市场');await until(`!!document.querySelector('.seal-market-grid article')`,'template market');await click('精选推荐');await until(`document.querySelectorAll('.seal-market-grid img').length>0&&[...document.querySelectorAll('.seal-market-grid img')].every(i=>i.complete&&i.naturalWidth>0)`,'loaded template pictures');await tap(sel('.seal-market-cover'),'预览演示模板');await until(`!!(${btn('使用并编辑副本')})`,'template preview');await pause(500)}
  const useTemplate=async()=>{await click('使用并编辑副本');await until(`!!document.querySelector('.wps-ppt-canvas')`,'editable deck');await focus(sel('.wps-ppt-canvas'),'可编辑的演示画布')}
  const formula=async()=>{await type(sel('[aria-label="名称框"]'),'D5','名称框选择 D5',true);await key('Enter');await type(sel('[aria-label="公式栏"]'),'=SUM(D2:D4)','输入求和公式',true);await key('Enter');await check(`document.querySelector('[data-地址="D5"]')?.textContent.includes('2360')`,'formula computed 2360');await focus(sel('[data-地址="D5"]'),'查看合计 2360')}
  let wordPath
  const operations={
    'new-word':newWord,
    'word-title':async()=>{await type(sel('.wps-editor-canvas__content'),'每周工作计划','输入标题');await key('Enter');await check(`document.querySelector('.wps-editor-canvas__content').textContent.includes('每周工作计划')`,'title entered')},
    'word-body':async()=>{const text=mobile?'每周工作计划\n本周目标：整理产品资料，完成预算核对。\n周一梳理需求，周三准备汇报，周五完成交付。':'本周目标：整理产品资料，完成预算核对。\n周一梳理需求，周三准备汇报，周五完成交付。';await type(sel('.wps-editor-canvas__content'),text,'填写计划正文');await check(`document.querySelector('.wps-editor-canvas__content').textContent.includes('完成交付')&&document.querySelector('.wps-editor-canvas__content').children.length>=3`,'body entered in separate paragraphs')},
    'word-save':async()=>{wordPath=await save('每周工作计划.sldoc');await check(`document.querySelector('.wps-global-tab--active')?.textContent.includes('.sldoc')&&!document.querySelector('.wps-global-tab--active .wps-global-tab__dirty')`,'saved SLDOC tab clean')},
    'word-reopen':async()=>{await tap(sel('.wps-global-tab--active .wps-global-tab__close'),'关闭已保存文档');await openFile(wordPath,'word');await check(`document.querySelector('.wps-editor-canvas__content').textContent.includes('完成交付')`,'saved content reopened')},
    'sheet-open':()=>openFile(fixture.sheet,'sheet'),
    'sheet-formula':formula,
    'sheet-save':async()=>{await click('自适应列宽');await save('项目预算.slxls',true)},
    'template-open':templatePreview,
    'template-use':async()=>{await useTemplate();await until(`document.querySelectorAll('.wps-ppt-thumb').length>=2`,'template has multiple editable pages');await tap(`document.querySelectorAll('.wps-ppt-thumb')[1]`,'查看第二张幻灯片');await check(`document.querySelectorAll('.wps-ppt-thumb')[1].classList.contains('wps-ppt-thumb--active')`,'selected template second slide')},
    'templates':async()=>{await templatePreview();await useTemplate()},
    'mindmap-create':async()=>{await nav('mindmap','脑图');await createProject('新品发布计划')},
    'mindmap-edit':async()=>{await type(sel('.diagram-inspector input:not([type="number"])'),'新品发布','修改中心主题',true);await click('保存文字');await click('添加节点');await type(sel('.diagram-inspector input:not([type="number"])'),'产品资料','填写分支文字',true);await click('保存文字');await click('适配画布');await check(`document.querySelector('.diagram-board').textContent.includes('产品资料')||[...document.querySelectorAll('.diagram-node')].some(n=>n.getAttribute('aria-label')==='产品资料')`,'diagram branch updated')},
    'mindmap-list':async()=>{await click('返回项目列表');await createProject('团队工作分解');await click('返回项目列表');await check(`document.querySelectorAll('.diagram-project-card').length===2`,'two independent mindmap projects')},
    'flow':async()=>{await nav('flow','流程图');await createProject('资料审核流程','流程图');await click('添加节点');await click('适配画布');await check(`document.querySelectorAll('.diagram-node').length>1`,'flow node added')},
    'navigation':async()=>{await click('服务');await type(sel('.seal-mobile-services input'),'脑图','搜索办公服务');await check(`document.querySelector('.seal-mobile-services').textContent.includes('脑图')`,'service search visible');await type(sel('.seal-mobile-services input'),'','清空服务搜索',true)},
    'reading-enter':async()=>{await openFile(fixture.reading,'word');await ev(`(()=>{HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new DOMException('Demonstration uses WebView viewport fullscreen fallback','NotAllowedError'));return true})()`);await click('全屏左右翻页阅读');await until(`!!document.querySelector('.seal-word-reader[data-reading-controls="hidden"]')`,'fullscreen chrome hidden');await check(`Number(document.querySelector('[data-reading-pages]').dataset.readingPages)>1`,'reader has multiple pages');await focus(sel('.seal-word-reader__viewport'),'全屏正文',false)},
    'reading-swipe':async()=>{const r=await focus(sel('.seal-word-reader__viewport'),'左右滑动阅读区域',false);if(!wc.debugger.isAttached())wc.debugger.attach('1.3');const x0=r.x+r.width*.8,x1=r.x+r.width*.2,y=r.y+r.height*.5;const command=(type,points)=>wc.debugger.sendCommand('Input.dispatchTouchEvent',{type,touchPoints:points});await command('touchStart',[{x:x0,y,id:1}]);for(let i=1;i<=16;i++){const x=x0+(x1-x0)*i/16;await ev(`window.__tutorialTouches([{x:${x},y:${y}}])`);await command('touchMove',[{x,y,id:1}]);await pause(35)}await command('touchEnd',[]);await ev(`window.__tutorialTouches([])`);log('touch-swipe',{label:'向左滑动翻页'});await until(`Number(document.querySelector('[data-reading-page]').dataset.readingPage)>1`,'actual next page after swipe');assertions.push({step:activeStep,label:'swipe changed page',passed:true});await pause(1500)},
    'reading-controls':async()=>{await tap(sel('.seal-word-reader__viewport'),'双击唤出阅读工具栏',2);await until(`!!document.querySelector('.seal-word-reader[data-reading-controls="visible"]')`,'double click revealed chrome');await ev(`window.__tutorialMark(null)`);await until(`!!document.querySelector('.seal-word-reader[data-reading-controls="hidden"]')`,'chrome auto hidden after 3s',6000);assertions.push({step:activeStep,label:'double click reveals then timer hides reader controls',passed:true})},
    'reading-zoom':async()=>{const r=await focus(sel('.seal-word-reader__viewport'),'双指缩放阅读区域',false);if(!wc.debugger.isAttached())wc.debugger.attach('1.3');const cx=r.x+r.width*.5,cy=r.y+r.height*.45;const points=d=>[{x:cx-d,y:cy,id:1},{x:cx+d,y:cy,id:2}];await wc.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(45)});for(let i=1;i<=14;i++){const p=points(45+i*2);await ev(`window.__tutorialTouches(${JSON.stringify(p)})`);await wc.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:p});await pause(45)}await wc.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await ev(`window.__tutorialTouches([])`);await check(`Number(document.querySelector('[data-reading-zoom]').dataset.readingZoom)>1`,'pinch increased reading zoom');log('touch-pinch',{label:'双指放大'});await pause(900);await tap(sel('.seal-word-reader__viewport'),'唤出返回按钮',2);await until(`!!document.querySelector('.seal-word-reader[data-reading-controls="visible"]')`,'toolbar visible');await click('退出全屏阅读')},
    'assistant-drag':async()=>{const r=await focus(btn('打开智能助手'),'拖动海豹 Logo 悬浮球');await move(r.cx,r.cy);wc.sendInputEvent({type:'mouseDown',x:Math.round(r.cx),y:Math.round(r.cy),button:'left',clickCount:1});await pause(150);await move(Math.min(width-45,r.cx-95),Math.max(110,r.cy-100),1000);wc.sendInputEvent({type:'mouseUp',x:Math.round(cursor.x),y:Math.round(cursor.y),button:'left',clickCount:1});log('drag',{label:'移动海豹助手',from:{x:r.cx,y:r.cy},to:{...cursor}});await pause(900);const after=await ev(`(()=>{const r=(${btn('打开智能助手')}).getBoundingClientRect();return{x:r.x,y:r.y}})()`);assert(Math.abs(after.y-(r.cy-28))>15,'assistant moved');await click('打开智能助手');await until(`!!document.querySelector('[aria-label="助手目标文件"]')`,'assistant opened')},
    'assistant-modes':async()=>{await focus(sel('[aria-label="助手目标文件"]'),'当前目标文件');await pause(800);await click('对话模式');await check(`(${btn('对话模式')}).getAttribute('aria-pressed')==='true'`,'chat mode selected');await click('工作模式');await check(`(${btn('工作模式')}).getAttribute('aria-pressed')==='true'`,'work mode selected');await focus(sel('.assistant-mobile-mode-hint'),'修改先预览确认');await pause(900)},
    'assistant-target':async()=>{await click('打开智能助手');await tap(sel('[aria-label="助手目标文件"]'),'选择已打开的目标文件');await key('Home');await key('Enter');await click('对话模式');await check(`(${btn('对话模式')}).getAttribute('aria-pressed')==='true'`,'target file and chat mode selected');await tap(sel('.assistant-mobile-modal .ant-modal-close'),'关闭助手')},
    'projects':async()=>{await nav('mindmap','脑图');await createProject('新品发布计划');await click('返回项目列表');await createProject('团队工作分解');await click('返回项目列表');await check(`document.querySelectorAll('.diagram-project-card').length===2`,'two independent mobile projects')},
    'outro':async()=>{await home();await focus(sel('.wps-global-tabs'),'已打开文件与项目');await pause(1800)}
  }
  // Mobile sheet starts after the assistant demonstration; close only its modal.
  if(mobile){const original=operations['sheet-open'];operations['sheet-open']=async()=>{if(await ev(`!!(${sel('.assistant-mobile-modal .ant-modal-close')})`))await tap(sel('.assistant-mobile-modal .ant-modal-close'),'关闭助手');await original()}}
  await pause(450);await until(`document.fonts.status==='loaded'`,'fonts loaded');await pause(500)
  const rawFile=path.join(work,platform+(probe?'-probe':'')+'-operations.mp4');encoder=spawn(ffmpeg,['-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','bgra','-video_size',width+'x'+height,'-framerate','20','-i','pipe:0','-an','-c:v','libx264','-preset','ultrafast','-crf','19','-pix_fmt','yuv420p','-threads','2',rawFile],{windowsHide:true,stdio:['pipe','ignore','pipe']});let encoderErrors='';encoder.stderr.on('data',b=>encoderErrors+=b);encoder.stdin.on('error',()=>{})
  const finished=new Promise((resolve,reject)=>encoder.on('exit',code=>code===0?resolve():reject(Error('Recording encoder '+code+': '+encoderErrors))));finished.catch(()=>{})
  running=true;loop=(async()=>{while(running){const tick=Date.now();if(frame){if(!encoder.stdin.write(frame))await new Promise(r=>encoder.stdin.once('drain',r));frames++}await pause(Math.max(1,50-(Date.now()-tick)))}})()
  const waitFrames=async target=>{while(frames<target)await pause(35)}
  const scenes=probe==='reading'?plan[platform].filter(s=>s.id.startsWith('reading-')):probe==='word'?plan[platform].filter(s=>['new-word','word-title','word-body'].includes(s.id)):plan[platform]
  for(const [index,scene]of scenes.entries()){
    activeStep=scene.id;const startFrame=frames,voice=voices.find(v=>v.platform===platform&&v.id===scene.id);assert(voice)
    if(index>0)await ev(`window.__tutorialMark(null)`)
    await waitFrames(startFrame+8);await operations[scene.id]();
    await waitFrames(startFrame+Math.ceil((probe?2:Math.max(scene.minimumSeconds,voice.seconds+1.3))*20))
    await ev(`window.__tutorialMark(null)`);await waitFrames(frames+8)
    const item={id:scene.id,index,title:scene.title,chapter:scene.chapter,narration:scene.narration,startFrame,endFrame:frames,start:startFrame/20,end:frames/20,audio:voice.file,audioSeconds:voice.seconds}
    steps.push(item);const shot=path.join(work,platform+'-'+scene.id+'-verified.png');fs.writeFileSync(shot,(await win.capturePage()).toPNG());item.endScreenshot=path.relative(root,shot).replaceAll('\\','/');item.endScreenshotSha256=sha(shot)
    console.log(JSON.stringify({platform,step:scene.id,seconds:(frames-startFrame)/20,actions:actions.filter(a=>a.step===scene.id).length,assertions:assertions.length}),true)
  }
  running=false;await loop;encoder.stdin.end();await finished;encoder=null
  const report={passed:true,version,platform,build,bundleSha256:sha(path.join(base,entry)),width,height,fps:20,frames,durationSeconds:frames/20,source:'Actual production UI with trusted Electron mouse/keyboard input, isolated demonstration storage and recording-only purple target/cursor overlays.',nativeDeviceRecording:false,filePickerFixture:true,realFileSave:true,savedWordReopened:!mobile,productionAccountsUsed:0,modelRequests:0,errors,assertions,actions,steps,recording:path.relative(root,rawFile).replaceAll('\\','/'),recordingSha256:sha(rawFile)}
  fs.writeFileSync(path.join(work,platform+(probe?'-probe':'')+'-recording.json'),JSON.stringify(report,null,2)+'\n');assert.equal(errors.length,0,errors.join('\n'));clearInterval(captureTimer);win.destroy();win=null
 }
 app.exit(0)
}catch(e){console.error(e.stack);if(win&&!win.isDestroyed()){try{fs.writeFileSync(path.join(work,'failure.png'),(await win.capturePage()).toPNG());fs.writeFileSync(path.join(work,'failure-dom.txt'),await win.webContents.executeJavaScript('document.body.innerText'))}catch{}}encoder?.kill();app.exit(1)
}finally{server?.closeAllConnections?.();server?.close()}})
