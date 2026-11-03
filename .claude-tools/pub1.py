"""把当前版本已验收的安装包发布为 GitHub 与 GitCode 正式版（latest）。

用法：python scripts/publish-current-release.py [--notes 说明文件] [--check]
- 只上传 release/v<版本>/ 中实际存在且列入 SHA256SUMS.txt 的成品；缺失的平台在说明里注明，不伪造。
- 凭据来自 git credential helper（与 git push 相同），不保存、不打印。
- 已存在的同名附件在字节一致时跳过；不一致时替换。上传后核对大小与 SHA-256。
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote, urlsplit

import requests

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
TAG = 'v' + VERSION
DIRECTORY = ROOT / 'release' / TAG
GH = 'https://api.github.com/repos/fangzhouxiaohai/seal-office'
GC = 'https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office'
CANDIDATES = [
    f'seal-office-setup-{VERSION}.exe',
    f'seal-office-{VERSION}-portable.exe',
    f'seal-office-{VERSION}-microsoft-store-x64.msix',
    f'seal-office-{VERSION}-amd64.deb',
    f'seal-office-{VERSION}-android.apk',
    f'seal-office-{VERSION}-harmony.app.zip',
    f'seal-office-{VERSION}-android-cloud-source.zip',
    f'seal-office-{VERSION}-harmony-cloud-source.zip',
]
TOKENS = {}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def credential(host):
    result = subprocess.run(['git', 'credential', 'fill'], input=f'protocol=https\nhost={host}\n\n', capture_output=True, text=True,
                            check=True, cwd=ROOT, env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
    values = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if not values.get('password'):
        raise RuntimeError('未找到 ' + host + ' 的 Git 凭据')
    return values['password']


def api(kind, method, path, missing=False, **kwargs):
    headers = {'User-Agent': 'SealOffice-release'}
    if kind == 'github':
        headers.update({'Authorization': 'Bearer ' + TOKENS[kind], 'Accept': 'application/vnd.github+json'})
    else:
        kwargs['params'] = {'access_token': TOKENS[kind], **kwargs.pop('params', {})}
    url = path if path.startswith('https://') else (GH if kind == 'github' else GC) + path
    for attempt in range(4):
        try:
            response = requests.request(method, url, headers={**headers, **kwargs.pop('headers', {})}, timeout=(30, 1800), **kwargs)
            break
        except requests.RequestException as error:
            if attempt == 3 or 'data' in kwargs:
                raise RuntimeError(f'{kind} {method} 网络失败：{type(error).__name__}') from None
            time.sleep(5)
    if missing and response.status_code == 404:
        return None
    if not response.ok:
        raise RuntimeError(f'{kind} {method} {urlsplit(url).path} HTTP {response.status_code}: {response.text[:300]}')
    return response.json() if response.content else {}


def assets():
    sums = {}
    for line in (DIRECTORY / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines():
        parts = line.split()
        if len(parts) >= 2:
            sums[parts[1]] = parts[0].lower()
    rows = []
    for name in CANDIDATES:
        file = DIRECTORY / name
        if not file.is_file():
            continue
        digest = sha(file)
        if sums.get(name) != digest:
            raise RuntimeError('SHA256SUMS 与文件不一致：' + name)
        rows.append({'name': name, 'bytes': file.stat().st_size, 'sha256': digest})
    rows.append({'name': 'SHA256SUMS.txt', 'bytes': (DIRECTORY / 'SHA256SUMS.txt').stat().st_size, 'sha256': sha(DIRECTORY / 'SHA256SUMS.txt')})
    return rows


def github_publish(rows, title, body):
    release = api('github', 'GET', '/releases/tags/' + TAG, missing=True)
    payload = {'name': title, 'body': body, 'draft': False, 'prerelease': False, 'make_latest': 'true'}
    if release is None:
        release = api('github', 'POST', '/releases', json={'tag_name': TAG, **payload})
    else:
        release = api('github', 'PATCH', f"/releases/{release['id']}", json=payload)
    rid = release['id']
    for row in rows:
        current = api('github', 'GET', f'/releases/{rid}')
        remote = next((item for item in current['assets'] if item['name'] == row['name']), None)
        if remote and remote['size'] == row['bytes'] and remote.get('digest') == 'sha256:' + row['sha256']:
            print(json.dumps({'github': 'skip', 'name': row['name']}, ensure_ascii=False), flush=True)
            continue
        if remote:
            api('github', 'DELETE', f"/releases/assets/{remote['id']}")
        with (DIRECTORY / row['name']).open('rb') as handle:
            remote = api('github', 'POST', release['upload_url'].split('{')[0], params={'name': row['name']},
                         headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(row['bytes'])}, data=handle)
        if remote['size'] != row['bytes'] or remote.get('digest') not in (None, 'sha256:' + row['sha256']):
            raise RuntimeError('GitHub 附件校验失败：' + row['name'])
        print(json.dumps({'github': 'uploaded', 'name': row['name'], 'bytes': row['bytes']}, ensure_ascii=False), flush=True)
    final = api('github', 'GET', f'/releases/{rid}')
    for row in rows:
        remote = next(item for item in final['assets'] if item['name'] == row['name'])
        assert remote['size'] == row['bytes'] and remote.get('digest') == 'sha256:' + row['sha256'], row['name']
    return final['html_url']


def gitcode_publish(rows, title, body):
    release = api('gitcode', 'GET', '/releases/' + TAG, missing=True)
    payload = {'name': title, 'body': body, 'release_status': 'latest'}
    if release is None:
        api('gitcode', 'POST', '/releases', json={'tag_name': TAG, **payload})
    else:
        try:
            api('gitcode', 'PATCH', '/releases/' + TAG, json={'tag_name': TAG, **payload})
        except RuntimeError as error:
            print(json.dumps({'gitcode': 'update-notes-failed', 'error': str(error)[:200]}, ensure_ascii=False), flush=True)

    def upload(row):
        current = api('gitcode', 'GET', '/releases/' + TAG)
        remote = next((item for item in current.get('assets', []) if item['name'] == row['name']), None)
        if remote and int(remote.get('size') or 0) == row['bytes']:
            return {'name': row['name'], 'status': 'skip'}
        target = api('gitcode', 'GET', '/releases/' + TAG + '/upload_url', params={'file_name': row['name']})
        parsed = urlsplit(target['url'])
        if parsed.scheme != 'https':
            raise RuntimeError('GitCode 上传地址异常')
        with (DIRECTORY / row['name']).open('rb') as handle:
            response = requests.put(target['url'], headers={**target['headers'], 'Content-Length': str(row['bytes'])}, data=handle, timeout=(30, 3600))
        if not response.ok:
            raise RuntimeError(f"GitCode 存储 HTTP {response.status_code}: {row['name']}")
        for _ in range(30):
            current = api('gitcode', 'GET', '/releases/' + TAG)
            remote = next((item for item in current.get('assets', []) if item['name'] == row['name']), None)
            if remote:
                break
            time.sleep(3)
        if not remote:
            raise RuntimeError('GitCode 附件未出现：' + row['name'])
        return {'name': row['name'], 'status': 'uploaded'}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(upload, rows):
            print(json.dumps({'gitcode': result}, ensure_ascii=False), flush=True)
    # 小文件做匿名下载核对字节
    for row in rows:
        if row['bytes'] > 120_000_000:
            continue
        url = GC + '/releases/' + TAG + '/attach_files/' + quote(row['name']) + '/download'
        digest, size = hashlib.sha256(), 0
        with requests.get(url, stream=True, timeout=(30, 600)) as response:
            response.raise_for_status()
            for block in response.iter_content(4 * 1024 * 1024):
                digest.update(block)
                size += len(block)
        if size != row['bytes'] or digest.hexdigest() != row['sha256']:
            raise RuntimeError('GitCode 公开下载字节不一致：' + row['name'])
        print(json.dumps({'gitcodeVerified': row['name']}, ensure_ascii=False), flush=True)
    return 'https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/' + TAG


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--notes', default=str(ROOT / 'docs' / 'release-notes' / f'{TAG}.md'))
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--only', choices=['github', 'gitcode'])
    args = parser.parse_args()
    head = git('rev-parse', TAG + '^{commit}')
    for remote in ['github', 'origin']:
        if head not in git('ls-remote', remote, f'refs/tags/{TAG}', f'refs/tags/{TAG}^{{}}'):
            raise SystemExit(f'请先把 {TAG} 推送到 {remote}')
    rows = assets()
    notes = Path(args.notes).read_text(encoding='utf-8')
    title = f'海豹办公 {VERSION}'
    print(json.dumps({'tag': TAG, 'assets': rows}, ensure_ascii=False, indent=1), flush=True)
    if args.check:
        return
    for kind, host in [('github', 'github.com'), ('gitcode', 'gitcode.com')]:
        TOKENS[kind] = credential(host)
    result = {}
    if args.only != 'gitcode':
        result['github'] = github_publish(rows, title, notes)
    if args.only != 'github':
        result['gitcode'] = gitcode_publish(rows, title, notes)
    print(json.dumps({'passed': True, **result, 'assets': len(rows)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except (RuntimeError, AssertionError) as error:
        print('发布中止：' + str(error), file=sys.stderr)
        sys.exit(1)
