// Full application layout/interaction audit in isolated Chromium. Desktop IPC
// and cloud responses are controlled; no user's files or services are changed.
const { app, BrowserWindow } = require('electron')
const fs = require('fs'),path = require('path'),assert = require('assert/strict')
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[2]||path.join(root,'.upgrade-private/ui-experience'))
app.setPath('userData',path.join(output,'profile'));app.disableHardwareAcceleration()
app.whenReady().then(async()=>{
  let win;const checks=[],errors=[],actions=[]
  try {
    fs.mkdirSync(output,{recursive:true})
    const entry=`
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import App from './renderer/src/App';
      const mount=createRoot(document.getElementById('root'));
      window.cloudMode='off';window.calls=[];
      window.start=()=>{
        flushSync(()=>mount.render(null));
        window.electronAPI={backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),backupClear:async()=>({成功:true}),
          reportUnsavedCount:async()=>({成功:true}),exportToPdf:async()=>({成功:false,错误:'已取消测试导出'}),
          showOpenDialog:async()=>null,showSaveDialog:async()=>null,listKnownFolder:async()=>({成功:true,路径:'C:/Audit',文件:[]}),
          presentationResources:{restore:async entries=>{window.resources=Object.fromEntries(entries.map(e=>[e.标识,e]));return {成功:true}},read:async id=>({成功:true,数据:window.resources[id]?.数据}),export:async ids=>({成功:true,条目:ids.map(id=>window.resources[id]).filter(Boolean)}),sync:async()=>({成功:true}),release:async()=>({成功:true})},
          ai:{getConfig:async()=>({成功:true,数据:null}),getSession:async()=>({成功:true,数据:null}),onStream:()=>()=>{},onToolCall:()=>()=>{}},
          cloud:{invoke:async(action,input)=>{window.calls.push({action,input});if(window.cloudMode==='error'&&action!=='status')return {成功:false,错误:'测试连接失败，请稍后重试'};
            const account=window.cloudMode==='off'?null:{id:'audit-user',phone:'13800000000',enabled:window.cloudMode!=='disabled',autosave:false,used:0,quota:300000000};
            return {成功:true,数据:action==='status'?{account,unlocked:window.cloudMode==='enabled',statuses:{},pending:0}:['list','pending'].includes(action)?[]:{items:[]}};}}
        };flushSync(()=>mount.render(<App 初始最近文档={[]}/>));
      };
      window.navigate=key=>flushSync(()=>key==='settings'?window.uiStore.showSettings():window.uiStore.handleNav(key,()=>{}));
      window.newDocument=kind=>flushSync(()=>window.uiStore.createDoc(kind,kind==='word'?'<h1>交互验收</h1><p>海豹办公测试正文。</p>':undefined));
      window.inspect=()=>{
        const visible=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'&&!el.closest('.ant-modal-wrap[style*="display: none"],.ant-dropdown-hidden')};
        const controls=[...document.querySelectorAll('button,input,textarea,select,[role=button],[role=tab],[role=switch]')].filter(visible).map(el=>{
          const r=el.getBoundingClientRect();return {tag:el.tagName,role:el.getAttribute('role'),name:el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent?.trim()||el.getAttribute('placeholder')||el.getAttribute('aria-labelledby')||'',
            disabled:el.disabled||el.getAttribute('aria-disabled')==='true',width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom,tabIndex:el.tabIndex};
        });return {module:window.uiStore.module,navKey:window.uiStore.navKey,controls,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,
          error:document.querySelector('.wps-error')?.textContent||'',dialogs:[...document.querySelectorAll('.ant-modal-wrap')].filter(visible).map(x=>x.textContent),text:document.body.textContent,images:[...document.images].filter(visible).map(x=>({alt:x.alt,loaded:x.complete&&x.naturalWidth>0}))};
      };
      window.theme=name=>{if(window.uiSettings.主题!==name)flushSync(()=>window.uiSettings.切换主题())};
    `
    await require('esbuild').build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(output,'ui.js'),
      define:{'process.env.NODE_ENV':'"production"',__APP_VERSION__:'"verification"'},loader:{'.png':'dataurl'},plugins:[
        {name:'audit-store',setup(build){build.onLoad({filter:/renderer[\\/]src[\\/]App\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace('const 是首页 = module', 'window.uiStore = useAppStore(); window.uiSettings = useSettings(); const 是首页 = module'),loader:'tsx'}))}},
        {name:'unused-worker',setup(build){build.onResolve({filter:/\?worker&url$/},()=>({path:'worker-url',namespace:'verification'}));build.onLoad({filter:/.*/,namespace:'verification'},()=>({contents:'export default "unused-worker"'}))}}
      ]})
    fs.writeFileSync(path.join(output,'ui.html'),`<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(root,'renderer/src/styles.css'),'utf8')}</style><link rel="stylesheet" href="ui.css"><div id="root"></div><script src="ui.js"></script>`)
    win=new BrowserWindow({show:false,width:1280,height:900,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}})
    win.webContents.on('console-message',(_e,level,message)=>{if(level>=3&&!message.includes('Failed to load resource'))errors.push(message)})
    await win.loadFile(path.join(output,'ui.html'))
    const js=code=>win.webContents.executeJavaScript(code)
    const settle=()=>js('new Promise(r=>setTimeout(()=>requestAnimationFrame(r),350))')
    await js('start()');await settle()
    for(const [width,height] of [[1280,900],[960,720]]) {
      win.setContentSize(width,height)
      for(const theme of ['浅色','深色']) {
        await js(`theme(${JSON.stringify(theme)})`);await settle()
        for(const route of ['home','recent','star','my-cloud','trash','knowledge','market','calendar','mindmap','flow','apps','desktop','document','download','settings']) {
          await js(`navigate(${JSON.stringify(route)})`);await settle()
          const info=await js('inspect()');checks.push({route,theme,...info})
          assert.ok(!info.text.includes('自动备份失败'),'Test IPC must support backup lifecycle')
          assert.equal(info.dialogs.length,0,'Unexpected dialog on '+route+': '+info.dialogs.join(' / '))
          if(route==='settings')assert.equal(info.module,'settings')
          if(width===1280)fs.writeFileSync(path.join(output,`${route}-${theme==='浅色'?'light':'dark'}.png`),(await win.webContents.capturePage()).toPNG())
        }
        for(const kind of ['word','table','ppt','pdf']) {
          await js(`newDocument(${JSON.stringify(kind)})`);await settle()
          const info=await js('inspect()');checks.push({route:kind,theme,...info})
          if(width===1280)fs.writeFileSync(path.join(output,`${kind}-${theme==='浅色'?'light':'dark'}.png`),(await win.webContents.capturePage()).toPNG())
        }
      }
    }
    for(const mode of ['disabled','locked','enabled','error']) {
      await js(`window.cloudMode=${JSON.stringify(mode)};start()`);await settle()
      for(const route of ['my-cloud','trash','knowledge','market','settings']) {
        await js(`navigate(${JSON.stringify(route)})`);await settle();const info=await js('inspect()');checks.push({route,theme:'深色',cloudMode:mode,...info})
        assert.equal(info.dialogs.length,0,'Cloud state must render without unexpected dialogs: '+mode+' '+route)
      }
    }
    win.setContentSize(1280,900);await js('window.cloudMode="off";start()');await settle()
    const click=async selector=>{
      await js(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`);await settle()
      const point=await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control: '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();const x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);const hit=document.elementFromPoint(x,y);if(!el.contains(hit))throw Error('Obscured control: '+${JSON.stringify(selector)}+' by '+hit?.outerHTML.slice(0,150));return {x,y}})()`)
      for(const type of ['mouseMove','mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...point});await settle()
    }
    const button=async text=>{
      const selector=await js(`(()=>{const el=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getBoundingClientRect().height>0&&!e.closest('.ant-modal-wrap[style*="display: none"]'));if(!el)throw Error('Missing button: '+${JSON.stringify(text)});el.dataset.auditClick='target';return 'button[data-audit-click="target"]'})()`)
      await click(selector);await js(`document.querySelectorAll('[data-audit-click]').forEach(e=>delete e.dataset.auditClick)`)
    }
    for(const [index,kind] of [[0,'word'],[1,'table'],[2,'ppt']]){
      await js('navigate("home")');await settle();await button('新建');assert.match((await js('inspect()')).text,/新建文档/)
      await click(`.wps-newdoc-option:nth-child(${index+1})`);assert.equal((await js('inspect()')).module,kind);actions.push('新建弹窗 → '+kind)
    }
    await js('navigate("market")');await settle();await click('.seal-market-favorite');assert.equal(await js('document.querySelector(".seal-market-favorite").textContent.trim()'),'取消收藏');await click('.seal-market-favorite');actions.push('模板收藏 → 取消收藏')
    await click('[aria-label="下一页模板"]');assert.equal(await js('document.querySelector(".ant-pagination-item-active").getAttribute("title")'),'2');await click('[aria-label="上一页模板"]');actions.push('模板翻页 → 返回')
    await click('.seal-market-cover');assert.equal(await js('document.querySelectorAll(".seal-market-preview > div").length'),9);assert.ok(await js('[...document.querySelectorAll(".seal-market-preview img")].every(i=>i.complete&&i.naturalWidth>0)'));await button('使用并编辑副本');assert.equal((await js('inspect()')).module,'ppt');actions.push('模板预览九页与配图 → 创建可编辑副本');await js('navigate("market")');await settle()
    for(const [tool,title] of [['document','文档生成演示'],['beautify','美化演示'],['image','图片转可编辑演示']]){
      await click(`[data-tool="${tool}"]`);assert.match((await js('inspect()')).dialogs.join(''),new RegExp(title));await click('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-close');actions.push(title+' → 对话框 → 取消')
    }
    await js('navigate("knowledge")');await settle();await button('阅读与提问');assert.match((await js('inspect()')).text,/知识问答/);await button('返回知识列表');actions.push('知识库阅读 → 返回列表')
    await js('navigate("calendar")');await settle();await button('新增日程');await click('.local-form .ant-input');win.webContents.insertText('界面交互验收日程');await settle();await button('保存');assert.match((await js('inspect()')).text,/界面交互验收日程/);await button('编辑');await button('取消');actions.push('日历新增保存 → 编辑 → 取消保留原内容')
    for(const route of ['mindmap','flow']){
      await js(`navigate(${JSON.stringify(route)})`);await settle();const count=await js('document.querySelectorAll(".diagram-node").length');await button('添加节点');assert.equal(await js('document.querySelectorAll(".diagram-node").length'),count+1);await button('转为演示');assert.equal((await js('inspect()')).module,'ppt');actions.push(route+' 添加节点 → 转为演示')
    }
    await js('window.cloudMode="enabled";start()');await settle();await js('navigate("my-cloud")');await settle();await button('新建目录');await button('确定');assert.ok((await js('inspect()')).dialogs.some(x=>x.includes('新建目录')));assert.equal(await js('calls.filter(c=>c.action==="folder").length'),0);assert.match((await js('inspect()')).text,/名称不能为空/)
    await click('input[aria-label="新建目录"]');win.webContents.insertText('验收目录');await settle();await js('window.cloudMode="error"');await button('确定');assert.ok((await js('inspect()')).dialogs.some(x=>x.includes('新建目录')));assert.equal(await js('document.querySelector("input[aria-label=新建目录]").value'),'验收目录');assert.match((await js('inspect()')).text,/测试连接失败/);await js('window.cloudMode="enabled"');await button('确定');assert.ok(await js('calls.some(c=>c.action==="folder"&&c.input.name==="验收目录")'));actions.push('云目录空名称反馈 → 保留弹窗 → 修正后创建');actions.push('云目录连接失败 → 保留输入 → 成功重试')
    const issues=checks.flatMap(c=>[
      ...(c.overflow>1?[{route:c.route,theme:c.theme,width:c.width,problem:'body-overflow',amount:c.overflow}]:[]),
      ...c.controls.filter(x=>!x.name&&x.tag!=='INPUT').map(x=>({route:c.route,theme:c.theme,width:c.width,problem:'unnamed-control',control:x})),
      ...c.images.filter(x=>!x.loaded).map(x=>({route:c.route,theme:c.theme,width:c.width,problem:'unloaded-image',image:x})),
      ...(c.error?[{route:c.route,problem:'page-error',error:c.error}]:[])
    ])
    const report={passed:issues.length===0&&errors.length===0,cases:checks.length,controls:checks.reduce((n,c)=>n+c.controls.length,0),actions,issues,errors,checks}
    fs.writeFileSync(path.join(output,'ui-report.json'),JSON.stringify(report,null,2))
    console.log(JSON.stringify({passed:report.passed,cases:report.cases,controls:report.controls,actions,issues,errors,output}));win.destroy();app.exit(report.passed?0:1)
  }catch(error){if(win)fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(output,'ui-report.json'),JSON.stringify({passed:false,checks,actions,errors,error:error.message},null,2));console.error(error);win?.destroy();app.exit(1)}
})
