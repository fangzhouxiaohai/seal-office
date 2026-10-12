"""Download and verify an Ubuntu candidate built by the repository's Actions workflow.

Usage: python scripts/fetch-ubuntu-candidate.py <run-id>
The Git credential helper supplies access without printing or saving its token.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit
import zipfile

import requests


ROOT = Path(__file__).resolve().parent.parent
REPO = 'fangzhouxiaohai/seal-office'
API = f'https://api.github.com/repos/{REPO}'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
DESTINATION = ROOT / 'release' / f'v{VERSION}' / 'linux'


def credential():
    result = subprocess.run(
        ['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n',
        text=True, capture_output=True, check=True, cwd=ROOT,
        env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'},
    )
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if not fields.get('password'):
        raise RuntimeError('GitHub credential unavailable')
    return fields['password']


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def main(run_id):
    token = credential()
    proxy = os.environ.get('SEAL_RELEASE_PROXY', 'http://127.0.0.1:7890')
    session = requests.Session()
    session.proxies.update({'http': proxy, 'https': proxy})
    session.headers.update({'Authorization': f'Bearer {token}', 'Accept': 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'SealOffice-release'})

    def api(path):
        response = session.get(API + path, timeout=30)
        response.raise_for_status()
        return response.json()

    run = api(f'/actions/runs/{run_id}')
    if run['status'] != 'completed' or run['conclusion'] != 'success' or run['head_branch'] != 'codex/pdf-print-preview':
        raise RuntimeError('Ubuntu candidate workflow has not passed on the expected branch')
    artifacts = {item['name']: item for item in api(f'/actions/runs/{run_id}/artifacts?per_page=100')['artifacts']}
    names = ['ubuntu-deb', 'verification-ubuntu-22.04', 'verification-ubuntu-24.04']
    if any(name not in artifacts or artifacts[name]['expired'] for name in names):
        raise RuntimeError('One or more Ubuntu build or verification artifacts are missing')
    DESTINATION.mkdir(parents=True, exist_ok=True)
    results = {}
    for name in names:
        response = session.get(API + f'/actions/artifacts/{artifacts[name]["id"]}/zip',
                               allow_redirects=False, timeout=30)
        if response.status_code != 302:
            raise RuntimeError(f'{name}: artifact download failed with HTTP {response.status_code}')
        target_url = response.headers.get('Location', '')
        if urlsplit(target_url).scheme != 'https':
            raise RuntimeError(f'{name}: non-HTTPS artifact redirect')
        # The signed storage URL receives no GitHub Authorization header.
        with requests.get(target_url, proxies={'http': proxy, 'https': proxy}, stream=True, timeout=(30, 180)) as source:
            source.raise_for_status()
            data = io.BytesIO()
            for chunk in source.iter_content(4 * 1024 * 1024):
                data.write(chunk)
        with zipfile.ZipFile(data) as archive:
            if archive.testzip() is not None:
                raise RuntimeError(f'{name}: artifact ZIP CRC failed')
            if name == 'ubuntu-deb':
                filename = f'SealOfficeUbuntu{VERSION}-amd64.deb'
                if archive.namelist() != [filename]:
                    raise RuntimeError('Ubuntu package artifact contains unexpected files')
                destination = DESTINATION / filename
                temporary = destination.with_suffix('.deb.download')
                with archive.open(filename) as source, temporary.open('wb') as output:
                    for chunk in iter(lambda: source.read(4 * 1024 * 1024), b''):
                        output.write(chunk)
                with temporary.open('rb') as check:
                    signature = check.read(8)
                if signature != b'!<arch>\n':
                    raise RuntimeError('Ubuntu package is not a Debian ar archive')
                temporary.replace(destination)
                results['package'] = {'file': str(destination), 'bytes': destination.stat().st_size,
                                      'sha256': digest(destination)}
            else:
                report_files = [item for item in archive.namelist() if item.endswith('ubuntu-verification.json')]
                if len(report_files) != 1:
                    raise RuntimeError(f'{name}: verification report missing')
                report = json.loads(archive.read(report_files[0]))
                output = DESTINATION / f'{name}.json'
                output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                results[name] = report
    package = results['package']
    for name in names[1:]:
        report = results[name]
        if not report.get('passed') or report.get('version') != VERSION or report.get('packageSha256') != package['sha256'] or report.get('packageBytes') != package['bytes'] or report.get('sandboxBypassed') is not False:
            raise RuntimeError(f'{name}: installed-package verification does not match the downloaded DEB')
    print(json.dumps({'run': run_id, 'commit': run['head_sha'], 'package': package,
                      'verifiedOn': ['ubuntu-22.04', 'ubuntu-24.04']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        raise SystemExit('Usage: python scripts/fetch-ubuntu-candidate.py <run-id>')
    main(int(sys.argv[1]))
