// Isolated Electron UI regression. Optional user sample is read only and stays local.
// electron scripts/verify-document-search.cjs <private-output> [sample.docx]
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const root = path.resolve(__dirname, '..'), output = path.resolve(process.argv[2])
app.setPath('userData', path.join(output, 'profile')); app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  const checks = [], errors = []
  try {
    fs.mkdirSync(output, { recursive: true })
    const synthetic = '<h1>文档搜索与目录演示</h1><p>1 开始使用与后台通用操作　6</p><p>1 1 这本手册怎样使用　6</p>' + '<p>用于测试阅读位置的普通段落。</p>'.repeat(50) + '<p>继续补<b>充</b>自己的需求。</p><p>提交前补充联系方式。</p>'
    await require('esbuild').build({ stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {App as AntdApp,ConfigProvider} from 'antd';import {AppProvider,useAppStore} from './renderer/src/store';
      import Editor from './renderer/src/editor/DocEditor';import {应用主题} from './renderer/src/styles/themes';
      const mount=createRoot(document.getElementById('root'));
      const Setup=()=>{const store=useAppStore();window.makeDoc=html=>store.createDoc('word',html);return <Editor/>};
      window.start=(html,theme)=>{flushSync(()=>mount.render(null));应用主题(theme);window.requests=[];
        window.electronAPI={backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),backupClear:async()=>({成功:true}),ai:{
          getConfig:async()=>({成功:true,数据:{服务商:'custom',地址:'https://example.com/model',模型:'test',已配置密钥:false}}),
          cancel:async()=>({成功:true}),chat:async payload=>{window.requests.push(payload);const data=JSON.parse(payload.文档上下文);const p=data.find(x=>x.原文.includes('继续补充自己的需求'));return {成功:true,数据:{内容:JSON.stringify({结果:p?[{编号:p.编号,原文:'继续补充自己的需求',说明:'说明如何继续完善咨询需求'}]:[]})}}}
        }};
        flushSync(()=>mount.render(<ConfigProvider button={{autoInsertSpace:false}}><AntdApp><AppProvider><Setup/></AppProvider></AntdApp></ConfigProvider>));
        flushSync(()=>window.makeDoc(html));
      };
      window.snapshot=()=>{const root=document.querySelector('.wps-editor-canvas__content'),stage=document.querySelector('.wps-editor-stage'),selection=window.getSelection();const r=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null,s=stage.getBoundingClientRect();return{html:root.innerHTML,text:root.textContent,selected:selection?.toString(),rect:r?{top:r.top*1.25,bottom:r.bottom*1.25,left:r.left*1.25,right:r.right*1.25}:null,stage:{top:s.top,bottom:s.bottom},scrollTop:stage.scrollTop,highlights:CSS.highlights.size,status:document.querySelector('.wps-find__tip[role=status]')?.textContent,headings:root.querySelectorAll('h1,h2,h3,h4,h5,h6').length}};
    ` }, bundle: true, platform: 'browser', plugins: [{ name: 'unused-pdf-worker', setup(build) {
      build.onResolve({ filter: /\?worker&url$/ }, args => ({ path: args.path, namespace: 'test-worker' }))
      build.onLoad({ filter: /.*/, namespace: 'test-worker' }, () => ({ contents: 'export default ""', loader: 'js' }))
    } }], define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"verification"' }, outfile: path.join(output, 'search.js') })
    fs.writeFileSync(path.join(output, 'search.html'), `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')}html,body,#root,.ant-app{height:100%;margin:0}.ant-app{display:flex;flex-direction:column;overflow:hidden}</style><link rel="stylesheet" href="search.css"><div id="root"></div><script src="search.js"></script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
    await win.loadFile(path.join(output, 'search.html'))
    const js = source => win.webContents.executeJavaScript(source)
    const frame = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const wait = async source => { const end = Date.now() + 15000; while (!await js(source)) { assert.ok(Date.now() < end, source); await frame() } }
    const click = async text => {
      await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('missing button '+${JSON.stringify(text)});e.scrollIntoView({block:'nearest',inline:'nearest'})})()`); await frame()
      const p = await js(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});const r=e.getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...p }); win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...p }); await frame()
    }
    const query = async value => { await wait('!!document.querySelector("input[placeholder=查找内容]")'); await js('document.querySelector("input[placeholder=查找内容]").focus()'); win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] }); win.webContents.insertText(value); await frame() }
    for (const theme of ['浅色', '深色']) {
      await js(`start(${JSON.stringify(synthetic)},${JSON.stringify(theme)})`); await frame(); await click('查找'); await query('补充')
      const original = await js('snapshot().html')
      await click('查找下一个'); let state = await js('snapshot()')
      assert.equal(state.selected, '补充'); assert.equal(state.status, '第 1 / 2 处'); assert.ok(state.scrollTop > 200)
      assert.ok(state.rect.top >= state.stage.top && state.rect.bottom <= state.stage.bottom, JSON.stringify({rect:state.rect,stage:state.stage,scrollTop:state.scrollTop})); assert.equal(state.html, original); assert.equal(state.highlights, 2)
      await click('查找下一个'); state = await js('snapshot()'); assert.equal(state.status, '第 2 / 2 处')
      await click('查找下一个'); assert.equal((await js('snapshot()')).status, '第 1 / 2 处')
      await click('查找上一个'); assert.equal((await js('snapshot()')).status, '第 2 / 2 处')
      fs.writeFileSync(path.join(output, `search-${theme}.png`), (await win.webContents.capturePage()).toPNG())
      await query('如何继续完善咨询需求'); await click('AI 搜索'); await wait('document.querySelectorAll(".wps-find__results button").length===1')
      await js('document.querySelector(".wps-find__results button").click()'); await frame(); assert.equal((await js('snapshot()')).selected, '继续补充自己的需求')
      assert.equal(await js('requests[0].用途'), '文档搜索'); assert.equal(await js('requests[0].自动执行'), false)
      fs.writeFileSync(path.join(output, `ai-search-${theme}.png`), (await win.webContents.capturePage()).toPNG())
      checks.push(`${theme}：实际鼠标查找、前后循环、跨格式选中、行级滚动、无正文标记、AI引用定位`)
    }
    if (process.argv[3]) {
      const bytes = fs.readFileSync(process.argv[3]), parsed = await require('../main/office/docxReader').读取docx(bytes)
      const zip = await require('jszip').loadAsync(bytes), xml = await zip.file('word/document.xml').async('string')
      const toc = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(x=>x[0]).filter(x=>/HYPERLINK.*_Toc/.test(x))
      await js(`start(${JSON.stringify(parsed.html)},'浅色')`); await frame()
      const rows = await js('[...document.querySelectorAll(".wps-editor-canvas__content p,.wps-editor-canvas__content h1,.wps-editor-canvas__content h2")].map(x=>x.textContent)')
      for (const p of toc) {
        const parser = require('sax').parser(true); let text = '', inside = false
        parser.onopentag = tag=>{if(tag.name==='w:t')inside=true};parser.onclosetag = tag=>{if(tag==='w:t')inside=false};parser.ontext = value=>{if(inside)text+=value};parser.write(p).close()
        assert.ok(rows.some(row=>row.replace(/\t/g,'')===text), 'Every TOC row retains its cached title and page number')
      }
      assert.equal(toc.length, 81); assert.equal((await js('snapshot()')).headings, 81)
      await click('查找'); await query('补充'); await click('查找下一个')
      const expectedCount = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(x=>x[1]).join('').split('补充').length - 1
      const state = await js('snapshot()'); assert.equal(state.selected, '补充'); assert.equal(state.status, `第 1 / ${expectedCount} 处`)
      assert.ok(state.rect.top >= state.stage.top && state.rect.bottom <= state.stage.bottom); assert.ok(state.scrollTop > 1000)
      checks.push(`用户样本：${toc.length}行目录中文与页码逐行一致、${state.headings}个大纲标题、${expectedCount}处搜索可定位到可见行`)
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks }, null, 2))
    console.log(JSON.stringify({ passed: true, checks }, null, 2)); win.destroy(); app.quit()
  } catch (error) {
    if(win) { fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG()); console.error(await win.webContents.executeJavaScript(`JSON.stringify({parents:[...document.querySelectorAll('.wps-editor-stage,.wps-editor-canvas__paper,.wps-editor-canvas__content')].map(e=>({class:e.className,zoom:getComputedStyle(e).zoom,rect:e.getBoundingClientRect().toJSON(),height:e.scrollHeight,top:e.scrollTop})),selection:window.getSelection()?.anchorNode?.parentElement?.getBoundingClientRect().toJSON()})`)) }
    console.error(error, errors); win?.destroy(); app.exit(1)
  }
})
