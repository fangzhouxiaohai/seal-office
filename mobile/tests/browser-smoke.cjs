const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const project = path.resolve(__dirname, '../..'), output = path.join(project, '.upgrade-private/mobile-verification')
const webRoot = path.resolve(__dirname, process.argv.includes('--web') ? '../unpackage/web' : '../static/office'), localFile = process.argv.includes('--file')
app.setPath('userData', path.join(output, 'browser-profile-' + (localFile ? 'file' : 'web') + '-' + process.pid)); app.disableHardwareAcceleration()
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const server = http.createServer((request, response) => {
    const filename = path.resolve(webRoot, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'))
    if (!filename.startsWith(webRoot + path.sep)) { response.writeHead(403); response.end(); return }
    try { response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream' }); fs.createReadStream(filename).on('error', () => response.destroy()).pipe(response) }
    catch { response.writeHead(404); response.end() }
  })
  await new Promise((resolve) => server.listen(5191, '127.0.0.1', resolve))
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false } })
  const errors = [], checks = []
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message) })
  // 模拟 App/WebView 被系统重新创建；允许重载带有未保存正文的测试窗口。
  win.webContents.on('will-prevent-unload', event => event.preventDefault())
  win.webContents.session.on('will-download', (_, item) => item.cancel())
  const evaluate = async (code) => {
    // 把页面异常传回主进程，保留具体原因，避免 sandbox 只显示笼统错误。
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (0,eval)(${JSON.stringify(code)})}}catch(error){return {error:error.stack || String(error)}}})()`, true)
    if (result.error) throw new Error(result.error)
    return result.value
  }
  try {
    if (localFile) await win.loadFile(path.join(webRoot, 'index.html'))
    else await win.loadURL('http://127.0.0.1:5191/')
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(`!!document.querySelector('.wps-app')`)) break; await new Promise(resolve => setTimeout(resolve, 250)) }
    assert.ok(await evaluate(`!!document.querySelector('.wps-app')`), '应用必须实际挂载')
    checks.push('生产构建可在无 Electron preload 的浏览器环境启动')
    if (localFile) {
      // 字体与导出使用确定性的宿主模拟；页面和编辑器本身从 file:// 加载。
      await evaluate(`window.sealNative={token:'offline-test',platform:'android'};window.uni={webView:{postMessage:async({data})=>{if(data.action==='save'){window.sealReceiveNative({id:data.id,type:'saved'});return}if(data.action==='font'){const result=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET','http://127.0.0.1:5191/fonts/NotoSansSC.ttf');xhr.responseType='arraybuffer';xhr.onload=()=>resolve(xhr.response);xhr.onerror=reject;xhr.send()});const bytes=new Uint8Array(result);for(let start=0;start<bytes.length;start+=98304){let text='';for(const b of bytes.slice(start,start+98304))text+=String.fromCharCode(b);window.sealReceiveNative({id:data.id,type:'chunk',data:btoa(text)})}window.sealReceiveNative({id:data.id,type:'end'})}}}};true`)
    }
    const roundtrip = await evaluate(`(async () => {
      const api=window.electronAPI;
      const word=await api.office.writeDocx({段落:[{类型:'段落',级别:1,对齐:'左',列表:'无',文字:[{文本:'跨端中文标题',加粗:true}]},{类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:'保存后重开，内容应完整。'}]}],未覆盖:[]});
      if(!word.成功)throw new Error(word.错误);
      const opened=await api.office.readDocx(word.数据);if(!opened.成功)throw new Error(opened.错误);
      const filename=await api.showSaveDialog('跨端验收.docx','word');
      const saved=await api.saveToFile(filename,word.数据,'二进制');if(!saved.成功)throw new Error(saved.错误);
      const read=await api.readFile(filename);
      const changed=await api.saveToFile(filename,word.数据,'二进制','incorrect-fingerprint');
      const ppt=await api.office.writePptx({页面尺寸:{宽:960,高:540},幻灯片:[{id:'slide1',背景色:'#FFFFFF',文本框:[{id:'text1',x:40,y:40,width:600,height:80,text:'移动演示验收',字号:32,颜色:'#222222',加粗:true}]}]});
      const deck=ppt.成功?await api.office.readPptx(ppt.数据):ppt;
      const table=await api.office.writeXlsx({工作表:[{名称:'验收表',数据:[['项目','金额'],['安卓与网页',123]]}]});
      const sheet=table.成功?await api.office.readXlsx(table.数据):table;
      const config=await api.ai.saveConfig({名称:'离线验收',服务商:'custom',地址:'https://example.com/v1',模型:'test-model',密钥:'test-secret-not-real'});
      const backup=await api.backupSave(JSON.stringify({test:'persisted'}));
      return {word:opened.html,file:read,blocked:changed,ppt:deck,sheet,config,backup,filename};
    })()`)
    assert.match(roundtrip.word, /跨端中文标题/); assert.match(roundtrip.word, /保存后重开/)
    assert.ok(roundtrip.file.成功); assert.equal(roundtrip.blocked.成功, false)
    assert.ok(roundtrip.ppt.成功, JSON.stringify(roundtrip.ppt)); assert.match(JSON.stringify(roundtrip.ppt),/移动演示验收/); assert.ok(roundtrip.sheet.成功, JSON.stringify(roundtrip.sheet)); assert.match(JSON.stringify(roundtrip.sheet),/安卓与网页/); assert.ok(roundtrip.config.成功); assert.ok(roundtrip.backup.成功)
    checks.push('DOCX/XLSX/PPTX 中文往返、文件持久保存、来源指纹冲突保护、模型安全配置')
    const data = await evaluate(`(async()=>{const api=window.electronAPI;const result=await api.printPreview('<h1>中文打印验收</h1><p>海豹办公移动与网页</p>','html');if(!result.成功)throw new Error(result.错误);const rotated=await api.pdf.rotate(result.数据,[1],90);const filename=await api.showSaveDialog('PDF阅读验收.pdf');await api.saveToFile(filename,result.数据,'二进制');const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,100,100);ctx.fillStyle='#0000ff';ctx.fillRect(100,0,100,100);const imagePdf=await api.printPreview('<p>旋转翻转图片导出验收</p><img src="'+canvas.toDataURL('image/png')+'" width="240" height="120" style="width:240px;height:120px;transform:rotate(90deg) scale(-1, 1)">','html');if(!imagePdf.成功)throw new Error(imagePdf.错误);return {result,rotated,filename,imagePdf}})()`)
    assert.ok(data.result.成功); assert.ok(data.rotated.成功, JSON.stringify(data.rotated)); checks.push('中文 PDF 生成与页面旋转')
    const { PDFDocument, PDFName, PDFDict } = require('pdf-lib')
    const imagePdf = await PDFDocument.load(Buffer.from(data.imagePdf.数据,'base64'))
    const xobjects = imagePdf.getPages()[0].node.Resources().lookup(PDFName.of('XObject'),PDFDict)
    const images = xobjects.values().map(ref=>imagePdf.context.lookup(ref)).filter(object=>object.dict?.get(PDFName.of('Subtype'))?.toString()==='/Image')
    assert.equal(images.length,1)
    assert.equal(images[0].dict.get(PDFName.of('Width')).asNumber(),100)
    assert.equal(images[0].dict.get(PDFName.of('Height')).asNumber(),200)
    assert.equal(images[0].dict.get(PDFName.of('ColorSpace')).toString(),'/DeviceRGB')
    const pixels = require('node:zlib').inflateSync(images[0].getContents())
    assert.equal(pixels.length,100*200*3)
    assert.deepEqual(Array.from(pixels.subarray((50*100+50)*3,(50*100+50)*3+3)),[0,0,255], '翻转并旋转后的上半部分应为蓝色')
    assert.deepEqual(Array.from(pixels.subarray((150*100+50)*3,(150*100+50)*3+3)),[255,0,0], '翻转并旋转后的下半部分应为红色')
    fs.writeFileSync(path.join(output,'word-picture-transformed.pdf'),Buffer.from(data.imagePdf.数据,'base64'))
    checks.push('Word 旋转和翻转转为真实图片像素后写入 PDF，导出尺寸保持方向')
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload() })
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(`!!document.querySelector('.wps-app')`)) break; await new Promise(resolve => setTimeout(resolve, 250)) }
    const reopened = await evaluate(`Promise.all([window.electronAPI.ai.getConfig(), window.electronAPI.backupLoad(), window.electronAPI.readFile(${JSON.stringify(roundtrip.filename)})])`)
    assert.equal(reopened[0].数据.已配置密钥, true); assert.ok(reopened[1].成功); assert.ok(reopened[2].成功)
    checks.push('页面重载后恢复本地文件与加密模型配置')
    // 前面故意写入非工作区 JSON 检查存储；应用必须拒绝当作有效编辑状态加载。
    for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(`document.body.textContent.includes('保留原备份并继续')`)) break; await new Promise(resolve => setTimeout(resolve, 50)) }
    assert.ok(await evaluate(`document.body.textContent.includes('工作状态恢复失败')`), '损坏的工作区备份应提示，不能静默覆盖')
    await evaluate(`Array.from(document.querySelectorAll('.ant-modal button')).find(button=>button.textContent.includes('保留原备份并继续')).click()`)
    for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(`document.body.textContent.includes('原备份已保留')`)) break; await new Promise(resolve => setTimeout(resolve, 50)) }
    await evaluate(`Array.from(document.querySelectorAll('.ant-modal button')).find(button=>button.textContent.includes('确') && !button.textContent.includes('保留'))?.click()`)
    for (let attempt = 0; attempt < 80; attempt++) { if (!(await evaluate(`!!document.querySelector('.ant-modal')`))) break; await new Promise(resolve => setTimeout(resolve, 50)) }
    checks.push('无效工作区备份被阻止且允许保留后继续')
    await evaluate(`window.electronAPI.ai.clearConfig();window.electronAPI.backupClear()`)
    await win.capturePage().then(image => fs.writeFileSync(path.join(output, 'pc-web.png'), image.toPNG()))
    win.setContentSize(390, 844); await new Promise(resolve => setTimeout(resolve, 500))
    const layout = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,nav:getComputedStyle(document.querySelector('.seal-mobile-nav')).display,ready:!!document.querySelector('.wps-app')})`)
    assert.ok(layout.ready); assert.equal(layout.nav, 'grid'); assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout))
    await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`); await new Promise(resolve => setTimeout(resolve, 400))
    assert.ok(await evaluate(`Array.from(document.querySelectorAll('.seal-mobile-function-grid button')).some(button=>button.textContent.includes('知识库'))`))
    await win.capturePage().then(image => fs.writeFileSync(path.join(output, 'mobile-web.png'), image.toPNG()))
    await evaluate(`document.querySelector('.seal-mobile-create [data-document-type="word"]').click()`); await new Promise(resolve => setTimeout(resolve, 500))
    assert.ok(await evaluate(`!!document.querySelector('[contenteditable="true"]')`), '手机端必须能新建并编辑文字文档')
    const paper = await evaluate(`(() => { const paper=document.querySelector('.wps-editor-canvas__paper'), editor=document.querySelector('.wps-editor-canvas__content'); editor.focus(); document.execCommand('insertText', false, '手机编辑换行验收'); editor.dispatchEvent(new Event('input', {bubbles:true})); const rect=paper.getBoundingClientRect(); return {left:rect.left,right:rect.right,width:innerWidth,text:editor.textContent} })()`)
    assert.ok(paper.left >= 0 && paper.right <= paper.width + 1, '手机正文必须在视口内重排：' + JSON.stringify(paper))
    assert.match(paper.text, /手机编辑换行验收/)
    await evaluate(`window.dispatchEvent(new Event('seal-persist-workspace'));true`)
    await new Promise(resolve => setTimeout(resolve, 800))
    assert.match((await evaluate(`window.electronAPI.backupLoad()`)).内容, /手机编辑换行验收/)
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload() })
    for (let attempt = 0; attempt < 120; attempt++) { if (await evaluate(`document.querySelector('.wps-editor-canvas__content')?.textContent?.includes('手机编辑换行验收')`)) break; await new Promise(resolve => setTimeout(resolve, 100)) }
    assert.ok(await evaluate(`document.querySelector('.wps-editor-canvas__content')?.textContent?.includes('手机编辑换行验收')`), '有效备份必须恢复正文和编辑页面')
    assert.equal(await evaluate(`!!document.querySelector('.ant-modal')`), false, '有效备份不应显示恢复失败')
    await win.capturePage().then(image => fs.writeFileSync(path.join(output, 'mobile-word.png'), image.toPNG()))
    checks.push('手机菜单新建文字文档并进入真实编辑器')
    checks.push('390px 文字正文重排、输入事件与编辑区域可见')
    checks.push('真实工作区备份恢复未保存正文与文字编辑页面')
    await require('./image-actions.cjs')({ win, evaluate, output, checks })
    await evaluate(`window.electronAPI.showOpenDialog=async()=>${JSON.stringify(data.filename)};document.querySelector('.seal-mobile-nav [aria-label="打开文件"]').click()`)
    for(let attempt=0;attempt<150;attempt++){if(await evaluate(`!!document.querySelector('.pdf-viewer__canvas')?.width && !!document.querySelector('.pdf-viewer__text-layer')?.textContent?.includes('中文打印验收')`))break;await new Promise(resolve=>setTimeout(resolve,100))}
    assert.ok(await evaluate(`!!document.querySelector('.pdf-viewer__canvas')?.width && !!document.querySelector('.pdf-viewer__text-layer')?.textContent?.includes('中文打印验收')`), '本地 PDF 必须在阅读器中绘制并提取中文：'+await evaluate(`document.querySelector('.pdf-viewer')?.textContent`))
    checks.push('手机文件入口打开 PDF 并通过本地 Worker 绘制页面')
    checks.push('390px 手机布局、底部触控导航、知识库与全部功能入口')
    // 逐一操作移动菜单，检查实际导航状态，而非只检查按钮存在。
    await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
    await new Promise(resolve => setTimeout(resolve, 350))
    const navigation = await evaluate(`Array.from(document.querySelectorAll('.seal-mobile-function-grid button')).map(button=>({key:button.dataset.navKey,label:button.textContent}))`)
    assert.equal(navigation.length, 15, '移动端已实现功能入口数量')
    for (const item of navigation) {
      await evaluate(`document.querySelector('[data-nav-key=${JSON.stringify(item.key)}]').click()`)
      await new Promise(resolve => setTimeout(resolve, 500))
      assert.equal(await evaluate(`document.querySelector('[aria-label="全部功能"]').getAttribute('aria-expanded')`), 'false', item.label + '应关闭菜单')
      assert.equal(await evaluate(`!!document.querySelector('.wps-error')`), false, item.label + '页面不得崩溃')
      const target = { settings: '.wps-main--settings', help: '.wps-main--help', pdf: '.wps-main--pdf' }[item.key]
      if (target) assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(target)})`), item.label + '必须加载目标页面')
      const layout = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`)
      assert.ok(layout.scroll <= layout.width + 1, item.label + '不应撑开手机视口：' + JSON.stringify(layout))
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await new Promise(resolve => setTimeout(resolve, 350))
      assert.equal(await evaluate(`document.querySelector('[data-nav-key=${JSON.stringify(item.key)}]').getAttribute('aria-current')`), 'page', item.label + '必须真的切换到目标')
    }
    await evaluate(`document.querySelector('.ant-drawer-close').click()`)
    checks.push('移动端 15 个功能入口逐一点击、导航状态及视口检查')
    for (const item of [{key:'table',selector:'.wps-sheet-toolbar'}, {key:'ppt',selector:'.wps-ppt-canvas'}, {key:'pdf',selector:'.wps-main--pdf'}]) {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await new Promise(resolve => setTimeout(resolve, 350))
      await evaluate(`document.querySelector('[data-document-type=${JSON.stringify(item.key)}]').click()`)
      for (let attempt=0;attempt<100;attempt++) { if(await evaluate(`!!document.querySelector(${JSON.stringify(item.selector)})`))break;await new Promise(resolve=>setTimeout(resolve,50)) }
      assert.ok(await evaluate(`!!document.querySelector(${JSON.stringify(item.selector)})`), item.key + '必须进入真实编辑页面')
      if (item.key === 'table') {
        await evaluate(`(()=>{const input=document.querySelector('[aria-label="公式栏"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'移动表格验收');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
        await new Promise(resolve=>setTimeout(resolve,100))
        await evaluate(`document.querySelector('[aria-label="公式栏"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
        assert.ok(await evaluate(`document.querySelector('.wps-sheet-stage').textContent.includes('移动表格验收')`), '公式栏提交必须写入单元格')
      }
      if (item.key === 'ppt') {
        const before = await evaluate(`(()=>{const box=document.querySelector('.wps-ppt-box'),rect=box.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,text:box.textContent}})()`)
        assert.ok(before.width > 0)
        await evaluate(`(()=>{const box=document.querySelector('.wps-ppt-box');const touch=(x,y)=>new Touch({identifier:1,target:box,clientX:x,clientY:y});box.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[touch(${before.x+5},${before.y+5})]}));window.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(${before.x+25},${before.y+15})]}));window.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[touch(${before.x+25},${before.y+15})]}))})()`)
        await new Promise(resolve=>setTimeout(resolve,150))
        const after = await evaluate(`(()=>{const rect=document.querySelector('.wps-ppt-box').getBoundingClientRect();return {x:rect.x,y:rect.y}})()`)
        assert.ok(Math.abs(after.x-before.x-20)<2 && Math.abs(after.y-before.y-10)<2, '触摸拖动应按屏幕距离移动：'+JSON.stringify({before,after}))
        await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'mobile-ppt.png'),image.toPNG()))
      }
      const tabs = await evaluate(`Array.from(document.querySelectorAll('.wps-ribbon-tabs button')).map(button=>button.textContent)`)
      for(const label of tabs) {
        await evaluate(`Array.from(document.querySelectorAll('.wps-ribbon-tabs button')).find(button=>button.textContent===${JSON.stringify(label)}).click()`)
        await new Promise(resolve=>setTimeout(resolve,50))
      }
      checks.push(item.key + '新建、页面及工具栏 '+tabs.length+' 个选项卡；'+(item.key==='table'?'公式栏写入单元格':item.key==='ppt'?'触屏文本框拖动':'PDF 工具入口'))
    }
    for(const width of [360, 820, 1280]) {
      win.setContentSize(width,844);await new Promise(resolve=>setTimeout(resolve,150))
      const layout=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth})`)
      assert.ok(layout.scroll<=layout.width+1, '窗口宽度 '+width+' 必须自适应')
    }
    checks.push('360/390/820/1280px 窄屏、平板与 PC 布局')
    assert.equal(errors.filter(message => !/ERR_ABORTED|favicon/.test(message)).length, 0, errors.join('\n'))
    fs.writeFileSync(path.join(output, localFile?'file-result.json':'result.json'), JSON.stringify({ passed: true, checks, errors, scheme:localFile?'file':'http' }, null, 2))
    console.log(JSON.stringify({ passed: true, checks, output }, null, 2)); app.exit(0)
  } catch (error) { console.error(error); fs.writeFileSync(path.join(output, localFile?'file-result.json':'result.json'), JSON.stringify({ passed: false, checks, errors, error: error.stack }, null, 2)); app.exit(1) }
  finally { server.close(); win.destroy() }
})
