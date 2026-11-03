// 2.5.0 界面截图：用真实组件与隔离的假云端渲染，不访问真实账号或用户文件。
// 输出 README 展示用的最新版界面截图到 docs/screenshots/v2.5.0/。
// 运行：npx electron scripts/capture-2.5.0-screenshots.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.upgrade-private/screenshots-2.5.0')
const target = path.join(root, 'docs/screenshots/v2.5.0')
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  let win
  try {
    fs.mkdirSync(output, { recursive: true })
    fs.mkdirSync(target, { recursive: true })
    const entry = `
      // 与桌面端 main.tsx 完全相同的样式入口与顺序，避免拼装时层叠错乱。
      import './renderer/src/styles.css'
      import './renderer/src/styles/nativeControls.css'
      import './renderer/src/styles/actionColors.css'
      import './renderer/src/styles/flatDesktop.css'
      import React from 'react'
      import {createRoot} from 'react-dom/client'
      import {flushSync} from 'react-dom'
      import App from './renderer/src/App'
      const mount = createRoot(document.getElementById('root'))
      window.cloudCalls = []
      // 隔离的假云端：文件名是演示资料，不含任何真实用户数据。
      const nodes = [
        {id:'n1',parent:null,kind:'folder',deleted:0,version:0,updated:Date.now()-3600e3,meta:{name:'季度汇报'}},
        {id:'n2',parent:null,kind:'file',deleted:0,version:3,updated:Date.now()-7200e3,meta:{name:'季度销售计划.docx',filename:'季度销售计划.docx',size:184320}},
        {id:'n3',parent:null,kind:'file',deleted:0,version:2,updated:Date.now()-86400e3,meta:{name:'客户名单.xlsx',filename:'客户名单.xlsx',size:96256}},
        {id:'n4',parent:null,kind:'file',deleted:0,version:1,updated:Date.now()-172800e3,meta:{name:'产品介绍.pptx',filename:'产品介绍.pptx',size:2408448}},
        {id:'n5',parent:null,kind:'file',deleted:0,version:1,updated:Date.now()-259200e3,meta:{name:'验收单.pdf',filename:'验收单.pdf',size:524288}}
      ]
      const knowledge = [
        {id:'k1',parent:null,kind:'knowledge',deleted:0,version:1,updated:Date.now()-3600e3,meta:{name:'产品手册.sealdoc',text:JSON.stringify([{location:'功能概览',text:'海豹办公支持文字、表格、演示与 PDF。'},{location:'云空间',text:'私有文件在本机加密后上传。'}])}},
        {id:'k2',parent:null,kind:'knowledge',deleted:0,version:1,updated:Date.now()-7200e3,meta:{name:'部署说明.md',text:JSON.stringify([{location:'安装步骤',text:'解压后运行安装程序。'}])}}
      ]
      window.start = () => {
        flushSync(() => mount.render(null))
        window.electronAPI = {
          backupLoad: async () => ({成功:true,内容:null}), backupSave: async () => ({成功:true}), backupClear: async () => ({成功:true}),
          reportUnsavedCount: async () => ({成功:true}), exportToPdf: async () => ({成功:false,错误:'演示环境不导出'}),
          showOpenDialog: async () => null, showSaveDialog: async () => null, listKnownFolder: async () => ({成功:true,路径:'演示目录',文件:[]}),
          recentList: async () => ({成功:true,数据:[]}), recentAdd: async () => ({成功:true}), recentRemove: async () => ({成功:true}),
          fonts: {list: async () => ({成功:true,数据:{系统:[],自定义:[],平台:'win32'}})},
          presentationResources: {restore:async()=>({成功:true}),read:async()=>({成功:true}),export:async()=>({成功:true,条目:[]}),sync:async()=>({成功:true}),release:async()=>({成功:true})},
          ai: {getConfig:async()=>({成功:true,数据:null}),getSession:async()=>({成功:true,数据:null}),onStream:()=>()=>{},onToolCall:()=>()=>{}},
          cloud: { invoke: async (action, input) => {
            window.cloudCalls.push({action,input})
            const account = {id:'demo-user',phone:'13800000000',enabled:true,autosave:true,used:48234496,quota:300000000,identityVerified:true,hasPassword:true}
            if (action === 'status') return {成功:true,数据:{account,unlocked:true,statuses:{},pending:0}}
            if (action === 'list') return {成功:true,数据:nodes.concat(knowledge)}
            if (action === 'pending') return {成功:true,数据:[]}
            if (action === 'myPublic') return {成功:true,数据:{items:[]}}
            if (action === 'public') return {成功:true,数据:{items:[]}}
            if (action === 'versions') return {成功:true,数据:{items:[{id:'v2',version:3,bytes:184320,created:Date.now()-7200e3}]}}
            if (action === 'zoteroIndex') return {成功:true,数据:{items:[
              {title:'茉莉花',route:'user-guidepluginsjasminum',summary:'增强 Zotero 的中文文献抓取与处理能力'},
              {title:'关于 Zotero 插件',route:'user-guidepluginsabout-plugin',summary:'插件的作用与分类'},
              {title:'数据与文件的同步',route:'user-guidesync',summary:'同步机制与容量说明'},
              {title:'在 Word 中插入参考文献',route:'user-guidems-word-plugin',summary:'安装与使用文字处理插件'},
              {title:'引文的格式',route:'user-guidecitation-styles',summary:'CSL 样式与中文排版'},
              {title:'备份',route:'user-guidebackup',summary:'本地与云端备份策略'}]}}
            if (action === 'zoteroRead') return {成功:true,数据:{route:input.route,source:'https://zotero-chinese.com/x.md',markdown:'# 茉莉花\\n\\n与国内的文献管理软件相比，原生的 Zotero 对中文网站的抓取能力较为有限。得益于开源社区维护的转换器库，可以显著提高中文文献的抓取能力。\\n\\n## 功能\\n\\n- 中文文献元数据抓取\\n- 附件重命名规则\\n- 中文标题、作者的分词处理\\n\\n## 使用建议\\n\\n先安装转换器，再在首选项中启用。遇到抓取失败时，优先检查转换器是否为最新版本。'}}
            if (action === 'shareLinkCreate') return {成功:true,数据:{id:input.id,url:'https://seal.xingmasoft.com/share/#/s/'+input.id+'?a=演示凭证&k=演示片段',name:'季度销售计划.docx',hasCode:Boolean(input.code),expiresAt:input.expiryDays?Date.now()+input.expiryDays*86400000:null,requiresCode:Boolean(input.code),downloads:0,created:Date.now()}}
            return {成功:true,数据:{items:[]}}
          }}
        }
        const 最近 = [
          { id:'r1', name:'季度销售计划.docx', type:'word', 路径:'C:/演示/季度销售计划.docx', size:184320, updatedAt:'2026-11-03 15:37', starred:true, shared:false },
          { id:'r2', name:'客户名单.xlsx', type:'table', 路径:'C:/演示/客户名单.xlsx', size:96256, updatedAt:'2026-11-02 10:15', starred:false, shared:true },
          { id:'r3', name:'产品介绍.pptx', type:'ppt', 路径:'C:/演示/产品介绍.pptx', size:2408448, updatedAt:'2026-11-01 16:39', starred:false, shared:false },
          { id:'r4', name:'季度汇报.docx', type:'word', 路径:'C:/演示/季度汇报.docx', size:102400, updatedAt:'2026-10-31 09:20', starred:false, shared:false }
        ]
        flushSync(() => mount.render(<App 初始最近文档={最近} />))
      }
      window.navigate = key => flushSync(() => window.uiStore.handleNav(key, () => {}))
      window.newDocument = kind => flushSync(() => window.uiStore.createDoc(kind, kind === 'word' ? '<h1>季度销售计划</h1><p>本季度重点：完成重点客户回访，按行业整理报价方案，联合市场部完成线上说明会，并复盘转化率。</p><h2>行动项</h2><p>第一周确认预算；第二周补充备选方案；第三周执行说明会；第四周形成下月清单。</p>' : undefined))
      window.theme = name => { if (window.uiSettings.主题 !== name) flushSync(() => window.uiSettings.切换主题()) }
    `
    await require('esbuild').build({
      stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, platform: 'browser',
      outfile: path.join(output, 'shot.js'), loader: { '.png': 'dataurl', '.svg': 'dataurl' },
      define: { 'process.env.NODE_ENV': '"production"', __APP_VERSION__: '"2.5.0"', __SEAL_PLATFORM__: '"desktop"' },
      plugins: [
        { name: 'expose-store', setup(build) { build.onLoad({ filter: /renderer[\\/]src[\\/]App\.tsx$/ }, args => ({ contents: fs.readFileSync(args.path, 'utf8').replace('const 是首页 = module', 'window.uiStore = useAppStore(); window.uiSettings = useSettings(); const 是首页 = module'), loader: 'tsx' })) } },
        { name: 'unused-worker', setup(build) { build.onResolve({ filter: /\?worker&url$/ }, () => ({ path: 'worker-url', namespace: 'shot' })); build.onLoad({ filter: /.*/, namespace: 'shot' }, () => ({ contents: 'export default "unused-worker"' })) } }
      ]
    })
    // 样式全部由 esbuild 从 entry 的 import 链合并到 shot.css，顺序与 main.tsx 一致。
    fs.writeFileSync(path.join(output, 'shot.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="shot.css"><div id="root"></div><script src="shot.js"></script>`)

    win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } })
    const failures = []
    win.webContents.on('console-message', (_e, level, message) => { if (level >= 3 && !message.includes('Failed to load resource')) failures.push(message) })
    await win.loadFile(path.join(output, 'shot.html'))
    const js = code => win.webContents.executeJavaScript(code)
    const settle = () => js('new Promise(r=>setTimeout(()=>requestAnimationFrame(r),420))')
    const save = async name => {
      const png = (await win.webContents.capturePage()).toPNG()
      fs.writeFileSync(path.join(target, name + '.png'), png)
      return { name, bytes: png.length }
    }
    const shot = []
    // 关掉上一步残留的消息提示，避免提示条串到后续截图里。
    const 清提示 = () => js(`(()=>{const n=document.querySelectorAll('.ant-message-notice');n.forEach(e=>e.remove());const w=document.querySelector('.ant-message');w&&(w.style.display='none');return n.length})()`)
    await js('start()'); await settle()

    // 首页最近文档
    await js('navigate("recent")'); await settle(); shot.push(await save('home'))

    // 文字编辑器
    await js('newDocument("word")'); await settle(); shot.push(await save('word-editor'))
    // 表格
    await js('newDocument("table")'); await settle(); shot.push(await save('sheet-editor'))
    // 演示
    await js('newDocument("ppt")'); await settle(); shot.push(await save('slide-editor'))
    // PDF 工具
    await js('newDocument("pdf")'); await settle(); shot.push(await save('pdf-tools'))

    // 云空间：文件操作菜单（分享链接入口）
    await js('navigate("my-cloud")'); await settle()
    const 点菜单 = () => js(`(()=>{const m=document.querySelectorAll('.seal-drive-file-more')[1]||document.querySelector('.seal-drive-file-more');if(!m)throw Error('缺少文件操作按钮');m.click();return true})()`)
    await 点菜单()
    for (let i = 0; i < 40 && !await js(`!!document.querySelector('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item')`); i++) await new Promise(r => setTimeout(r, 100))
    await settle(); shot.push(await save('cloud-files-with-share-link'))

    // 分享链接弹窗：生成前
    await js(`(()=>{const b=[...document.querySelectorAll('.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item')].find(e=>/生成分享链接/.test(e.textContent));if(!b)throw Error('缺少生成分享链接菜单项');b.click();return true})()`)
    for (let i = 0; i < 40 && !await js(`!!document.querySelector('.seal-share-link')`); i++) await new Promise(r => setTimeout(r, 100))
    await settle(); shot.push(await save('share-link-create'))
    // 分享链接结果
    await js(`(()=>{const btn=[...document.querySelectorAll('.seal-share-link__footer button')].find(b=>/生成链接/.test(b.textContent));if(!btn)throw Error('缺少生成链接按钮');btn.click();return true})()`)
    for (let i = 0; i < 40 && !await js(`!!document.querySelector('.seal-share-link__result')`); i++) await new Promise(r => setTimeout(r, 100))
    await settle(); shot.push(await save('share-link-result'))
    await js(`(()=>{const c=document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-close');if(c)c.click();return true})()`); await settle()

    // 知识库：Zotero 百科
    await 清提示()
    await js('navigate("knowledge")'); await settle(); shot.push(await save('knowledge-library'))
    await js(`(()=>{const t=[...document.querySelectorAll('.ant-segmented-item')].find(e=>/Zotero/.test(e.textContent));if(!t)throw Error('缺少 Zotero 资料源页签');t.click();return true})()`)
    for (let i = 0; i < 40 && !await js(`document.querySelectorAll('.seal-zotero__list button').length>0`); i++) await new Promise(r => setTimeout(r, 100))
    await settle()
    await js(`(()=>{const b=[...document.querySelectorAll('.seal-zotero__list button')].find(e=>/茉莉花/.test(e.textContent));if(!b)throw Error('缺少茉莉花条目');b.click();return true})()`)
    for (let i = 0; i < 40 && !await js(`!!document.querySelector('.seal-zotero__markdown')`); i++) await new Promise(r => setTimeout(r, 100))
    await settle(); shot.push(await save('zotero-encyclopedia'))

    // 设置页：先关掉全部编辑器标签，避免演示文档标题留在顶栏。
    // 演示文档未保存，关闭会弹出确认框，需逐个确认“放弃修改”。
    await 清提示()
    for (let i = 0; i < 8; i++) {
      const 剩余 = await js(`document.querySelectorAll('.wps-global-tab__close').length`)
      if (!剩余) break
      await js(`(()=>{const b=document.querySelector('.wps-global-tab__close');if(b)b.click();return true})()`)
      await new Promise(r => setTimeout(r, 350))
      await js(`(()=>{const m=document.querySelector('.ant-modal-wrap:not([style*="display: none"])');if(!m)return false;const btn=[...m.querySelectorAll('button')].find(x=>/放弃修改/.test(x.textContent));if(btn)btn.click();return Boolean(btn)})()`)
      await new Promise(r => setTimeout(r, 350))
    }
    await settle()
    await js('window.uiStore.showSettings()'); await settle(); shot.push(await save('settings'))
    await js(`(()=>{const c=document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal-close');if(c)c.click();return true})()`); await settle()
    await js(`(()=>{const m=document.querySelector('.ant-modal-wrap:not([style*="display: none"])');if(!m)return false;const btn=[...m.querySelectorAll('button')].find(x=>/确定|放弃|关闭/.test(x.textContent));if(btn)btn.click();return Boolean(btn)})()`); await settle()

    // 深色主题首页
    await js('navigate("recent")'); await settle()
    await js('theme("深色")'); await settle(); await new Promise(r => setTimeout(r, 300))
    shot.push(await save('home-dark'))
    await js('theme("浅色")'); await settle()

    const report = { passed: failures.length === 0, target, screenshots: shot, failures }
    fs.writeFileSync(path.join(output, 'shot-report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
    win.destroy(); app.exit(report.passed ? 0 : 1)
  } catch (error) {
    const detail = { message: String(error && error.message), stack: String(error && error.stack).slice(0, 2000) }
    console.error(detail.stack)
    try { if (win) fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG()) } catch {}
    try { fs.writeFileSync(path.join(output, 'shot-report.json'), JSON.stringify({ passed: false, target, detail }, null, 2)) } catch {}
    win?.destroy(); app.exit(1)
  }
})
