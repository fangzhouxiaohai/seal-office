"""把 2.5.0 的安装包发布到 GitHub Release。

与旧版 publish-release.py 的区别：本版产物是英文命名、7 个文件的当前结构，
没有 MSIX 与旧式 verification JSON，因此按 SHA256SUMS.txt 与仓库内文档作为校验依据。
凭证来自 git credential，不落盘、不打印。
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote
import requests

ROOT = Path(__file__).resolve().parent.parent
REPO = 'fangzhouxiaohai/seal-office'
API = f'https://api.github.com/repos/{REPO}'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
TAG = f'v{VERSION}'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True, encoding='utf-8').strip()


def token():
    run = subprocess.run(['git', 'credential', 'fill'], cwd=ROOT, text=True, capture_output=True,
                         input='protocol=https\nhost=github.com\n\n', check=True,
                         env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
    for line in run.stdout.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1]
    raise SystemExit('GitHub 凭证不可用')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    head = git('rev-parse', 'HEAD')
    if git('rev-parse', f'{TAG}^{{commit}}') != head:
        raise SystemExit('标签必须指向当前 HEAD')
    if git('status', '--porcelain'):
        raise SystemExit('发布前必须提交所有改动')

    release_dir = ROOT / 'release' / TAG
    sums = {}
    for line in (release_dir / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines():
        if line.strip():
            parts = line.split()
            sums[parts[1] if len(parts) > 1 else parts[0]] = parts[0].lower()

    payload = sorted(p for p in release_dir.iterdir() if p.suffix in ('.exe', '.deb', '.zip', '.hap', '.app', '.apk'))
    if not payload:
        raise SystemExit('发布目录没有安装包')
    # GitHub Releases 不接受 .app 扩展名，且 AGENTS.md 规定鸿蒙 App Pack 以 .app.zip 作为发行附件。
    app_pack = next((p for p in payload if p.suffix == '.app'), None)
    wrapped = None
    if app_pack is not None:
        import zipfile
        wrapped = app_pack.with_name(app_pack.name + '.zip')
        payload = [p for p in payload if p is not app_pack]
        if not wrapped.exists() or wrapped.stat().st_mtime < app_pack.stat().st_mtime:
            with zipfile.ZipFile(wrapped, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                zf.write(app_pack, app_pack.name)
        payload.append(wrapped)
        payload.sort()
    files = payload + [release_dir / 'SHA256SUMS.txt', ROOT / 'docs' / f'{TAG}-修复与验收.md']
    expected = {}
    for f in files:
        digest = hashlib.sha256(f.read_bytes()).hexdigest()
        expected[f.name] = (digest, f.stat().st_size)
        if f in payload and sums.get(f.name) != digest:
            raise SystemExit(f'校验和不符：{f.name}')

    session = requests.Session()
    session.headers.update({'Authorization': f'Bearer {token()}', 'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SealOffice-release'})

    def call(method, url, **kw):
        kw.setdefault('timeout', 60)
        r = session.request(method, url, **kw)
        if not r.ok:
            raise SystemExit(f'GitHub 请求失败 {method} {url}: HTTP {r.status_code} {r.text[:300]}')
        return r.json()

    body = (ROOT / 'docs' / f'{TAG}-修复与验收.md').read_text(encoding='utf-8')

    def relink(m):
        bang, label, target = m.groups()
        if '://' in target or target.startswith('#'):
            return m.group(0)
        path, sep, frag = target.partition('#')
        src = (ROOT / 'docs' / path).resolve()
        try:
            repo_path = src.relative_to(ROOT).as_posix()
        except ValueError:
            return m.group(0)
        base = f'https://raw.githubusercontent.com/{REPO}/{TAG}' if bang else f'https://github.com/{REPO}/blob/{TAG}'
        out = base + '/' + quote(repo_path, safe='/')
        return out + ('#' + frag if sep else '')
    body = re.sub(r'(!?)\[([^\]]+)\]\(([^)]+)\)', relink, body)
    body += f'\n\n源码与 `{TAG}` 标签已同步 GitHub 与 GitCode。安装包文件名不含空格。\n'

    found = next((r for r in call('GET', f'{API}/releases', params={'per_page': 100}) if r['tag_name'] == TAG), None)
    if found is None:
        found = call('POST', f'{API}/releases', json={'tag_name': TAG, 'target_commitish': head,
                                                   'name': f'海豹办公 {VERSION}', 'body': body,
                                                   'draft': True, 'prerelease': False, 'make_latest': 'true'})
    upload = found['upload_url'].split('{', 1)[0]

    done = []
    for f in files:
        digest, size = expected[f.name]
        name = f'{VERSION}-ReleaseNotes.md' if f.name.startswith(TAG) else f.name
        assets = call('GET', f"{API}/releases/{found['id']}/assets", params={'per_page': 100})
        asset = next((a for a in assets if a['name'] == name), None)
        if asset is None:
            print(json.dumps({'phase': '上传', 'name': name, 'bytes': size}, ensure_ascii=False), flush=True)
            with f.open('rb') as src:
                asset = call('POST', upload, params={'name': name}, data=src,
                             headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(size)},
                             timeout=1800)
        if asset['size'] != size or asset.get('state') != 'uploaded' or asset.get('digest') != f'sha256:{digest}':
            raise SystemExit(f'远端文件不一致或上传未完成：{name}；已保留现有数据')
        done.append({'name': name, 'bytes': size, 'sha256': digest, 'url': asset['browser_download_url']})
        print(json.dumps({'phase': '已校验', 'name': name}, ensure_ascii=False), flush=True)

    final = call('PATCH', f"{API}/releases/{found['id']}", json={'body': body, 'target_commitish': head,
                                                              'draft': False, 'prerelease': False, 'make_latest': 'true'})
    result = {'version': VERSION, 'commit': head, 'tag': TAG, 'url': final['html_url'], 'assets': done}
    (release_dir / 'published-release.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'phase': '完成', 'url': result['url'], 'assetCount': len(done)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
