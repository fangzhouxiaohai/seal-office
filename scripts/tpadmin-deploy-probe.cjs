// 部署验证只读取站点和更新接口；管理员令牌从标准输入接收，不写入参数或日志。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process')
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const expectedMenus=['overview','users','template','knowledge','skin','audit','converter','releases','admins','roles','menus'].map(key=>'/seal/'+key)
const validProfile=value=>value?.code===0&&value.data?.user?.username==='admin'&&value.data?.user?.is_super===1&&Array.isArray(value.data.menus)&&value.data.menus.length===expectedMenus.length&&expectedMenus.every(p=>value.data.menus.some(item=>item.path===p))

async function privateProbe({socket,entry,token,nginx='/www/server/nginx/sbin/nginx'}) {
  if(!socket?.startsWith('/')||!entry?.startsWith('/')||!token)throw Error('私有探针参数不完整')
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seal-tpadmin-probe-')),publicSocket=dir+'/nginx.sock'
  let child,diagnostic=''
  try {
    fs.mkdirSync(dir+'/logs')
    const lua='/www/server/nginx/lib/lua',luaPath=fs.existsSync(lua+'/resty/core.lua')?`lua_package_path "${lua}/?.lua;;";\n`:''
    const config=`daemon off;\nmaster_process off;\npid ${dir}/nginx.pid;\nerror_log ${dir}/nginx.log;\nevents {}\nhttp {\n${luaPath}access_log off;\nclient_body_temp_path ${dir}/body;\nserver {\nlisten unix:${publicSocket};\nlocation ^~ /seal-admin/ {\ninclude /www/server/nginx/conf/fastcgi_params;\nfastcgi_param SCRIPT_FILENAME ${entry};\nfastcgi_param SCRIPT_NAME /index.php;\nfastcgi_param HTTP_AUTHORIZATION $http_authorization;\nfastcgi_pass unix:${socket};\nfastcgi_cache off;\nclient_max_body_size 2m;\nfastcgi_read_timeout 210s;\n}\n}\n}\n`
    fs.writeFileSync(dir+'/nginx.conf',config)
    const syntax=spawnSync(nginx,['-t','-p',dir+'/','-c',dir+'/nginx.conf'],{encoding:'utf8'});if(syntax.status!==0)throw Error('私有 Nginx 配置语法错误')
    child=spawn(nginx,['-p',dir+'/','-c',dir+'/nginx.conf'],{stdio:['ignore','pipe','pipe']});child.stderr.on('data',v=>{diagnostic+=v})
    for(let i=0;i<250&&!fs.existsSync(publicSocket);i++){if(child.exitCode!==null)throw Error('私有 Nginx 启动失败');await sleep(20)}
    if(!fs.existsSync(publicSocket))throw Error('私有 Nginx 套接字不可用')
    const request=authorization=>new Promise((resolve,reject)=>{const req=http.request({socketPath:publicSocket,path:'/seal-admin/profile',headers:authorization?{Authorization:'Bearer '+authorization}:{}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}))});req.on('error',reject);req.setTimeout(10000,()=>req.destroy(Error('私有请求超时')));req.end()})
    const anonymous=await request('');if(anonymous.status!==401)throw Error('私有探针：未授权请求未拒绝')
    const authorized=await request(token);let value;try{value=JSON.parse(authorized.body)}catch{throw Error('私有探针：菜单响应不是 JSON')}
    if(authorized.status!==200||!validProfile(value))throw Error('私有探针：管理员菜单验证失败')
    return {passed:true,checks:2}
  } finally {
    if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');for(let i=0;i<250&&child.exitCode===null&&child.signalCode===null;i++)await sleep(20);if(child.exitCode===null&&child.signalCode===null)throw Error('私有探针未退出，保留隔离目录')}
    if(fs.realpathSync(dir)!==dir||!path.basename(dir).startsWith('seal-tpadmin-probe-'))throw Error('私有探针目录校验失败')
    fs.rmSync(dir,{recursive:true,force:true})
  }
}

async function publicProbe({base,token,indexSha,assets,legacy,version}) {
  if(base!=='https://seal.xingmasoft.com'||!token||!/^[a-f0-9]{64}$/.test(indexSha)||!Array.isArray(assets)||!assets.length||!Array.isArray(legacy)||!/^\d+\.\d+\.\d+/.test(version))throw Error('公网探针参数无效')
  let checks=0
  async function get(route,authorization=false) {
    const response=await fetch(base+route,{redirect:'error',headers:authorization?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(30000)})
    const length=Number(response.headers.get('content-length')||0);if(length>32*1024*1024)throw Error('探针资源过大')
    const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>32*1024*1024)throw Error('探针资源过大')
    return {status:response.status,bytes}
  }
  for(const route of ['/','/seal/overview']){const r=await get(route);if(r.status!==200||hash(r.bytes)!==indexSha)throw Error('后台入口或 history 路由不一致');checks++}
  for(const [prefix,files] of [['/admin-assets/',assets],['/assets/',legacy]])for(const item of files){if(!/^[A-Za-z0-9._/-]+$/.test(item.path)||item.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('资源清单路径无效');const r=await get(prefix+item.path);if(r.status!==200||hash(r.bytes)!==item.sha256)throw Error('后台资源内容不一致：'+prefix+item.path);checks++}
  for(const route of ['/office/','/share/','/api/v1/capabilities']){const r=await get(route);if(r.status!==200)throw Error('既有站点接口不可访问：'+route);checks++}
  const update=await get('/api/v1/updates/latest?platform=windows&version='+encodeURIComponent(version));let updateData;try{updateData=JSON.parse(update.bytes.toString())}catch{throw Error('更新接口不是 JSON')};if(update.status!==200||typeof updateData.hasUpdate!=='boolean')throw Error('客户端更新接口无效');checks++
  const anonymous=await get('/seal-admin/profile');if(anonymous.status!==401)throw Error('公网未授权请求未拒绝');checks++
  const profile=await get('/seal-admin/profile',true);let value;try{value=JSON.parse(profile.bytes.toString())}catch{throw Error('公网菜单响应不是 JSON')};if(profile.status!==200||!validProfile(value))throw Error('公网菜单验证失败');checks++
  const overview=await get('/seal-admin/api/overview',true);if(overview.status!==200)throw Error('公网运行概览无法读取');checks++
  return {passed:true,checks}
}

if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',async()=>{try{const cfg=JSON.parse(input),result=cfg.mode==='private'?await privateProbe(cfg):cfg.mode==='public'?await publicProbe(cfg):null;if(!result)throw Error('探针模式无效');console.log(JSON.stringify(result))}catch(error){console.error('部署探针失败：'+error.message);process.exitCode=1}})}
module.exports={privateProbe,publicProbe}
