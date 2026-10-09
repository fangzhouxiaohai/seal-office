// Real Chromium regression for the editor, ribbon, selection and scrolling.
// Runs in an isolated window with local test documents; no desktop UI is driven.
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.resolve(process.argv[2] || path.join(root, '.upgrade-private/editor-interactions'))
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  const checks = []
  try {
    fs.mkdirSync(output, { recursive: true })
    const entry = `
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {App as AntdApp,ConfigProvider} from 'antd';import {AppProvider,useAppStore} from './renderer/src/store';
      import {SettingsProvider} from './renderer/src/store/settingsStore';import DocEditor from './renderer/src/editor/DocEditor';
      import {应用主题} from './renderer/src/styles/themes';
      import {HistoryStack} from './renderer/src/editor/history';
      const recordHistory=HistoryStack.prototype.record;
      HistoryStack.prototype.record=function(item){window.auditHistory=this;return recordHistory.call(this,item)};
      const mount=createRoot(document.getElementById('root'));let store;
      window.start=theme=>{
        flushSync(()=>mount.render(null));应用主题(theme);
        window.electronAPI={backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true})};
        const Harness=()=>{store=useAppStore();return <DocEditor/>};
        flushSync(()=>mount.render(<SettingsProvider><ConfigProvider button={{autoInsertSpace:false}}><AntdApp><AppProvider><Harness/></AppProvider></AntdApp></ConfigProvider></SettingsProvider>));
        flushSync(()=>store.createDoc('word',Array.from({length:30},(_,i)=>'<p data-test-paragraph="'+i+'" style="font-size:12pt;line-height:1.5;margin-bottom:30pt">第'+i+'段：海豹办公选区操作测试。'+ '选中这段文字修改格式后，阅读位置和正文内容应保持正确。'.repeat(3)+'</p>').join(''),{名称:'编辑交互测试.docx'}));
      };
      window.select=(scroll=true)=>{
        const editor=document.querySelector('.wps-editor-canvas__content'),p=editor.querySelector('[data-test-paragraph="15"]')||editor.querySelectorAll('p')[15];
        if(scroll)p.scrollIntoView({block:'center'});editor.focus({preventScroll:true});
        const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),text=walker.nextNode();
        const range=document.createRange();range.setStart(text,5);range.setEnd(text,18);const s=getSelection();s.removeAllRanges();s.addRange(range);
        editor.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      };
      window.info=()=>{
        const editor=document.querySelector('.wps-editor-canvas__content'),s=getSelection(),node=s?.anchorNode;
        const el=node?.nodeType===3?node.parentElement:node,style=el&&getComputedStyle(el);
        return {scroll:document.querySelector('.wps-editor-stage').scrollTop,selection:s?.toString(),fontSize:style?.fontSize,font:style?.fontFamily,
          float:!!document.querySelector('.wps-float-panel'),html:editor.innerHTML,text:editor.textContent,
          anchorTop:s?.rangeCount?s.getRangeAt(0).getBoundingClientRect().top:null,menu:!!document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden)')};
      };
      window.rect=(selector,label)=>{
        const nodes=[...document.querySelectorAll(selector)],node=nodes.find(x=>!x.closest('.ant-dropdown-hidden')&&(x.getAttribute('aria-label')===label||x.textContent===label));
        if(!node)throw Error('Missing control '+label);node.scrollIntoView({block:'nearest',inline:'nearest'});const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,top:r.top,bottom:r.bottom};
      };
      window.prepareRegion=part=>{
        const el=document.querySelector('.wps-editor-canvas__'+part);el.innerHTML='<p>海豹办公区域格式测试</p>';
        el.dispatchEvent(new InputEvent('input',{bubbles:true}));el.scrollIntoView({block:'center'});el.focus({preventScroll:true});
        const range=document.createRange();range.selectNodeContents(el.firstElementChild);getSelection().removeAllRanges();getSelection().addRange(range);
      };
      window.regionInfo=part=>{const el=document.querySelector('.wps-editor-canvas__'+part);return {html:el.innerHTML,text:el.textContent,body:document.querySelector('.wps-editor-canvas__content').innerHTML,size:getComputedStyle(getSelection().anchorNode?.parentElement||el).fontSize}};
      window.caret=()=>{const e=document.querySelector('.wps-editor-canvas__content'),p=e.querySelectorAll('p')[15];e.focus({preventScroll:true});const r=document.createRange();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)};
    `
    await require('esbuild').build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"verification"' }, outfile: path.join(output, 'editor.js'),
      plugins:[{name:'unused-pdf-worker',setup(build){build.onResolve({filter:/\?worker&url$/},()=>({path:'worker-url',namespace:'verification'}));build.onLoad({filter:/.*/,namespace:'verification'},()=>({contents:'export default "unused-pdf-worker"'}))}}] })
    fs.writeFileSync(path.join(output, 'editor.html'), `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')} html,body,#root{height:100%;margin:0}#root .ant-app{height:100%;display:flex;flex-direction:column}</style><link rel="stylesheet" href="editor.css"><div id="root"></div><script src="editor.js"></script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    win.webContents.on('console-message', (_event, level, message) => { if(level>=3) console.error(message) })
    await win.loadFile(path.join(output, 'editor.html'))
    const js = code => win.webContents.executeJavaScript(code)
    const frame = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const click = async (selector, label) => {
      const { x, y } = await js(`rect(${JSON.stringify(selector)},${JSON.stringify(label)})`)
      for (const type of ['mouseMove','mouseDown','mouseUp']) win.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(y),button:'left',clickCount:1})
      await frame()
      await js('new Promise(r=>setTimeout(r,220))')
    }
    if(process.argv.includes('--probe')) {
      await js('start("浅色")');await frame();await js('select()');await frame()
      console.log(await js(`(()=>{const e=document.querySelector('.wps-editor-canvas__content');getSelection().collapseToEnd();document.execCommand('styleWithCSS',false,'true');document.execCommand('fontSize',false,'7');const before=e.querySelectorAll('p')[15].innerHTML;document.execCommand('insertText',false,'测试');return {before,after:e.querySelectorAll('p')[15].innerHTML}})()`));win.destroy();app.exit(0);return
    }
    for (const theme of ['浅色','深色']) {
      await js(`start(${JSON.stringify(theme)})`);await frame();await js('select()');await frame();await js('select(false)');await frame()
      let before = await js('info()')
      assert.ok(before.scroll>1000, 'Select a paragraph well below the document top')
      assert.ok(before.float, 'Selection opens floating actions')
      await click('.wps-ribbon-button','字号');await frame()
      assert.equal((await js('info()')).float,false,'Ribbon dropdown must hide the selection toolbar')
      await click('.ant-dropdown-menu-title-content','小一');await frame()
      let after=await js('info()')
      assert.ok(Math.abs(after.scroll-before.scroll)<=2,`Font size moved viewport: ${before.scroll} -> ${after.scroll}`)
      assert.equal(after.selection,before.selection,'Font size retains the selected text')
      assert.equal(after.fontSize,'32px','小一 must apply exactly 24 pt')
      checks.push({theme,action:'font-size',before:before.scroll,after:after.scroll,passed:true})
      for(const [option,pixels] of [['五号','14px'],['初号','56px'],['72','96px'],['8','10.6667px']]) {
        await click('.wps-ribbon-button','字号');await click('.ant-dropdown-menu-title-content',option);after=await js('info()')
        assert.equal(after.selection,before.selection,option+' '+JSON.stringify({scroll:after.scroll,size:after.fontSize,menu:after.menu,anchorTop:after.anchorTop,html:after.html.slice(after.html.indexOf('第15段'),after.html.indexOf('第16段'))}));assert.equal(after.fontSize,pixels,option+' exact size')
        assert.ok(Math.abs(after.scroll-before.scroll)<=2,option+' viewport must stay fixed')
        checks.push({theme,action:'font-size-'+option,passed:true})
      }
      await click('.wps-ribbon-button','字体');assert.equal((await js('info()')).float,false)
      await click('.ant-dropdown-menu-title-content','Arial');after=await js('info()')
      assert.equal(after.font,'Arial');assert.equal(after.selection,before.selection)
      assert.ok(Math.abs(after.scroll-before.scroll)<=2,'Font family viewport')
      checks.push({theme,action:'font-family',passed:true})
      for(const action of ['加粗','斜体','下划线','删除线','上标','下标','居中','右对齐','左对齐','两端对齐']) {
        const old=await js('info()');await click('.wps-ribbon-button',action);after=await js('info()')
        assert.equal(after.selection,before.selection,action+' selection');assert.equal(after.text,before.text,action+' text')
        assert.ok(Math.abs(after.scroll-old.scroll)<=2,action+' viewport')
        assert.notEqual(after.html,old.html,action+' changes selected formatting')
        checks.push({theme,action,passed:true})
      }
      const edited=await js('info()')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);await frame()
      const undone=await js('info()');assert.notEqual(undone.html,edited.html,'Undo restores previous formatting')
      await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}))`);await frame()
      assert.equal((await js('info()')).html,edited.html,'Redo restores edited formatting')
      const snapshots=await js('auditHistory.snapshots()')
      assert.ok(!snapshots.some((s,i)=>i>0&&s.html===snapshots[i-1].html&&JSON.stringify(s.页面设置??null)===JSON.stringify(snapshots[i-1].页面设置??null)), 'No duplicate undo snapshot')
      checks.push({theme,action:'undo-redo',passed:true})
      for(const region of ['header','footer']) {
        await js(`prepareRegion(${JSON.stringify(region)})`);await frame()
        const initial=await js(`regionInfo(${JSON.stringify(region)})`)
        await click('.wps-ribbon-button','字号');await click('.ant-dropdown-menu-title-content','小一')
        const changed=await js(`regionInfo(${JSON.stringify(region)})`)
        assert.equal(changed.size,'32px');assert.equal(changed.body,initial.body,region+' formatting must not affect body')
        await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))`);await frame()
        assert.equal((await js(`regionInfo(${JSON.stringify(region)})`)).html,initial.html,region+' undo')
        await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}))`);await frame()
        assert.equal((await js(`regionInfo(${JSON.stringify(region)})`)).html,changed.html,region+' redo')
        checks.push({theme,action:region+'-format-undo-redo',passed:true})
      }
      await js('caret()');await frame();await click('.wps-ribbon-button','字号');await click('.ant-dropdown-menu-title-content','五号')
      await js(`document.execCommand('insertText',false,'字号输入验证')`);await frame()
      assert.equal((await js('info()')).fontSize,'14px','Typing after choosing font size uses exact point size')
      checks.push({theme,action:'caret-font-size',passed:true})
      fs.writeFileSync(path.join(output,`editor-${theme==='浅色'?'light':'dark'}.png`),(await win.webContents.capturePage()).toPNG())
    }
    fs.writeFileSync(path.join(output,'interaction-report.json'),JSON.stringify({passed:true,checks},null,2))
    console.log(JSON.stringify({passed:true,checks:checks.length,output}));win.destroy();app.exit(0)
  } catch(error) {
    fs.writeFileSync(path.join(output,'interaction-report.json'),JSON.stringify({passed:false,checks,error:error.message},null,2))
    console.error(error);win?.destroy();app.exit(1)
  }
})
