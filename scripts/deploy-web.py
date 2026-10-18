"""Deploy only the public Web frontend; secrets remain in the caller's private files.

python scripts/deploy-web.py preflight
python scripts/deploy-web.py prepare --release-id 2.0.0-web-YYYYMMDD-HHMMSS
python scripts/deploy-web.py plan --release-id ...
python scripts/deploy-web.py stage --release-id ... --main-js-sha ... --qa-report ...
python scripts/deploy-web.py publish --release-id ...
python scripts/deploy-web.py rollback --release-id ...

`stage` requires a matching frozen production bundle and a newer successful local
browser report. This script never modifies backend release pointers or accounts.
"""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import tarfile
import time
import zipfile

import paramiko
from artifact_names import artifact_name

ROOT = pathlib.Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
PRIVATE = ROOT / '.upgrade-private/web-deployment'
SITE = '/www/wwwroot/seal.xingmasoft.com'
CONF = '/www/server/panel/vhost/nginx/seal.xingmasoft.com.conf'
FINGERPRINT = 'SHA256:E5r0/n8PRbe7VLprGOWW7Y/E3ZpnLVaVo53q+5r4xPw'
BEGIN = '# BEGIN SEAL OFFICE WEB MANAGED'
END = '# END SEAL OFFICE WEB MANAGED'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def patch_nginx(original, example):
    block = BEGIN + '\n' + example.replace('/var/www/seal-office-web/', SITE + '/webcurrent/') + '\n' + END + '\n'
    if BEGIN in original or END in original:
        if original.count(BEGIN) != 1 or original.count(END) != 1:
            raise ValueError('Ambiguous managed NGINX block')
        if original.index(END) < original.index(BEGIN):
            raise ValueError('Managed NGINX block markers are reversed')
        return re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', lambda _: block, original, flags=re.S)
    anchor = '  location /api/ {'
    if original.count(anchor) != 1 or original.find('listen 443 ssl') < 0 or original.find('listen 443 ssl') > original.find(anchor):
        raise ValueError('HTTPS API anchor is missing or ambiguous')
    if re.search(r'location\s+[^\n{]*/office/?(?:\s|\{)', original):
        raise ValueError('Unmanaged /office location already exists')
    return original.replace(anchor, block + anchor, 1)


def connection():
    credentials = json.loads((ROOT / '.upgrade-private/connection.json').read_text(encoding='utf-8-sig'))
    client = paramiko.SSHClient()
    client.load_host_keys(str(ROOT / '.upgrade-private/server-known-hosts'))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(credentials['host'], username=credentials['user'], password=credentials['password'], timeout=20, look_for_keys=False, allow_agent=False)
    actual = 'SHA256:' + base64.b64encode(hashlib.sha256(client.get_transport().get_remote_server_key().asbytes()).digest()).decode().rstrip('=')
    if actual != FINGERPRINT:
        client.close()
        raise ValueError('SSH server fingerprint mismatch')
    client.get_transport().set_keepalive(15)
    return client


def remote(client, code, name, timeout=60):
    _, stdout, stderr = client.exec_command("/usr/local/bin/node - <<'JS'\n" + code + "\nJS", timeout=timeout)
    output, diagnostic = stdout.read().decode(), stderr.read().decode()
    status = stdout.channel.recv_exit_status()
    (PRIVATE / (name + '.stderr')).write_text(diagnostic, encoding='utf-8')
    (PRIVATE / (name + '.stdout')).write_text(output, encoding='utf-8')
    if status:
        raise RuntimeError(name + ' failed; private diagnostics retained; exit=' + str(status))
    return json.loads(output)


def private_state(release):
    return PRIVATE / (release + '.json')


