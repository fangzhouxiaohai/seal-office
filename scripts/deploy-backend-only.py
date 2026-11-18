"""云服务独立部署：stage 只暂存；deploy 使用冻结状态切换，不碰后台与业务数据。"""
import argparse
import hashlib
import importlib.util
import json
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'.upgrade-private/backend-only'
SITE='/www/wwwroot/seal.xingmasoft.com'
SCRIPTS=['deploy-backend-runner.cjs','deploy-backend-only.cjs']
RUNTIME=['index.cjs','store.cjs','adminAccess.cjs','sms.cjs','formats.cjs','passwords.cjs','shareLinks.cjs','myShares.cjs','collaboration.cjs','realtime.cjs','accountConversion.cjs','accountErasure.cjs','eraseRecords.cjs','eraseBackups.cjs','publicValidation.cjs','nativeCodec.cjs','skinFormat.cjs','converterAdmin.cjs','validateIsolated.cjs','releases.cjs','releaseAssets.cjs','package.json','package-lock.json']

def digest(path):
    value=hashlib.sha256()
    with Path(path).open('rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''):value.update(chunk)
    return value.hexdigest()

def collect_sources():
    files={name:ROOT/'server'/name for name in RUNTIME}
    files.update({'documentFormats.json':ROOT/'main/documentFormats.json','nativeSealFormat.cjs':ROOT/'main/office/sealFormat.js','skinFormat.js':ROOT/'main/skins/skinFormat.js'})
    for file in sorted((ROOT/'server/converter').rglob('*')):
        if file.is_symlink():raise ValueError('转换服务源码不允许符号链接')
        if file.is_file() and file.name!='test.cjs':files['converter/'+file.relative_to(ROOT/'server/converter').as_posix()]=file
    result={}
    for name,file in files.items():
        if not file.is_file() or file.is_symlink():raise ValueError('服务源码缺失或不是普通文件：'+name)
        result[name]={'source':str(file.relative_to(ROOT)).replace('\\','/'),'sha256':digest(file)}
    return result

def validate_state_path(path):
    resolved=Path(path).resolve()
    if resolved.parent!=PRIVATE.resolve() or not re.fullmatch(r'\d{8,14}_[a-f0-9]{8}\.json',resolved.name):raise ValueError('状态文件路径无效')
    return resolved

def connection():
    sys.path.insert(0,str(ROOT/'scripts'))
    spec=importlib.util.spec_from_file_location('seal_deploy_web',ROOT/'scripts/deploy-web.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module.connection()

def upload(sftp,source,target):
    with Path(source).open('rb') as src,sftp.open(target,'wx') as out:
        while True:
            chunk=src.read(1024*1024)
            if not chunk:break
            out.write(chunk)
    sftp.chmod(target,0o644)
    h=hashlib.sha256()
    with sftp.open(target,'rb') as value:
        for chunk in iter(lambda:value.read(1024*1024),b''):h.update(chunk)
    if h.hexdigest()!=digest(source):raise ValueError('上传后摘要不一致')

def remote(client,location,payload):
    if not re.fullmatch(r'/tmp/seal-backend-only-[a-f0-9]{32}/deploy-backend-runner\.cjs',location):raise ValueError('远程执行路径无效')
    stdin,stdout,stderr=client.exec_command('/usr/local/bin/node '+location,timeout=900)
    stdin.write(json.dumps(payload,ensure_ascii=False));stdin.channel.shutdown_write()
    output=stdout.read().decode('utf-8');error=stderr.read().decode('utf-8');status=stdout.channel.recv_exit_status()
    if status:raise RuntimeError('云服务部署阶段失败：'+error[:1500])
    try:return json.loads(output)
    except json.JSONDecodeError as exc:raise RuntimeError('服务器返回内容无效') from exc

def stage():
    sources=collect_sources();version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?',version):raise ValueError('版本号无效')
    identifier=datetime.now().strftime('%Y%m%d%H%M%S')+'_'+uuid.uuid4().hex[:8]
    remote_dir='/tmp/seal-backend-only-'+uuid.uuid4().hex
    candidate='releases/'+version+'-backend-only-'+identifier
    script_hash={name:digest(ROOT/'scripts'/name) for name in SCRIPTS}
    PRIVATE.mkdir(parents=True,exist_ok=True)
    client=connection();sftp=client.open_sftp()
    try:
        sftp.mkdir(remote_dir,mode=0o700)
        for name in SCRIPTS:upload(sftp,ROOT/'scripts'/name,remote_dir+'/'+name)
        baseline=remote(client,remote_dir+'/'+SCRIPTS[0],{'mode':'baseline'})['baseline']
        candidate_path=SITE+'/'+candidate;sftp.mkdir(candidate_path,mode=0o755);made={''}
        for name,info in sources.items():
            parts=name.split('/')
            for index in range(1,len(parts)):
                parent='/'.join(parts[:index])
                if parent not in made:sftp.mkdir(candidate_path+'/'+parent,mode=0o755);made.add(parent)
            upload(sftp,ROOT/info['source'],candidate_path+'/'+name)
        if collect_sources()!=sources:raise ValueError('服务源码在上传期间发生变化')
        manifest=[{'path':name,'sha256':info['sha256']} for name,info in sources.items()]
        result=remote(client,remote_dir+'/'+SCRIPTS[0],{'mode':'stage','version':version,'candidate':candidate,'baseline':baseline,'manifest':manifest})
        state={'version':version,'candidate':candidate,'baseline':baseline,'manifest':manifest,'sources':sources,'remoteDir':remote_dir,'scriptHashes':script_hash,'nodeModulesHash':result['nodeModulesHash']}
        state_file=PRIVATE/(identifier+'.json');state_file.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'passed':True,'stageOnly':True,'state':str(state_file),'candidate':candidate},ensure_ascii=False))
    finally:sftp.close();client.close()

def deploy(state_file):
    state=json.loads(validate_state_path(state_file).read_text(encoding='utf-8'))
    if collect_sources()!=state['sources'] or any(digest(ROOT/'scripts'/name)!=state['scriptHashes'].get(name) for name in SCRIPTS):raise ValueError('源码或部署执行器在暂存后发生变化')
    location=state['remoteDir']
    if not re.fullmatch(r'/tmp/seal-backend-only-[a-f0-9]{32}',location):raise ValueError('远程执行目录无效')
    client=connection();sftp=client.open_sftp()
    try:
        for name in SCRIPTS:
            h=hashlib.sha256()
            with sftp.open(location+'/'+name,'rb') as value:
                for chunk in iter(lambda:value.read(1024*1024),b''):h.update(chunk)
            if h.hexdigest()!=state['scriptHashes'][name]:raise ValueError('远程部署执行器摘要不一致')
        payload={key:state[key] for key in ('version','candidate','baseline','manifest','nodeModulesHash')};payload['mode']='deploy'
        print(json.dumps(remote(client,location+'/'+SCRIPTS[0],payload),ensure_ascii=False))
    finally:sftp.close();client.close()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['stage','deploy']);parser.add_argument('--state');args=parser.parse_args()
    if args.action=='stage':stage()
    elif args.state:deploy(args.state)
    else:parser.error('deploy 必须提供暂存状态文件')

if __name__=='__main__':main()
