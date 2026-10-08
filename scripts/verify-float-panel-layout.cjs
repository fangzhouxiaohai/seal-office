// Electron rendering regression, using an isolated offscreen window and the real
// shared component, action definitions and stylesheet. No desktop UI is controlled.
// Run: electron scripts/verify-float-panel-layout.cjs <report-directory>
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.resolve(process.argv[2] || path.join(root, '.upgrade-private', 'float-layout'))
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  const results = []
  try {
    fs.mkdirSync(output, { recursive: true })
    const entry = `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {flushSync} from 'react-dom';
      import Panel, {计算浮窗位置} from './renderer/src/components/SelectionFloatPanel';
      import {构建文字浮窗按钮} from './renderer/src/editor/floatActions';
      import {构建表格浮窗按钮} from './renderer/src/sheet/sheetFloatActions';
      import {构建演示浮窗按钮} from './renderer/src/ppt/pptFloatActions';
      import {应用主题} from './renderer/src/styles/themes';
      const mount = createRoot(document.getElementById('root'));
      window.showPanel = (kind, theme, bottom) => {
        应用主题(theme); window.commands=[];
        const call = id => window.commands.push(id);
        const text = () => window.getSelection()?.toString() || '测试选区';
        const actions = kind==='word'
          ? 构建文字浮窗按钮({执行命令:call, 执行格式化:(id,value)=>document.execCommand(id,false,value),取选区文本:text})
          : kind==='table'
          ? 构建表格浮窗按钮({执行命令:call,取选区文本:text,选区有内容:true})
          : 构建演示浮窗按钮({执行命令:call,对象操作:call,取选区文本:text,有文本对象:true});
        const anchor = {left:innerWidth-180,right:innerWidth-30,top:bottom?innerHeight-50:32,bottom:bottom?innerHeight-30:52,width:150,height:20};
        flushSync(()=>mount.render(<div style={{transform:'scale(1.25)',overflow:'hidden',width:200,height:50}}>
          <Panel 打开 位置={计算浮窗位置(anchor,{宽:innerWidth,高:innerHeight})} 按钮={actions} 名称="选区操作" on关闭={()=>flushSync(()=>mount.render(null))}/>
        </div>));
      };
      window.checkLayout = () => {
        const panel=document.querySelector('[role=toolbar]'), a=panel.querySelector('.wps-float-panel__actions');
        const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        const buttons=[...panel.querySelectorAll('button')];
        const measured={panel:rect(panel),close:rect(buttons.at(-1)),parent:panel.parentElement.tagName,
          viewport:{width:innerWidth,height:innerHeight},background:getComputedStyle(panel).backgroundColor,
          rows:new Set(buttons.slice(0,-1).map(b=>Math.round(b.getBoundingClientRect().top))).size,
          scrollable:a.scrollHeight>a.clientHeight,icons:panel.querySelectorAll('svg').length,
          buttons:buttons.map(b=>{b.scrollIntoView({block:'nearest',inline:'nearest'});return {name:b.getAttribute('aria-label'),...rect(b)}})};
        a.scrollTop=0; return measured;
      };
      window.checkActions = () => {
        const editor=document.getElementById('editor');editor.focus();
        const range=document.createRange();range.selectNodeContents(editor);window.getSelection().removeAllRanges();window.getSelection().addRange(range);
        const button=[...document.querySelectorAll('[role=toolbar] button')].find(b=>b.getAttribute('aria-label')==='加粗');
        const event=new MouseEvent('mousedown',{bubbles:true,cancelable:true});button.dispatchEvent(event);button.click();
        const result={prevented:event.defaultPrevented,bold:!!editor.querySelector('b,strong'),selection:window.getSelection().toString()};
        document.querySelector('.wps-float-panel__close').click();result.closed=!document.querySelector('[role=toolbar]');return result;
      };
    `
    await require('esbuild').build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' },
      bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' },
      outfile: path.join(output, 'panel.js') })
    const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')
    fs.writeFileSync(path.join(output, 'panel.html'), `<!doctype html><meta charset="utf-8"><style>${css}</style><div id="editor" contenteditable style="margin:16px">浮窗选区格式测试</div><div id="root"></div><script src="panel.js"></script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    await win.loadFile(path.join(output, 'panel.html'))
    for (const [width, height] of [[1280,720],[768,480],[480,320],[320,180]]) {
      win.setContentSize(width, height)
      for (const kind of ['word','table','ppt']) for (const theme of ['浅色','深色']) for (const bottom of [false,true]) {
        await win.webContents.executeJavaScript(`showPanel(${JSON.stringify(kind)},${JSON.stringify(theme)},${bottom}); new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
        const layout = await win.webContents.executeJavaScript('checkLayout()')
        const { panel, close } = layout
        assert.equal(layout.parent, 'BODY', 'Toolbar must escape the scaled, clipped editor')
        assert.ok(panel.left>=11.5 && panel.top>=11.5 && panel.right<=width-11.5 && panel.bottom<=height-11.5, JSON.stringify(layout))
        assert.ok(close.left>=panel.left && close.right<=panel.right && close.top>=panel.top && close.bottom<=panel.bottom, 'Close button must remain reachable')
        assert.ok(layout.rows>1 && layout.icons>0, 'Actions must wrap and display icons')
        for (const b of layout.buttons) assert.ok(b.left>=panel.left && b.right<=panel.right && b.top>=panel.top && b.bottom<=panel.bottom, 'Unreachable action: '+JSON.stringify(b))
        assert.equal(layout.background, theme==='深色' ? 'rgb(45, 51, 63)' : 'rgb(255, 255, 255)')
        if (width===1280 && kind==='word' && !bottom) fs.writeFileSync(path.join(output, `word-${theme==='浅色'?'light':'dark'}.png`), (await win.webContents.capturePage()).toPNG())
        if (width===320 && kind==='word' && !bottom) assert.ok(layout.scrollable, 'Short windows need internal scrolling')
        results.push({kind,theme,bottom,...layout})
      }
    }
    win.setContentSize(1280,720)
    await win.webContents.executeJavaScript(`showPanel('word','浅色',false);new Promise(r=>requestAnimationFrame(r))`)
    const actions = await win.webContents.executeJavaScript('checkActions()')
    assert.deepEqual(actions, { prevented: true, bold: true, selection: '浮窗选区格式测试', closed: true })
    fs.writeFileSync(path.join(output,'layout-report.json'), JSON.stringify({passed:true,cases:results.length,actions,results},null,2))
    console.log(JSON.stringify({passed:true,cases:results.length,actions,output}))
    win.destroy(); app.exit(0)
  } catch (error) {
    fs.writeFileSync(path.join(output,'layout-report.json'),JSON.stringify({passed:false,error:error.message,completed:results.length},null,2))
    console.error(error); win?.destroy(); app.exit(1)
  }
})
