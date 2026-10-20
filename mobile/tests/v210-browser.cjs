// Production responsive Web UI and real local account API; disposable users and files only.
const {app,BrowserWindow,net}=require('electron')
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict')
const {createLocalCollaborationFixture}=require('../../server/test/collaborationFixture.cjs')
const {readSeal}=require('../../main/office/sealFormat')
const PptxGenJS=require('pptxgenjs')
if(!global.fetch)global.fetch=net.fetch.bind(net)
const root=path.resolve(__dirname,'../unpackage/web'),output=path.resolve(__dirname,'../../.upgrade-private/v210-browser')
app.setPath('userData',path.join(output,'profile-'+process.pid));app.disableHardwareAcceleration()
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),checks=[],errors=[]
app.whenReady().then(async()=>{
  let fixture,server,win
  fs.mkdirSync(output,{recursive:true})
  try{
    fixture=await createLocalCollaborationFixture(undefined,{clients:false})
    server=http.createServer((request,response)=>{
      if(request.url.startsWith('/api/')){const upstream=http.request(fixture.url+request.url.slice(4),{method:request.method,headers:{...request.headers,host:new URL(fixture.url).host}},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response)});upstream.on('error',()=>{response.writeHead(502);response.end()});request.pipe(upstream);return}
      const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/office\//,'/').replace(/\/$/,'/index.html'),filename=path.resolve(root,'.'+name)
      if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){response.writeHead(404);response.end();return}
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.png':'image/png','.svg':'image/svg+xml'}[path.extname(filename)]||'application/octet-stream'
      response.writeHead(200,{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'"});fs.createReadStream(filename).pipe(response)
    })
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
    win=new BrowserWindow({show:false,width:390,height:844,webPreferences:{offscreen:true,contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}})
    win.webContents.on('console-message',(_,level,message)=>{if(level>=3&&!/ERR_ABORTED|favicon/.test(message))errors.push(message)})
    win.webContents.on('will-prevent-unload',event=>event.preventDefault())
    const downloads=new Set()
    win.webContents.session.on('will-download',(_,item)=>{const name=path.basename(item.getFilename());item.setSavePath(path.join(output,name));item.once('done',(_event,state)=>{if(state==='completed')downloads.add(name)})})
    const evaluate=async code=>{const result=await win.webContents.executeJavaScript(`(async()=>{try{return {value:await(${code})}}catch(error){return {error:error.stack||String(error)}}})()`,true);if(result.error)throw new Error(result.error);return result.value}
    const until=async(code,label)=>{for(let i=0;i<180;i++){if(await evaluate(code))return;await pause(100)}throw new Error('Timeout: '+label)}
    const hostUntil=async(test,label)=>{for(let i=0;i<180;i++){if(test())return;await pause(100)}throw new Error('Timeout: '+label)}
    const click=async label=>evaluate(`(()=>{const match=[...document.querySelectorAll('button')].find(node=>node.getClientRects().length&&!node.disabled&&(node.getAttribute('aria-label')===${JSON.stringify(label)}||node.textContent.replace(/\\s/g,'')===${JSON.stringify(label.replace(/\s/g,''))}));if(!match)throw new Error('Missing visible button: '+${JSON.stringify(label)});match.click();return true})()`)
    const input=async(selector,value)=>{await until(`!!document.querySelector(${JSON.stringify(selector)})`,'input '+selector);await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.focus();Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);await pause(100)}
    const capture=async name=>{await pause(200);fs.writeFileSync(path.join(output,name),(await win.capturePage()).toPNG())}
    await win.loadURL('http://127.0.0.1:'+server.address().port+'/office/')
    await until(`!!window.electronAPI&&!!document.querySelector('.wps-app')`,'production app')
    assert.equal(await evaluate(`!!document.querySelector('.wps-global-tabs')`),false,'empty mobile workspace must not show a tab bar')
    await click('我的');await until(`!!document.querySelector('[aria-label="我的账号与应用"]')`,'profile page')
    await click('登录 / 注册');await input('#seal-login-phone','13800111888');await click('获取验证码')
    await hostUntil(()=>fixture.codes.has('13800111888'),'controlled SMS')
    await input('#seal-login-code',fixture.codes.get('13800111888'));await click('登录')
    await until(`document.body.textContent.includes('已登录：')`,'SMS sign-in')
    const owner=fixture.cloud.db.one('SELECT id FROM users WHERE phone=?',['13800111888']).id
    const recovery=await evaluate(`(async()=>{const enabled=await window.electronAPI.cloud.invoke('enable',{consent:true});if(!enabled.成功)throw new Error(enabled.错误);const ack=await window.electronAPI.cloud.invoke('ackRecovery');if(!ack.成功)throw new Error(ack.错误);return enabled.数据.recovery})()`)
    const originalCloud=await evaluate(`(async()=>{const data=await window.electronAPI.office.writeSeal('word',{html:'<p>云端原生文件𠮷🦭</p>'});const saved=await window.electronAPI.cloud.invoke('save',{linkId:'v210-ui-account',name:'云端原生文件.sealdoc',data:data.数据});if(!saved.成功)throw new Error(saved.错误);return {id:saved.数据.id,data:data.数据}})()`)
    await click('设置登录密码');fixture.advance(61000);await click('获取账号安全验证码')
    await hostUntil(()=>fixture.cloud.db.one("SELECT phone FROM codes WHERE phone=? AND purpose='password'",['13800111888']),'password verification SMS')
    await input('#seal-security-code',fixture.codes.get('13800111888'))
    const password='Seal Browser 2.1 中文🦭'
    await input('#seal-security-new',password);await input('#seal-security-repeat',password);await click('保存登录密码')
    await until(`(async()=>{const status=await window.electronAPI.cloud.invoke('status');return status.数据.account?.hasPassword===true})()`,'password stored')
    assert.equal(await evaluate(`document.querySelector('#seal-security-new').value`),'')
    await capture('phone-account-security.png')
    await click('退出登录');await until(`!!document.querySelector('.seal-login')`,'signed out')
    win.setContentSize(1280,900);await pause(250)
    await click('密码登录');await input('#seal-login-phone','13800111888');await input('#current-password',password);await click('登录')
    await until(`!!document.querySelector('[aria-label="恢复密钥"]')`,'independent recovery key requested')
    await input('[aria-label="恢复密钥"]',recovery);await click('解锁云空间')
    await until(`(async()=>{const state=await window.electronAPI.cloud.invoke('status');return state.数据.unlocked})()`,'password session unlocked')
    const downloaded=await evaluate(`window.electronAPI.cloud.invoke('rawDownload',{id:${JSON.stringify(originalCloud.id)}})`)
    assert.equal(downloaded.成功,true);assert.equal(downloaded.数据.data,originalCloud.data)
    await capture('desktop-password-account.png')
    checks.push('390px真实短信登录与密码设置、1280px密码登录及恢复密钥解锁；原加密原生文件字节不变')
    await evaluate(`(()=>{document.querySelector('.ant-modal-close').click();return true})()`);win.setContentSize(390,844);await pause(250)
    for(const label of ['返回首页','云盘','服务','模板','我的']){await click(label);await pause(250);assert.equal(await evaluate(`document.querySelector('.seal-mobile-nav [aria-label=${JSON.stringify(label)}]').getAttribute('aria-current')`),'page')}
    await click('服务');await input('[aria-label="搜索办公服务"]','脑图');assert.equal(await evaluate(`document.querySelectorAll('.seal-mobile-function-grid [data-nav-key]').length`),1)
    await input('[aria-label="搜索办公服务"]','海豹');assert.ok(await evaluate(`!!document.querySelector('[aria-label="海豹专属格式"]')`));assert.equal(await evaluate(`document.body.textContent.includes('未找到匹配的办公服务')`),false)
    await capture('phone-services-native-format.png')
    await input('[aria-label="搜索办公服务"]','');checks.push('五个完整底部页面与服务检索；导入为页面动作，首页无空工作区标签行')
    const sourceWord=await evaluate(`window.electronAPI.office.writeDocx({段落:[{类型:'段落',级别:0,对齐:'左',列表:'无',文字:[{文本:'端到端文字𠮷🦭é'}]}],未覆盖:[]})`)
    const sourceTable=await evaluate(`window.electronAPI.office.writeXlsx({工作表:[{名称:'公式保真',数据:[['文本','公式'],[{文字:[{文本:'表格𠮷🦭'}],类型:'文本'},{公式:'SUM(1,2)',结果:3}]]}]})`)
    const deck=new PptxGenJS();deck.layout='LAYOUT_WIDE';const slide=deck.addSlide();slide.addText('演示𠮷🦭é',{x:1,y:1,w:8,h:1})
    const image=fs.readFileSync(path.resolve(__dirname,'../../renderer/src/editor/__fixtures__/office-image.png'))
    slide.addImage({data:'data:image/png;base64,'+image.toString('base64'),x:1,y:2,w:2,h:2})
    const sourceShow={成功:true,数据:Buffer.from(await deck.write({outputType:'nodebuffer'})).toString('base64')}
    for(const [type,extension,source,ready]of [['word','sealdoc',sourceWord,`.wps-editor-canvas__content`],['table','sealsheet',sourceTable,`.wps-sheet-stage`],['ppt','sealshow',sourceShow,`.wps-ppt-canvas`]]){
      assert.equal(source.成功,true,source.错误)
      const name='v210-'+type+'.'+{word:'docx',table:'xlsx',ppt:'pptx'}[type]
      const filename=await evaluate(`(async()=>{const file=await window.electronAPI.showSaveDialog(${JSON.stringify(name)},${JSON.stringify(type)});const saved=await window.electronAPI.saveToFile(file,${JSON.stringify(source.数据)},'二进制');if(!saved.成功)throw new Error(saved.错误);window.electronAPI.showOpenDialog=async()=>file;return file})()`)
      await click('返回首页');await until(`!!document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]')`,'document import');await click('导入文件');await until(`!!document.querySelector(${JSON.stringify(ready)})`,'real '+type+' editor')
      await click('服务');await until(`!!document.querySelector('[aria-label="海豹专属格式"]')`,'native format export')
      const exportedName='v210-'+type+'.'+extension
      await click('导出海豹格式副本');await hostUntil(()=>downloads.has(exportedName),'actual native download '+extension)
      const parsed=await readSeal(extension,fs.readFileSync(path.join(output,exportedName)))
      assert.equal(parsed.类型,type)
      if(type==='word')assert.match(parsed.html,/端到端文字𠮷🦭é/)
      if(type==='table'){assert.equal(parsed.工作表列表[0].单元格.B2.原始值,'=SUM(1,2)');assert.equal(parsed.工作表列表[0].单元格.B2.显示值,'3');assert.equal(parsed.工作表列表[0].单元格.A2.原始值,'表格𠮷🦭')}
      if(type==='ppt'){assert.match(JSON.stringify(parsed.演示文稿),/演示𠮷🦭é/);assert.ok(parsed.资源条目.some(resource=>Buffer.from(resource.数据,'base64').equals(image)))}
      const stored=await evaluate(`(async()=>{const result=await window.electronAPI.listKnownFolder('document');if(!result.成功)throw new Error(result.错误);const file=result.文件.find(item=>item.名称===${JSON.stringify(exportedName)});if(!file)throw new Error('Missing saved native file');window.electronAPI.showOpenDialog=async()=>file.路径;return file.路径})()`)
      await click('返回首页');await until(`!!document.querySelector('.seal-mobile-homebar [aria-label="导入文件"]')`,'native import');await click('导入文件');await until(`!!document.querySelector(${JSON.stringify(ready)})`,'native editor reopen')
      assert.notEqual(stored,filename);checks.push(type+'：真实 Office 导入→服务页导出专属格式→下载字节校验→应用文档空间重新打开，Unicode/公式/图片保留')
    }
    await click('我的');await click('账号与安全');await until(`!!document.querySelector('[aria-label="账号安全"]')`,'account security')
    await click('注销账号');assert.equal(await evaluate(`document.querySelector('[aria-label="永久注销账号"] button.ant-btn-dangerous.ant-btn-primary').disabled`),true)
    fixture.advance(61000);await click('获取注销验证码');await hostUntil(()=>fixture.cloud.db.one("SELECT phone FROM codes WHERE phone=? AND purpose='delete-account'",['13800111888']),'deletion SMS');await input('#seal-delete-code',fixture.codes.get('13800111888'));await input('#seal-delete-confirm','永久注销海豹办公账号')
    await evaluate(`(()=>{document.querySelector('[aria-label="永久注销账号"] input[type="checkbox"]').click();return true})()`)
    await capture('phone-account-deletion-confirmation.png')
    await click('永久注销并删除云数据');await until(`(async()=>{const state=await window.electronAPI.cloud.invoke('status');return !state.数据.account&&!state.数据.deletionPending})()`,'complete deletion')
    assert.equal(fixture.cloud.db.one('SELECT id FROM users WHERE id=?',[owner]),undefined)
    assert.equal(fixture.cloud.db.one('SELECT COUNT(*) n FROM nodes WHERE user_id=?',[owner]).n,0)
    assert.equal(fixture.cloud.db.one('SELECT COUNT(*) n FROM sessions WHERE user_id=?',[owner]).n,0)
    const localStillReadable=await evaluate(`(async()=>{const list=await window.electronAPI.listKnownFolder('document');const file=list.文件.find(item=>item.名称==='v210-word.sealdoc');const raw=await window.electronAPI.readFile(file.路径);return window.electronAPI.office.readSeal('sealdoc',raw.内容)})()`)
    assert.equal(localStillReadable.成功,true);assert.match(localStillReadable.html,/端到端文字𠮷🦭/)
    checks.push('真实注销表单的后果确认、专用验证码和完整确认文字；完成后云文件/会话删除，本机原生文档保留')
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:true,version:require('../../package.json').version,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,output}));app.exit(0)
  }catch(error){const diagnostic=win?await win.webContents.executeJavaScript(`({body:document.body.innerText,alerts:[...document.querySelectorAll('[role="alert"]')].map(node=>node.textContent)})`).catch(()=>null):null;fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:false,checks,errors,error:error.stack,diagnostic},null,2));if(win)await win.capturePage().then(image=>fs.writeFileSync(path.join(output,'failure.png'),image.toPNG())).catch(()=>{});console.error(error);app.exit(1)}
  finally{win?.destroy();server?.closeAllConnections?.();server?.close();await fixture?.cleanup()}
})
