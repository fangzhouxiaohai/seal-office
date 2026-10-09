"""Publish verified Windows artifacts to GitHub Releases using Git credentials.

Run after committing and pushing the tested code and version tag to both remotes.
Requires Python 3.11+ and requests; no credentials are saved or printed.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import requests

ROOT = Path(__file__).resolve().parent.parent
REPO = 'fangzhouxiaohai/seal-office'
API = f'https://api.github.com/repos/{REPO}'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise SystemExit('Release version must contain three numeric components')
    tag, head = f'v{version}', git('rev-parse', 'HEAD')
    if git('status', '--porcelain'):
        raise SystemExit('Commit all release changes before publishing')
    if git('rev-parse', f'{tag}^{{commit}}') != head:
        raise SystemExit('Version tag must point to the verified HEAD')
    for remote in ['github', 'origin']:
        for ref in ['refs/heads/main', f'refs/tags/{tag}']:
            actual = git('ls-remote', remote, ref).split()
            if not actual or actual[0] != head:
                raise SystemExit(f'Push {ref} to {remote} before publishing')
    release_dir = ROOT / 'release' / tag
    integrity = json.loads((release_dir / 'release-integrity.json').read_text(encoding='utf-8-sig'))
    msix = json.loads((release_dir / f'SealOffice{version}.msix.verification.json').read_text(encoding='utf-8-sig'))
    if not integrity.get('passed') or integrity.get('version') != version or msix.get('version') != f'{version}.0' or not msix.get('hasBlockMap'):
        raise SystemExit('Verified package reports for this version are required')
    names = [f'SealOfficeSetup{version}.exe', f'SealOffice{version}.exe', f'SealOffice{version}.msix']
    sums = dict(line.split('  ', 1)[::-1] for line in (release_dir / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines() if line)
    files = [release_dir / name for name in names] + [release_dir / 'SHA256SUMS.txt']
    store_materials = release_dir / f'SealOffice{version}-LenovoAssets.zip'
    if store_materials.is_file():
        files.append(store_materials)
    files.append(ROOT / 'docs' / f'{tag}-修复与验收.md')
    expected = {}
    for file in files:
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        expected[file.name] = digest
        if file.name in names and sums.get(file.name) != digest:
            raise SystemExit(f'Checksum mismatch: {file.name}')
        if ' ' in file.name:
            raise SystemExit('Release filenames must not contain spaces')
    credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True, cwd=ROOT,
                                env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
    fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
    token = fields.get('password')
    if not token:
        raise SystemExit('GitHub credential unavailable')
    session = requests.Session()
    session.headers.update({'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SealOffice-release'})

    def call(method, url, **kwargs):
        response = session.request(method, url, timeout=kwargs.pop('timeout', 60), **kwargs)
        if not response.ok:
            raise SystemExit(f'GitHub release request failed: HTTP {response.status_code}')
        return response.json()

    body = files[-1].read_text(encoding='utf-8-sig')
    # Release notes render outside docs/, so repository-relative screenshot
    # links need an immutable tag URL. The saved document stays relative.
    body = body.replace('](screenshots/', f'](https://raw.githubusercontent.com/{REPO}/{tag}/docs/screenshots/')
    body += f'\n\n源码和 `{tag}` 标签已同步 GitHub 与 GitCode，安装包文件名不含空格。\n'
    releases = call('GET', f'{API}/releases', params={'per_page': 100})
    release = next((r for r in releases if r['tag_name'] == tag), None)
    if release is None:
        release = call('POST', f'{API}/releases', json={'tag_name': tag, 'target_commitish': head, 'name': f'海豹办公 {version} 预发布版', 'body': body, 'draft': True, 'prerelease': True, 'make_latest': 'false'})
    elif not release['prerelease']:
        raise SystemExit('Refusing to replace an existing stable release')
    upload_url = release['upload_url'].split('{', 1)[0]
    verified = []
    for file in files:
        digest, size = expected[file.name], file.stat().st_size
        asset_name = f'SealOffice{version}-ReleaseNotes.md' if file == files[-1] else file.name
        assets = call('GET', f'{API}/releases/{release["id"]}/assets', params={'per_page': 100})
        asset = next((a for a in assets if a['name'] == asset_name), None)
        if asset is None:
            print(json.dumps({'phase': 'uploading', 'name': file.name, 'bytes': size}, ensure_ascii=False), flush=True)
            with file.open('rb') as source:
                asset = call('POST', upload_url, params={'name': asset_name}, data=source, headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(size)}, timeout=600)
        if asset['name'] != asset_name or asset['size'] != size or asset.get('digest') != f'sha256:{digest}' or asset.get('state') != 'uploaded':
            raise SystemExit(f'Remote asset differs or upload is incomplete: {file.name}; existing data was preserved')
        verified.append({'name': asset_name, 'bytes': size, 'sha256': digest, 'url': asset['browser_download_url']})
        print(json.dumps({'phase': 'verified', 'name': file.name}, ensure_ascii=False), flush=True)
    release = call('PATCH', f'{API}/releases/{release["id"]}', json={'body': body, 'target_commitish': head, 'draft': False, 'prerelease': True, 'make_latest': 'false'})
    result = {'version': version, 'commit': head, 'tag': tag, 'url': release['html_url'], 'draft': release['draft'], 'prerelease': release['prerelease'], 'assets': verified}
    (release_dir / 'published-release.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'phase': 'published', 'url': result['url'], 'assetCount': len(verified)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
