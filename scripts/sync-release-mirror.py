"""Copy hash-pinned public GitCode assets to the same existing GitHub Release.

No build, no signing material, no GitCode token, no tag changes. Replacements
are verified under a temporary name before the old GitHub attachment is removed.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = 'fangzhouxiaohai/seal-office'
API = 'https://api.github.com/repos/' + REPOSITORY
MIRROR = 'https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office'


def validate_manifest(config):
    if not re.fullmatch(r'v\d+\.\d+\.\d+', config['tag']):
        raise ValueError('Invalid release tag')
    if not re.fullmatch(r'[a-f0-9]{40}', config['buildSourceCommit']):
        raise ValueError('Invalid source commit')
    assets = config['assets']
    if not assets or len({a['name'] for a in assets}) != len(assets):
        raise ValueError('Empty or duplicate asset list')
    version = config['tag'][1:]
    for asset in assets:
        name = asset['name']
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', name) or name in ('.', '..'):
            raise ValueError('Unsafe asset filename')
        if name != 'SHA256SUMS.txt' and not name.startswith(f'SealOffice-{version}-'):
            raise ValueError('Asset is outside this release')
        if not isinstance(asset['size'], int) or isinstance(asset['size'], bool) or asset['size'] <= 0:
            raise ValueError('Invalid asset size')
        if not re.fullmatch(r'[a-f0-9]{64}', asset['sha256']):
            raise ValueError('Invalid asset checksum')
    if sum(a['name'] == 'SHA256SUMS.txt' for a in assets) != 1:
        raise ValueError('Exactly one checksum file is required')
    return config


def sha(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def matches(asset, expected):
    return (asset.get('state') == 'uploaded' and asset.get('size') == expected['size']
            and asset.get('digest') == 'sha256:' + expected['sha256'])


def api(method, endpoint, body=None):
    token = os.environ.get('GH_TOKEN')
    if not token:
        raise RuntimeError('Repository release credential is required')
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
               'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SealOffice-release-mirror'}
    data = None if body is None else json.dumps(body).encode('utf-8')
    if data is not None:
        headers['Content-Type'] = 'application/json'
    request = Request(API + endpoint, method=method, headers=headers, data=data)
    try:
        with urlopen(request, timeout=90) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except HTTPError as error:
        raise RuntimeError(f'GitHub {method} {endpoint}: HTTP {error.code}') from None
    except URLError:
        raise RuntimeError(f'GitHub {method} network failure') from None


def release(tag):
    result = api('GET', '/releases/tags/' + quote(tag, safe=''))
    if result['tag_name'] != tag or result['draft'] or result['prerelease']:
        raise RuntimeError('An existing published production release is required')
    return result


def download(tag, asset, directory):
    destination = directory / asset['name']
    if destination.is_file() and destination.stat().st_size == asset['size'] and sha(destination) == asset['sha256']:
        return destination
    url = MIRROR + f'/releases/{tag}/attach_files/{quote(asset["name"], safe="")}/download'
    # Anonymous download; GitHub authorization is never passed to GitCode or OBS.
    try:
        with urlopen(Request(url, headers={'User-Agent': 'SealOffice-release-mirror'}), timeout=120) as response:
            with destination.open('wb') as target:
                while chunk := response.read(4 * 1024 * 1024):
                    target.write(chunk)
    except (HTTPError, URLError):
        raise RuntimeError('Public GitCode download failed: ' + asset['name']) from None
    if destination.stat().st_size != asset['size'] or sha(destination) != asset['sha256']:
        raise RuntimeError('Downloaded asset checksum differs: ' + asset['name'])
    print(json.dumps({'downloadVerified': asset['name'], 'sha256': asset['sha256']}), flush=True)
    return destination


def replace(tag, asset, path, directory):
    current = release(tag)
    old = next((a for a in current['assets'] if a['name'] == asset['name']), None)
    if old and matches(old, asset):
        return {'name': asset['name'], 'sha256': asset['sha256'], 'verified': True, 'unchanged': True}
    temporary = asset['name'] + '.verified-upload'
    staged = next((a for a in current['assets'] if a['name'] == temporary), None)
    if staged and not matches(staged, asset):
        raise RuntimeError('An unexpected temporary asset was preserved: ' + temporary)
    if staged is None:
        upload_dir = directory / 'staging'
        upload_dir.mkdir(exist_ok=True)
        upload = upload_dir / temporary
        # Hard links avoid copying large installer bytes on the runner.
        if not upload.exists():
            upload.hardlink_to(path)
        result = subprocess.run(['gh', 'release', 'upload', tag, str(upload), '--repo', REPOSITORY],
                                capture_output=True, text=True, timeout=900)
        if result.returncode:
            raise RuntimeError('GitHub release upload failed: ' + asset['name'])
        current = release(tag)
        staged = next((a for a in current['assets'] if a['name'] == temporary), None)
    if not staged or not matches(staged, asset):
        raise RuntimeError('Uploaded temporary asset failed verification: ' + asset['name'])
    # Refuse to replace an attachment changed concurrently by another publisher.
    latest = release(tag)
    latest_old = next((a for a in latest['assets'] if a['name'] == asset['name']), None)
    if (latest_old or {}).get('id') != (old or {}).get('id'):
        raise RuntimeError('Release attachment changed concurrently: ' + asset['name'])
    if old:
        api('PATCH', f"/releases/assets/{old['id']}", {'name': asset['name'] + '.previous-' + str(old['id'])})
    renamed = api('PATCH', f"/releases/assets/{staged['id']}", {'name': asset['name']})
    if renamed['name'] != asset['name'] or not matches(renamed, asset):
        raise RuntimeError('Renamed asset failed verification; previous asset was preserved')
    if old:
        api('DELETE', f"/releases/assets/{old['id']}")
    print(json.dumps({'githubVerified': asset['name'], 'sha256': asset['sha256']}), flush=True)
    return {'name': asset['name'], 'sha256': asset['sha256'], 'verified': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, required=True)
    args = parser.parse_args()
    config = validate_manifest(json.loads((ROOT / 'scripts/release-mirror.json').read_text(encoding='utf-8')))
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    tag = config['tag']
    release(tag)
    sums = next(a for a in config['assets'] if a['name'] == 'SHA256SUMS.txt')
    sums_path = download(tag, sums, directory)
    checksums = {line.split('  ', 1)[1]: line.split('  ', 1)[0] for line in sums_path.read_text().splitlines()}
    expected = {a['name']: a['sha256'] for a in config['assets'] if a != sums}
    if checksums != expected:
        raise RuntimeError('Checksum file does not cover exactly the pinned release assets')

    def sync(asset):
        path = download(tag, asset, directory)
        return replace(tag, asset, path, directory)

    # Mobile first, while preserving concurrency for large desktop files.
    ordered = sorted((a for a in config['assets'] if a != sums),
                     key=lambda a: (not (a['name'].endswith('.apk') or 'HarmonyOS' in a['name']), a['size']))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(sync, ordered))
    results.append(replace(tag, sums, sums_path, directory))
    final = release(tag)
    if {a['name'] for a in final['assets']} != {a['name'] for a in config['assets']}:
        raise RuntimeError('Unexpected release attachment inventory; unrelated attachments were preserved')
    for expected in config['assets']:
        actual = next(a for a in final['assets'] if a['name'] == expected['name'])
        if not matches(actual, expected):
            raise RuntimeError('Final remote checksum differs: ' + expected['name'])
    report = {'complete': True, 'tag': tag, 'buildSourceCommit': config['buildSourceCommit'],
              'releaseUrl': final['html_url'], 'assets': results}
    (directory / 'mirror-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