COMMON = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const base='/www/wwwroot/seal.xingmasoft.com',conf='/www/server/panel/vhost/nginx/seal.xingmasoft.com.conf',nginx='/www/server/nginx/sbin/nginx';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const target=name=>{try{return fs.realpathSync(name)}catch{return null}};
const call=(name,args)=>execFileSync(name,args,{timeout:45000,stdio:['ignore','pipe','pipe']});
const stateFile=backup=>path.join(backup,'state.json');
const atomicFile=(name,data,mode=0o644)=>{const tmp=name+'.seal-web-next';if(fs.existsSync(tmp))throw new Error('Temporary config path exists');const previous=fs.existsSync(name)?fs.statSync(name):null,fd=fs.openSync(tmp,'wx',mode);let closed=false;try{fs.fchmodSync(fd,mode);if(previous)fs.fchownSync(fd,previous.uid,previous.gid);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);closed=true;fs.renameSync(tmp,name)}catch(error){if(!closed)try{fs.closeSync(fd)}catch{}try{fs.unlinkSync(tmp)}catch{}throw error}};
const swap=(name,value)=>{const temp=name+'.seal-web-next';try{fs.lstatSync(temp);throw new Error('Temporary pointer exists')}catch(error){if(error.code!=='ENOENT')throw error}fs.symlinkSync(value,temp);try{fs.renameSync(temp,name)}catch(error){try{fs.unlinkSync(temp)}catch{}throw error}};
const restore=state=>{if(state.previousWeb)swap(base+'/webcurrent',state.previousWeb);else{try{const st=fs.lstatSync(base+'/webcurrent');if(!st.isSymbolicLink())throw new Error('Web pointer is not a symlink');fs.unlinkSync(base+'/webcurrent')}catch(error){if(error.code!=='ENOENT')throw error}}atomicFile(conf,fs.readFileSync(state.backup+'/nginx.conf'),state.nginxMode);call(nginx,['-t']);call(nginx,['-s','reload'])};
"""


def preflight(client):
    return remote(client, COMMON + r"""
(async()=>{call(nginx,['-t']);const caps=await(await fetch('https://seal.xingmasoft.com/api/v1/capabilities')).json();console.log(JSON.stringify({nginxHash:digest(fs.readFileSync(conf)),backendCurrent:target(base+'/current'),admin:target(base+'/admin'),adminHash:digest(fs.readFileSync(base+'/admin/index.html')),webCurrent:target(base+'/webcurrent'),capabilities:{collaboration:caps.collaboration,accountConversion:caps.accountConversion},unauthorizedGateway:(await fetch('https://seal.xingmasoft.com/api/v1/conversion/capabilities')).status,hostKeyVerified:true}));})().catch(()=>process.exitCode=1);
""", 'preflight')


def prepare(client, release):
    state = remote(client, COMMON + r"""
