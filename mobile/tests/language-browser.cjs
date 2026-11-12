const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '../..')
const webRoot = path.join(root, 'mobile/unpackage/web')
const output = path.join(root, '.upgrade-private/mobile-verification')
app.setPath('userData', path.join(output, 'language-' + crypto.randomUUID()))
app.disableHardwareAcceleration()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml' }

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\/$/, '/index.html')
    const file = path.resolve(webRoot, '.' + relative)
    if (!file.startsWith(webRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(response)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true, nodeIntegration: false } })
  const errors = []
  win.webContents.on('render-process-gone', (_event, detail) => errors.push('渲染进程退出：' + detail.reason))
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  win.webContents.on('will-prevent-unload', event => event.preventDefault())
  const evaluate = code => win.webContents.executeJavaScript(code, true)
  const until = async (code, label) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(code)) return; await wait(100) }
    throw new Error('等待界面超时：' + label)
  }
  const collect = selector => evaluate(`(() => {
    const root = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.body'};
    if (!root) throw Error('找不到检查区域');
    const ignored='[data-ui-language-ignore="true"],[contenteditable="true"],textarea,pre,code,.wps-doc-card__name,.wps-doc-row__name,.wps-titlebar__doc,.assistant-message__body,.assistant-markdown,.assistant-plaintext,.wps-sheet-stage,.wps-ppt-stage';
    const ignoredAttributes=ignored.replace(',textarea,',',');
    const allArticleText=${['.help-manual__article', '.settings-page'].includes(selector) ? 'true' : 'false'};
    const visible = el => { const box=el.getBoundingClientRect(),style=getComputedStyle(el); return box.width>0&&box.height>0&&(allArticleText||(box.bottom>0&&box.top<innerHeight&&box.right>0&&box.left<innerWidth))&&style.visibility!=='hidden'&&style.display!=='none'&&style.opacity!=='0'&&!el.closest('[hidden],[aria-hidden="true"]'); };
    const seen=[]; const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){const node=walker.currentNode,el=node.parentElement,text=node.nodeValue.trim();if(el&&text&&/[\\u3400-\\u9fff]/u.test(text.replaceAll('海豹办公',''))&&!el.closest(ignored)&&visible(el)&&text!=='简体中文'&&text!=='中')seen.push(text)}
    for(const el of root.querySelectorAll('[placeholder],[aria-label],[title]')){if(!visible(el)||el.closest(ignoredAttributes))continue;for(const attr of ['placeholder','aria-label','title']){const text=el.getAttribute(attr)?.trim();if(text&&/[\\u3400-\\u9fff]/u.test(text.replaceAll('海豹办公',''))&&text!=='简体中文')seen.push(attr+'：'+text)}}
    return [...new Set(seen)];
  })()`)
  const snapshots = []
  let exitCode = 0
  async function scan(label, selector) { await wait(350); snapshots.push({ label, chinese: await collect(selector) }) }
  async function switchLanguage(target) {
    await evaluate("document.querySelector('.wps-language-switcher').click()")
    const match = target === 'en-US' ? 'English' : 'Simplified Chinese|简体中文'
    await until(`[...document.querySelectorAll('[role=menuitem]')].some(x=>new RegExp('^(${match})$').test(x.textContent.trim()))`, '语言选项')
    await evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(x=>new RegExp('^(${match})$').test(x.textContent.trim())).click()`)
    await until(`document.documentElement.lang===${JSON.stringify(target)}`, '语言切换')
    await wait(200)
  }
  try {
    await win.loadURL('http://127.0.0.1:' + server.address().port + '/')
    await until("Boolean(document.querySelector('.wps-language-switcher'))", '语言切换入口')
    await switchLanguage('en-US')
    await scan('电脑首页')
    await evaluate("document.querySelector('.wps-homesidebar__actions button').click()")
    await until("Boolean(document.querySelector('.wps-newdoc-options'))", '新建窗口')
    await scan('电脑新建窗口', '.ant-modal-content')
    await evaluate("document.querySelector('.ant-modal-close').click()")
    await until("!document.querySelector('.wps-newdoc-options')", '关闭新建窗口')
    await evaluate("[...document.querySelectorAll('.wps-homenav__item')].find(x=>/^(Help|帮助手册)$/.test(x.textContent.trim())).click()")
    await until("Boolean(document.querySelector('.help-manual__layout'))", '帮助手册')
    await scan('电脑帮助手册', '.help-manual')
    const topics = await evaluate("document.querySelectorAll('.help-manual__topic').length")
    assert.ok(topics >= 30, '帮助主题不完整')
    for (let index = 0; index < topics; index++) {
      await evaluate(`document.querySelectorAll('.help-manual__topic')[${index}].click()`)
      await scan('帮助主题 ' + (index + 1), '.help-manual__article')
    }
    await evaluate("document.querySelector('.ant-modal-close').click()")
    await wait(300)
    await evaluate("document.querySelector('.assistant-desktop-launcher').click()")
    await until("Boolean(document.querySelector('.assistant-composer__input'))", '助手输入框')
    await scan('电脑智能助手')
    const assistantInput = await evaluate("({placeholder:document.querySelector('.assistant-composer__input').getAttribute('placeholder'),label:document.querySelector('.assistant-composer__input').getAttribute('aria-label')})")
    if (/[\u3400-\u9fff]/u.test(assistantInput.placeholder + assistantInput.label)) snapshots.push({ label: '助手输入框属性', chinese: Object.values(assistantInput) })
    for (let iteration = 0; iteration < 3; iteration++) { await switchLanguage('zh-CN'); await switchLanguage('en-US') }
    await evaluate("document.querySelector('.assistant-collapse')?.click()")
    win.setContentSize(390, 844)
    await wait(500)
    await until("document.querySelectorAll('.seal-mobile-nav button').length===5", '移动导航')
    for (let index = 0; index < 5; index++) {
      await evaluate(`document.querySelectorAll('.seal-mobile-nav button')[${index}].click()`)
      await scan('移动主页面 ' + (index + 1))
      const subnavs = await evaluate("document.querySelectorAll('.seal-mobile-subnav button').length")
      for (let sub = 0; sub < subnavs; sub++) {
        await evaluate(`document.querySelectorAll('.seal-mobile-subnav button')[${sub}].click()`)
        await scan('移动主页面 ' + (index + 1) + ' 子页面 ' + (sub + 1))
      }
    }
    await evaluate("[...document.querySelectorAll('.seal-mobile-profile__links button')].find(x=>/App settings|应用设置/.test(x.textContent)).click()")
    await until("Boolean(document.querySelector('.settings-page'))", '移动应用设置')
    await scan('移动应用设置', '.settings-page')
    await evaluate("document.querySelectorAll('.seal-mobile-nav button')[2].click()")
    // 原生宿主会在页面加载时标注 app，移动阅读工具仅在该宿主标记存在时出现。
    await evaluate("document.documentElement.dataset.sealPlatform='app'")
    for (const item of [
      { key: 'word', selector: '.wps-editor-canvas__content', name: '文字' },
      { key: 'table', selector: '.wps-sheet-toolbar', name: '表格' },
      { key: 'ppt', selector: '.wps-ppt-canvas', name: '演示' },
      { key: 'pdf', selector: '.wps-main--pdf', name: 'PDF' },
    ]) {
      await evaluate("document.querySelectorAll('.seal-mobile-nav button')[2].click()")
      await until("Boolean(document.querySelector('.seal-mobile-create'))", '移动服务入口')
      await evaluate(`document.querySelector('[data-document-type=${JSON.stringify(item.key)}]').click()`)
      await until(`Boolean(document.querySelector(${JSON.stringify(item.selector)}))`, item.name + '编辑区')
      await scan('移动' + item.name + '顶部外框', '.wps-titlebar')
      if (await evaluate("Boolean(document.querySelector('.wps-editor-status'))")) await scan('移动' + item.name + '底部状态栏', '.wps-editor-status')
      if (item.key === 'word') {
        const initialName = await evaluate("document.querySelector('.wps-titlebar__doc')?.textContent.trim()")
        assert.equal(initialName, 'Untitled Document.sldoc', '英文界面新建文字文档使用英文默认名称')
        await evaluate("(()=>{const e=document.querySelector('.wps-editor-canvas__content');e.focus();document.execCommand('insertText',false,'首页 保存：这是用户正文');e.dispatchEvent(new Event('input',{bubbles:true}))})()")
        win.setContentSize(1280, 900); await wait(300)
        await switchLanguage('zh-CN'); await switchLanguage('en-US')
        assert.ok(await evaluate("document.querySelector('.wps-editor-canvas__content')?.textContent.includes('首页 保存：这是用户正文')"), '切换语言不能更改用户正文')
        assert.equal(await evaluate("document.querySelector('.wps-titlebar__doc')?.textContent.trim()"), initialName, '切换语言不能更改已创建的文件名')
        win.setContentSize(390, 844); await wait(300)
        await until("Boolean(document.querySelector('.seal-reading-toolbar'))", '移动阅读工具')
        await scan('移动文字编辑模式', '.seal-reading-toolbar')
        assert.equal(await evaluate("document.querySelector('.seal-reading-toolbar__hint').textContent.trim()"), 'Editable')
        assert.match(await evaluate("getComputedStyle(document.querySelector('.wps-editor-status__left'),'::before').content"), /Mobile editing view/)
        await evaluate("document.querySelector('.seal-reading-toolbar__modes button:first-child').click()")
        await until("document.querySelector('.seal-reading-toolbar').dataset.reading==='true'", '移动阅读模式')
        await scan('移动文字阅读模式', '.seal-reading-toolbar')
        assert.equal(await evaluate("document.querySelector('.seal-reading-toolbar__hint').textContent.trim()"), 'Read-only')
        assert.match(await evaluate("getComputedStyle(document.querySelector('.wps-editor-status__left'),'::before').content"), /Mobile reading view/)
        await evaluate("document.querySelector('.seal-reading-toolbar__modes button:nth-child(2)').click()")
        await until("document.querySelector('.seal-reading-toolbar').dataset.reading==='false'", '移动编辑模式')
        for (const language of ['en-US', 'zh-CN']) {
          win.setContentSize(1280, 900); await wait(200); await switchLanguage(language)
          for (const width of [320, 360, 390]) {
            win.setContentSize(width, 844); await until(`innerWidth===${width}`, '调整到 ' + width + ' 像素视口'); await wait(100)
            const layout = await evaluate(`(() => { const b=document.querySelector('.seal-cloud-banner'), t=b.querySelector(':scope > span'), r=b.getBoundingClientRect(), tr=t.getBoundingClientRect(); return {width:r.width,height:r.height,textWidth:tr.width,overflow:b.scrollWidth>b.clientWidth+1,buttons:[...b.querySelectorAll('button')].map(x=>{const q=x.getBoundingClientRect();return {left:q.left,right:q.right,top:q.top,bottom:q.bottom,scroll:x.scrollWidth,client:x.clientWidth}}),textBottom:tr.bottom} })()`)
            assert.ok(layout.textWidth >= layout.width - 32 && layout.height <= 150 && !layout.overflow, `云提示文本布局异常 ${language} ${width}: ${JSON.stringify(layout)}`)
            assert.ok(layout.buttons.every(button=>button.left>=-1&&button.right<=width+1&&button.top>=layout.textBottom-1&&button.scroll<=button.client+1), `云提示按钮布局异常 ${language} ${width}: ${JSON.stringify(layout)}`)
            if (width === 360) {
              await until("Boolean(document.querySelector('.seal-reading-toolbar'))", '移动阅读工具')
              assert.equal(await evaluate("document.querySelector('.seal-reading-toolbar__hint').textContent.trim()"), language === 'en-US' ? 'Editable' : '可编辑')
              assert.match(await evaluate("getComputedStyle(document.querySelector('.wps-editor-status__left'),'::before').content"), language === 'en-US' ? /Mobile editing view/ : /手机编辑视图/)
              await evaluate("document.querySelector('.seal-reading-toolbar__modes button:first-child').click()")
              await until("document.querySelector('.seal-reading-toolbar').dataset.reading==='true'", '移动阅读模式')
              assert.equal(await evaluate("document.querySelector('.seal-reading-toolbar__hint').textContent.trim()"), language === 'en-US' ? 'Read-only' : '只读')
              assert.match(await evaluate("getComputedStyle(document.querySelector('.wps-editor-status__left'),'::before').content"), language === 'en-US' ? /Mobile reading view/ : /手机阅读视图/)
              await evaluate("document.querySelector('.seal-reading-toolbar__modes button:nth-child(2)').click()")
              await until("document.querySelector('.seal-reading-toolbar').dataset.reading==='false'", '移动编辑模式')
              assert.equal(await evaluate("document.querySelector('.wps-titlebar__doc')?.textContent.trim()"), initialName, '切换语言不能更改已创建的文件名')
            }
          }
        }
        win.setContentSize(1280, 900); await wait(200); await switchLanguage('en-US')
        win.setContentSize(390, 844); await wait(300)
      }
      if (item.key === 'pdf') { await scan('移动 PDF 工具', item.selector); continue }
      await until("Boolean(document.querySelector('.wps-ribbon-tabs'))", item.name + '功能区')
      const tabs = await evaluate("document.querySelectorAll('.wps-ribbon-tabs button').length")
      for (let index = 0; index < tabs; index++) {
        await evaluate(`document.querySelectorAll('.wps-ribbon-tabs button')[${index}].click()`)
        await scan('移动' + item.name + '功能区 ' + (index + 1), '.wps-ribbon-panel')
      }
    }
    assert.equal(errors.length, 0, '渲染错误：' + JSON.stringify(errors))
    fs.writeFileSync(path.join(output, 'language-browser-result.json'), JSON.stringify({ snapshots, errors }, null, 2))
    console.log(JSON.stringify({ snapshots, errors }, null, 2))
    const missing = snapshots.filter(item => item.chinese.length)
    assert.deepEqual(missing, [], '英文界面仍有可见中文：' + JSON.stringify(missing))
    console.log('电脑与移动主要页面的英文界面检查通过')
  } catch (error) { console.error(error.stack || error); console.error('最近检查区域：' + JSON.stringify(snapshots.slice(-3).map(item=>item.label))); if(errors.length)console.error('渲染日志：' + JSON.stringify(errors)); exitCode = 1 }
  finally { win.destroy(); server.close(); app.exit(exitCode) }
}).catch(error => { console.error(error); app.exit(1) })
