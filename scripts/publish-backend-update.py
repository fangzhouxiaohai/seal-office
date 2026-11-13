"""将当前版本已验收的成品上传并发布到后台；不修改历史发布记录。

先运行 --check 核验文件。--platform 可重复指定；不指定则发布实际存在的平台。
凭据读取本机忽略文件，报告仅保存发布记录、下载校验与匿名更新查询结果。
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

import requests

ROOT = Path(__file__).resolve().parent.parent
STORE_URL = 'ms-windows-store://pdp/?productid=9NGPL705R5Z3'
NAMES = {
    'windows': 'seal-office-setup-{version}.exe',
    'windows-store': 'seal-office-{version}-microsoft-store-x64.msix',
    'linux': 'seal-office-{version}-amd64.deb',
    'macos': 'seal-office-{version}-macos.dmg',
    'android': 'seal-office-{version}-android.apk',
    'harmony': 'seal-office-{version}-harmony.hap',
    'web': 'seal-office-{version}-web.zip',
}


def digest(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def collect(root, platforms=None):
    version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('当前项目版本格式错误')
    directory = root / 'release' / ('v' + version)
    sums = {}
    for line in (directory / 'SHA256SUMS.txt').read_text(encoding='utf-8-sig').splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            sums[parts[1].lstrip('*').replace('\\', '/')] = parts[0].lower()
    rows = []
    for platform in platforms or NAMES:
        if platform not in NAMES:
            raise ValueError('发布平台无效')
        name = NAMES[platform].format(version=version)
        relative = name if (directory / name).is_file() else 'mobile-web/' + name
        path = directory / relative
        if not path.is_file():
            if platforms:
                raise ValueError('缺少所选平台安装包：' + platform)
            continue
        checksum, size = digest(path), path.stat().st_size
        if not size or size > 1024 ** 3 or sums.get(relative) != checksum:
            raise ValueError('安装包大小或校验清单不一致：' + name)
        rows.append({'platform': platform, 'filename': name, 'path': str(path), 'bytes': size, 'sha256': checksum})
    if not rows:
        raise ValueError('没有可以发布的已校验安装包')
    return version, rows


def pending(rows, existing, version):
    result = []
    for row in rows:
        record = next((item for item in existing if item['platform'] == row['platform'] and item['version'] == version and item['channel'] == 'stable'), None)
        if record is None:
            result.append(row)
        elif record.get('withdrawn') or not record.get('assetId') or any(record.get(key) != row[key] for key in ['bytes', 'sha256']):
            raise ValueError('已有同版本发布记录与本地包不一致，停止发布：' + row['platform'])
    return result


def base_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise ValueError('后台地址须为不含路径、凭据或查询参数的安全站点')
    return value.rstrip('/') + '/api/v1'


def upload_and_publish(api, rows, version, notes):
    if not rows:
        return []
    selected = []
    for row in rows:
        with Path(row['path']).open('rb') as handle:
            item = api('POST', '/admin/release-assets', params={key: row[key] for key in ['platform', 'filename']} | {'version': version},
                       headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(row['bytes'])}, data=handle)['item']
        if not item.get('id') or any(item.get(key) != row[key] for key in ['platform', 'filename', 'bytes', 'sha256']):
            raise ValueError('后台上传校验失败：' + row['filename'])
        platform = {'platform': row['platform'], 'assetId': item['id']}
        if row['platform'] == 'windows-store':
            platform['url'] = STORE_URL
        if row['platform'] in ['android', 'harmony']:
            major, minor, patch = map(int, version.split('.'))
            platform['versionCode'] = major * 10000 + minor * 100 + patch
        selected.append(platform)
        print('已上传并校验：' + row['filename'], flush=True)
    return api('POST', '/admin/releases/batch', json={'version': version, 'channel': 'stable', 'notes': notes,
               'mandatory': False, 'platforms': selected})['items']


def verify(api, rows, existing, version, previous):
    checks = []
    for row in rows:
        record = next(item for item in existing if item['platform'] == row['platform'] and item['version'] == version and item['channel'] == 'stable')
        asset = record.get('asset') or {}
        if not asset.get('url') or any(asset.get(key) != row[key] for key in ['bytes', 'sha256']):
            raise ValueError('发布记录缺少已核对的安装包：' + row['platform'])
        # 下载不发送管理员令牌；验证所有平台的全部字节。
        checksum, size = hashlib.sha256(), 0
        with requests.get(asset['url'], stream=True, timeout=(30, 900)) as response:
            response.raise_for_status()
            for block in response.iter_content(4 * 1024 * 1024):
                checksum.update(block)
                size += len(block)
        if size != row['bytes'] or checksum.hexdigest() != row['sha256']:
            raise ValueError('后台公开下载校验失败：' + row['filename'])
        old = api('GET', '/updates/latest', anonymous=True, params={'platform': row['platform'], 'version': previous, 'channel': 'stable'})
        current = api('GET', '/updates/latest', anonymous=True, params={'platform': row['platform'], 'version': version, 'channel': 'stable'})
        if not old.get('hasUpdate') or old.get('version') != version or old.get('sha256') != row['sha256'] or old.get('bytes') != row['bytes'] or current.get('hasUpdate') is not False:
            raise ValueError('匿名更新查询校验失败：' + row['platform'])
        if row['platform'] == 'windows-store' and old.get('url') != STORE_URL:
            raise ValueError('微软商店更新入口不一致')
        checks.append({'platform': row['platform'], 'filename': row['filename'], 'bytes': size, 'sha256': checksum.hexdigest(),
                       'publicDownload': asset['url'], 'oldVersion': previous, 'oldResponse': old, 'currentResponse': current})
        print('发布与匿名下载验证通过：' + row['platform'], flush=True)
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', action='append', choices=list(NAMES))
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--credentials', type=Path, default=ROOT / '.upgrade-private/admin-access.json')
    parser.add_argument('--notes', type=Path)
    parser.add_argument('--previous', required=True, help='本轮覆盖升级验证的旧版本')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    version, rows = collect(ROOT, args.platform)
    notes = (args.notes or ROOT / 'docs/release-notes' / ('v' + version + '.md')).read_text(encoding='utf-8').strip()
    if not notes or len(notes) > 4000:
        raise ValueError('更新说明不能为空且不得超过 4000 字')
    if not re.fullmatch(r'\d+\.\d+\.\d+', args.previous) or tuple(map(int, args.previous.split('.'))) >= tuple(map(int, version.split('.'))):
        raise ValueError('验收旧版本必须低于本轮版本')
    print(json.dumps({'version': version, 'platforms': rows}, ensure_ascii=False), flush=True)
    if args.check:
        return
    credentials = json.loads(args.credentials.read_text(encoding='utf-8-sig'))
    base = base_url(credentials['url'])
    token = None
    def api(method, route, anonymous=False, **kwargs):
        headers = kwargs.pop('headers', {})
        if token and not anonymous:
            headers['Authorization'] = 'Bearer ' + token
        response = requests.request(method, base + route, headers=headers, timeout=(30, 1800), allow_redirects=False, **kwargs)
        if not response.ok or response.is_redirect:
            raise RuntimeError('后台接口失败：' + route + '，状态码 ' + str(response.status_code))
        return response.json()
    token = api('POST', '/admin/login', json={'username': credentials['username'], 'password': credentials['password']})['token']
    existing = api('GET', '/admin/releases')['items']
    upload_and_publish(api, pending(rows, existing, version), version, notes)
    existing = api('GET', '/admin/releases')['items']
    checks = verify(api, rows, existing, version, args.previous)
    report = args.report or ROOT / 'docs/verification' / ('v' + version) / 'backend-update.json'
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_bytes((json.dumps({'passed': True, 'version': version, 'checks': checks}, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print('后台更新已发布，全部公开下载和版本查询已验证。', flush=True)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        main()
    except (ValueError, RuntimeError, requests.RequestException, OSError, KeyError) as error:
        # 不输出响应内容、凭据或请求对象，避免口令与令牌进入发行日志。
        print('后台发布中止：' + (str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