const release=RELEASE,backup='/root/seal-web-deploy/'+release,dir=base+'/web-releases/'+release;
if(fs.existsSync(backup)||fs.existsSync(dir))throw new Error('Staging path already exists');
call(nginx,['-t']);fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.chmodSync('/root/seal-web-deploy',0o700);fs.chmodSync(backup,0o700);fs.copyFileSync(conf,backup+'/nginx.conf');fs.chmodSync(backup+'/nginx.conf',0o600);
fs.mkdirSync(base+'/web-releases',{recursive:true,mode:0o755});
const state={release,backup,directory:dir,nginxHash:digest(fs.readFileSync(conf)),nginxMode:fs.statSync(conf).mode&0o777,backendCurrent:target(base+'/current'),admin:target(base+'/admin'),adminHash:digest(fs.readFileSync(base+'/admin/index.html')),previousWeb:target(base+'/webcurrent'),preparedAt:new Date().toISOString()};
fs.writeFileSync(stateFile(backup),JSON.stringify(state),{mode:0o600});console.log(JSON.stringify(state));
""".replace('RELEASE', json.dumps(release)), 'prepare')
    private_state(release).write_text(json.dumps(state, indent=2), encoding='utf-8')
    return state


def package(release, expected_sha, qa_report):
    folder = ROOT / 'mobile/unpackage/web'
    info = json.loads((folder / 'build-info.json').read_text())
    if info.get('desktopVersion') != VERSION or info.get('platform') != 'web':
        raise ValueError('Expected frozen ' + VERSION + ' Web build')
    html = (folder / 'index.html').read_text(encoding='utf-8')
    script = re.search(r'<script[^>]+src="(\./assets/index-[^"]+\.js)"', html)
    if not script:
        raise ValueError('Main production script missing')
    main = folder / script[1]
    if sha(main.read_bytes()) != expected_sha:
        raise ValueError('Frozen main bundle hash mismatch')
    qa_path = pathlib.Path(qa_report).resolve()
    if not json.loads(qa_path.read_text(encoding='utf-8')).get('passed') or qa_path.stat().st_mtime < main.stat().st_mtime:
        raise ValueError('A successful browser report newer than this build is required')
    manifest = {}
    for file in sorted(folder.rglob('*')):
        if file.is_symlink():
            raise ValueError('Symlinks are not allowed in the Web artifact')
        if file.is_file():
            name = file.relative_to(folder).as_posix()
            if any(part.startswith('.') for part in file.relative_to(folder).parts) or file.suffix in ['.env', '.map', '.pem', '.key']:
                raise ValueError('Unexpected private/build source file in Web artifact')
            manifest[name] = {'sha256': sha(file.read_bytes()), 'bytes': file.stat().st_size}
    archive, zipped = PRIVATE / (release + '.tar.gz'), web_archive_path(release)
    zipped.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'w:gz') as tar, zipfile.ZipFile(zipped, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for name in manifest:
            tar.add(folder / name, arcname=name, recursive=False)
            zip_file.write(folder / name, name)
    return archive, zipped, manifest


def web_archive_path(release):
    # Keep each deployment's archive separate, with the stable public filename.
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', release):
        raise ValueError('Unsafe Web release id')
    return PRIVATE / release / artifact_name('web', VERSION)


def plan(client, release):
    """Syntax-check an isolated candidate; do not replace or reload active NGINX."""
    state = json.loads(private_state(release).read_text())
    sftp = client.open_sftp()
    try:
        with sftp.open(CONF, 'rb') as file: original = file.read()
        if sha(original) != state['nginxHash']:
            raise ValueError('NGINX changed since preparation')
        candidate = patch_nginx(original.decode(), (ROOT / 'mobile/deploy/nginx.conf.example').read_text(encoding='utf-8'))
        with sftp.open(state['backup'] + '/nginx-next.conf', 'wb') as file: file.write(candidate.encode())
        sftp.chmod(state['backup'] + '/nginx-next.conf', 0o600)
        isolated = 'events {}\nhttp {\ninclude /www/server/nginx/conf/mime.types;\ninclude ' + state['backup'] + '/nginx-next.conf;\n}\n'
        with sftp.open(state['backup'] + '/nginx-isolated-test.conf', 'wb') as file: file.write(isolated.encode())
        sftp.chmod(state['backup'] + '/nginx-isolated-test.conf', 0o600)
    finally:
        sftp.close()
    return remote(client, COMMON + r"""
const state=JSON.parse(fs.readFileSync(STATE));call(nginx,['-t','-c',state.backup+'/nginx-isolated-test.conf','-p','/www/server/nginx']);if(digest(fs.readFileSync(conf))!==state.nginxHash||target(base+'/current')!==state.backendCurrent)throw new Error('Production changed unexpectedly');console.log(JSON.stringify({passed:true,activeConfigUnchanged:true,backendPointerUnchanged:true,nginxCandidateSyntax:true,privateBackupMode:fs.statSync(state.backup).mode&0o777}));
""".replace('STATE', json.dumps(state['backup'] + '/state.json')), 'plan')


def stage(client, release, expected_sha, qa_report):
    state = json.loads(private_state(release).read_text())
    archive, zipped, manifest = package(release, expected_sha, qa_report)
    sftp = client.open_sftp()
    with sftp.open(CONF, 'rb') as file:
        original = file.read()
    if sha(original) != state['nginxHash']:
        raise ValueError('NGINX changed since preparation')
    patched = patch_nginx(original.decode(), (ROOT / 'mobile/deploy/nginx.conf.example').read_text(encoding='utf-8'))
    candidate = PRIVATE / (release + '-nginx.conf'); candidate.write_text(patched, encoding='utf-8')
    manifest_file = PRIVATE / (release + '-manifest.json'); manifest_file.write_text(json.dumps(manifest), encoding='utf-8')
    for local, name in [(archive, 'web.tar.gz'), (candidate, 'nginx-next.conf'), (manifest_file, 'manifest.json')]:
        sftp.put(str(local), state['backup'] + '/' + name); sftp.chmod(state['backup'] + '/' + name, 0o600)
    sftp.close()
    result = remote(client, COMMON + r"""
