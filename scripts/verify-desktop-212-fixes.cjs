// Real Chromium editor interactions, isolated profile and synthetic files only.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(root,'.upgrade-private/v212-desktop-ui'))
app.setPath('userData',path.join(out,'profile'));app.disableHardwareAcceleration()
app.whenReady().then(async()=>{let win;const checks=[];try{
  fs.mkdirSync(out,{recursive:true})
  const entry=`
import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {App as AntdApp,ConfigProvider} from 'antd';import {AppProvider,useAppStore} from './renderer/src/store';
import {SettingsProvider} from './renderer/src/store/settingsStore';import DocEditor from './renderer/src/editor/DocEditor';
import SheetEditor from './renderer/src/sheet/SheetEditor';import {导出为Xlsx} from './renderer/src/sheet/sheetExport';import Launcher from './renderer/src/assistant/MobileAssistantLauncher';
import './renderer/src/assistant/assistant.css';import {应用主题} from './renderer/src/styles/themes';
window.electronAPI={backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),recentList:async()=>[],settings:{get:async()=>({成功:true,值:false})}};
let store;const mount=createRoot(document.getElementById('root'));window.opens=0;
function Harness({mode}){store=useAppStore();return <>{mode==='word'?<DocEditor/>:<SheetEditor/>}<Launcher desktop disabled={false} onOpen={()=>window.opens++}/></>}
window.start=(mode,data)=>{flushSync(()=>mount.render(null));应用主题('浅色');flushSync(()=>mount.render(<SettingsProvider><ConfigProvider button={{autoInsertSpace:false}}><AntdApp><AppProvider><Harness mode={mode}/></AppProvider></AntdApp></ConfigProvider></SettingsProvider>));flushSync(()=>store.createDoc(mode,data??'<p>图片插入验证𠮷</p>',{名称:mode==='word'?'验证.sldoc':'验证.xlsx'}))};
window.sheets=()=>store.表格文档模型[store.activeDocumentId];window.exportSheet=()=>导出为Xlsx(window.sheets());
window.word=()=>store.documents.find(d=>d.id===store.activeDocumentId)?.html??document.querySelector('.wps-editor-canvas__content')?.innerHTML;
window.transfer=(kind,base64)=>{const root=document.querySelector('.wps-editor-canvas__content');root.focus();const r=document.createRange();r.selectNodeContents(root.firstElementChild);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],'verification.png',{type:'image/png'}));const rect=root.getBoundingClientRect();root.dispatchEvent(kind==='paste'?new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}):new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:rect.x+30,clientY:rect.y+20}));};
`
  await require('esbuild').build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',loader:{'.png':'dataurl','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"',__APP_VERSION__:'"2.1.2"'},outfile:path.join(out,'test.js'),plugins:[{name:'unused-worker',setup(b){b.onResolve({filter:/\?worker&url$/},()=>({path:'worker',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export default "unused"'}))}}]})
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(root,'renderer/src/styles.css'),'utf8')}html,body,#root{height:100%;margin:0}#root .ant-app{height:100%;display:flex;flex-direction:column}</style><link rel="stylesheet" href="test.css"><div id="root"></div><script src="test.js"></script>`)
  win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}})
  await win.loadFile(path.join(out,'index.html'))
  const js=code=>win.webContents.executeJavaScript(code)
  const wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50))}throw Error('Timed out: '+code)}
  const settle=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  const click=async label=>{await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click()})()`);await settle()}
  await js('start("word")');await settle()
  const png=fs.readFileSync(path.join(root,'renderer/src/editor/__fixtures__/office-image.png')).toString('base64')
  for(const kind of ['paste','drop']){
    await js(`transfer(${JSON.stringify(kind)},${JSON.stringify(png)})`)
    await wait('document.querySelectorAll(".wps-editor-canvas__content img").length===1');await settle()
    const content=await js('word()');assert(content.includes('data:image/png;base64,'))
    await click('撤销');await wait('document.querySelectorAll(".wps-editor-canvas__content img").length===0')
    await click('重做');await wait('document.querySelectorAll(".wps-editor-canvas__content img").length===1')
    const codec=require('../main/office/sealFormat');const bytes=await codec.writeSeal('word',{html:await js('word()')});const restored=await codec.readSeal('sldoc',bytes)
    assert(restored.html.includes(png));checks.push(kind+' image, undo/redo, native bytes reopen')
    fs.writeFileSync(path.join(out,'word-'+kind+'.png'),(await win.capturePage()).toPNG())
    await click('撤销');await wait('document.querySelectorAll(".wps-editor-canvas__content img").length===0')
  }
  const ball=await js('(()=>{const b=document.querySelector(".assistant-desktop-launcher"),r=b.getBoundingClientRect();return{x:r.x+28,y:r.y+28,width:r.width,height:r.height,radius:getComputedStyle(b).borderRadius,svg:!!b.querySelector("svg")}})()')
  assert.equal(ball.width,56);assert.equal(ball.height,56);assert(ball.svg)
  win.webContents.debugger.attach('1.3')
  for(const event of [{type:'mouseMoved',x:ball.x,y:ball.y,buttons:0},{type:'mousePressed',x:ball.x,y:ball.y,buttons:1},{type:'mouseMoved',x:ball.x-150,y:ball.y-120,buttons:1},{type:'mouseReleased',x:ball.x-150,y:ball.y-120,buttons:0}]){await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{...event,button:'left',clickCount:1});await settle()}
  await settle();assert.equal(await js('opens'),0)
  assert(await js('!!localStorage.getItem("seal.desktop.assistant.position.v1")'))
  await click('打开智能助手');assert.equal(await js('opens'),1)
  checks.push('desktop circular seal launcher: real mouse drag, persisted position, no accidental click')
  fs.writeFileSync(path.join(out,'launcher.png'),(await win.capturePage()).toPNG())
  const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook(),sheet=book.addWorksheet('回归表格')
  sheet.getCell('A1').value='非常长的中文栏目名称'
  sheet.getCell('B1').value={richText:[{text:'字体',font:{name:'宋体',size:11}},{text:'分段',font:{size:20,bold:true}}]}
  const codec=require('../main/office/xlsxCodec'),source=await codec.读取xlsx(await book.xlsx.writeBuffer())
  await js(`start('table',${JSON.stringify(source.工作表列表)})`);await wait(`!!document.querySelector('[aria-label="自适应列宽"]')`);await settle()
  const before=await js('sheets()[0].列宽')
  await click('自适应列宽');await settle()
  const after=await js('sheets()[0].列宽');assert(after[0]>before[0]);assert(after[1]!==before[1]);assert.equal(after[2],before[2])
  await click('撤销');assert.deepEqual(await js('sheets()[0].列宽'),before)
  await click('重做');assert.deepEqual(await js('sheets()[0].列宽'),after)
  const saved=await codec.写入xlsx(await js('exportSheet()')),reopened=await codec.读取xlsx(saved)
  assert.equal(reopened.工作表列表[0].元数据.列宽[0],after[0]);assert.equal(reopened.工作表列表[0].元数据.单元格富文本.B1[1].格式.字号,20)
  checks.push('auto-fit actual ribbon, Chinese/rich text measured, empty columns retained, undo/redo, XLSX reopen')
  fs.writeFileSync(path.join(out,'sheet-autofit.png'),(await win.capturePage()).toPNG())
  const report={version:'2.1.2',passed:true,checks,scope:'isolated Chromium source harness; native image decoding and real mouse events',at:new Date().toISOString()}
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));win.destroy();app.exit(0)
}catch(error){console.error(error);if(win&&!win.isDestroyed()){fs.writeFileSync(path.join(out,'failure.png'),(await win.capturePage()).toPNG());win.destroy()}app.exit(1)}})
