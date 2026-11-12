"""仅发布匿名分享页面和 nginx 路由，校验失败时恢复三份原文件。"""

import argparse
import base64
import hashlib
import json
import re
import shlex
import subprocess
from datetime import datetime
from pathlib import Path
from uuid import uuid4

import paramiko
import requests


ROOT = Path(__file__).resolve().parent.parent
SITE = '/www/wwwroot/seal.xingmasoft.com'
BACKUPS = '/root/seal-share-deploy'
FINGERPRINT = 'SHA256:E5r0/n8PRbe7VLprGOWW7Y/E3ZpnLVaVo53q+5r4xPw'
FILES = {
    'script': ('share/app.js', SITE + '/share/app.js'),
    'page': ('share/index.html', SITE + '/share/index.html'),
    'nginx': ('server/deploy/nginx-admin-assets.conf', '/www/server/panel/vhost/nginx/extension/seal.xingmasoft.com/10-admin-assets.conf'),
}


def hash_bytes(content):
    return hashlib.sha256(content).hexdigest()


def valid_backup_id(value):
    return re.fullmatch(r'\d{8}T\d{6}-[a-f0-9]{12}', value or '') is not None


def secure_connection(credentials, known_hosts):
    client = paramiko.SSHClient()
    try:
        client.load_host_keys(str(known_hosts))
        client.set_missing_host_key_policy(paramiko.RejectPolicy())
        client.connect(credentials['host'], username=credentials['user'], password=credentials['password'],
                       timeout=20, look_for_keys=False, allow_agent=False)
        transport = client.get_transport()
        actual = 'SHA256:' + base64.b64encode(hashlib.sha256(transport.get_remote_server_key().asbytes()).digest()).decode().rstrip('=')
        if actual != FINGERPRINT:
            raise RuntimeError('SSH 服务器指纹不匹配')
        transport.set_keepalive(15)
        return client
    except BaseException:
        client.close()
        raise


def verify_baseline(expected, actual):
    if expected != actual:
        raise RuntimeError('线上文件与修改前版本不一致，已停止发布')


def verify_response(response, expected):
    if response.status_code != 200 or response.history:
        raise RuntimeError('分享入口返回错误或发生跳转')
    if hash_bytes(response.content) != expected:
        raise RuntimeError('公网返回的分享内容与发布文件不一致')
    if 'no-store' not in response.headers.get('Cache-Control', '').lower():
        raise RuntimeError('分享入口缺少禁止缓存响应头')
    if response.headers.get('Referrer-Policy', '').lower() != 'no-referrer':
        raise RuntimeError('分享入口缺少引用来源保护')
    if "script-src 'self'" not in response.headers.get('Content-Security-Policy', ''):
        raise RuntimeError('分享入口缺少脚本安全策略')


def remote_command(ssh, command):
    _input, output, error = ssh.exec_command(command, timeout=60)
    out = output.read().decode('utf-8', 'replace')
    err = error.read().decode('utf-8', 'replace')
    code = output.channel.recv_exit_status()
    if code:
        raise RuntimeError('远程核验失败：' + (err or out)[-1000:])
    return out.strip()


def remote_script(ssh, script):
    stream, output, error = ssh.exec_command('bash -s', timeout=60)
    stream.write(script)
    stream.channel.shutdown_write()
    out = output.read().decode('utf-8', 'replace')
    err = error.read().decode('utf-8', 'replace')
    if output.channel.recv_exit_status():
        raise RuntimeError('服务器切换失败：' + (err or out)[-1000:])
    if 'SHARE_SWITCH_OK' not in out:
        raise RuntimeError('服务器切换没有完成标记')


def build_switch_script(backup, staged, old_hashes, new_hashes):
    quote = shlex.quote
    lines = ['set -Eeuo pipefail', '# 校验发布基线']
    for key, (_, target) in FILES.items():
        lines.append(f'test "$(sha256sum {quote(target)} | cut -d " " -f1)" = {quote(old_hashes[key])}')
    lines.extend(['rollback() {', '  trap - ERR HUP INT TERM', '  set +e', '  result=0'])
    for key, (_, target) in FILES.items():
        source = f'{backup}/{key}.bak'
        temporary = target + '.seal-restore-' + backup.rsplit('/', 1)[-1]
        lines.append(f'  cp -p {quote(source)} {quote(temporary)} && mv -f {quote(temporary)} {quote(target)} || result=1')
    lines.extend(['  nginx -t && systemctl reload nginx || result=1'])
    for key, (_, target) in FILES.items():
        lines.append(f'  test "$(sha256sum {quote(target)} | cut -d " " -f1)" = {quote(old_hashes[key])} || result=1')
    lines.extend(['  if [ "$result" -eq 0 ]; then echo SHARE_ROLLBACK_OK; else echo SHARE_ROLLBACK_FAILED >&2; fi',
                  '  exit 1', '}', 'trap rollback ERR HUP INT TERM'])
    for key in ('script', 'page', 'nginx'):
        lines.append(f'mv -f {quote(staged[key])} {quote(FILES[key][1])}')
    lines.extend(['nginx -t', 'systemctl reload nginx'])
    for key, (_, target) in FILES.items():
        lines.append(f'test "$(sha256sum {quote(target)} | cut -d " " -f1)" = {quote(new_hashes[key])}')
    lines.extend(['trap - ERR HUP INT TERM', 'echo SHARE_SWITCH_OK'])
    return '\n'.join(lines) + '\n'


def remote_file(sftp, filename):
    with sftp.open(filename, 'rb') as stream:
        return stream.read()


