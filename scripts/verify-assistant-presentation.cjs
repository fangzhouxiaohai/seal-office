// Isolated real Chromium rendering of assistant content/settings/composer.
// Controlled IPC and clipboard only; no live AI calls or user documents.
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path'), assert = require('assert/strict')
const root = path.resolve(__dirname, '..')
const output = path.resolve(process.argv[2] || path.join(root, '.upgrade-private/assistant-presentation'))
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  const cases = [], errors = []
  try {
    fs.mkdirSync(output, { recursive: true })
    const replies = [
      '普通文本第一行\n  第二行保留缩进与 <符号>。',
      '# 工作计划\n\n**重点**：核对数据，再执行。\n\n- [x] 读取文件\n- [ ] 整理结果\n\n| 项目 | 状态 | 说明 |\n| --- | --- | --- |\n| 一 | 完成 | 已确认 |\n\n> 确认修改后再应用。',
      '```python\ndef greet(name):\n    # 生成问候\n    return "你好 " + name\n\nprint(greet("海豹"))\n```',
      '```typescript\ninterface Task { name: string; done: boolean }\nconst task: Task = { name: "整理文件", done: true };\nconsole.log(task);\n```',
      '```json\n{"name": "海豹办公", "ready": true, "count": 3}\n```',
      '运行示例：\n\n```sql\nSELECT name FROM files WHERE status = 1;\n```\n\n**下一步**：核对输出。',
      '```md\n## Markdown 内容\n\n1. 读取\n2. 整理\n\n**完成后确认。**\n```',
      '```txt\n# 保持原样\n**普通文本，不转成加粗**\n```',
      '```unknown-lang\n' + 'unbroken_symbol_'.repeat(90) + '\n```',
    ]
    const entry = `
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {App as AntdApp,ConfigProvider,theme as antdTheme} from 'antd';import {AppProvider} from './renderer/src/store';
      import Assistant from './renderer/src/assistant/AiAssistant';import {应用主题} from './renderer/src/styles/themes';
      const mount=createRoot(document.getElementById('root'));let listener,finish;
      const replies=${JSON.stringify(replies)};
      window.start=(theme)=>{
        flushSync(()=>mount.render(null));应用主题(theme);window.copied=[];window.calls=[];
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copied.push(text)}});
        window.electronAPI={backupLoad:async()=>({成功:true,内容:null}),backupSave:async()=>({成功:true}),backupClear:async()=>({成功:true}),ai:{
          getConfig:async()=>({成功:true,数据:{名称:'测试模型',地址:'https://example.com/chat',模型:'test',已配置密钥:true,思考强度:'medium',参数模式:'three',上下文令牌:131072}}),
          getSession:async()=>({成功:true,数据:{摘要:'',计划:[],压缩次数:0,显示消息:replies.map(内容=>({角色:'assistant',内容}))}}),
          onStream:fn=>{listener=fn;return()=>{}},onToolCall:()=>()=>{},clearSession:async()=>({成功:true}),
          chat:payload=>{window.calls.push(payload);return new Promise(resolve=>finish=resolve)}
        }};
        const dark=theme==='深色';
        const Feedback=()=>{window.dismiss=AntdApp.useApp().message.destroy;return <Assistant/>};
        flushSync(()=>mount.render(<ConfigProvider theme={{algorithm:dark?antdTheme.darkAlgorithm:antdTheme.defaultAlgorithm,token:{colorPrimary:dark?'#4A90E2':'#2B6CF6',colorText:dark?'#E8EAED':'#1A1D24',colorTextSecondary:dark?'#9AA0A6':'#5C6472',colorBgContainer:dark?'#252A33':'#FFFFFF',colorBgElevated:dark?'#2D333F':'#FFFFFF',borderRadius:6,fontFamily:'"Microsoft YaHei", "PingFang SC", Arial, sans-serif'}}} button={{autoInsertSpace:false}}><AntdApp><AppProvider><Feedback/></AppProvider></AntdApp></ConfigProvider>));
      };
      window.reply=(text)=>{const id=window.calls.at(-1).请求标识;flushSync(()=>listener({请求标识:id,类型:'正文',内容:text}))};
      window.complete=(text)=>finish({成功:true,数据:{内容:text}});
      window.layout=()=>{
        const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
        const log=document.querySelector('[role="log"]'),composer=document.querySelector('.assistant-drawer__composer');
        return {log:rect(log),composer:rect(composer),body:rect(document.querySelector('.ant-drawer-body')),
          content:[...document.querySelectorAll('.assistant-result')].map(e=>({type:e.dataset.contentType,...rect(e)})),
          buttons:[...document.querySelectorAll('.assistant-result__footer button')].map(e=>({label:e.getAttribute('aria-label'),...rect(e)})),
          inputsInComposer:composer.querySelectorAll('.ant-select,.ant-checkbox-wrapper,.assistant-settings__note').length,
          codeTokens:document.querySelectorAll('code span[class^="hljs-"]').length,
          overflow:document.documentElement.scrollWidth>innerWidth,
          texts:replies,
        };
      };
    `
    await require('esbuild').build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser',
      define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"verification"' }, outfile: path.join(output, 'presentation.js') })
    fs.writeFileSync(path.join(output, 'presentation.html'), `<!doctype html><meta charset="utf-8"><style>${fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')}</style><link rel="stylesheet" href="presentation.css"><div id="root"></div><script src="presentation.js"></script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
    await win.loadFile(path.join(output, 'presentation.html'))
    const js = value => win.webContents.executeJavaScript(value)
    const frame = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const wait = async condition => { const end = Date.now() + 8000; while (!await js(condition)) { assert.ok(Date.now() < end, condition); await frame() } }
    const click = async selector => {
      await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`); await frame()
      const p = await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...p })
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...p })
      await frame()
    }
    for (const theme of ['浅色', '深色']) for (const [width, height] of [[1366, 768], [1280, 900], [800, 600], [480, 800], [360, 640], [320, 568]]) {
      win.setContentSize(width, height); await js(`start(${JSON.stringify(theme)})`)
      await click('.assistant-launcher'); await wait('document.querySelectorAll(".assistant-result").length>=10')
      await wait('document.querySelector(".ant-drawer-content-wrapper").getBoundingClientRect().right<=innerWidth+0.5'); await frame()
      const state = await js('layout()')
      assert.equal(state.inputsInComposer, 0, 'Reasoning controls belong to settings')
      assert.ok(Math.abs(state.log.bottom - state.composer.y) <= 1, 'Chat extends to composer without a gap')
      assert.ok(state.log.height >= 140 && state.composer.bottom <= height + 1)
      assert.equal(state.overflow, false)
      assert.ok(state.codeTokens > 10)
      for (const content of state.content) assert.ok(content.x >= -1 && content.right <= width + 1, 'Content stays inside drawer: '+JSON.stringify(content))
      for (const selector of ['[aria-label="复制Python代码"]', '[aria-label="复制TypeScript代码"]', '[aria-label="复制Markdown 原文"]']) {
        await click(selector); await wait('window.copied.length>0')
      }
      const copied = await js('window.copied')
      assert.equal(copied[0], 'def greet(name):\n    # 生成问候\n    return "你好 " + name\n\nprint(greet("海豹"))')
      assert.equal(copied[1], 'interface Task { name: string; done: boolean }\nconst task: Task = { name: "整理文件", done: true };\nconsole.log(task);')
      assert.equal(copied[2], replies[1])
      const readPosition = await js('document.querySelector("[role=log]").scrollTop')
      await click('.assistant-settings-toggle'); await wait('!!document.querySelector(".assistant-settings")')
      assert.equal(await js('getComputedStyle(document.querySelector(".assistant-drawer__composer")).display'), 'none')
      assert.ok(await js('!!document.querySelector("[aria-label=默认思考强度]")'))
      assert.ok(await js('document.querySelector(".assistant-settings").scrollHeight>=document.querySelector(".assistant-settings").clientHeight'))
      await click('.assistant-settings-toggle'); await frame()
      assert.notEqual(await js('getComputedStyle(document.querySelector(".assistant-drawer__composer")).display'), 'none')
      assert.ok(Math.abs(await js('document.querySelector("[role=log]").scrollTop') - readPosition) <= 1, 'Settings preserves position when reviewing earlier replies')
      if (width === 1366 || width === 360) {
        await js(`window.dismiss();document.querySelector('.assistant-result--code').scrollIntoView({block:'center'})`)
        await js('new Promise(r=>setTimeout(r,300))'); await frame()
        const rect = await js(`(()=>{const r=document.querySelector('.ant-drawer-content-wrapper').getBoundingClientRect();return{x:Math.round(r.x),y:0,width:Math.round(r.width),height:innerHeight}})()`)
        fs.writeFileSync(path.join(output, `${theme === '浅色' ? 'light' : 'dark'}-${width}.png`), (await win.webContents.capturePage(rect)).toPNG())
        if (width === 1366) {
          await js(`document.querySelector('.assistant-result--markdown').scrollIntoView({block:'start'})`); await frame()
          fs.writeFileSync(path.join(output, `markdown-${theme === '浅色' ? 'light' : 'dark'}.png`), (await win.webContents.capturePage(rect)).toPNG())
        }
      }
      if (width === 1366) {
        await js(`(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'请输出示例代码');e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
        await wait('!document.querySelector(".assistant-send").disabled')
        await js('new Promise(r=>setTimeout(r,300))')
        await frame()
        assert.equal(await js('getComputedStyle(document.querySelector(".assistant-send > span:last-child")).color'), await js('getComputedStyle(document.querySelector(".assistant-send")).color'), 'Send text inherits the primary button color')
        assert.equal(await js('getComputedStyle(document.querySelector(".assistant-send > span:last-child")).color'), 'rgb(255, 255, 255)', 'Enabled send button has readable light text')
        const composeRect = await js(`(()=>{const r=document.querySelector('.ant-drawer-content-wrapper').getBoundingClientRect();return{x:Math.round(r.x),y:0,width:Math.round(r.width),height:innerHeight}})()`)
        fs.writeFileSync(path.join(output, `composer-${theme === '浅色' ? 'light' : 'dark'}.png`), (await win.webContents.capturePage(composeRect)).toPNG())
        await click('.assistant-send'); await wait('window.calls.length===1')
        assert.equal(await js('!!document.querySelector(".assistant-queue")'), false)
        for (const fragment of ['```py', 'thon\n', 'print("海', '豹")\n', '```']) { await js(`reply(${JSON.stringify(fragment)})`); await frame() }
        await wait('document.querySelectorAll(".assistant-result--code").length===6')
        assert.equal(await js('document.querySelectorAll(".assistant-result--code")[5].querySelector("code").textContent'), 'print("海豹")')
        await click('.assistant-settings-toggle'); await frame()
        await js(`complete(${JSON.stringify('```python\nprint("海豹")\n```')})`)
        await wait('!document.querySelector(".assistant-output--streaming")')
        await click('.assistant-settings-toggle'); await frame()
        assert.equal(await js('document.querySelectorAll(".assistant-result--code")[5].querySelector("code").textContent'), 'print("海豹")')
        assert.ok(await js('(()=>{const e=document.querySelector("[role=log]");return e.scrollHeight-e.clientHeight-e.scrollTop<2})()'), 'Closing settings resumes following the latest reply')
      }
      cases.push({ theme, width, height, logHeight: state.log.height, gap: state.composer.y - state.log.bottom, copied: copied.length, codeTokens: state.codeTokens, panels: state.content.length })
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'presentation-report.json'), JSON.stringify({ passed: true, cases: cases.length, results: cases, errors }, null, 2))
    console.log(JSON.stringify({ passed: true, cases: cases.length, output }))
    win.destroy(); app.exit(0)
  } catch (error) {
    const diagnostics = win ? await win.webContents.executeJavaScript(`({calls:window.calls,dialogs:[...document.querySelectorAll('.ant-modal')].filter(e=>e.getClientRects().length).map(e=>e.textContent),input:document.querySelector('textarea')?.value,sendDisabled:document.querySelector('.assistant-send')?.disabled})`).catch(() => null) : null
    fs.writeFileSync(path.join(output, 'presentation-report.json'), JSON.stringify({ passed: false, error: error.stack, completed: cases.length, errors, diagnostics }, null, 2))
    console.error(error.stack); if (win) win.destroy(); app.exit(1)
  }
})
