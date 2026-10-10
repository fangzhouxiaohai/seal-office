// 录制移动端生产构建。独立演示资料与账户状态，不读取用户文档或密钥。
// 文件选择器只固定选择演示路径；编解码、存储与编辑使用真实应用 API。
const { app, BrowserWindow } = require('electron')
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'../..'), config=require('../../docs/promo/mobile/storyboard.json')
const work=path.join(root,`release/promo/mobile-v${config.version}`)
console.log('录制初始化',work)
app.setPath('userData',path.join(work,'recording-profile-'+process.pid)); app.disableHardwareAcceleration()
const pause=ms=>new Promise(r=>setTimeout(r,ms))
app.whenReady().then(async()=>{
 console.log('录制窗口准备')
 const win=new BrowserWindow({show:false,width:420,height:840,webPreferences:{offscreen:true,sandbox:true,contextIsolation:true}})
 const wc=win.webContents, errors=[]; wc.on('console-message',(_e,l,m)=>{if(l>=3){errors.push(m);console.error('页面错误：',m)}})
 wc.on('will-prevent-unload',e=>e.preventDefault());wc.session.on('will-download',(_e,item)=>item.cancel())
 wc.debugger.attach('1.3');const cmd=(name,p={})=>wc.debugger.sendCommand(name,p)
 const js=async code=>{const r=await cmd('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}
 // Electron 25 的离屏窗口不支持手机设备模拟，使用真实 420px 响应式界面。
 win.setContentSize(420,840)
 console.log('加载生产界面')
 await win.loadURL(process.env.SEAL_TUTORIAL_URL || 'http://127.0.0.1:5194/')
 const wait=async(code)=>{for(let i=0;i<120;i++){if(await js(code))return;await pause(100)}throw Error('录制条件未满足：'+code)}
 await wait("!!document.querySelector('.wps-app')")
 console.log('生产界面已就绪')
 let recording=null
 const visible="e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && !e.closest('.ant-modal-wrap[style*=\"display: none\"]')"
 const selector=s=>`[...document.querySelectorAll(${JSON.stringify(s)})].filter(${visible})[0]`
 const button=name=>`[...document.querySelectorAll('button,[role=tab]')].filter(${visible}).find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)} || e.textContent.trim()===${JSON.stringify(name)})`
 const tap=async(expr,label)=>{
  const p=await js(`(()=>{const e=${expr};if(!e||e.disabled)throw Error('不可操作：'+${JSON.stringify(label)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();const left=Math.max(0,r.left),right=Math.min(420,r.right),top=Math.max(0,r.top),bottom=Math.min(790,r.bottom);if(right<=left||bottom<=top)throw Error('控件不在视口：'+${JSON.stringify(label)});return {x:(left+right)/2,y:(top+bottom)/2}})()`)
  assert(p.x>=0&&p.x<=420&&p.y>=0&&p.y<=840, '点击必须在视口内：'+label)
  if(recording)recording.actions.push({seconds:(Date.now()-recording.start)/1000,...p,label})
  wc.sendInputEvent({type:'mouseDown',x:Math.round(p.x),y:Math.round(p.y),button:'left',clickCount:1})
  await pause(100);wc.sendInputEvent({type:'mouseUp',x:Math.round(p.x),y:Math.round(p.y),button:'left',clickCount:1});await pause(650)
 }
 const menu=async()=>{if(await js("document.querySelector('[aria-label=\"全部功能\"]').getAttribute('aria-expanded')!=='true'"))await tap(button('全部功能'),'打开功能菜单')}
 const nav=async key=>{await menu();await tap(selector(`[data-nav-key="${key}"]`),'进入 '+key);await pause(400)}
 const type=async text=>{await cmd('Input.insertText',{text});await pause(600)}
 const fixture=await js(`(async()=>{
  const api=window.electronAPI;
  const word=await api.office.writeDocx({段落:[{类型:'段落',级别:1,对齐:'左',列表:'无',文字:[{文本:'每周工作计划',加粗:true}]},{类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:'周一：整理需求。周三：核对预算。周五：交付报告。'}]}],未覆盖:[]});
  const sheet=await api.office.writeXlsx({工作表:[{名称:'预算',数据:[['项目','数量','单价','小计'],['文具',3,12,36],['资料',2,25,50],['合计','','',86]]}]});
  const ppt=await api.office.writePptx({页面尺寸:{宽:960,高:540},幻灯片:[{id:'demo-slide',背景色:'#FFFFFF',文本框:[{id:'demo-title',x:48,y:64,width:220,height:80,text:'每周工作汇报',字号:22,颜色:'#2B6CF6',加粗:true},{id:'demo-body',x:48,y:184,width:260,height:180,text:'进展：整理需求\\n预算：核对费用\\n下一步：准备资料',字号:20,颜色:'#222222'}]}]});
  const pdf=await api.printPreview('<h1>海豹办公 · 工作记录</h1><p>本周任务：整理资料、核对预算、完成交付。</p>','html');
  const result={};for(const [kind,data,ext] of [['word',word,'docx'],['sheet',sheet,'xlsx'],['ppt',ppt,'pptx'],['pdf',pdf,'pdf']]){if(!data.成功)throw Error(data.错误);const p=await api.showSaveDialog('教程示例.'+ext);const saved=await api.saveToFile(p,data.数据,'二进制');if(!saved.成功)throw Error(saved.错误);result[kind]=p}
  return result;
 })()`)
 const open=async kind=>{await js(`window.electronAPI.showOpenDialog=async()=>${JSON.stringify(fixture[kind])};true`);await tap(button('打开文件'),'打开演示文件 '+kind);await pause(1000);if(await js("[...document.querySelectorAll('.ant-modal-confirm')].some(e=>e.getClientRects().length)"))await tap(button('我知道了'),'确认导入提醒')}
 const record=async(scene,operation)=>{
  const dir=path.join(work,'recordings',scene.screen);fs.mkdirSync(dir,{recursive:true})
  recording={id:scene.id,screen:scene.screen,start:Date.now(),frames:[],actions:[]};const info=recording;let keep=true
  const capture=(async()=>{while(keep){const seconds=(Date.now()-info.start)/1000;const pic=await wc.capturePage();const file=String(info.frames.length).padStart(4,'0')+'.png';fs.writeFileSync(path.join(dir,file),pic.toPNG());info.frames.push({file,seconds});await pause(250)}})()
  try{await pause(800);await operation();await pause(1200)}finally{keep=false;await capture;recording=null}
  info.duration=(Date.now()-info.start)/1000;delete info.start;fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(info,null,2));console.log(JSON.stringify({id:scene.id,frames:info.frames.length,seconds:info.duration}))
 }
 const operations={
  home:async()=>{await tap(button('全部功能'),'查看功能');await tap(selector('.ant-drawer-close'),'收起功能')},
  functions:async()=>{await menu();await pause(800)},
  word:async()=>{await tap(selector('[data-document-type="word"]'),'新建文字');await open('word');await tap(selector('.wps-editor-canvas__content'),'点正文');await type(' 及时保存，认真核对。')},
  'word-tools':async()=>{await tap(button('插入'),'打开插入功能区');await tap(button('页面布局'),'打开页面布局');await tap(button('开始'),'回到开始')},
  pictures:async()=>{
   await js(`(()=>{const c=document.createElement('canvas');c.width=240;c.height=120;const x=c.getContext('2d');x.fillStyle='#e9f1ff';x.fillRect(0,0,240,120);x.fillStyle='#2b6cf6';x.fillRect(28,52,32,46);x.fillRect(82,32,32,66);x.fillRect(136,18,32,80);x.fillStyle='#1a1d24';x.font='16px sans-serif';x.fillText('周计划进度',20,18);const e=document.querySelector('.wps-editor-canvas__content');e.focus();document.execCommand('insertImage',false,c.toDataURL('image/png'));e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));return true})()`)
   await tap(selector('.wps-editor-canvas__content img'),'选中图片');await tap(button('布局选项'),'查看图片布局');await tap(selector('.ant-modal-close'),'关闭布局');await tap(button('图片预览'),'预览图片');await tap(selector('.ant-modal-close'),'关闭预览')
  },
  ocr:async()=>{await tap(selector('.wps-editor-canvas__content img'),'选中图片');await tap(button('提取文字'),'打开图片识别');await pause(1000)},
  save:async()=>{if(await js("!!document.querySelector('.ant-modal-close')"))await tap(selector('.ant-modal-close'),'关闭识别面板');await tap(button('保存'),'保存文字文件');await tap(button('返回首页'),'回到首页')},
  sheet:async()=>{await open('sheet');await tap(selector('.wps-sheet__cell'),'选择单元格');},
  'sheet-tools':async()=>{await tap(button('插入'),'查看表格插入');await tap(button('数据'),'查看数据操作');await tap(button('开始'),'回到开始')},
  ppt:async()=>{await open('ppt');await wait("!!document.querySelector('.wps-ppt-canvas')");await pause(800);await tap(selector('.wps-ppt-canvas'),'查看演示画布');},
  'ppt-tools':async()=>{await tap(button('切换'),'查看切换设置');await tap(button('幻灯片放映'),'查看放映工具');await tap(button('开始'),'回到开始')},
  pdf:async()=>{await open('pdf');await wait("!!document.querySelector('.pdf-viewer__canvas')?.width");await tap(button('放大'),'放大 PDF');await tap(button('缩小'),'缩小 PDF')},
  assistant:async()=>{await tap(button('打开智能助手'),'打开智能助手');await pause(1200)},
  market:async()=>{if(await js("!!document.querySelector('.assistant-drawer .ant-drawer-close')"))await tap(selector('.assistant-drawer .ant-drawer-close'),'收起助手');await nav('market')},
  knowledge:async()=>{await nav('knowledge')},
  cloud:async()=>{await nav('my-cloud');await nav('trash');await nav('my-cloud')},
  calendar:async()=>{await nav('calendar')},
  diagrams:async()=>{await nav('mindmap');await nav('flow')},
  files:async()=>{await nav('recent');await nav('star');await nav('apps');await nav('document')},
  settings:async()=>{await nav('settings')},
  help:async()=>{await nav('help');await tap(selector('[aria-label="搜索帮助内容"]'),'搜索帮助');await type('保存')}
 }
 for(const scene of config.scenes){await record(scene,operations[scene.screen])}
 const source={version:config.version,buildInfo:JSON.parse(fs.readFileSync(path.join(root,'mobile/unpackage/web/build-info.json'),'utf8')),viewport:{width:420,height:840},source:config.source,errors,fixtureFileSelection:true,speechService:'Microsoft Edge TTS',recordings:config.scenes.length}
 fs.writeFileSync(path.join(work,'capture-source.json'),JSON.stringify(source,null,2));assert.equal(errors.length,0,errors.join('\n'));win.destroy();app.quit()
}).catch(e=>{console.error(e.stack);app.exit(1)})