def read_state(ssh):
    result = remote_command(ssh, '\n'.join([
        'set -e',
        f'readlink -f {shlex.quote(SITE + "/current")}',
        f'readlink -f {shlex.quote(SITE + "/webcurrent")}',
        f'sha256sum {shlex.quote(SITE + "/admin/index.html")} | cut -d " " -f 1',
        'systemctl is-active seal-cloud',
    ]))
    lines = result.splitlines()
    if len(lines) != 4 or lines[3] != 'active':
        raise RuntimeError('后端、网页或后台当前状态无法核验')
    return lines


def public_check(contents):
    checks = [('/share/', 'page'), ('/share/?v=2', 'page'),
              ('/share/index.html', 'page'), ('/share/app.js?v=2', 'script')]
    for trust_env in (True, False):
        with requests.Session() as client:
            client.trust_env = trust_env
            for route, kind in checks:
                response = client.get('https://seal.xingmasoft.com' + route, timeout=30, allow_redirects=False)
                verify_response(response, hash_bytes(contents[kind]))


def restore(ssh, sftp, backup, old_hashes, new_hashes):
    # 若有其他发布同时改动相同文件，不覆盖对方的新内容。
    actual = {key: hash_bytes(remote_file(sftp, target)) for key, (_, target) in FILES.items()}
    if any(actual[key] not in (old_hashes[key], new_hashes[key]) for key in FILES):
        raise RuntimeError('线上文件已被其他操作更改，未覆盖其内容；请使用备份人工核对')
    commands = ['set -e']
    for key, (_, target) in FILES.items():
        source = f'{backup}/{key}.bak'
        temporary = target + '.seal-restore-' + backup.rsplit('/', 1)[-1]
        commands.extend([f'cp -p {shlex.quote(source)} {shlex.quote(temporary)}',
                         f'mv -f {shlex.quote(temporary)} {shlex.quote(target)}'])
    commands.extend(['nginx -t', 'systemctl reload nginx'])
    remote_command(ssh, '\n'.join(commands))
    verify_baseline(old_hashes, {key: hash_bytes(remote_file(sftp, target)) for key, (_, target) in FILES.items()})


def main():
    parser = argparse.ArgumentParser(description='仅发布分享页及路由，失败自动回滚')
    parser.add_argument('--deploy', action='store_true', required=True)
    parser.parse_args()
    local = {key: (ROOT / source).read_bytes() for key, (source, _) in FILES.items()}
    baseline = {key: hash_bytes(subprocess.check_output(['git', 'show', 'HEAD:' + source], cwd=ROOT))
                for key, (source, _) in FILES.items()}
    new_hashes = {key: hash_bytes(content) for key, content in local.items()}
    cfg = json.loads((ROOT / '.upgrade-private/connection.json').read_text(encoding='utf-8-sig'))
    backup_id = datetime.now().strftime('%Y%m%dT%H%M%S') + '-' + uuid4().hex[:12]
    assert valid_backup_id(backup_id)
    backup = BACKUPS + '/' + backup_id
    ssh = secure_connection(cfg, ROOT / '.upgrade-private/server-known-hosts')
    sftp = ssh.open_sftp()
    staged = {}
    changed = False
    old_hashes = {}
    try:
        before_state = read_state(ssh)
        old = {key: remote_file(sftp, target) for key, (_, target) in FILES.items()}
        old_hashes = {key: hash_bytes(content) for key, content in old.items()}
        verify_baseline(baseline, old_hashes)
        try:
            sftp.stat(BACKUPS)
        except IOError:
            sftp.mkdir(BACKUPS, mode=0o700)
        sftp.mkdir(backup, mode=0o700)
        for key, (_, target) in FILES.items():
            stat = sftp.stat(target)
            with sftp.open(f'{backup}/{key}.bak', 'wb') as stream:
                stream.write(old[key])
            sftp.chmod(f'{backup}/{key}.bak', stat.st_mode & 0o777)
            sftp.chown(f'{backup}/{key}.bak', stat.st_uid, stat.st_gid)
            staged[key] = target + '.seal-' + backup_id + '.next'
            with sftp.open(staged[key], 'wb') as stream:
                stream.write(local[key])
            sftp.chmod(staged[key], stat.st_mode & 0o777)
            sftp.chown(staged[key], stat.st_uid, stat.st_gid)
            if hash_bytes(remote_file(sftp, staged[key])) != new_hashes[key]:
                raise RuntimeError('上传文件哈希不一致')
        verify_baseline(old_hashes, {key: hash_bytes(remote_file(sftp, target)) for key, (_, target) in FILES.items()})
        # 目标和暂存文件均在同一目录；服务器端同步设立失败回滚。
        changed = True
        remote_script(ssh, build_switch_script(backup, staged, old_hashes, new_hashes))
        verify_baseline(new_hashes, {key: hash_bytes(remote_file(sftp, target)) for key, (_, target) in FILES.items()})
        public_check(local)
        if read_state(ssh) != before_state:
            raise RuntimeError('后端、网页或后台状态在发布期间发生变化')
        print(json.dumps({'通过': True, '备份目录': backup, '公网入口及脚本检查': 8,
                          '后端与网页指针未变': True, '后台页面未变': True}, ensure_ascii=False))
    except BaseException as error:
        if changed:
            try:
                restore(ssh, sftp, backup, old_hashes, new_hashes)
                if read_state(ssh) != before_state:
                    raise RuntimeError('关联状态与发布前不同')
                print(json.dumps({'已回滚并核验': True, '备份目录': backup}, ensure_ascii=False))
            except Exception as rollback_error:
                print(json.dumps({'回滚失败': str(rollback_error), '备份目录': backup}, ensure_ascii=False))
        raise RuntimeError('分享页面发布中止：' + str(error)) from None
    finally:
        for temporary in staged.values():
            try:
                sftp.remove(temporary)
            except IOError:
                pass
        sftp.close()
        ssh.close()


if __name__ == '__main__':
    main()
