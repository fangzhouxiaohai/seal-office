// 智能助手界面预览：使用真实组件、样式与隔离的合成会话渲染对话面板，不访问真实模型或用户文件。
// 生成浅色、深色、空状态和移动端截图，同时输出可供设计审计的 audit.html / audit-mobile.html。
// 运行：npx electron scripts/preview-assistant-ui.cjs；产物在 .upgrade-private/assistant-preview/。
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.upgrade-private/assistant-preview')
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let win
  try {
    fs.mkdirSync(output, { recursive: true })
    const entry = `
      import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
      import {App as AntdApp,ConfigProvider} from 'antd';import {AppProvider,useAppStore} from './renderer/src/store';
      import {SettingsProvider} from './renderer/src/store/settingsStore';
      import {CloudProvider} from './renderer/src/cloud/CloudProvider';
      import Assistant from './renderer/src/assistant/AiAssistant';
      import {应用主题} from './renderer/src/styles/themes';
      const ok=async()=>({成功:true});
      window.electronAPI={
        backupLoad:async()=>({成功:true,内容:null}),backupSave:ok,backupClear:ok,reportUnsavedCount:ok,
        recentList:async()=>({成功:true,数据:[]}),recentAdd:ok,saveToFile:ok,showSaveDialog:async()=>null,
        fonts:{list:async()=>({成功:true,数据:{系统:[],自定义:[],平台:'win32'}})},
        cloud:{invoke:async(action)=>{
          if(action==='status')return {成功:true,数据:{account:{id:'preview',phone:'13800000000',enabled:true,autosave:false,used:0,quota:300000000,identityVerified:true},unlocked:true,statuses:{},pending:0}};
          return {成功:true,数据:null};
        }},
        ai:{
          getConfig:async()=>({成功:true,数据:{名称:'DeepSeek',服务商:'deepseek',地址:'https://api.deepseek.com',模型:'deepseek-flash',已配置密钥:true,上下文令牌:131072,思考强度:'high'}}),
          chat:async()=>({成功:true,数据:{内容:''}}),
          getSession:async()=>({成功:true,数据:location.search.includes('empty')?null:{摘要:'',压缩次数:0,计划:[],显示消息:[
            {角色:'assistant',内容:'已读取《季度销售计划》。整体目标明确，但缺少可执行的周节奏和负责人。'},
            {角色:'user',内容:'把销售目标拆成每周可执行的行动项'},
            {角色:'assistant',内容:'建议按四周拆解：\\n\\n1. 第一周：完成重点客户回访，确认第四季度预算。\\n2. 第二周：按行业整理报价方案，补充两个备选方案。\\n3. 第三周：联合市场部完成一场线上说明会。\\n4. 第四周：复盘转化率，形成下月行动清单。\\n\\n如需改入文档，我可以先给出待确认的修改预览。'}
          ]}}),
          clearSession:ok,cancel:ok,guide:ok,bindSession:ok,
          onToolCall:()=>()=>{},onStream:()=>()=>{}
        }
      };
      let store;const Harness=()=>{store=useAppStore();return <Assistant/>};
      const mount=createRoot(document.getElementById('root'));应用主题('浅色');
      flushSync(()=>mount.render(<SettingsProvider><ConfigProvider><AntdApp><CloudProvider><AppProvider><Harness/></AppProvider></CloudProvider></AntdApp></ConfigProvider></SettingsProvider>));
      flushSync(()=>store.createDoc('word','<p>季度销售计划</p>',{名称:'季度销售计划.docx'}));
      window.openAssistant=()=>{const b=document.querySelector('[aria-label="打开智能助手"]');if(!b)return false;b.click();return true};
      window.setTheme=theme=>应用主题(theme);
      window.ready=()=>!!document.querySelector('.assistant-drawer__messages')&&document.querySelectorAll('.assistant-message').length>=3;
      if(window.__AUTO_OPEN__)window.openAssistant();
    `
    await require('esbuild').build({
      stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser',
      loader: { '.png': 'dataurl', '.svg': 'dataurl' },
      define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"preview"' },
      outfile: path.join(output, 'assistant.js')
    })
    const styles = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8')
    fs.writeFileSync(path.join(output, 'preview.html'), `<!doctype html><meta charset="utf-8"><style>${styles}</style><link rel="stylesheet" href="assistant.css"><div id="root" style="height:100%"></div><script src="assistant.js"></script>`)
    fs.writeFileSync(path.join(output, 'audit.html'), `<!doctype html><meta charset="utf-8"><style>${styles}</style><link rel="stylesheet" href="assistant.css"><div id="root" style="height:100%"></div><script>window.__AUTO_OPEN__=true</script><script src="assistant.js"></script>`)
    fs.writeFileSync(path.join(output, 'audit-mobile.html'), `<!doctype html><meta charset="utf-8"><style>${styles}</style><link rel="stylesheet" href="assistant.css"><div id="root" style="height:100%"></div><script>document.documentElement.dataset.sealPlatform='app';window.__AUTO_OPEN__=true</script><script src="assistant.js"></script>`)
    fs.writeFileSync(path.join(output, 'audit-settings.html'), `<!doctype html><meta charset="utf-8"><style>${styles}</style><link rel="stylesheet" href="assistant.css"><div id="root" style="height:100%"></div><script>window.__AUTO_OPEN__=true</script><script src="assistant.js"></script><script>setTimeout(()=>document.querySelector('[aria-label="模型设置"]')?.click(),100)</script>`)
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.error('RENDERER', level, message) })
    win.webContents.on('render-process-gone', (_e, detail) => console.error('RENDERER GONE', JSON.stringify(detail)))
    await win.loadFile(path.join(output, 'preview.html'))
    const js = code => win.webContents.executeJavaScript(code)
    const frame = () => js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    const settle = async (readyCode) => {
      for (let i = 0; i < 80 && !await js(readyCode); i++) await new Promise(r => setTimeout(r, 100))
      for (let i = 0; i < 40; i++) {
        const done = await js(`(()=>{const d=document.querySelector('.ant-drawer-content-wrapper');if(!d)return false;const r=d.getBoundingClientRect();return r.right<=innerWidth+0.5&&r.width>100})()`)
        if (done) break
        await new Promise(r => setTimeout(r, 100))
      }
      await new Promise(r => setTimeout(r, 400))
      await frame()
    }
    const panelRect = async () => {
      const width = await js(`Math.round(document.querySelector('.ant-drawer-content-wrapper').getBoundingClientRect().width)`)
      return { x: 1280 - width, y: 0, width, height: 900 }
    }
    await win.loadFile(path.join(output, 'preview.html'), { query: { empty: '1' } })
    for (let i = 0; i < 80 && !await js('typeof window.openAssistant === "function"'); i++) await new Promise(r => setTimeout(r, 100))
    await js('openAssistant()')
    await settle(`!!document.querySelector('.assistant-empty')`)
    fs.writeFileSync(path.join(output, 'panel-empty.png'), (await win.webContents.capturePage(await panelRect())).toPNG())

    await win.loadFile(path.join(output, 'preview.html'))
    for (let i = 0; i < 80 && !await js('typeof window.openAssistant === "function"'); i++) await new Promise(r => setTimeout(r, 100))
    await js('openAssistant()')
    await settle('ready()')
    const metrics = await js(`(()=>{const d=document.querySelector('.ant-drawer-content-wrapper');const r=d.getBoundingClientRect();return {width:r.width,height:r.height,messages:document.querySelectorAll('.assistant-message').length,title:document.querySelector('.assistant-titlebar__name')?.textContent,composer:!!document.querySelector('.assistant-composer'),send:document.querySelector('.assistant-send')?.textContent}})()`)
    const rect = await panelRect()
    fs.writeFileSync(path.join(output, 'panel-light.png'), (await win.webContents.capturePage(rect)).toPNG())
    await js(`document.querySelector('[aria-label="模型设置"]').click()`)
    for (let i = 0; i < 40 && !await js(`!!document.querySelector('[role="switch"][aria-label="自动确认修改"]')`); i++) await new Promise(r => setTimeout(r, 100))
    await frame()
    fs.writeFileSync(path.join(output, 'panel-settings.png'), (await win.webContents.capturePage(rect)).toPNG())
    await js(`document.querySelector('[aria-label="收起模型设置"]').click()`)
    await frame()
    await js('setTheme("深色")'); await frame(); await new Promise(r => setTimeout(r, 250))
    fs.writeFileSync(path.join(output, 'panel-dark.png'), (await win.webContents.capturePage(rect)).toPNG())

    const mobileWin = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    mobileWin.webContents.on('console-message', (_e, level, message) => { if (level >= 2) console.error('MOBILE RENDERER', level, message) })
    await mobileWin.loadFile(path.join(output, 'audit-mobile.html'))
    for (let i = 0; i < 80; i++) {
      const ready = await mobileWin.webContents.executeJavaScript(`!!document.querySelector('.assistant-mobile-modal')&&document.querySelectorAll('.assistant-message').length>=3`)
      if (ready) break
      await new Promise(r => setTimeout(r, 100))
    }
    await new Promise(r => setTimeout(r, 700))
    fs.writeFileSync(path.join(output, 'panel-mobile.png'), (await mobileWin.webContents.capturePage()).toPNG())
    mobileWin.destroy()

    fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2))
    console.log(JSON.stringify({ passed: true, output, metrics }))
    win.destroy(); app.exit(0)
  } catch (error) {
    console.error(error.stack)
    if (win) win.destroy()
    app.exit(1)
  }
})

