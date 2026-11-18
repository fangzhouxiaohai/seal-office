"""在服务器私有 Unix 套接字上验证独立 Nginx、PHP-FPM 和模拟上游。

不连接或修改生产业务服务；唯一上游地址会替换为当前隔离回环端口。
依赖现有部署连接配置及已固定的 SSH 主机密钥。所有候选文件和套接字
均放在新建的 /tmp/seal-tpadmin-fpm-*，验证结束后仅清理本次目录。
"""
import importlib.util
import hashlib
import json
import pathlib
import sys
import uuid
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
spec = importlib.util.spec_from_file_location('seal_deploy_web', ROOT / 'scripts/deploy-web.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

REMOTE = r'''
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),crypto=require('crypto'),{spawn,spawnSync}=require('child_process');
const dir=process.argv[2];
if(!/^\/tmp\/seal-tpadmin-fpm-[a-f0-9]{32}$/.test(dir)||fs.realpathSync(dir)!==dir)throw Error('隔离目录无效');
const fpm='/www/server/php/82/sbin/php-fpm',nginx='/www/server/nginx/sbin/nginx';
const fpmSocket=dir+'/fpm.sock',nginxSocket=dir+'/nginx.sock',checks=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let up,php,web,revoked=false,diagnostic='';
const start=(name,args)=>{const p=spawn(name,args,{stdio:['ignore','pipe','pipe'],env:{...process.env}});for(const stream of [p.stdout,p.stderr])stream.on('data',s=>{diagnostic+=s});return p};
async function waitSocket(p,s){for(let i=0;i<250;i++){if(p.exitCode!==null)throw Error('隔离进程退出：'+diagnostic.slice(-1200));if(fs.existsSync(s))return;await sleep(20)}throw Error('隔离套接字未创建：'+diagnostic.slice(-1200))}
async function stop(p){if(!p||p.exitCode!==null||p.signalCode!==null)return;p.kill('SIGTERM');for(let i=0;i<250&&p.exitCode===null&&p.signalCode===null;i++)await sleep(20);if(p.exitCode===null&&p.signalCode===null)throw Error('隔离进程未退出，保留目录供检查')}
function req(method,uri,token,body,chunked=false){return new Promise((resolve,reject)=>{const headers=token?{Authorization:'Bearer '+token}:{};if(body&&!chunked)headers['Content-Length']=body.length;const q=http.request({socketPath:nginxSocket,path:uri,method,headers},r=>{const chunks=[];r.on('data',b=>chunks.push(b));r.on('end',()=>resolve({status:r.statusCode,body:Buffer.concat(chunks).toString()}));r.on('error',reject)});q.on('error',reject);q.setTimeout(10000,()=>q.destroy(Error('隔离请求超时')));if(body){if(chunked){for(let n=0;n<body.length;n+=65536)q.write(body.subarray(n,n+65536));q.end()}else q.end(body)}else q.end()})}
(async()=>{
 try{
  up=http.createServer((req,res)=>{const good=req.headers.authorization==='Bearer valid'&&!revoked;res.writeHead(good?200:401,{'Content-Type':'application/json'});const profile={user:{username:'admin',is_super:1},roles:[],permissions:[],menus:['overview','users','template','knowledge','skin','audit','converter','releases','admins','roles','menus'].map(key=>({path:'/seal/'+key}))};res.end(JSON.stringify(good?(req.url==='/v1/admin/session'?profile:{users:[]}):{error:'请先登录'}))});
  await new Promise(r=>up.listen(0,'127.0.0.1',r));
  const hashes={};function record(folder,prefix=''){for(const ent of fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const name=prefix+ent.name,full=path.join(folder,ent.name);if(ent.isDirectory())record(full,name+'/');else if(ent.isFile())hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');else throw Error('隔离目录包含异常条目')}}record(dir+'/app');
  const entry=dir+'/app/public/index.php',source=fs.readFileSync(entry,'utf8'),old='http://127.0.0.1:8096';
  assert.equal(source.split(old).length,2);fs.writeFileSync(entry,source.replace(old,'http://127.0.0.1:'+up.address().port));
  const fpmSource=fs.readFileSync(dir+'/fpm.template.conf','utf8');
  assert.ok(fpmSource.includes('/run/seal-admin-php/'));const fpmConfig=fpmSource.replaceAll('/run/seal-admin-php/',dir+'/');
  fs.writeFileSync(dir+'/fpm.conf',fpmConfig);
  const lua='/www/server/nginx/lib/lua';const luaPath=fs.existsSync(lua+'/resty/core.lua')?`lua_package_path "${lua}/?.lua;;";\n`:'';
  fs.mkdirSync(dir+'/site/assets',{recursive:true});fs.mkdirSync(dir+'/logs');fs.writeFileSync(dir+'/site/index.html','isolated-index');fs.writeFileSync(dir+'/site/assets/new.js','new-asset');fs.writeFileSync(dir+'/site/assets/old.js','old-asset');
  const nginxSource=fs.readFileSync(dir+'/nginx.template.conf','utf8');
  const site='/www/wwwroot/seal.xingmasoft.com/';
  const route=nginxSource.replaceAll(site+'admin/',dir+'/site/').replaceAll(site+'seal-admin-php/current/public/index.php',entry).replaceAll('/run/seal-admin-php/fpm.sock',fpmSocket);
  assert.notEqual(route,nginxSource);
  const nginxConfig=`daemon off;\nmaster_process off;\npid ${dir}/nginx.pid;\nerror_log ${dir}/nginx.log;\nevents {}\nhttp {\n${luaPath}access_log off;\nclient_body_temp_path ${dir}/body;\nserver {\nlisten unix:${nginxSocket};\n${route}\nlocation ^~ /assets/ { root ${dir}/site; try_files $uri =404; }\nlocation / { root ${dir}/site; try_files $uri $uri/ /index.html; }\n}\n}\n`;
  fs.writeFileSync(dir+'/nginx.conf',nginxConfig);
  const a=spawnSync(fpm,['-t','-y',dir+'/fpm.conf'],{encoding:'utf8'});assert.equal(a.status,0,'PHP-FPM 配置检查失败：'+a.stderr);checks.push('PHP 8.2 FPM 隔离配置检查');
  const b=spawnSync(nginx,['-t','-p',dir+'/','-c',dir+'/nginx.conf'],{encoding:'utf8'});assert.equal(b.status,0,'Nginx 配置检查失败：'+b.stderr);checks.push('Nginx 隔离配置检查');
  const unit=spawnSync('systemd-analyze',['verify',dir+'/seal-admin-php.service'],{encoding:'utf8',timeout:10000});assert.equal(unit.status,0,'systemd 单元检查失败：'+unit.stderr);checks.push('systemd 服务单元语法检查');
  php=start(fpm,['-F','-y',dir+'/fpm.conf']);await waitSocket(php,fpmSocket);
  assert.equal(fs.statSync(fpmSocket).mode&0o777,0o660);checks.push('专用 FPM 套接字权限');
  web=start(nginx,['-p',dir+'/','-c',dir+'/nginx.conf']);await waitSocket(web,nginxSocket);
  const fresh=await req('GET','/admin-assets/assets/new.js');assert.equal(fresh.status,200);assert.equal(fresh.body,'new-asset');checks.push('新静态资源前缀');
  const legacy=await req('GET','/assets/old.js');assert.equal(legacy.status,200);assert.equal(legacy.body,'old-asset');checks.push('旧会话资源保留');
  assert.equal((await req('GET','/admin-assets/assets/missing.js')).status,404);checks.push('不存在的新资源返回 404');
  const history=await req('GET','/seal/overview');assert.equal(history.status,200);assert.equal(history.body,'isolated-index');checks.push('根站点历史路由回退');
  assert.equal((await req('GET','/seal-admin/profile')).status,401);checks.push('未认证请求被拒绝');
  assert.equal((await req('GET','/seal-admin/profile','wrong')).status,401);checks.push('无效令牌被拒绝');
  const profile=await req('GET','/seal-admin/profile','valid');assert.equal(profile.status,200);assert.equal(JSON.parse(profile.body).data.menus.length,11);checks.push('FPM 路径与有效令牌的 11 项业务菜单');
  assert.equal((await req('GET','/seal-admin/api/overview','valid')).status,200);checks.push('管理接口白名单转发');
  assert.equal((await req('GET','/seal-admin/api/releases%2fbatch','valid')).status,404);checks.push('编码路径不能绕过白名单');
  assert.equal((await req('POST','/seal-admin/api/release-assets','valid',Buffer.from('{}'))).status,404);checks.push('桥接不处理大附件上传');
  assert.equal((await req('PATCH','/seal-admin/api/converter','valid',Buffer.alloc(2097153))).status,413);checks.push('有长度的超限请求被 Nginx 拒绝');
  assert.equal((await req('PATCH','/seal-admin/api/converter','valid',Buffer.alloc(2097153),true)).status,413);checks.push('分块超限请求被 Nginx 拒绝');
  const deploymentProbe=await require(dir+'/tpadmin-deploy-probe.cjs').privateProbe({socket:fpmSocket,entry,token:'valid'});assert.equal(deploymentProbe.passed,true);checks.push('生产私有探针通过已启动的候选 FPM');
  revoked=true;assert.equal((await req('GET','/seal-admin/profile','valid')).status,401);checks.push('上游撤销后会话立即失效');
  await stop(php);assert.equal(fs.existsSync(fpmSocket),false);php=start(fpm,['-F','-y',dir+'/fpm.conf']);await waitSocket(php,fpmSocket);revoked=false;assert.equal((await req('GET','/seal-admin/profile','valid')).status,200);checks.push('隔离 FPM 停止与重新启动');
  const originalConfig=fs.readFileSync(dir+'/fpm.conf','utf8');fs.writeFileSync(dir+'/fpm.conf',originalConfig+'\ninvalid_config_key = bad\n');const broken=spawnSync(fpm,['-t','-y',dir+'/fpm.conf'],{encoding:'utf8'});assert.notEqual(broken.status,0);fs.writeFileSync(dir+'/fpm.conf',originalConfig);const restored=spawnSync(fpm,['-t','-y',dir+'/fpm.conf'],{encoding:'utf8'});assert.equal(restored.status,0);checks.push('隔离错误配置恢复及语法检查');
  const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  console.log(JSON.stringify({passed:true,checks,sourceHashes:hashes,configHashes:{fpm:sha(dir+'/fpm.template.conf'),service:sha(dir+'/seal-admin-php.service'),nginx:sha(dir+'/nginx.template.conf'),probe:sha(dir+'/tpadmin-deploy-probe.cjs')},upstream:'回环隔离模拟服务，实际生产地址未访问',sockets:'独立 Unix 套接字',sourceModification:'仅隔离副本上游端口替换；FPM 和 Nginx 配置路径替换到隔离目录'}));
 }catch(error){console.error(JSON.stringify({passed:false,checks,error:error.message,diagnostic:diagnostic.slice(-1200)}));process.exitCode=1}
 finally{
  try{await stop(web);await stop(php);if(up)await new Promise(r=>up.close(r));fs.rmSync(dir,{recursive:true,force:true})}catch(error){console.error('隔离清理未完成：'+error.message);process.exitCode=1}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

def main():
    directory = '/tmp/seal-tpadmin-fpm-' + uuid.uuid4().hex
    client = module.connection()
    sftp = client.open_sftp()
    try:
        sftp.mkdir(directory, mode=0o755)
        sftp.chmod(directory, 0o755)
        sftp.mkdir(directory + '/app', mode=0o755)
        source = ROOT / 'server/tpadmin/server'
        files = [source / 'public/index.php', *sorted((source / 'src').rglob('*.php')), *sorted((source / 'vendor-source').rglob('*.php'))]
        hashes = {file.relative_to(source).as_posix(): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}
        made = {'app'}
        for file in files:
            relative = file.relative_to(source).as_posix()
            parts = relative.split('/')
            for i in range(1, len(parts)):
                current = 'app/' + '/'.join(parts[:i])
                if current not in made:
                    sftp.mkdir(directory + '/' + current, mode=0o755)
                    made.add(current)
            sftp.put(str(file), directory + '/app/' + relative)
            sftp.chmod(directory + '/app/' + relative, 0o644)
        with sftp.open(directory + '/check.cjs', 'w') as output:
            output.write(REMOTE)
        configs = {'fpm.template.conf': ROOT / 'server/deploy/seal-admin-php-fpm.conf', 'nginx.template.conf': ROOT / 'server/deploy/nginx-tpadmin.conf', 'seal-admin-php.service': ROOT / 'server/deploy/seal-admin-php.service', 'tpadmin-deploy-probe.cjs': ROOT / 'scripts/tpadmin-deploy-probe.cjs'}
        for name, file in configs.items():
            sftp.put(str(file), directory + '/' + name)
            sftp.chmod(directory + '/' + name, 0o644)
        _, stdout, stderr = client.exec_command('/usr/local/bin/node ' + directory + '/check.cjs ' + directory, timeout=120)
        out, err = stdout.read().decode('utf-8'), stderr.read().decode('utf-8')
        status = stdout.channel.recv_exit_status()
        if err:
            print(err.strip(), file=sys.stderr)
        if status:
            raise SystemExit(status)
        report = json.loads(out)
        if not report.get('passed'):
            raise SystemExit('隔离验收未通过')
        if report['sourceHashes'] != hashes:
            raise SystemExit('服务器隔离候选与本机源码摘要不一致')
        config_hashes = {key: hashlib.sha256(configs[name].read_bytes()).hexdigest() for key, name in {'fpm':'fpm.template.conf','nginx':'nginx.template.conf','service':'seal-admin-php.service','probe':'tpadmin-deploy-probe.cjs'}.items()}
        if report['configHashes'] != config_hashes:
            raise SystemExit('服务器隔离配置与本机候选摘要不一致')
        report.update({
            'recordedAt': datetime.now(timezone.utc).isoformat(),
            'command': 'python -X utf8 scripts/verify-tpadmin-fpm-remote.py',
            'verifiedServerHostKey': True,
            'productionDataAccessed': False,
            'productionConfigurationChanged': False,
            'nginxVersion': '1.30.4',
            'phpFpmVersion': '8.2.28',
            'testScriptSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
        })
        result = ROOT / 'docs/verification/tpadmin-fpm隔离验收.json'
        result.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'passed': True, 'checks': len(report['checks']), 'sourceFiles': len(hashes), 'report': str(result)}, ensure_ascii=False))
    finally:
        sftp.close()
        client.close()

if __name__ == '__main__':
    main()
