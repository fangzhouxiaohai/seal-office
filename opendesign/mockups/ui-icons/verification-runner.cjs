const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const root = 'E:/seal-office';
const output = path.join(root, 'opendesign/mockups/ui-icons');
app.setPath('userData', path.join(root, '.upgrade-private/icon-preview/profile'));
app.commandLine.appendSwitch('disable-gpu');
const base = 'http://127.0.0.1:8290/opendesign/mockups/ui-icons/';
const result = { generatedAt: new Date().toISOString(), browser: 'Electron 25.9.8', previewUrl:base,checks: [], screenshots: [], runtimeErrors:[], warnings:[] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function metrics(win) {
  return win.webContents.executeJavaScript(`(() => {
    const rect = el => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const buttons = [...document.querySelectorAll('button[data-view]')].map(el => ({view:el.dataset.view,pressed:el.getAttribute('aria-pressed'),...rect(el)}));
    const overflow = [...document.querySelectorAll('header,main,.page-title,.page-title>*,.mobile-layout,.mobile-layout>*,.mobile-board,.phone,.review-footer')].map(el=>({element:el.className || el.tagName,...rect(el)})).filter(el=>el.right>document.documentElement.clientWidth+1 || el.x<0);
    const colorNavCloud = document.querySelector('.phone-bottom .nav-item:nth-child(2) svg');
    return {view:document.body.dataset.view,title:document.title,width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,buttons,svgCount:document.querySelectorAll('main svg').length,brokenImages:[...document.images].filter(el=>!el.complete || !el.naturalWidth).map(el=>el.src),iconCatalogCount:window.SEAL_ICON_PROPOSAL.length,visibleText:document.querySelector('h1').textContent,overflow,cloudNavigation:colorNavCloud?{viewBox:colorNavCloud.getAttribute('viewBox'),stroke:getComputedStyle(colorNavCloud).stroke,strokeWidth:getComputedStyle(colorNavCloud).strokeWidth,fill:getComputedStyle(colorNavCloud).fill}:null};
  })()`);
}
async function load(win, view, capture=false) {
  await win.loadURL(base+'?view='+view+(capture?'&capture=1':''));
  await sleep(300);
  await win.webContents.executeJavaScript('document.fonts.ready');
}
async function capture(win, view, filename) {
  win.setContentSize(1600, 1000);
  await load(win, view, true);
  const before=await metrics(win);
  win.setContentSize(1600, before.height);
  await sleep(300);
  const info=await metrics(win);
  const bitmap=await win.webContents.capturePage({x:0,y:0,width:1600,height:info.height});
  fs.writeFileSync(path.join(output,'assets',filename),bitmap.toPNG());
  result.screenshots.push({view,path:path.join(output,'assets',filename).replaceAll('\\','/'),width:1600,height:info.height,independentlyViewed:false});
  return info;
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,width:1600,height:1000,frame:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false}});
  win.webContents.setFrameRate(30);
  win.webContents.on('console-message',(_,level,message)=>{
    if(level===2){if(!result.warnings.some(item=>item.message===message))result.warnings.push({source:'Electron renderer',level:'warning',message});}
    else if(level>=3)result.runtimeErrors.push({source:'renderer console',level:'error',message});
  });
  win.webContents.on('render-process-gone',(_,details)=>result.runtimeErrors.push({source:'render-process-gone',details}));
  try {
    for(const view of ['pc','mobile']){
      const data=await capture(win,view,view+'-effect.png');
      result.checks.push({name:'full page capture '+view,pass:data.scrollWidth<=data.clientWidth && !data.brokenImages.length && !data.overflow.length,data});
    }
    for(const width of [1280,390]){
      win.setContentSize(width,1000);
      for(const view of ['pc','mobile']){
        await load(win,view);
        const data=await metrics(win);
        result.checks.push({name:'responsive '+width+' '+view,pass:data.scrollWidth<=data.clientWidth && !data.brokenImages.length && !data.overflow.length,data});
      }
      await win.webContents.executeJavaScript("document.querySelector('button[data-view=pc]').click()");
      const pc=await metrics(win);
      await win.webContents.executeJavaScript("document.querySelector('button[data-view=mobile]').click()");
      const mobile=await metrics(win);
      result.checks.push({name:'version switcher '+width,pass:pc.view==='pc' && mobile.view==='mobile' && pc.buttons.filter(v=>v.pressed==='true')[0].view==='pc' && mobile.buttons.filter(v=>v.pressed==='true')[0].view==='mobile',data:{pc,mobile}});
      await win.webContents.executeJavaScript("document.querySelector('.all-icons').open=true");
      const catalog=await metrics(win);
      const catalogCells=await win.webContents.executeJavaScript("document.querySelectorAll('.all-icons .icon-cell').length");
      result.checks.push({name:'complete catalog '+width,pass:catalogCells===127 && catalog.scrollWidth<=catalog.clientWidth,data:{cells:catalogCells,scrollWidth:catalog.scrollWidth,clientWidth:catalog.clientWidth}});
    }
    result.automatedPassed=result.checks.every(item=>item.pass) && !result.runtimeErrors.length;
    result.passed=false;
    result.visualReview={status:'pending',referenceImages:['e7ad6f09350353ad49073844ac5b3b38.jpg','327d9c227699f3a1f37969a2b43f1340.jpg','codex-clipboard-137a226c-dc17-427f-badd-43813d23cdaa.png']};
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2));
  } catch(error) {
    result.runtimeErrors.push({source:'verification harness',message:error.stack});
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(result,null,2));
    app.exit(1);return;
  }
  win.destroy();app.quit();
});
