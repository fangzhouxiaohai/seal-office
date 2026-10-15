// UI regression in isolated Chromium; fixtures never touch an existing cloud account.
const {app,BrowserWindow}=require('electron')
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const root=path.resolve(__dirname,'..'),output=path.join(root,'.upgrade-private/cloud-fix-20261015')
app.setPath('userData',path.join(output,'profile-'+process.pid));app.disableHardwareAcceleration()
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
app.whenReady().then(async()=>{
  let win
  const errors=[],checks=[]
  try{
    fs.mkdirSync(output,{recursive:true})
    const entry=`
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import App from './renderer/src/App';import MobileNavigation from './mobile/web/navigation';import {IconPlatformProvider} from './renderer/src/components/IconPlatform';
      window.fixtureMode='enabled';window.nativeStates=[];window.backups=[];window.sealNative={token:'ui-test',platform:'android'};window.uni={webView:{postMessage:({data})=>{if(data.action==='state')window.nativeStates.push(data)}}};
      const mount=createRoot(document.getElementById('root'));
      const nodes=[{id:'folder',parent:null,kind:'folder',deleted:0,version:0,updated:Date.now(),meta:{name:'工作资料'}},{id:'folder2',parent:null,kind:'folder',deleted:0,version:0,updated:Date.now(),meta:{name:'演示模板'}},{id:'file',parent:null,kind:'file',deleted:0,version:3,updated:Date.now(),meta:{name:'推广员补充需求答复_20261014.docx'}},{id:'pdf',parent:'folder',kind:'file',deleted:0,version:1,updated:Date.now(),meta:{name:'预算资料.pdf'}}];
      window.start=()=>{flushSync(()=>mount.render(null));window.electronAPI={
        backupLoad:async()=>({成功:true,内容:null}),backupSave:async(data)=>{window.backups.push(data);return {成功:true}},backupClear:async()=>({成功:true}),reportUnsavedCount:async()=>({成功:true}),listKnownFolder:async()=>({成功:true,路径:'/test',文件:[]}),
        ai:{getConfig:async()=>({成功:true,数据:null}),getSession:async()=>({成功:true,数据:null}),onStream:()=>()=>{},onToolCall:()=>()=>{}},
        cloud:{invoke:async(action)=>({成功:true,数据:action==='status'?{account:window.fixtureMode==='off'?null:{id:'ui-test',phone:'13800000000',enabled:true,autosave:false,used:200000,quota:300000000},unlocked:window.fixtureMode!=='off',statuses:{},pending:0}:action==='list'?nodes:action==='pending'?[]:{items:[]}})}
      };flushSync(()=>mount.render(<IconPlatformProvider responsive><App 初始最近文档={[]} 跨端导航={MobileNavigation}/></IconPlatformProvider>))};
      window.navigate=key=>flushSync(()=>window.uiStore.handleNav(key,()=>{}));
      window.setLanguage=language=>window.uiSettings.设置语言(language);
      window.newWord=()=>flushSync(()=>window.uiStore.createDoc('word','<p>返回测试未保存正文</p>'));
    `
    await require('esbuild').build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(output,'ui.js'),define:{'process.env.NODE_ENV':'"production"',__APP_VERSION__:'"1.9.15"'},loader:{'.png':'dataurl'},plugins:[
      {name:'ui-store',setup(build){build.onLoad({filter:/renderer[\\/]src[\\/]App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('const 是首页 = module','window.uiStore = useAppStore(); window.uiSettings = useSettings(); const 是首页 = module'),loader:'tsx'}))}},
      {name:'worker-url',setup(build){build.onResolve({filter:/\?worker&url$/},()=>({path:'worker',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default "unused-worker"'}))}}
    ]})
    const styles=['renderer/src/styles.css','renderer/src/styles/nativeControls.css','renderer/src/styles/actionColors.css','renderer/src/styles/flatDesktop.css','mobile/web/mobile.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')
    fs.writeFileSync(path.join(output,'ui.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="ui.css"><style>${styles}</style><div id="root"></div><script src="ui.js"></script>`)
    win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
    win.webContents.on('console-message',(_e,level,message)=>{if(level>=3&&!message.includes('Failed to load resource'))errors.push(message)})
    const js=code=>win.webContents.executeJavaScript(code,true)
    const until=async code=>{for(let i=0;i<80;i++){if(await js(code))return;await wait(100)}throw new Error('Not ready: '+code)}
    await win.loadFile(path.join(output,'ui.html'));await js('start()');await wait(400)
    for(const width of [1280,390]){
      win.setContentSize(width,850);await wait(250);await js("navigate('my-cloud')");await until("document.querySelectorAll('.seal-drive-file').length===3")
      const layout=await js("({width:innerWidth,scroll:document.documentElement.scrollWidth,files:document.querySelectorAll('.seal-drive-file').length,icon:[...document.querySelectorAll('.seal-drive-file-open svg')].every(s=>Math.abs(s.getBoundingClientRect().width-s.getBoundingClientRect().height)<1)})")
      assert(layout.scroll<=layout.width+1,JSON.stringify(layout));assert(layout.icon);checks.push({width,cloud:'grid',...layout})
      fs.writeFileSync(path.join(output,`cloud-grid-${width}.png`),(await win.webContents.capturePage()).toPNG())
      await js("document.querySelector('[aria-label=\"列表视图\"]').click()");await wait(200);assert(await js("!!document.querySelector('.seal-drive-files--list')"))
      fs.writeFileSync(path.join(output,`cloud-list-${width}.png`),(await win.webContents.capturePage()).toPNG())
      await js("[...document.querySelectorAll('.seal-drive-file-open')].find(b=>b.textContent==='工作资料').click()");await until("document.querySelector('.seal-drive-file-name')?.textContent==='预算资料.pdf'")
      await js("window.dispatchEvent(new Event('seal-native-back',{cancelable:true}))");await until("document.querySelectorAll('.seal-drive-file').length===3");assert.equal(await js('window.uiStore.navKey'),'my-cloud');checks.push({width,folderBack:'passed'})
      if(width===390){
        await js("navigate('market')");await wait(3200);assert.equal(await js("document.querySelectorAll('.seal-market-cover').length"),8);assert.equal(await js("!!document.querySelector('.wps-error')"),false);checks.push({market:'8 mobile covers remain mounted after 3 seconds'})
        await js("window.dispatchEvent(new Event('seal-native-back',{cancelable:true}))");await wait(200);assert.equal(await js('window.uiStore.navKey'),'home');assert.equal(await js('window.nativeStates.at(-1).atHome'),true)
        await js("document.querySelector('[aria-label=\"全部功能\"]').click()");await wait(250);assert.equal(await js('window.nativeStates.at(-1).atHome'),false)
        await js("window.dispatchEvent(new Event('seal-native-back',{cancelable:true}))");await wait(350);assert.equal(await js("document.querySelector('[aria-label=\"全部功能\"]').getAttribute('aria-expanded')"),'false');assert.equal(await js('window.nativeStates.at(-1).atHome'),true);checks.push({back:'function panel closes first; root reports atHome'})
        await js('newWord()');await wait(250);assert.equal(await js('window.nativeStates.at(-1).atHome'),false)
        await js("window.dispatchEvent(new Event('seal-native-back',{cancelable:true}));window.dispatchEvent(new Event('seal-persist-workspace'))");await wait(350)
        assert.equal(await js('window.nativeStates.at(-1).atHome'),true);assert.equal(await js('window.nativeStates.at(-1).unsaved'),1)
        assert(await js("window.backups.some(data=>data.includes('返回测试未保存正文'))"));checks.push({back:'dirty document returns to home; unsaved content remains in workspace backup'})
      }
      await js("document.querySelector('[aria-label=\"网格视图\"]')?.click()")
    }
    await js("window.fixtureMode='off';start();navigate('my-cloud')");await wait(300)
    await js("document.querySelector('.seal-drive-welcome .ant-btn').click()");await until("!!document.querySelector('#seal-login-phone')")
    assert.equal(await js('window.nativeStates.at(-1).atHome'),false)
    await js("window.dispatchEvent(new Event('seal-native-back',{cancelable:true}))");await wait(350);assert.equal(await js("!!document.querySelector('.ant-modal-wrap:not([style*=\"display: none\"])')"),false);checks.push({login:'cloud login opens and system back closes modal'})
    await js("window.fixtureMode='enabled';start();navigate('my-cloud');setLanguage('en-US')");await wait(400);assert.equal(await js("document.querySelector('.seal-drive-header h1').textContent"),'My cloud space');assert(await js("document.body.textContent.includes('推广员补充需求答复_20261014.docx')"));checks.push({language:'English controls keep Chinese file names'})
    assert.equal(errors.length,0,errors.join('\n'))
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:true,checks,errors},null,2))
    console.log(JSON.stringify({passed:true,checks,output},null,2));win.destroy();app.exit(0)
  }catch(error){console.error(error.stack);if(win&&!win.isDestroyed()){fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());win.destroy()}app.exit(1)}
})
