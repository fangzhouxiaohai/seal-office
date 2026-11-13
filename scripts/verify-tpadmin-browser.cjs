// 使用真实 Electron 浏览器和独立回环模拟接口验收管理后台，不访问生产服务。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'server/tpadmin/web/dist')
const output = path.resolve(process.argv[2] || path.join(root, '.upgrade-private/tpadmin-browser'))
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
const checks = [], errors = [], calls = []
const names = [['overview','运行概览'],['users','用户管理'],['template','演示模板审核'],['knowledge','知识内容审核'],['skin','皮肤审核'],['audit','操作记录'],['converter','文档转换'],['releases','版本管理'],['admins','管理员管理'],['roles','角色管理'],['menus','菜单管理']]
const icons = ['dashboard','usergroup','view-module','book','palette','time','file-copy','system-application','user-setting','usergroup','system-application']
const menus = names.map(([key,title],i)=>({id:i+1,parent_id:0,type:'menu',title,name:'Seal'+key,path:'/seal/'+key,component:'seal/'+key,icon:icons[i],permission:'',sort:i,visible:1,status:1}))
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now=Date.now()
const pub={id,kind:'template',title:'测试公开资料',description:'测试说明',category:'分类',status:'pending',created:now}
const overview={overviewCounts:{users:1,used:1000000,pending:1},users:[{id:'test-user',phone:'138****0000',enabled:1,autosave:1,used:1000000,created:now-100000,lastAction:now}],publications:[pub],audit:[{id:1,user_id:'test-user',action:'login',detail:'',time:now}],quota:300000000,smsConfigured:true,runtime:{diskFree:50000000000,memory:100000000,pendingUploads:0},sms:{sign:'测试',template:'测试',lastDay:2}}
const converter={connected:true,config:{enabled:false,concurrency:1,tokenConfigured:false,tokenFingerprint:'',endpoint:'https://seal.example.test/api/office-converter'},engine:{ready:true,version:'隔离测试'},statistics:{active:0,succeeded:2,failed:1,recent:[]}}
let forceExpired=false, released=[], uploaded=[]
const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if (u.pathname.startsWith('/admin-assets/')) {
    const relative=u.pathname.slice('/admin-assets/'.length),file=path.resolve(dist,relative)
    if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
    const ext=path.extname(file),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}
    res.setHeader('Content-Type',types[ext]||'application/octet-stream');fs.createReadStream(file).pipe(res);return
  }
  if(!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/seal-admin/')){res.writeHead(200,{'Content-Type':'text/html'});fs.createReadStream(path.join(dist,'index.html')).pipe(res);return}
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
    const body=Buffer.concat(chunks),method=req.method,token=req.headers.authorization||''
    calls.push({method,path:u.pathname,query:Object.fromEntries(u.searchParams),token,bytes:body.length,body:body.length<10000?body.toString():''})
    if(u.pathname==='/api/v1/admin/login'&&method==='POST'){const value=JSON.parse(body);return respond(res,value.password==='test-password'?200:401,value.password==='test-password'?{token:'isolated-token'}:{error:'管理员账号或密码不正确'})}
    if(forceExpired||token!=='Bearer isolated-token')return respond(res,401,{error:'登录已过期'})
    if(u.pathname==='/api/v1/admin/logout')return respond(res,200,{loggedOut:true})
    if(u.pathname==='/seal-admin/profile')return respond(res,200,{code:0,data:{user:{id:1,username:'admin',nickname:'管理员',is_super:1},roles:[],permissions:['*'],menus}})
    if(u.pathname==='/seal-admin/api/overview')return respond(res,200,overview)
    if(u.pathname==='/seal-admin/api/publications/'+id&&method==='GET')return respond(res,200,{id,title:pub.title,name:'test.dat',kind:'template',text:'测试公开内容'})
    if(u.pathname==='/seal-admin/api/publications/'+id&&method==='PATCH'){pub.status=JSON.parse(body).status;return respond(res,200,{status:pub.status})}
    if(u.pathname==='/api/v1/admin/publications/'+id+'/download'){res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end('隔离原件');return}
    if(u.pathname==='/seal-admin/api/converter'&&method==='GET')return respond(res,200,converter)
    if(u.pathname==='/seal-admin/api/converter'&&method==='PATCH'){Object.assign(converter.config,JSON.parse(body));return respond(res,200,converter)}
    if(u.pathname==='/seal-admin/api/converter/token'){converter.config.tokenConfigured=true;converter.config.tokenFingerprint='testhash';return respond(res,200,{token:'synthetic-token-for-test',config:converter.config})}
    if(u.pathname==='/seal-admin/api/converter/test')return respond(res,200,{passed:true})
    if(u.pathname==='/seal-admin/api/releases'&&method==='GET')return respond(res,200,{items:released,statistics:{all:released.length,published:released.length,withdrawn:0}})
    if(u.pathname==='/api/v1/admin/release-assets'&&method==='POST'){const item={id:'asset-test',platform:u.searchParams.get('platform'),version:u.searchParams.get('version'),filename:u.searchParams.get('filename'),sha256:crypto.createHash('sha256').update(body).digest('hex'),bytes:body.length,url:'https://example.test/file'};uploaded.push(item);return respond(res,200,{item})}
    if(u.pathname==='/seal-admin/api/releases/batch'&&method==='POST'){const payload=JSON.parse(body);released=payload.platforms.map((item,i)=>({...item,id:'release-'+i,version:payload.version,channel:payload.channel,publishedAt:now,withdrawn:false}));return respond(res,200,{items:released})}
    respond(res,404,{error:'隔离测试接口不存在'})
  })
})
app.whenReady().then(async()=>{
 let win
 try {
  assert.ok(fs.existsSync(path.join(dist,'index.html')),'需要先构建后台')
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3&&!message.includes('Failed to load resource'))errors.push(message)})
  const js=code=>win.webContents.executeJavaScript(code), settle=()=>new Promise(r=>setTimeout(r,300))
  const wait=async expression=>{for(let i=0;i<60;i++){if(await js(expression))return;await settle()}throw Error('等待界面超时：'+expression)}
  const click=async(text,selector='button')=>{await js(`(()=>{const all=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.getClientRects().length&&!e.disabled),target=all.find(e=>e.textContent.trim().replace(/\\s+/g,'')===${JSON.stringify(text.replace(/\s+/g,''))});if(!target)throw Error('未找到可操作元素：'+${JSON.stringify(text)}+'；可用：'+all.map(e=>e.textContent.trim()).join('、'));target.click()})()`);await settle()}
  const input=async(selector,value)=>{await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('缺少输入框');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`)}
  const go=async name=>{await click(name,'.t-menu__item');await wait(`document.querySelector('main h1')?.textContent.includes(${JSON.stringify(name)})`)}
  await win.loadURL(`http://127.0.0.1:${server.address().port}/login`)
  await wait(`!!document.querySelector('input[placeholder="请输入账号"]')`)
  await input('input[placeholder="请输入账号"]','admin');await input('input[type="password"]','wrong');await click('登 录');await wait('document.body.textContent.includes("管理员账号或密码不正确")');checks.push('错误登录显示原因')
  await input('input[type="password"]','test-password');await click('登 录');await wait('document.body.textContent.includes("运行概览") && location.pathname.includes("/seal/overview")');checks.push('真实登录与动态路由')
  await wait('document.querySelectorAll(".dashboard .stat-card").length === 4 && !!document.querySelector(".dashboard .shortcut-grid")');checks.push('框架仪表盘卡片与快捷入口')
  assert.equal(await js('document.querySelectorAll(".layout-menu .t-menu__item svg path").length >= 8'),true);checks.push('业务菜单图标随应用打包')
  for(const width of [1440,960,390]){win.setContentSize(width,900);await settle();assert.ok(await js('document.documentElement.scrollWidth<=innerWidth+1'),'概览页横向溢出 '+width);fs.writeFileSync(path.join(output,`概览-${width}.png`),(await win.webContents.capturePage()).toPNG());checks.push('概览视口 '+width)}
  win.setContentSize(1440,900);await settle();await go('用户管理');await wait('document.body.textContent.includes("138****0000")');assert.ok(!await js('document.body.textContent.includes("13800000000")'));checks.push('账号脱敏')
  await go('演示模板审核');await click('查看资料并审核');await wait('document.body.textContent.includes("测试公开内容")');await click('下架');await wait('document.body.textContent.includes("确认下架公开资料")');assert.equal(calls.filter(c=>c.path.endsWith('/publications/'+id)&&c.method==='PATCH').length,0);await click('取消');assert.equal(calls.filter(c=>c.path.endsWith('/publications/'+id)&&c.method==='PATCH').length,0);checks.push('审核下架前确认，取消不修改')
  await js(`document.querySelector('.t-dialog__close')?.click()`);await settle()
  await go('版本管理');await click('发布版本');await wait('document.querySelector(".release-compose")!==null');assert.equal(await js('document.querySelectorAll(".release-platform").length'),7);checks.push('发布弹窗包含七个平台')
  for(const [width,height] of [[1440,900],[960,900],[390,900],[390,700]]){win.setContentSize(width,height);await settle();const bounds=await js(`(()=>{const e=document.querySelector('.t-dialog');const r=e.getBoundingClientRect(),button=[...e.querySelectorAll('button')].find(x=>x.textContent.includes('发布所选平台')).getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,scroll:document.documentElement.scrollWidth,buttonTop:button.top,buttonBottom:button.bottom,height:innerHeight}})()`);assert.ok(bounds.left>=-1&&bounds.right<=bounds.width+1&&bounds.scroll<=bounds.width+1,'发布弹窗横向溢出 '+JSON.stringify(bounds));assert.ok(bounds.buttonTop>=0&&bounds.buttonBottom<=bounds.height,'发布按钮超出视口 '+JSON.stringify(bounds));fs.writeFileSync(path.join(output,`发布-${width}x${height}.png`),(await win.webContents.capturePage()).toPNG());checks.push('发布弹窗视口 '+width+'×'+height)}
  win.setContentSize(1440,900);await settle();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait('!document.querySelector(".release-compose")?.getClientRects().length');assert.ok(await js('document.activeElement?.textContent.includes("发布版本")'),'关闭后应恢复触发按钮焦点');checks.push('发布弹窗 ESC 关闭并恢复焦点');await click('发布版本');await input('#release-version','8.8.8')
  await js(`(()=>{const s=[...document.querySelectorAll('.release-platform')].find(e=>e.textContent.includes('macOS'));s.querySelector('input[type=checkbox]').click()})()`);await settle()
  await js(`(()=>{const e=[...document.querySelectorAll('.release-platform')].find(s=>s.textContent.includes('macOS')).querySelector('input[type=file]');const d=new DataTransfer();d.items.add(new File(['fake-dmg'],'seal-office-8.8.8-macos.dmg',{type:'application/octet-stream'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await click('上传附件');await wait('document.body.textContent.includes("上传完成")');assert.equal(uploaded[0].platform,'macos');assert.ok(calls.some(c=>c.path==='/api/v1/admin/release-assets'&&c.token==='Bearer isolated-token'));assert.ok(await js('document.querySelector("#release-version").disabled'),'上传后版本号应锁定');checks.push('macOS 附件经原认证上传路径并锁定版本')
  await click('发布所选平台');await wait('document.body.textContent.includes("已发布 8.8.8")');const batch=calls.find(c=>c.path==='/seal-admin/api/releases/batch');assert.ok(batch);assert.equal(JSON.parse(batch.body).platforms[0].platform,'macos');checks.push('所选平台批量发布请求')
  await go('文档转换');await click('生成访问令牌');await wait('document.body.textContent.includes("令牌只在生成后显示一次")');await click('确认');await wait('document.body.textContent.includes("保存新的访问令牌")');assert.ok(await js('!!document.querySelector("input[type=password]")'));await click('已保存，关闭');assert.ok(!await js('document.body.textContent.includes("synthetic-token-for-test")'));checks.push('转换令牌确认、遮罩和关闭清除')
  forceExpired=true;await click('刷新状态');await wait('location.pathname==="/login"');assert.equal(await js('sessionStorage.getItem("seal-admin-token")'),null);checks.push('401 清除会话并返回登录')
  assert.deepEqual(errors,[]);const report={passed:true,checks,errors,distIndexSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'index.html'))).digest('hex'),scope:'仅回环模拟接口，无生产访问',screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));win.destroy();server.close();app.exit(0)
 }catch(error){fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));console.error(error);win?.destroy();server.close();app.exit(1)}
})
