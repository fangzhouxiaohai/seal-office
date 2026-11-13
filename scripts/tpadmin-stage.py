"""冻结并暂存管理后台；仅 `deploy` 子命令会切换生产。

stage 只新建唯一候选，校验上传摘要和旧资源，不修改正在运行的配置。
deploy 需读取 stage 产生的本地状态、重新核对源码，并以标准输入传递临时会话。
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import uuid
from datetime import datetime

import requests

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.upgrade-private/tpadmin-deploy'
WEB = ROOT / 'server/tpadmin/web'
BACKEND = ROOT / 'server/tpadmin/server'
REPORT_MAIN = ROOT / '.upgrade-private/tpadmin-final-main/report.json'
REPORT_EXTRA = ROOT / '.upgrade-private/tpadmin-final-extra/report.json'
REPORT_REQUIRED = {
    'limited': (ROOT / '.upgrade-private/tpadmin-final-limited/report.json', 3),
    'access': (ROOT / '.upgrade-private/tpadmin-final-access/report.json', 9),
    'dark': (ROOT / '.upgrade-private/tpadmin-final-dark-permission/report.json', 47),
}
REPORT_FPM = ROOT / 'docs/verification/tpadmin-fpm隔离验收.json'
SITE = '/www/wwwroot/seal.xingmasoft.com'
EXT = '/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com'

def module(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

sys.path.insert(0, str(ROOT / 'scripts'))
freeze = module('tpadmin_freeze', ROOT / 'scripts/tpadmin-freeze.py')
connection = module('seal_deploy_web', ROOT / 'scripts/deploy-web.py')

def backend_files():
    return [BACKEND/'public/index.php', *sorted((BACKEND/'src').rglob('*.php')), *sorted((BACKEND/'vendor-source').rglob('*.php'))]

def configs():
    return {'fpm': ROOT/'server/deploy/seal-admin-php-fpm.conf', 'unit': ROOT/'server/deploy/seal-admin-php.service', 'nginx': ROOT/'server/deploy/nginx-tpadmin.conf'}

def local_freeze():
    frontend = freeze.freeze_frontend(WEB, REPORT_MAIN, REPORT_EXTRA, REPORT_REQUIRED)
    report = json.loads(REPORT_FPM.read_text(encoding='utf-8'))
    if not report.get('passed') or len(report.get('checks', [])) < 20: raise ValueError('服务器隔离 FPM 验收未通过')
    files = backend_files()
    backend = {f.relative_to(BACKEND).as_posix(): freeze.digest(f) for f in files}
    config = {k: freeze.digest(v) for k, v in configs().items()}
    if backend != report.get('sourceHashes'): raise ValueError('PHP 源码与隔离验收版本不一致')
    expected = report.get('configHashes', {})
    if any(config[k] != expected.get({'unit':'service'}.get(k,k)) for k in config): raise ValueError('配置与隔离验收版本不一致')
    if freeze.digest(ROOT/'scripts/tpadmin-deploy-probe.cjs') != expected.get('probe'): raise ValueError('探针与隔离验收版本不一致')
    if freeze.digest(ROOT/'scripts/verify-tpadmin-fpm-remote.py') != report.get('testScriptSha256'): raise ValueError('FPM 验收脚本与记录不一致')
    scripts = {n: freeze.digest(ROOT/'scripts'/n) for n in ['tpadmin-production.cjs','tpadmin-production-runner.cjs','tpadmin-stage-remote.cjs','tpadmin-deploy-probe.cjs']}
    tooling = {n: freeze.digest(ROOT/'scripts'/n) for n in ['tpadmin-stage.py','tpadmin-freeze.py','verify-tpadmin-browser.cjs','verify-tpadmin-browser-extra.cjs','verify-tpadmin-fpm-remote.py']}
    return {'frontend':frontend,'backend':backend,'config':config,'scripts':scripts,'tooling':tooling,'fpmReport':freeze.digest(REPORT_FPM)}

def targets(identifier):
    entries = {'php':(SITE+'/seal-admin-php/current',True), 'fpm':(SITE+'/seal-admin-php/fpm.conf',False), 'unit':('/etc/systemd/system/seal-admin-php.service',False), 'nginx':(EXT+'/30-tpadmin.conf',False), 'admin':(SITE+'/admin',True)}
    return {key:{'active':path,'candidate':path+'.candidate-'+identifier,'directory':directory} for key,(path,directory) in entries.items()}

def remote(client, script, payload):
    if not re.fullmatch(r'/tmp/seal-tpadmin-deploy-[a-f0-9]{32}/[a-z0-9.-]+\.cjs', script): raise ValueError('暂存脚本路径无效')
    stdin, stdout, stderr = client.exec_command('/usr/local/bin/node '+script, timeout=900)
    stdin.write(json.dumps(payload, ensure_ascii=False)); stdin.channel.shutdown_write()
    output, error = stdout.read().decode('utf-8'), stderr.read().decode('utf-8')
    status = stdout.channel.recv_exit_status()
    if status: raise RuntimeError('服务器步骤失败：'+error[:1200])
    try: return json.loads(output)
    except json.JSONDecodeError as exc: raise RuntimeError('服务器步骤返回无效结果') from exc

def upload(sftp, local, remote_name):
    with Path(local).open('rb') as source, sftp.open(remote_name, 'wx') as target:
        while True:
            chunk = source.read(1024*1024)
            if not chunk: break
            target.write(chunk)
    sftp.chmod(remote_name, 0o644)
    checksum=hashlib.sha256()
    with sftp.open(remote_name, 'rb') as verify:
        while True:
            chunk=verify.read(1024*1024)
            if not chunk:break
            checksum.update(chunk)
    if checksum.hexdigest()!=freeze.digest(local):raise ValueError('SSH 上传后摘要不一致')

def upload_tree(sftp, local, remote_root):
    sftp.mkdir(remote_root, mode=0o755);sftp.chmod(remote_root,0o755)
    made={''}; expected=[]
    for file in sorted(Path(local).rglob('*')):
        if file.is_symlink(): raise ValueError('候选中不允许符号链接')
        if not file.is_file(): continue
        rel=file.relative_to(local).as_posix();parts=rel.split('/')
        for index in range(1,len(parts)):
            current='/'.join(parts[:index])
            if current not in made: sftp.mkdir(remote_root+'/'+current,mode=0o755);sftp.chmod(remote_root+'/'+current,0o755);made.add(current)
        name=remote_root+'/'+rel;upload(sftp,file,name);expected.append({'path':name,'sha256':freeze.digest(file)})
    return expected

def stage():
    local=local_freeze();identifier=datetime.now().strftime('%Y%m%d%H%M%S')+'_'+uuid.uuid4().hex[:8];items=targets(identifier)
    remote_dir='/tmp/seal-tpadmin-deploy-'+uuid.uuid4().hex
    PRIVATE.mkdir(parents=True,exist_ok=True)
    client=connection.connection();sftp=client.open_sftp()
    try:
        sftp.mkdir(remote_dir,mode=0o700)
        for name in local['scripts']: upload(sftp,ROOT/'scripts'/name,remote_dir+'/'+name)
        base=remote(client,remote_dir+'/tpadmin-stage-remote.cjs',{'phase':'preflight','id':identifier,'items':items})
        expected=upload_tree(sftp,WEB/'dist',items['admin']['candidate'])
        sftp.mkdir(items['php']['candidate'],mode=0o755);sftp.chmod(items['php']['candidate'],0o755);made={''}
        for file in backend_files():
            rel=file.relative_to(BACKEND).as_posix();parts=rel.split('/')
            for index in range(1,len(parts)):
                part='/'.join(parts[:index])
                if part not in made:sftp.mkdir(items['php']['candidate']+'/'+part,mode=0o755);sftp.chmod(items['php']['candidate']+'/'+part,0o755);made.add(part)
            target=items['php']['candidate']+'/'+rel;upload(sftp,file,target);expected.append({'path':target,'sha256':freeze.digest(file)})
        for name,file in configs().items():
            target=items[name]['candidate'];upload(sftp,file,target);expected.append({'path':target,'sha256':freeze.digest(file)})
        if local_freeze()!=local:raise ValueError('本地源码或构建在上传期间发生变化')
        result=remote(client,remote_dir+'/tpadmin-stage-remote.cjs',{'phase':'finalize','id':identifier,'items':items,'baseline':base['baseline'],'expectedFiles':expected})
        state={'id':identifier,'items':items,'remoteDir':remote_dir,'localFreeze':local,'baseline':result['baseline'],'frozen':result['frozen'],'legacy':result['legacy'],'version':json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']}
        state_file=PRIVATE/(identifier+'.json');state_file.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'passed':True,'stageOnly':True,'state':str(state_file),'legacy':result['legacy']},ensure_ascii=False))
    finally:sftp.close();client.close()

def publish(state_file):
    state_path=Path(state_file).resolve()
    if state_path.parent!=PRIVATE.resolve() or not re.fullmatch(r'[A-Za-z0-9_-]+\.json',state_path.name):raise ValueError('状态文件路径无效')
    state=json.loads(state_path.read_text(encoding='utf-8'))
    if local_freeze()!=state['localFreeze']:raise ValueError('源码、产物或验收记录在暂存后发生变化')
    creds=json.loads((ROOT/'.upgrade-private/admin-access.json').read_text(encoding='utf-8-sig'))
    if creds.get('url')!='https://seal.xingmasoft.com':raise ValueError('管理员服务地址无效')
    response=requests.post(creds['url']+'/api/v1/admin/login',json={'username':creds['username'],'password':creds['password']},timeout=30)
    if response.status_code!=200:raise RuntimeError('管理员验证失败，部署尚未开始')
    token=response.json().get('token')
    if not isinstance(token,str) or not re.fullmatch(r'[A-Za-z0-9_-]{20,}',token):raise RuntimeError('管理员响应缺少有效会话')
    client=connection.connection()
    try:
        payload={key:state[key] for key in ('id','items','baseline','frozen','version')};payload['token']=token
        result=remote(client,state['remoteDir']+'/tpadmin-production-runner.cjs',payload)
        print(json.dumps(result,ensure_ascii=False))
    finally:
        client.close()
        try:requests.post(creds['url']+'/api/v1/admin/logout',headers={'Authorization':'Bearer '+token},timeout=15)
        except requests.RequestException:pass

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['stage','deploy']);parser.add_argument('--state');args=parser.parse_args()
    if args.action=='stage':stage()
    else:
        if not args.state:parser.error('deploy 必须提供 stage 状态文件')
        publish(args.state)

if __name__=='__main__':main()
