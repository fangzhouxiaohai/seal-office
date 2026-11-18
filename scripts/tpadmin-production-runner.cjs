// 仅在服务器上接收标准输入中的预先冻结部署状态；默认不自动运行。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync,execFileSync}=require('node:child_process')
const {deploy,assertLegacyAssets}=require('./tpadmin-production.cjs')
const SITE='/www/wwwroot/seal.xingmasoft.com',EXT='/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com',NGINX='/www/server/nginx/sbin/nginx',SERVICE='seal-admin-php.service'

function validateTargets({id,items}) {
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('部署标识无效')
  const expected={php:[SITE+'/seal-admin-php/current',true],fpm:[SITE+'/seal-admin-php/fpm.conf',false],unit:['/etc/systemd/system/'+SERVICE,false],nginx:[EXT+'/30-tpadmin.conf',false],admin:[SITE+'/admin',true]}
  for(const [key,[active,directory]] of Object.entries(expected)){const item=items?.[key];if(!item||item.active!==active||item.directory!==directory)throw Error('生产目标不匹配：'+key);if(item.candidate!==active+'.candidate-'+id)throw Error('候选路径不匹配：'+key)}
  return true
}

function parseServiceState(output) {
  const entries=Object.fromEntries(output.trim().split(/\r?\n/).filter(Boolean).map(row=>{const index=row.indexOf('=');return [row.slice(0,index),row.slice(index+1)]}))
  if(entries.LoadState==='not-found'&&entries.ActiveState==='inactive'&&!entries.UnitFileState)return {active:false,enabled:false}
  if(entries.LoadState!=='loaded'||!['active','inactive'].includes(entries.ActiveState)||!['enabled','disabled'].includes(entries.UnitFileState))throw Error('服务状态不可安全恢复')
  return {active:entries.ActiveState==='active',enabled:entries.UnitFileState==='enabled'}
}

function assetList(directory) {
  if(!fs.existsSync(directory))return []
  const result=[]
  function walk(dir,prefix=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const relative=prefix+entry.name,full=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('静态资源不允许符号链接');if(entry.isDirectory())walk(full,relative+'/');else if(entry.isFile()){if(!/^[A-Za-z0-9._/-]+$/.test(relative))throw Error('静态资源路径无效');result.push({path:relative,sha256:crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')})}else throw Error('静态资源类型无效')}}
  walk(directory);return result
}

function makeOps(cfg,assets,legacy,indexSha) {
  const command=(file,args)=>execFileSync(file,args,{encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']})
  const probe=(payload,timeout)=>{const result=spawnSync(process.execPath,[path.join(__dirname,'tpadmin-deploy-probe.cjs')],{input:JSON.stringify(payload),encoding:'utf8',timeout,windowsHide:true});if(result.status!==0)throw Error('部署探针未通过：'+String(result.stderr||'进程异常').slice(0,400));let report;try{report=JSON.parse(result.stdout)}catch{throw Error('部署探针响应无效')};if(!report.passed)throw Error('部署探针未通过')}
  return {
    state:()=>{const result=spawnSync('systemctl',['show',SERVICE,'--property=LoadState','--property=ActiveState','--property=UnitFileState'],{encoding:'utf8',timeout:10000});return parseServiceState(result.stdout||'')},
    reloadUnits:()=>command('systemctl',['daemon-reload']),start:()=>command('systemctl',['start',SERVICE]),stop:()=>command('systemctl',['stop',SERVICE]),enable:()=>command('systemctl',['enable',SERVICE]),disable:()=>command('systemctl',['disable',SERVICE]),
    nginxTest:()=>command(NGINX,['-t']),nginxReload:()=>command(NGINX,['-s','reload']),
    privateProbe:()=>probe({mode:'private',socket:'/run/seal-admin-php/fpm.sock',entry:SITE+'/seal-admin-php/current/public/index.php',token:cfg.token},90000),
    publicProbe:()=>probe({mode:'public',base:'https://seal.xingmasoft.com',token:cfg.token,indexSha,assets,legacy,version:cfg.version},600000),
  }
}

function run(cfg) {
  validateTargets(cfg)
  if(!/^[A-Za-z0-9_-]{20,}$/.test(cfg.token||''))throw Error('缺少有效的管理员临时会话')
  const oldAssets=path.join(cfg.items.admin.active,'assets'),newAssets=path.join(cfg.items.admin.candidate,'assets')
  const count=assertLegacyAssets(oldAssets,newAssets),legacy=assetList(oldAssets),assets=assetList(cfg.items.admin.candidate).filter(item=>item.path!=='index.html'&&item.path!=='build-manifest.json')
  if(count!==legacy.length||!assets.length)throw Error('静态资源清单不完整')
  const indexSha=crypto.createHash('sha256').update(fs.readFileSync(path.join(cfg.items.admin.candidate,'index.html'))).digest('hex')
  const result=deploy({items:cfg.items,id:cfg.id,baseline:cfg.baseline,frozen:cfg.frozen,ops:makeOps(cfg,assets,legacy,indexSha)})
  return {passed:result.passed,oldResources:count,newResources:assets.length,backups:result.records.filter(record=>record.hadOriginal).map(record=>record.previous)}
}

if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',v=>input+=v);process.stdin.on('end',()=>{try{console.log(JSON.stringify(run(JSON.parse(input))))}catch(error){console.error('管理后台部署失败：'+error.message);process.exitCode=1}})}
module.exports={validateTargets,parseServiceState,assetList}