const state=JSON.parse(fs.readFileSync(STATE)),manifest=JSON.parse(fs.readFileSync(state.backup+'/manifest.json'));
if(target(base+'/current')!==state.backendCurrent||digest(fs.readFileSync(conf))!==state.nginxHash||target(base+'/admin')!==state.admin)throw new Error('Production baseline changed');
if(fs.existsSync(state.directory))throw new Error('Release directory already exists');fs.mkdirSync(state.directory,{mode:0o755});call('tar',['-xzf',state.backup+'/web.tar.gz','-C',state.directory,'--no-same-owner','--no-same-permissions']);
for(const [name,entry] of Object.entries(manifest)){const file=path.resolve(state.directory,name);if(!file.startsWith(state.directory+'/')||!fs.lstatSync(file).isFile()||digest(fs.readFileSync(file))!==entry.sha256)throw new Error('Artifact manifest mismatch');fs.chmodSync(file,0o644)}
const chmod=folder=>{fs.chmodSync(folder,0o755);for(const dirent of fs.readdirSync(folder,{withFileTypes:true}))if(dirent.isDirectory())chmod(path.join(folder,dirent.name))};chmod(state.directory);
state.stagedAt=new Date().toISOString();state.files=Object.keys(manifest).length;state.manifestHash=digest(fs.readFileSync(state.backup+'/manifest.json'));state.newNginxHash=digest(fs.readFileSync(state.backup+'/nginx-next.conf'));fs.writeFileSync(stateFile(state.backup),JSON.stringify(state),{mode:0o600});console.log(JSON.stringify(state));
""".replace('STATE', json.dumps(state['backup'] + '/state.json')), 'stage')
    result.update({'archiveSha256': sha(archive.read_bytes()), 'zipSha256': sha(zipped.read_bytes()), 'zipFile': str(zipped), 'mainJsSha256': expected_sha})
    private_state(release).write_text(json.dumps(result, indent=2), encoding='utf-8')
    result['retainedSessionAssets'] = retain_sessions(client, release)
    private_state(release).write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


def retain_sessions(client, release):
    """Preserve prior immutable chunks so open tabs can finish lazy imports."""
    state = json.loads(private_state(release).read_text())
    sftp = client.open_sftp()
    try:
        sftp.put(str(ROOT / 'scripts/retain-web-session-assets.cjs'), state['backup'] + '/retain-web-session-assets.cjs')
        sftp.chmod(state['backup'] + '/retain-web-session-assets.cjs', 0o600)
    finally:
        sftp.close()
    result = remote(client, COMMON + r"""
const state=JSON.parse(fs.readFileSync(STATE));
if(target(base+'/current')!==state.backendCurrent||target(base+'/admin')!==state.admin||![state.previousWeb,state.directory].includes(target(base+'/webcurrent'))||![state.nginxHash,state.newNginxHash].includes(digest(fs.readFileSync(conf))))throw new Error('Release baseline changed before immutable asset retention');
const retain=require(state.backup+'/retain-web-session-assets.cjs').retainHashedAssets,root=base+'/web-releases';
const histories=fs.readdirSync(root,{withFileTypes:true}).filter(item=>item.isDirectory()&&/^\d+\.\d+\.\d+-web-\d{8}-\d{6}$/.test(item.name)).map(item=>path.join(root,item.name)).filter(item=>item!==state.directory).sort();
const result={passed:true,previous:state.previousWeb,directory:state.directory,retained:[],reused:0,bytes:0,sources:[]};
for(const previous of histories){const part=retain({root,previous,directory:state.directory,maxBytes:1024*1024*1024-result.bytes,maxFiles:2000-result.retained.length});result.retained.push(...part.retained);result.reused+=part.reused;result.bytes+=part.bytes;result.sources.push(previous)}
state.retainedSessionAssets=result;fs.writeFileSync(stateFile(state.backup),JSON.stringify(state),{mode:0o600});console.log(JSON.stringify(result));
""".replace('STATE', json.dumps(state['backup'] + '/state.json')), 'retain-sessions')
    state['retainedSessionAssets'] = result
    private_state(release).write_text(json.dumps(state, indent=2), encoding='utf-8')
    return result


def publish(client, release):
    state = json.loads(private_state(release).read_text())
    return remote(client, COMMON + r"""
