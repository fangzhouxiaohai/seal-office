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
let forceExpired=false, released=[], uploaded=[], readOnly=false; const admins=[{id:'admin',username:'admin',enabled:true,roleIds:[],roleNames:['超级管理员'],created:null,builtin:true}], accessRoles=[], accessMenus=[{key:'admins',title:'管理员管理',path:'/seal/admins',visible:true,enabled:true,sort:0,readPermission:'admins:read'},{key:'skin',title:'皮肤审核',path:'/seal/skin',visible:true,enabled:true,sort:1,readPermission:'skin:read'}]
const respond=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if (u.pathname.startsWith('/admin-assets/')) {
    const relative=u.pathname.slice('/admin-assets/'.length),file=path.resolve(dist,relative)
    if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
    const ext=path.extname(file),types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}
    res.setHeader('Content-Type',types[ext]||'application/octet-stream');fs.createReadStream(file).pipe(res);return
  }
  if(!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/seal-admin/')){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"});fs.createReadStream(path.join(dist,'index.html')).pipe(res);return}
  const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{
    const body=Buffer.concat(chunks),method=req.method,token=req.headers.authorization||''
    calls.push({method,path:u.pathname,query:Object.fromEntries(u.searchParams),token,bytes:body.length,body:body.length<10000?body.toString():''})
    if(u.pathname==='/api/v1/admin/login'&&method==='POST'){const value=JSON.parse(body);return respond(res,value.password==='test-password'?200:401,value.password==='test-password'?{token:'isolated-token'}:{error:'管理员账号或密码不正确'})}
    if(forceExpired||token!=='Bearer isolated-token')return respond(res,401,{error:'登录已过期'})
    if(u.pathname==='/api/v1/admin/logout')return respond(res,200,{loggedOut:true})
    if(u.pathname==='/seal-admin/profile')return respond(res,200,{code:0,data:{user:{id:1,username:'admin',nickname:'管理员',is_super:readOnly?0:1},roles:[],permissions:readOnly?['admins:read','roles:read','menus:read']:['*'],menus:readOnly?menus.filter(m=>['admins','roles','menus'].some(k=>m.path==='/seal/'+k)):menus}})
    if(u.pathname==='/seal-admin/api/access/admins'&&method==='GET')return respond(res,200,{items:admins});
    if(u.pathname==='/seal-admin/api/access/roles'&&method==='GET')return respond(res,200,{items:accessRoles});
    if(u.pathname==='/seal-admin/api/access/menus'&&method==='GET')return respond(res,200,{items:accessMenus});
    if(u.pathname==='/seal-admin/api/access/menu-candidates'&&method==='GET')return respond(res,200,{items:accessMenus.filter(m=>!m.enabled)});
    if(u.pathname==='/seal-admin/api/access/admins'&&method==='POST'){const data=JSON.parse(body);const item={id:'11111111-1111-1111-1111-111111111111',username:data.username,enabled:data.enabled,roleIds:data.roleIds,roleNames:[],created:now};admins.push(item);return respond(res,200,{item})}
    if(u.pathname==='/seal-admin/api/access/roles'&&method==='POST'){const data=JSON.parse(body);const item={id:'22222222-2222-2222-2222-222222222222',name:data.name,permissions:data.permissions,created:now};accessRoles.push(item);return respond(res,200,{item})}
    if(u.pathname==='/seal-admin/api/access/menus'&&method==='POST'){const data=JSON.parse(body),item=accessMenus.find(m=>m.key===data.key&&!m.enabled);if(!item)return respond(res,400,{error:'不可添加'});item.enabled=true;return respond(res,200,{item})}
    if(u.pathname.startsWith('/seal-admin/api/access/')){const parts=u.pathname.split('/'),kind=parts[4],id=parts[5],collection=kind==='admins'?admins:kind==='roles'?accessRoles:accessMenus,item=collection.find(x=>(x.id||x.key)===id);if(!item)return respond(res,404,{error:'不存在'});if(method==='PATCH'){Object.assign(item,JSON.parse(body));return respond(res,200,{item})}if(method==='DELETE'){collection.splice(collection.indexOf(item),1);return respond(res,200,{deleted:true})}}
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
  await win.loadURL(`http://127.0.0.1:${server.address().port}/login`);await wait(`!!document.querySelector('input[placeholder="请输入账号"]')`);await input('input[placeholder="请输入账号"]','admin');await input('input[type="password"]','test-password');await click('登 录');await wait('location.pathname.includes("/seal/overview")')
  await go('管理员管理');await wait(`document.querySelector('tbody')?.textContent.includes('内置超管')`);assert.ok(await js(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('内置超管'))?.textContent.includes('只读')`));assert.ok(!await js(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('内置超管'))?.querySelector('button')`));checks.push('内置超管只读且无编辑删除入口');assert.ok(await js(`[...document.querySelectorAll('.t-menu__item')].filter(x=>['管理员管理','角色管理','菜单管理'].some(s=>x.textContent.includes(s))).every(x=>!!x.querySelector('svg'))`));checks.push('权限菜单本地图标与内容安全策略');await click('新增管理员');await input('input[placeholder="请输入登录账号"]','operator');await input('input[placeholder="请输入密码"]','a-long-test-password');await click('保存');await wait('document.body.textContent.includes("operator")');assert.equal(admins.length,2);assert.equal(admins[1].enabled,true);assert.ok(!('password' in admins[1]));checks.push('新增管理员与密码不回显')
  await click('编辑');await wait('document.body.textContent.includes("重置密码")');await click('保存');await wait('!document.querySelector(".access-form")?.getClientRects().length');const patch=calls.find(c=>c.method==='PATCH'&&c.path.includes('/access/admins/'));assert.ok(patch);assert.ok(!('password' in JSON.parse(patch.body)));checks.push('编辑管理员留空密码不提交')
  await go('角色管理');await click('新增角色');await input('input[placeholder="请输入角色名称"]','审核员');await js(`(()=>{const x=[...document.querySelectorAll('.t-checkbox')].find(x=>x.textContent.includes('查看演示模板'));x.querySelector('input').click()})()`);await click('保存');await wait('document.body.textContent.includes("审核员")');assert.deepEqual(accessRoles[0].permissions,['template:read']);checks.push('新增角色真实授权请求')
  await go('菜单管理');await wait('[...document.querySelectorAll("tbody tr")].some(x=>x.textContent.includes("皮肤审核"))');await js(`(()=>{const r=[...document.querySelectorAll('tbody tr')].find(x=>x.textContent.includes('管理员管理'));r.querySelector('button').click()})()`);await wait('document.body.textContent.includes("启用菜单")');assert.ok(await js(`[...document.querySelectorAll('.access-form .t-switch')].every(x=>x.classList.contains('t-is-disabled'))`));checks.push('系统菜单停用保护');await js(`document.querySelector('.t-dialog__close')?.click()`);await settle()
  await js(`(()=>{const r=[...document.querySelectorAll('tbody tr')].find(x=>x.textContent.includes('皮肤审核'));r.querySelector('button').click()})()`);await wait('document.body.textContent.includes("停用后对应业务接口")');await js(`document.querySelectorAll('.access-form .t-switch')[1].click()`);await click('保存');await wait('!document.querySelector(".access-form")?.getClientRects().length');assert.equal(accessMenus.find(x=>x.key==='skin').enabled,false);checks.push('菜单停用请求')
  await click('新增菜单');await wait('document.body.textContent.includes("选择业务页面")');checks.push('新增菜单仅展示已注册候选');await js(`document.querySelector('.t-dialog__close')?.click()`);await settle()
  readOnly=true;await js(`window.dispatchEvent(new Event('seal-permissions-changed'))`);await wait(`![...document.querySelectorAll('button')].some(x=>x.getClientRects().length&&x.textContent.includes('新增菜单'))`);assert.ok(await js(`document.body.textContent.includes('只读')`));checks.push('实际权限变化后刷新只读菜单')
  assert.deepEqual(errors,[]);const report={passed:true,checks,errors,distIndexSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'index.html'))).digest('hex'),scope:'仅回环模拟接口，无生产访问',screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));win.destroy();server.close();app.exit(0)
 }catch(error){fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));console.error(error);win?.destroy();server.close();app.exit(1)}
})
