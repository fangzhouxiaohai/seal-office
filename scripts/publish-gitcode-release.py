# Mirror verified GitHub Release binaries to GitCode using the existing Git credential helper.
# Usage: python scripts/publish-gitcode-release.py [1.9.11]; dependency: requests.
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.parse import urlsplit
import requests

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
REPO = 'gcw_pGfMiWVg/seal-office'
parser = argparse.ArgumentParser(description='Publish identical verified GitHub Release installers to GitCode')
parser.add_argument('version', nargs='?', default=json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version'])
parser.add_argument('--check', action='store_true', help='Verify local files and the GitCode tag without publishing')
arguments = parser.parse_args()
VERSION = arguments.version
if not all(part.isdigit() for part in VERSION.split('.')) or len(VERSION.split('.')) != 3:
    raise SystemExit('Use a numeric semantic version, for example 1.9.11')
TAG = 'v' + VERSION
BASE = 'https://api.gitcode.com/api/v5/repos/' + REPO
PAGE = 'https://gitcode.com/' + REPO + '/releases/' + TAG
DIRECTORY = ROOT / 'release' / TAG

credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=gitcode.com\n\n',
    text=True, capture_output=True, check=True, cwd=ROOT,
    env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'})
fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
TOKEN = fields['password']

def api(method, endpoint, **kwargs):
    params = {'access_token': TOKEN, **kwargs.pop('params', {})}
    try:
        response = requests.request(method, BASE + endpoint, params=params, timeout=60, **kwargs)
    except requests.RequestException:
        raise RuntimeError('GitCode API network failure: ' + endpoint) from None
    if not response.ok:
        raise RuntimeError(f'GitCode API {method} {endpoint}: HTTP {response.status_code}')
    return response.json()

def sha(file):
    with file.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()

def download_check(name, expected):
    endpoint = BASE + f'/releases/{TAG}/attach_files/{name}/download'
    # Verify the public mirror independently, without sending the credential to storage.
    try:
        response = requests.get(endpoint, stream=True, timeout=(30, 90))
        if not response.ok:
            raise RuntimeError(f'GitCode public download {name}: HTTP {response.status_code}')
        digest, size = hashlib.sha256(), 0
        for chunk in response.iter_content(4 * 1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    except requests.RequestException:
        raise RuntimeError('GitCode public download network failure: ' + name) from None
    assert size == expected['size'] and digest.hexdigest() == expected['sha256'], 'GitCode downloaded bytes differ: ' + name
    return {'name': name, 'size': size, 'sha256': digest.hexdigest(), 'anonymousDownloadVerified': True}

def publish_one(asset):
    name = asset['name']
    expected = {'size': asset['size'], 'sha256': asset['digest'].removeprefix('sha256:')}
    file = DIRECTORY / name
    assert file.stat().st_size == expected['size'] and sha(file) == expected['sha256'], 'Local asset differs: ' + name
    current = api('GET', '/releases/' + TAG)
    if not any(row['name'] == name for row in current['assets']):
        upload = api('GET', f'/releases/{TAG}/upload_url', params={'file_name': name})
        parsed = urlsplit(upload['url'])
        assert parsed.scheme == 'https' and (parsed.hostname == 'file.gitcode.com' or parsed.hostname.endswith('.myhuaweicloud.com')), 'Unexpected storage host'
        print(json.dumps({'uploading': name, 'bytes': expected['size']}), flush=True)
        with file.open('rb') as content:
            try:
                response = requests.put(upload['url'], data=content,
                    headers={**upload['headers'], 'Content-Length': str(expected['size'])}, timeout=(30, 900))
            except requests.RequestException:
                raise RuntimeError('GitCode storage upload network failure: ' + name) from None
        if not response.ok:
            raise RuntimeError(f'GitCode upload {name}: HTTP {response.status_code}')
    # OBS callback may take a moment to register the attachment.
    for _ in range(12):
        current = api('GET', '/releases/' + TAG)
        remote = next((row for row in current['assets'] if row['name'] == name), None)
        if remote:
            break
        time.sleep(2)
    assert remote, 'Upload not registered in Release: ' + name
    result = download_check(name, expected)
    public_url = remote['browser_download_url']
    assert not urlsplit(public_url).query, 'Permanent download URL expected'
    result['url'] = public_url
    print(json.dumps({'verified': name, 'bytes': result['size'], 'sha256': result['sha256']}), flush=True)
    return result

def main():
    # Snapshot already published public GitHub assets; every local file must match.
    upstream_response = requests.get('https://api.github.com/repos/fangzhouxiaohai/seal-office/releases/tags/' + TAG, timeout=30)
    if not upstream_response.ok:
        raise RuntimeError('GitHub public Release inventory unavailable')
    upstream = upstream_response.json()
    assets = upstream['assets']
    assert assets and all(a.get('digest', '').startswith('sha256:') for a in assets), 'Release asset checksums are required'
    for asset in assets:
        name = asset['name']
        assert Path(name).name == name and name not in ['.', '..'], 'Unsafe asset name'
        file = DIRECTORY / name
        assert file.stat().st_size == asset['size'] and 'sha256:' + sha(file) == asset['digest'], 'Local asset differs: ' + name
    local_tag = subprocess.check_output(['git', 'rev-list', '-n', '1', TAG], cwd=ROOT, text=True).strip()
    remote_tags = dict(line.split()[::-1] for line in subprocess.check_output(
        ['git', 'ls-remote', 'origin', 'refs/tags/' + TAG, 'refs/tags/' + TAG + '^{}'], cwd=ROOT, text=True).splitlines())
    remote_tag = remote_tags.get('refs/tags/' + TAG + '^{}', remote_tags.get('refs/tags/' + TAG))
    assert local_tag == remote_tag, 'Push the matching release tag to GitCode before publishing'
    if arguments.check:
        print(json.dumps({'checkPassed': True, 'tag': TAG, 'assets': len(assets), 'releaseUrl': PAGE}), flush=True)
        return
    releases = api('GET', '/releases')
    existing = next((row for row in releases if row['tag_name'] == TAG), None)
    if existing is None:
        api('POST', '/releases', json={'tag_name': TAG, 'target_commitish': local_tag,
            'name': upstream['name'], 'body': upstream['body'].replace('https://github.com/fangzhouxiaohai/seal-office/releases/download/' + TAG + '/', 'https://gitcode.com/' + REPO + '/releases/download/' + TAG + '/'), 'release_status': 'pre' if upstream['prerelease'] else 'latest'})
        print(json.dumps({'created': PAGE}), flush=True)
    # Prove a small attachment works before uploading the installation files.
    small = next(a for a in assets if a['name'] == 'SHA256SUMS.txt')
    results = [publish_one(small)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results.extend(pool.map(publish_one, [a for a in assets if a != small]))
    current = api('GET', '/releases/' + TAG)
    assert {a['name'] for a in current['assets'] if a['type'] != 'source'} == {a['name'] for a in assets}
    report = {'tag': TAG, 'releaseUrl': PAGE, 'repository': REPO, 'verified': True,
        'sourceRelease': upstream['html_url'], 'assets': sorted(results, key=lambda a: a['name'])}
    (DIRECTORY / 'gitcode-published-release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'complete': True, 'url': PAGE, 'assets': len(results), 'allAnonymousDownloadsVerified': True}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
