"""把当前版本已验收的安装包发布为 GitHub 与 GitCode 正式版（latest）。

用法：python scripts/publish-current-release.py [--tag 当前版本补发标签] [--notes 说明文件] [--check]
- 只上传 release/v<版本>/ 中实际存在且列入 SHA256SUMS.txt 的成品；缺失的平台在说明里注明，不伪造。
- 凭据来自 git credential helper（与 git push 相同），不保存、不打印。
- 已存在的同名附件在字节一致时跳过；不一致时替换。上传后核对大小与 SHA-256。
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
import re
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
    f'seal-office-{VERSION}-microsoft-store-x64.msix',
    f'seal-office-{VERSION}-amd64.deb',
    f'seal-office-{VERSION}-macos.dmg',
    f'seal-office-{VERSION}-macos-arm64.dmg',
    f'seal-office-{VERSION}-macos-intel.dmg',
    f'seal-office-{VERSION}-android.apk',
    f'seal-office-{VERSION}-harmony.hap',
    f'seal-office-{VERSION}-web.zip',
]
TOKENS = {}


def release_tag(value):
    tag = value or 'v' + VERSION
    if not re.fullmatch(r'v' + re.escape(VERSION) + r'(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?', tag):
        raise ValueError('发行标签必须属于当前项目版本')
    return tag


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


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


def assets(names=None):
    sums = {}
    for line in (DIRECTORY / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines():
        parts = line.split()
        if len(parts) >= 2:
            sums[parts[1]] = parts[0].lower()
    rows = []
    for name in CANDIDATES:
        if names and name not in names:
            continue
        # The universal DMG can be prepared exclusively for the in-app update.
        if name == f'seal-office-{VERSION}-macos.dmg' and name not in sums and (DIRECTORY / 'SHA256SUMS-local.txt').is_file():
            local_sums = (DIRECTORY / 'SHA256SUMS-local.txt').read_text(encoding='utf-8-sig').splitlines()
            if any(line.split()[1:] == [name] for line in local_sums):
                continue
        relative = name if (DIRECTORY / name).is_file() else 'mobile-web/' + name
        file = DIRECTORY / relative
        if not file.is_file():
            continue
        digest = sha(file)
        if sums.get(relative) != digest:
            raise RuntimeError('SHA256SUMS 与文件不一致：' + name)
        rows.append({'name': name, 'path': relative, 'bytes': file.stat().st_size, 'sha256': digest})
    if not names or 'SHA256SUMS.txt' in names:
        rows.append({'name': 'SHA256SUMS.txt', 'path': 'SHA256SUMS.txt', 'bytes': (DIRECTORY / 'SHA256SUMS.txt').stat().st_size, 'sha256': sha(DIRECTORY / 'SHA256SUMS.txt')})
    return select_assets(rows, names)


def select_assets(rows, names):
    if not names:
        return rows
    requested = set(names)
    selected = [row for row in rows if row['name'] in requested]
    if len(selected) != len(requested):
        missing = requested.difference(row['name'] for row in selected)
        raise ValueError('找不到已校验的发行附件：' + '、'.join(sorted(missing)))
    return selected


def gitcode_matches(remote, row):
    if int(remote.get('size') or 0) != row['bytes']:
        return False
    url = GC + '/releases/' + TAG + '/attach_files/' + quote(row['name'], safe='') + '/download'
    digest, size = hashlib.sha256(), 0
    try:
        with requests.get(url, stream=True, timeout=(30, 600)) as response:
            response.raise_for_status()
            for block in response.iter_content(4 * 1024 * 1024):
                digest.update(block)
                size += len(block)
    except requests.RequestException as error:
        raise RuntimeError('GitCode 附件下载中断：' + row['name'] + '，' + type(error).__name__) from None
    if size != row['bytes']:
        raise RuntimeError('GitCode 附件下载不完整：' + row['name'])
    return digest.hexdigest() == row['sha256']


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
        upload_name = row['name'] + '.upload-' + row['sha256'][:16] if remote else row['name']
        uploaded = next((item for item in current['assets'] if item['name'] == upload_name), None)
        if not uploaded:
            with (DIRECTORY / row['path']).open('rb') as handle:
                uploaded = api('github', 'POST', release['upload_url'].split('{')[0], params={'name': upload_name},
                               headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(row['bytes'])}, data=handle)
        if uploaded['size'] != row['bytes'] or uploaded.get('digest') != 'sha256:' + row['sha256']:
            raise RuntimeError('GitHub 附件校验失败：' + row['name'])
        if remote:
            old_path = f"/releases/assets/{remote['id']}"
            if api('github', 'GET', old_path)['name'] != row['name']:
                raise RuntimeError('GitHub 同名附件在上传期间发生变化：' + row['name'])
            api('github', 'PATCH', old_path, json={'name': row['name'] + '.previous-' + str(remote['id'])})
            try:
                api('github', 'PATCH', f"/releases/assets/{uploaded['id']}", json={'name': row['name']})
            except Exception:
                latest = api('github', 'GET', f'/releases/{rid}')
                canonical = next((item for item in latest['assets'] if item['name'] == row['name']), None)
                if canonical is None:
                    api('github', 'PATCH', old_path, json={'name': row['name']})
                    raise
                if canonical['id'] != uploaded['id']:
                    raise
            api('github', 'DELETE', old_path)
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
        if remote and gitcode_matches(remote, row):
            return {'name': row['name'], 'status': 'skip'}
        if remote:
            api('gitcode', 'DELETE', f"/releases/{TAG}/attach_files/{remote['id']}")
        target = api('gitcode', 'GET', '/releases/' + TAG + '/upload_url', params={'file_name': row['name']})
        parsed = urlsplit(target['url'])
        if parsed.scheme != 'https':
            raise RuntimeError('GitCode 上传地址异常')
        with (DIRECTORY / row['path']).open('rb') as handle:
            try:
                response = requests.put(target['url'], headers={**target['headers'], 'Content-Length': str(row['bytes'])}, data=handle, timeout=(30, 3600))
            except requests.RequestException as error:
                raise RuntimeError('GitCode 附件上传中断：' + row['name'] + '，' + type(error).__name__) from None
        if not response.ok:
            raise RuntimeError(f"GitCode 存储 HTTP {response.status_code}: {row['name']}")
        for _ in range(30):
            current = api('gitcode', 'GET', '/releases/' + TAG)
            remote = next((item for item in current.get('assets', []) if item['name'] == row['name']), None)
            if remote and int(remote.get('size') or 0) == row['bytes']:
                break
            time.sleep(3)
        if not remote or not gitcode_matches(remote, row):
            raise RuntimeError('GitCode 公开下载校验失败：' + row['name'])
        return {'name': row['name'], 'status': 'uploaded'}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(upload, rows):
            print(json.dumps({'gitcode': result}, ensure_ascii=False), flush=True)
    return 'https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/' + TAG


def main():
    global TAG
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag', help='当前版本补发标签，保留原发行标签的历史记录')
    parser.add_argument('--notes', default=str(ROOT / 'docs' / 'release-notes' / f'v{VERSION}.md'))
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--only', choices=['github', 'gitcode'])
    parser.add_argument('--asset', action='append', help='只补发指定的成品或校验清单，可重复传入')
    args = parser.parse_args()
    TAG = release_tag(args.tag)
    head = git('rev-parse', TAG + '^{commit}')
    # 只核对本次实际发布的仓库，避免一端网络不通时阻塞另一端发布。
    repositories = {'github': 'https://github.com/fangzhouxiaohai/seal-office.git',
                    'gitcode': 'https://gitcode.com/gcw_pGfMiWVg/seal-office.git'}
    remotes = [repositories[args.only]] if args.only else repositories.values()
    for remote in remotes:
        if head not in git('ls-remote', remote, f'refs/tags/{TAG}', f'refs/tags/{TAG}^{{}}'):
            raise SystemExit(f'请先把 {TAG} 推送到 {remote}')
    rows = assets(args.asset)
    notes = Path(args.notes).read_text(encoding='utf-8')
    title = f'海豹办公 {VERSION}'
    print(json.dumps({'tag': TAG, 'assets': rows}, ensure_ascii=False, indent=1), flush=True)
    if args.check:
        return
    for kind, host in [('github', 'github.com'), ('gitcode', 'gitcode.com')]:
        if args.only in (None, kind):
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
