"""真实 Node 云服务 + PHP 路由的隔离联调；只使用临时数据库。"""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parents[1]

def request(url,method='GET',data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token:headers['Authorization']='Bearer '+token
    body=json.dumps(data).encode() if data is not None else None
    req=urllib.request.Request(url,data=body,method=method,headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.loads(r.read())
    except urllib.error.HTTPError as e:return e.code,json.loads(e.read())

with socket.socket() as probe:
    try:probe.bind(('127.0.0.1',8096))
    except OSError as error:raise SystemExit(f'本机 8096 被占用，拒绝连接现有服务：{error}')
with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));php_port=probe.getsockname()[1]

with tempfile.TemporaryDirectory(prefix='seal-rbac-local-') as directory:
    env=os.environ.copy();env.update({'SEAL_DATA_DIR':directory,'PORT':'8096','SEAL_ADMIN_PASSWORD_HASH':hashlib.scrypt(b'isolated-password',salt=b'seal-admin-v1',n=16384,r=8,p=1,dklen=32).hex()})
    opts={'cwd':str(ROOT),'stdout':subprocess.DEVNULL,'stderr':subprocess.DEVNULL}
    if os.name=='nt':opts['creationflags']=subprocess.CREATE_NO_WINDOW
    node=subprocess.Popen(['node','server/index.cjs'],env=env,**opts)
    php=subprocess.Popen(['php','-S',f'127.0.0.1:{php_port}','server/tpadmin/server/public/index.php'],**opts)
    node_base='http://127.0.0.1:8096';php_base=f'http://127.0.0.1:{php_port}'
    try:
        for attempt in range(100):
            try:
                if request(node_base+'/v1/capabilities')[0]==200:break
            except OSError:
                if node.poll() is not None:raise RuntimeError('隔离 Node 服务启动失败')
                if attempt==99:raise
                time.sleep(.05)
        status,root=request(node_base+'/v1/admin/login','POST',{'username':'admin','password':'isolated-password'});assert status==200
        root_token=root['token']
        for attempt in range(100):
            try:
                status,root_profile=request(php_base+'/seal-admin/profile',token=root_token);break
            except OSError:
                if php.poll() is not None:raise RuntimeError('隔离 PHP 服务启动失败')
                if attempt==99:raise
                time.sleep(.05)
        assert status==200 and root_profile['data']['user']['username']=='admin'
        assert len(root_profile['data']['menus'])==11
        status,created=request(php_base+'/seal-admin/api/access/roles','POST',{'name':'隔离审核','permissions':['template:read']},root_token);assert status==200
        status,admin=request(php_base+'/seal-admin/api/access/admins','POST',{'username':'reviewer','password':'TestPassword123','roleIds':[created['item']['id']],'enabled':True},root_token);assert status==200
        status,login=request(node_base+'/v1/admin/login','POST',{'username':'reviewer','password':'TestPassword123'});assert status==200
        token=login['token'];status,profile=request(php_base+'/seal-admin/profile',token=token)
        assert status==200 and [x['path'] for x in profile['data']['menus']]==['/seal/template']
        status,overview=request(php_base+'/seal-admin/api/overview',token=token)
        assert status==200 and 'publications' in overview and 'users' not in overview and 'audit' not in overview
        assert request(php_base+'/seal-admin/api/releases',token=token)[0]==403
        assert request(php_base+'/seal-admin/api/access/admins',token=token)[0]==403
        assert request(php_base+'/seal-admin/api/access/admins/'+admin['item']['id'],'PATCH',{'enabled':False},root_token)[0]==200
        assert request(php_base+'/seal-admin/profile',token=token)[0]==401
        print('真实隔离 Node + PHP RBAC 联调 11 项通过，未连接生产数据库')
    finally:
        for process in (php,node):
            process.terminate()
        for process in (php,node):
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()
