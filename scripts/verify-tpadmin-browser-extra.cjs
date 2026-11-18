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
const menus = names.map(([key,title],i)=>({id:i+1,parent_id:0,type:'menu',title,name:'Seal'+key,path:'/seal/'+key,component:'seal/'+key,icon:'',permission:'',sort:i,visible:1,status:1}))
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now=Date.now()
const pub={id,kind:'template',title:'测试公开资料',description:'测试说明',category:'分类',status:'pending',created:now}
const overview={overviewCounts:{users:1,used:1000000,pending:1},users:[{id:'test-user',phone:'138****0000',enabled:1,autosave:1,used:1000000,created:now-100000,lastAction:now}],publications:[pub],audit:[{id:1,user_id:'test-user',action:'login',detail:'',time:now}],quota:300000000,smsConfigured:true,runtime:{diskFree:50000000000,memory:100000000,pendingUploads:0},sms:{sign:'测试',template:'测试',lastDay:2}}
const converter={connected:true,config:{enabled:false,concurrency:1,tokenConfigured:false,tokenFingerprint:'',endpoint:'https://seal.example.test/api/office-converter'},engine:{ready:true,version:'隔离测试'},statistics:{active:0,succeeded:2,failed:1,recent:[]}}
let forceExpired=false, released=[{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',platform:'windows',version:'8.8.8',channel:'stable',notes:'测试',publishedAt:now,withdrawn:false,mandatory:false}], uploaded=[], uploadMode='normal'
const pubs=[pub,{id:'cccccccc-cccc-cccc-cccc-cccccccccccc',kind:'knowledge',title:'知识测试',category:'知识',status:'pending'},{id:'dddddddd-dddd-dddd-dddd-dddddddddddd',kind:'skin',title:'皮肤测试',category:'皮肤',status:'pending'}];overview.publications=pubs;overview.users=Array.from({length:25},(_,i)=>({id:'user-'+i,phone:'138****'+String(i).padStart(4,'0'),enabled:1,autosave:1,used:1000,created:now,lastAction:now-i}));
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
    if(u.pathname.startsWith('/seal-admin/api/publications/')){const item=pubs.find(p=>u.pathname.endsWith('/'+p.id));if(!item)return respond(res,404,{error:'不存在'});if(method==='GET')return respond(res,200,{id:item.id,title:item.title,name:'test.dat',kind:item.kind,text:'测试公开内容'});if(method==='PATCH'){item.status=JSON.parse(body).status;return respond(res,200,{status:item.status})}}
    if(u.pathname==='/api/v1/admin/publications/'+id+'/download'){res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end('隔离原件');return}
    if(u.pathname==='/seal-admin/api/converter'&&method==='GET')return respond(res,200,converter)
    if(u.pathname==='/seal-admin/api/converter'&&method==='PATCH'){Object.assign(converter.config,JSON.parse(body));return respond(res,200,converter)}
    if(u.pathname==='/seal-admin/api/converter/token'){converter.config.tokenConfigured=true;converter.config.tokenFingerprint='testhash';return respond(res,200,{token:'synthetic-token-for-test',config:converter.config})}
    if(u.pathname==='/seal-admin/api/converter/test')return respond(res,200,{passed:true})
    if(u.pathname==='/seal-admin/api/releases'&&method==='GET')return respond(res,200,{items:released,statistics:{all:released.length,published:released.length,withdrawn:0}})
    if(u.pathname==='/api/v1/admin/release-assets'&&method==='POST'){if(uploadMode==='hang')return;if(uploadMode==='disconnect'){res.destroy();return;}const item={id:'asset-test',platform:u.searchParams.get('platform'),version:u.searchParams.get('version'),filename:u.searchParams.get('filename'),sha256:crypto.createHash('sha256').update(body).digest('hex'),bytes:body.length,url:'https://example.test/file'};uploaded.push(item);return respond(res,200,{item})}
    if(u.pathname.startsWith('/seal-admin/api/releases/')&&method==='PATCH'){const item=released.find(p=>u.pathname.endsWith('/'+p.id));if(!item)return respond(res,404,{error:'不存在'});Object.assign(item,JSON.parse(body));return respond(res,200,{item})}
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
  await input('input[placeholder="请输入账号"]','admin'); await input('input[type="password"]','test-password'); await click('登 录'); await wait('location.pathname.includes("/seal/overview")')
  await go('用户管理'); await wait('document.body.textContent.includes("user-0")'); assert.equal(await js('document.querySelectorAll("tbody tr").length'),20); await click('2','.t-pagination__number'); await wait('document.body.textContent.includes("user-24")'); checks.push('账号列表第二页显示剩余数据')
  await input('input[placeholder="搜索号码片段或账号标识"]','user-3'); await wait('document.body.textContent.includes("user-3")'); assert.ok(!await js('document.body.textContent.includes("user-2")')); checks.push('账号搜索筛选')
  for(const [name,decision,itemId] of [['知识内容审核','通过并公开','cccccccc-cccc-cccc-cccc-cccccccccccc'],['皮肤审核','拒绝发布','dddddddd-dddd-dddd-dddd-dddddddddddd']]) { await go(name); await click('查看资料并审核'); await wait('document.body.textContent.includes("测试公开内容")'); await click(decision); await wait(`document.body.textContent.includes(${JSON.stringify(decision==='通过并公开'?'已公开':'已拒绝')})`); assert.ok(calls.some(c=>c.path.endsWith(itemId)&&c.method==='PATCH')); checks.push(name+'实际审核') }
  await go('版本管理'); await click('管理平台'); await click('设为强制'); await wait('document.body.textContent.includes("确认设为强制更新")'); let n=calls.filter(c=>c.method==='PATCH').length; await click('取消'); assert.equal(calls.filter(c=>c.method==='PATCH').length,n); await click('设为强制'); await click('确认'); await wait('document.body.textContent.includes("已设为强制更新")'); assert.ok(released[0].mandatory); checks.push('版本强制更新确认和取消')
  await click('下架'); await wait('document.body.textContent.includes("重新上架")'); assert.equal(released[0].withdrawn,true); await click('重新上架'); await wait('document.body.textContent.includes("下架")'); assert.equal(released[0].withdrawn,false); checks.push('版本上下架')
  await js(`document.querySelector('.t-dialog__close')?.click()`); await settle(); await click('发布版本'); await input('#release-version','8.8.9'); await js(`(()=>{const s=[...document.querySelectorAll('.release-platform')].find(e=>e.textContent.includes('macOS'));s.querySelector('input[type=checkbox]').click()})()`); await settle(); await js(`(()=>{const s=[...document.querySelectorAll('.release-platform')].find(e=>e.textContent.includes('macOS'));const e=s.querySelector('input[type=file]'),d=new DataTransfer();d.items.add(new File(['fake-dmg'],'seal-office-8.8.9-macos.dmg'));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  uploadMode='hang'; await click('上传附件'); await wait('document.body.textContent.includes("取消上传")'); await click('取消上传'); await wait('document.body.textContent.includes("安装包上传已取消")'); checks.push('上传中取消')
  await click('知道了'); uploadMode='disconnect'; await click('上传附件'); await wait('document.body.textContent.includes("上传连接中断")'); checks.push('上传断连')
  await click('知道了'); uploadMode='hang'; await js(`(()=>{const original=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(...args){this.timeout=100;return original.apply(this,args)}})()`); await click('上传附件'); await wait('document.body.textContent.includes("上传超时")'); checks.push('上传超时')
  assert.deepEqual(errors,[]);const report={passed:true,checks,errors,distIndexSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'index.html'))).digest('hex'),scope:'仅回环模拟接口，无生产访问',screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));win.destroy();server.close();app.exit(0)
 }catch(error){fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));console.error(error);win?.destroy();server.close();app.exit(1)}
})