const state=JSON.parse(fs.readFileSync(STATE)),manifest=JSON.parse(fs.readFileSync(state.backup+'/manifest.json'));
const save=result=>{fs.writeFileSync(state.backup+'/deployment.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result))};
(async()=>{if(!state.stagedAt||digest(fs.readFileSync(conf))!==state.nginxHash||target(base+'/current')!==state.backendCurrent||target(base+'/webcurrent')!==state.previousWeb)throw new Error('Prepared baseline changed');
let changed=false;try{swap(base+'/webcurrent',state.directory);changed=true;atomicFile(conf,fs.readFileSync(state.backup+'/nginx-next.conf'),state.nginxMode);call(nginx,['-t']);call(nginx,['-s','reload']);
let last;for(let i=0;i<20;i++){try{const response=await fetch('https://seal.xingmasoft.com/office/',{signal:AbortSignal.timeout(5000)});if(response.status!==200||digest(Buffer.from(await response.arrayBuffer()))!==manifest['index.html'].sha256)throw new Error('Public index mismatch');last=null;break}catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,250))}}if(last)throw last;
const checks=[];for(const [name,entry] of Object.entries(manifest)){const response=await fetch('https://seal.xingmasoft.com/office/'+name.split('/').map(encodeURIComponent).join('/'),{signal:AbortSignal.timeout(15000)});if(response.status!==200||digest(Buffer.from(await response.arrayBuffer()))!==entry.sha256)throw new Error('Public asset mismatch: '+name);checks.push(name)}
const root=await fetch('https://seal.xingmasoft.com/'),caps=await(await fetch('https://seal.xingmasoft.com/api/v1/capabilities')).json(),unauth=await fetch('https://seal.xingmasoft.com/api/v1/conversion/capabilities');if(digest(Buffer.from(await root.arrayBuffer()))!==state.adminHash||target(base+'/current')!==state.backendCurrent||target(base+'/admin')!==state.admin||caps.collaboration!==1||caps.accountConversion!==1||unauth.status!==401)throw new Error('Existing service preservation check failed');
save({passed:true,release:state.release,directory:state.directory,backup:state.backup,previousWeb:state.previousWeb,backendPointerUnchanged:true,adminUnchanged:true,unauthorizedGateway:401,assetCount:checks.length,nginxHash:digest(fs.readFileSync(conf)),completedAt:new Date().toISOString(),browserCheck:'pending public browser acceptance'});
}catch(error){console.error(error.message);let rolledBack=false;if(changed){try{restore(state);rolledBack=true}catch(rollbackError){console.error(rollbackError.message)}}save({passed:false,release:state.release,rolledBack,error:'Web deployment or health check failed; private diagnostics retained'});process.exitCode=rolledBack?2:3}})().catch(error=>{console.error(error.message);process.exitCode=1});
""".replace('STATE', json.dumps(state['backup'] + '/state.json')), 'publish', timeout=240)


def rollback(client, release):
    state = json.loads(private_state(release).read_text())
    return remote(client, COMMON + r"""
