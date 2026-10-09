// Developer regression: real assistant/store/styles in isolated Chromium with
// delayed IPC and controlled tool events. No live provider or desktop UI is used.
// electron scripts/verify-assistant-flow.cjs <output-directory>
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.resolve(process.argv[2] || path.join(root, '.upgrade-private/assistant-flow'))
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  const cases = []
  try {
    fs.mkdirSync(output, { recursive: true })
    const entry = `
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {App as AntdApp,ConfigProvider} from 'antd';import {AppProvider,useAppStore} from './renderer/src/store';
      import Assistant from './renderer/src/assistant/AiAssistant';import {交给助手,通用AI指令} from './renderer/src/assistant/quickActions';
      import {应用主题} from './renderer/src/styles/themes';
      const mount=createRoot(document.getElementById('root'));let store,stream,releaseConfig,releaseSession,finish;
      window.start=(kind,theme)=>{
        flushSync(()=>mount.render(null));应用主题(theme);window.calls=[];window.configReads=0;window.guides=[];
        const config=new Promise(r=>releaseConfig=r),session=new Promise(r=>releaseSession=r);
        window.electronAPI={backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),ai:{
          getConfig:()=>{window.configReads++;return config},getSession:()=>session,
          onToolCall:()=>()=>{},onStream:fn=>{stream=fn;return()=>{}},
          chat:payload=>{window.calls.push(payload);return new Promise(r=>finish=r)},
          guide:async(id,text)=>{window.guides.push({id,text});return{成功:true}},cancel:async()=>({成功:true})
        }};
        const Harness=()=>{store=useAppStore();return <Assistant/>};
        flushSync(()=>mount.render(<ConfigProvider button={{autoInsertSpace:false}}><AntdApp><AppProvider><Harness/></AppProvider></AntdApp></ConfigProvider>));
        flushSync(()=>store.createDoc(kind,kind==='word'?'<p>第一季度销售工作计划</p>':kind==='pdf'?'测试PDF数据':undefined,{名称:'销售计划.'+({word:'docx',table:'xlsx',ppt:'pptx',pdf:'pdf'}[kind])}));
        window.ask('分析销售目标，整理关键步骤');
      };
      window.ask=text=>flushSync(()=>交给助手(通用AI指令.find(x=>x.id==='ai.summarize'),text));
      window.initialize=()=>{releaseConfig({成功:true,数据:{名称:'测试服务',地址:'https://example.com/chat',模型:'test',已配置密钥:true,上下文令牌:65536,思考强度:'medium'}});releaseSession({成功:true,数据:null})};
      window.emit=(value)=>flushSync(()=>stream({请求标识:window.calls[0].请求标识,...value}));
      window.finish=()=>finish({成功:true,数据:{内容:'已核对销售计划，补充预算需求已一并整理。'}});
      window.info=()=>({calls:window.calls,configReads:window.configReads,guides:window.guides,
        missing:!![...document.querySelectorAll('.ant-modal-confirm-title')].find(x=>x.textContent.includes('请先配置')),
        queue:document.querySelector('.assistant-queue')?.textContent||'',planOpen:document.querySelector('.assistant-plan')?.open,
        summary:document.querySelector('.assistant-plan summary')?.textContent,
        rows:[...document.querySelectorAll('.assistant-activity > li')].map(row=>{
          const r=row.getBoundingClientRect(),title=row.querySelector('.assistant-activity__title').getBoundingClientRect(),status=row.querySelector('.assistant-activity__status').getBoundingClientRect();
          return{text:row.textContent,status:row.dataset.status,top:r.top,left:r.left,right:r.right,titleRight:title.right,statusLeft:status.left,height:title.height}
        })});
    `
    await require('esbuild').build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"verification"' }, outfile: path.join(output, 'assistant.js') })
    const styles = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')
    fs.writeFileSync(path.join(output, 'assistant.html'), `<!doctype html><meta charset="utf-8"><style>${styles}</style><link rel="stylesheet" href="assistant.css"><div id="root"></div><script src="assistant.js"></script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    await win.loadFile(path.join(output, 'assistant.html'))
    const frame = () => win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const wait = async (condition) => {
      const deadline = Date.now() + 8000
      while (!await win.webContents.executeJavaScript(condition)) { assert.ok(Date.now() < deadline, condition); await frame() }
    }
    for (const theme of ['浅色', '深色']) for (const kind of ['word', 'table', 'ppt', 'pdf']) {
      await win.webContents.executeJavaScript(`start(${JSON.stringify(kind)},${JSON.stringify(theme)})`)
      await frame()
      let state = await win.webContents.executeJavaScript('info()')
      assert.equal(state.configReads, 1)
      assert.equal(state.calls.length, 0)
      assert.equal(state.missing, false)
      assert.equal(state.queue, '')
      await win.webContents.executeJavaScript('initialize()'); await wait('window.calls.length===1'); await frame()
      state = await win.webContents.executeJavaScript('info()')
      assert.equal(state.calls[0].上下文令牌, 65536)
      assert.equal(state.calls[0].思考强度, 'medium')
      assert.ok(state.calls[0].文档上下文.includes('销售计划.'))
      assert.equal(state.queue, '')
      assert.equal(state.missing, false)
      const plan = [{ id: 'read', title: '核对销售目标与文件内容', status: 'in_progress' }, { id: 'summary', title: '整理关键步骤与预算需求', status: 'pending' }]
      await win.webContents.executeJavaScript(`emit({类型:'计划',内容:${JSON.stringify(JSON.stringify(plan))}})`)
      for (const event of [
        { 调用标识: 'read', 内容: '读取当前文件', 执行状态: '执行中' },
        { 调用标识: 'read', 内容: '读取当前文件', 执行状态: '完成', 详情: '已核对原始内容' },
        { 调用标识: 'bad', 内容: '校验修改候选', 执行状态: '失败', 详情: '原文不匹配，正在调整方案' },
        { 调用标识: 'next', 内容: '按照用户需求整理销售计划与下一阶段工作安排', 执行状态: '执行中' },
      ]) await win.webContents.executeJavaScript(`emit(${JSON.stringify({ 类型: '工具', ...event })})`)
      plan[0].status = 'completed'; plan[1].status = 'in_progress'
      await win.webContents.executeJavaScript(`emit({类型:'计划',内容:${JSON.stringify(JSON.stringify(plan))}})`)
      await wait('document.querySelector(".ant-drawer-content-wrapper").getBoundingClientRect().right<=innerWidth+0.5')
      await frame(); state = await win.webContents.executeJavaScript('info()')
      assert.equal(state.planOpen, false)
      assert.ok(state.summary.includes('1/2'))
      assert.deepEqual(state.rows.map(r => r.status), ['完成', '失败', '执行中'])
      state.rows.forEach((row, i) => {
        assert.ok(row.titleRight <= row.statusLeft, 'Title must not overlap status')
        assert.ok(row.right <= 1280 && row.left >= 0, 'Row stays inside viewport')
        assert.ok(row.height <= 20, 'One line per action')
        if (i) assert.ok(row.top > state.rows[i - 1].top, 'Each action gets a separate row')
      })
      await win.webContents.executeJavaScript(`document.querySelector('.assistant-plan summary').click()`); await frame()
      assert.equal(await win.webContents.executeJavaScript('info().planOpen'), true)
      if (kind === 'word') {
        await win.webContents.executeJavaScript(`document.querySelector('.assistant-plan summary').click()`); await frame()
        const rect = await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('.ant-drawer-content-wrapper').getBoundingClientRect();return {x:Math.round(r.x),y:0,width:Math.round(r.width),height:innerHeight}})()`)
        fs.writeFileSync(path.join(output, theme === '浅色' ? 'assistant-light.png' : 'assistant-dark.png'), (await win.webContents.capturePage(rect)).toPNG())
      }
      await win.webContents.executeJavaScript(`ask('补充预算')`); await frame()
      state = await win.webContents.executeJavaScript('info()')
      assert.ok(state.queue.includes('补充预算'))
      assert.ok(!state.queue.includes('分析销售目标'))
      await win.webContents.executeJavaScript(`document.querySelector('[aria-label^="引导当前任务"]').click()`)
      await wait('window.guides.length===1')
      await win.webContents.executeJavaScript(`emit({类型:'工具',调用标识:'next',内容:'按照用户需求整理销售计划与下一阶段工作安排',执行状态:'完成'});finish()`)
      await wait('!document.querySelector(".assistant-queue")'); await frame()
      state = await win.webContents.executeJavaScript('info()')
      assert.equal(state.calls.length, 1, 'Guided message must not run again')
      assert.deepEqual(state.rows.map(r => r.status), ['完成', '失败', '完成'])
      cases.push({ kind, theme, firstUse: true, directExecution: true, queueAndGuide: true, collapsedPlan: true, ...state })
    }
    fs.writeFileSync(path.join(output, 'assistant-report.json'), JSON.stringify({ passed: true, cases: cases.length, results: cases }, null, 2))
    console.log(JSON.stringify({ passed: true, cases: cases.length, output }))
    win.destroy(); app.exit(0)
  } catch (error) {
    fs.writeFileSync(path.join(output, 'assistant-report.json'), JSON.stringify({ passed: false, error: error.stack, completed: cases.length }, null, 2))
    console.error(error.stack)
    if (win) win.destroy()
    app.exit(1)
  }
})
