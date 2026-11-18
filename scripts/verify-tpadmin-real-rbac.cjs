// 使用真实 Electron 浏览器和独立回环模拟接口验收管理后台，不访问生产服务。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'server/tpadmin/web/dist');const {spawn}=require('node:child_process'),net=require('node:net'),os=require('node:os');let nodeServer,phpServer,phpPort;const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-rbac-browser-'));const env={...process.env,SEAL_DATA_DIR:testDir,PORT:'8096',SEAL_ADMIN_PASSWORD_HASH:crypto.scryptSync('isolated-password','seal-admin-v1',32).toString('hex')};
const output = path.resolve(process.argv[2] || path.join(root, '.upgrade-private/tpadmin-browser'))
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'profile'))
app.disableHardwareAcceleration()
const checks = [], errors = [], calls = []
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname.startsWith('/admin-assets/')){const file=path.resolve(dist,u.pathname.slice('/admin-assets/'.length));if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}const type={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};res.setHeader('Content-Type',type[path.extname(file)]||'application/octet-stream');return fs.createReadStream(file).pipe(res)}
 if(!u.pathname.startsWith('/api/')&&!u.pathname.startsWith('/seal-admin/')){res.writeHead(200,{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'"});return fs.createReadStream(path.join(dist,'index.html')).pipe(res)}
 const isNode=u.pathname.startsWith('/api/'), options={hostname:'127.0.0.1',port:isNode?8096:phpPort,path:isNode?req.url.slice(4):req.url,method:req.method,headers:req.headers};const upstream=http.request(options,response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end('隔离服务不可用')});req.pipe(upstream)
});
async function startServices(){await new Promise((resolve,reject)=>{const p=net.createServer().once('error',reject).listen(8096,'127.0.0.1',()=>p.close(resolve))});phpPort=await new Promise((resolve,reject)=>{const p=net.createServer().once('error',reject).listen(0,'127.0.0.1',()=>{const n=p.address().port;p.close(()=>resolve(n))})});nodeServer=spawn('node',['server/index.cjs'],{cwd:root,env,windowsHide:true,stdio:'ignore'});phpServer=spawn('php',['-S',`127.0.0.1:${phpPort}`,'server/tpadmin/server/public/index.php'],{cwd:root,windowsHide:true,stdio:'ignore'});for(let i=0;i<100;i++){try{const [a,b]=await Promise.all([fetch('http://127.0.0.1:8096/v1/capabilities'),fetch(`http://127.0.0.1:${phpPort}/seal-admin/profile`)]);if(a.status===200&&b.status===401)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('隔离 Node/PHP 服务启动失败')}
async function stopServices(){
 const children=[nodeServer,phpServer].filter(Boolean)
 await Promise.all(children.map(child=>new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();const timeout=setTimeout(resolve,5000);child.once('exit',()=>{clearTimeout(timeout);resolve()});child.kill()})))
 const absolute=fs.realpathSync(testDir),parent=fs.realpathSync(os.tmpdir())
 assert.equal(path.dirname(absolute),parent);assert.ok(path.basename(absolute).startsWith('seal-rbac-browser-'))
 fs.rmSync(absolute,{recursive:true,force:true})
}
app.whenReady().then(async()=>{
 let win
 try {
  assert.ok(fs.existsSync(path.join(dist,'index.html')),'需要先构建后台')
  await startServices();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  win=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  win.webContents.on('console-message',(_e,level,message)=>{if(level>=3&&!message.includes('Failed to load resource'))errors.push(message)})
  const js=code=>win.webContents.executeJavaScript(code), settle=()=>new Promise(r=>setTimeout(r,300))
  const wait=async expression=>{for(let i=0;i<60;i++){if(await js(expression))return;await settle()}throw Error('等待界面超时：'+expression)}
  const click=async(text,selector='button')=>{await js(`(()=>{const all=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.getClientRects().length&&!e.disabled),target=all.find(e=>e.textContent.trim().replace(/\\s+/g,'')===${JSON.stringify(text.replace(/\s+/g,''))});if(!target)throw Error('未找到可操作元素：'+${JSON.stringify(text)}+'；可用：'+all.map(e=>e.textContent.trim()).join('、'));target.click()})()`);await settle()}
  const input=async(selector,value)=>{await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('缺少输入框');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`)}
  const go=async name=>{await click(name,'.t-menu__item');await wait(`document.querySelector('main h1')?.textContent.includes(${JSON.stringify(name)})`)}
  await win.loadURL(`http://127.0.0.1:${server.address().port}/login`);await wait(`!!document.querySelector('input[placeholder="请输入账号"]')`);await input('input[placeholder="请输入账号"]','admin');await input('input[type="password"]','isolated-password');await click('登 录');await wait('location.pathname.includes("/seal/overview")');checks.push('真实 Node/PHP 管理员登录与菜单')
  await go('管理员管理');await wait(`document.querySelector('tbody')?.textContent.includes('内置超管')`);assert.ok(!await js(`[...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('内置超管'))?.querySelector('button')`));checks.push('真实后端内置管理员只读')
  await go('角色管理');await click('新增角色');await input('input[placeholder="请输入角色名称"]','隔离测试审核角色');await js(`(()=>{const x=[...document.querySelectorAll('.t-checkbox')].find(x=>x.textContent.includes('查看演示模板'));x.querySelector('input').click()})()`);await click('保存');await wait('document.body.textContent.includes("隔离测试审核角色")');checks.push('真实接口新增受限角色')
  await go('管理员管理');await click('新增管理员');await input('input[placeholder="请输入登录账号"]','isolated_reviewer');await input('input[placeholder="请输入密码"]','IsolatedPassword123');await js(`document.querySelector('input[placeholder="请选择角色"]').click()`);await wait('document.body.textContent.includes("隔离测试审核角色")');await js(`(()=>{const x=[...document.querySelectorAll('.t-select-option')].find(x=>x.textContent.includes('隔离测试审核角色'));if(!x)throw Error('未找到角色选项');x.click()})()`);await click('保存');await wait('document.body.textContent.includes("isolated_reviewer")');checks.push('真实接口新增管理员并分配角色')
  await js('sessionStorage.clear()');await win.loadURL(`http://127.0.0.1:${server.address().port}/login`);await wait(`!!document.querySelector('input[placeholder="请输入账号"]')`);await input('input[placeholder="请输入账号"]','isolated_reviewer');await input('input[type="password"]','IsolatedPassword123');await click('登 录');await wait('location.pathname.includes("/seal/template")');assert.ok(!await js(`document.querySelector('.t-menu')?.textContent.includes('管理员管理')`));const status=await js(`fetch('/seal-admin/api/access/admins',{headers:{Authorization:'Bearer '+sessionStorage.getItem('seal-admin-token')}}).then(x=>x.status)`);assert.equal(status,403);checks.push('受限管理员登录只显示授权菜单且后端拒绝越权')
  assert.deepEqual(errors,[]);const report={passed:true,checks,errors,distIndexSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'index.html'))).digest('hex'),scope:'仅回环模拟接口，无生产访问',screenshots:fs.readdirSync(output).filter(n=>n.endsWith('.png'))};fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));win.destroy();server.close();await stopServices();app.exit(0)
 }catch(error){fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({passed:false,checks,errors,error:error.stack},null,2));console.error(error);win?.destroy();server.close();await stopServices();app.exit(1)}
})