const state=JSON.parse(fs.readFileSync(STATE));if(target(base+'/webcurrent')!==state.directory||digest(fs.readFileSync(conf))!==state.newNginxHash)throw new Error('Cannot rollback over a newer deployment');restore(state);if(target(base+'/current')!==state.backendCurrent)throw new Error('Backend pointer changed outside Web deployment');console.log(JSON.stringify({rolledBack:true,release:state.release,webCurrent:target(base+'/webcurrent'),backendPointerUnchanged:true,nginxHash:digest(fs.readFileSync(conf))}));
""".replace('STATE', json.dumps(state['backup'] + '/state.json')), 'rollback')


def current_web_main_sha():
    folder = ROOT / 'mobile/unpackage/web'
    html = (folder / 'index.html').read_text(encoding='utf-8')
    main = re.search(r'src="\./(assets/index-[^"]+\.js)"', html)[1]
    return sha((folder / main).read_bytes())


def public_browser_acceptance(client, release):
    expected = json.loads(private_state(release).read_text())['mainJsSha256']
    def current_main_sha():
        return current_web_main_sha()
    try:
        reports = []
        # Each independent cold-profile workflow keeps the same 240s watchdog.
        # Large template photography is no longer part of the bootstrap route.
        for group in ['documents', 'templates', 'projects']:
            if current_main_sha() != expected:
                raise RuntimeError('Frozen Web bundle changed during public acceptance')
            started = time.time()
            arguments = json.dumps(['mobile/tests/public-web.cjs', '--group=' + group])
            launcher = "const p=require('node:child_process').spawn(require('electron')," + arguments + ",{windowsHide:true,stdio:'inherit'});p.on('error',()=>process.exitCode=1);p.on('exit',code=>process.exitCode=code);setTimeout(()=>{p.kill();process.exitCode=1},240000).unref()"
            with (PRIVATE / (release + '-public-' + group + '.log')).open('wb') as log:
                completed = subprocess.run([shutil.which('node') or 'node', '-e', launcher], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=260, check=False)
            result_file = ROOT / ('.upgrade-private/public-web-verification/public-' + group + '-result.json')
            result = json.loads(result_file.read_text(encoding='utf-8'))
            if completed.returncode or result_file.stat().st_mtime < started or not result.get('passed') or result.get('group') != group or result.get('version') != VERSION:
                raise RuntimeError('Public browser workflow failed: ' + group)
            reports.append(result)
        if current_main_sha() != expected:
            raise RuntimeError('Frozen Web bundle changed during public acceptance')
        documents, templates, projects = reports
        report = dict(documents)
        report.update(group='all', checks=list(dict.fromkeys(check for item in reports for check in item['checks'])),
                      template=templates['template'], projectLists=projects['projectLists'],
                      errors=[error for item in reports for error in item['errors']],
                      requestCount=sum(item['requestCount'] for item in reports),
                      externalRequests=sum(item['externalRequests'] for item in reports),
                      productionAccountOperations=sum(item['productionAccountOperations'] for item in reports),
                      allGroupsCompleted=True, processWatchdogMs=240000, mainJsSha256=expected,
                      groups=[{'name':item['group'],'passed':item['passed'],'checks':len(item['checks'])} for item in reports])
        (ROOT / '.upgrade-private/public-web-verification/public-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report
    except Exception:
        # A failed final public browser check must not leave a broken new Web UI
        # active. The rollback function refuses to overwrite a newer deployment.
        rollback(client, release)
        raise RuntimeError('Public browser acceptance failed; Web pointer and NGINX rolled back; private diagnostics retained') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['preflight', 'prepare', 'plan', 'stage', 'retain-sessions', 'publish', 'rollback'])
    parser.add_argument('--release-id'); parser.add_argument('--main-js-sha'); parser.add_argument('--qa-report')
    args = parser.parse_args()
    if args.action != 'preflight' and not re.fullmatch(re.escape(VERSION) + r'-web-\d{8}-\d{6}', args.release_id or ''):
        parser.error('A distinct ' + VERSION + '-web-YYYYMMDD-HHMMSS release ID is required')
    if args.action == 'stage' and (not re.fullmatch(r'[a-f0-9]{64}', args.main_js_sha or '') or not args.qa_report):
        parser.error('Staging requires the frozen main JS SHA-256 and a fresh passed browser QA report')
    PRIVATE.mkdir(exist_ok=True)
    client = connection()
    try:
        if args.action == 'preflight': result = preflight(client)
        elif args.action == 'prepare': result = prepare(client, args.release_id)
        elif args.action == 'plan': result = plan(client, args.release_id)
        elif args.action == 'stage': result = stage(client, args.release_id, args.main_js_sha, args.qa_report)
        elif args.action == 'retain-sessions': result = retain_sessions(client, args.release_id)
        elif args.action == 'publish':
            result = publish(client, args.release_id)
            result['browserAcceptance'] = public_browser_acceptance(client, args.release_id)
        else: result = rollback(client, args.release_id)
        # ASCII JSON stays parseable through Windows console code pages; report
        # files and browser artifacts retain their original UTF-8 text.
        print(json.dumps(result, ensure_ascii=True))
    finally:
        client.close()


if __name__ == '__main__':
    main()
