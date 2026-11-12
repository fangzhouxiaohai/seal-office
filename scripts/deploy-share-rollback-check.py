"""在服务器隔离临时目录验证分享页切换失败后的自动回滚。"""

import importlib.util
import json
import shlex
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('deploy_share', ROOT / 'scripts/deploy-share.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def main():
    cfg = json.loads((ROOT / '.upgrade-private/connection.json').read_text(encoding='utf-8-sig'))
    ssh = MODULE.secure_connection(cfg, ROOT / '.upgrade-private/server-known-hosts')
    sftp = ssh.open_sftp()
    base = '/tmp/seal-share-rollback-' + uuid4().hex
    known_files = []
    known_dirs = [base, base + '/bin', base + '/backup']
    try:
        for directory in known_dirs:
            sftp.mkdir(directory, mode=0o700)

        def put(name, content, mode=0o600):
            filename = base + '/' + name
            known_files.append(filename)
            with sftp.open(filename, 'wb') as stream:
                stream.write(content)
            sftp.chmod(filename, mode)
            return filename

        old, new, staged = {}, {}, {}
        MODULE.FILES = {key: (key, base + '/' + key) for key in ('script', 'page', 'nginx')}
        for key, (_, target) in MODULE.FILES.items():
            before, after = ('原内容-' + key).encode(), ('新内容-' + key).encode()
            old[key], new[key] = MODULE.hash_bytes(before), MODULE.hash_bytes(after)
            put(key, before)
            put('backup/' + key + '.bak', before)
            staged[key] = put(key + '.next', after)
            known_files.append(target + '.seal-restore-backup')
        marker = base + '/模拟失败标记'
        known_files.append(marker)
        put('bin/nginx', f'#!/bin/sh\nif [ ! -f {shlex.quote(marker)} ]; then touch {shlex.quote(marker)}; exit 1; fi\nexit 0\n'.encode(), 0o700)
        put('bin/systemctl', b'#!/bin/sh\nexit 0\n', 0o700)
        script = 'export PATH=' + shlex.quote(base + '/bin') + ':$PATH\n' + MODULE.build_switch_script(base + '/backup', staged, old, new)
        stdin, stdout, stderr = ssh.exec_command('bash -s', timeout=30)
        stdin.write(script)
        stdin.channel.shutdown_write()
        result = stdout.read().decode('utf-8', 'replace')
        errors = stderr.read().decode('utf-8', 'replace')
        status = stdout.channel.recv_exit_status()
        if status == 0 or 'SHARE_ROLLBACK_OK' not in result or 'SHARE_ROLLBACK_FAILED' in errors:
            raise RuntimeError('模拟失败时未确认成功回滚')
        actual = {key: MODULE.hash_bytes(MODULE.remote_file(sftp, target)) for key, (_, target) in MODULE.FILES.items()}
        MODULE.verify_baseline(old, actual)
        print('隔离环境中模拟 nginx 校验失败，三项文件均已恢复并逐项核验')
    finally:
        # 只清理本次随机创建的目录及其明确列出的文件。
        if not base.startswith('/tmp/seal-share-rollback-') or len(base.rsplit('-', 1)[-1]) != 32:
            raise RuntimeError('临时目录不符合清理范围')
        for filename in reversed(known_files):
            try:
                sftp.remove(filename)
            except IOError:
                pass
        for directory in reversed(known_dirs):
            try:
                sftp.rmdir(directory)
            except IOError:
                pass
        sftp.close()
        ssh.close()


if __name__ == '__main__':
    main()
