"""同版本修复包：上传并核对附件后替换本轮已存在的发布记录。

上传或替换失败可能留下不可公开下载的未绑定附件，保留以便排查，不自动删除。
"""
import argparse
import importlib.util
import json
import os
import re
import sys
import tempfile
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent


def write_report(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.seal-report-', suffix='.tmp', dir=path.parent)
    linked = False
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            json.dump(content, output, ensure_ascii=False, indent=2)
            output.write('\n'); output.flush(); os.fsync(output.fileno())
        os.link(temporary, path)
        linked = True
    finally:
        try: os.unlink(temporary)
        except OSError:
            if not linked: raise
            print('报告已生成，但临时文件清理失败：' + temporary, file=sys.stderr)


def validate_records(rows, existing, version):
    records = []
    for row in rows:
        matches = [item for item in existing if item.get('platform') == row['platform'] and item.get('version') == version and item.get('channel') == 'stable']
        if len(matches) != 1 or matches[0].get('withdrawn') or not matches[0].get('assetId') or not matches[0].get('id'):
            raise ValueError('同版本发布记录不存在、重复或不可替换：' + row['platform'])
        records.append(matches[0])
    return records


def rollback_assets(api, rows, records, uploaded, version):
    latest = api('GET', '/admin/releases')['items']
    failures = []
    for row, original, item in reversed(list(zip(rows, records, uploaded))):
        try:
            now = validate_records([row], latest, version)[0]
            if now['id'] != original['id']: raise RuntimeError('发布记录身份已改变')
            if now['assetId'] == item['id']:
                api('PATCH', '/admin/releases/' + original['id'], json={'assetId': original['assetId'], 'expectedAssetId': item['id']})
            elif now['assetId'] != original['assetId']: raise RuntimeError('发布附件被其他操作修改')
        except Exception as error:
            failures.append(row['platform'] + '：' + str(error))
    if failures: raise RuntimeError('部分平台无法恢复：' + '；'.join(failures))


def replace_assets(api, rows, existing, version):
    records = validate_records(rows, existing, version)
    uploaded = []
    for row in rows:
        with Path(row['path']).open('rb') as source:
            item = api('POST', '/admin/release-assets', params={'platform': row['platform'], 'filename': row['filename'], 'version': version}, headers={'Content-Type': 'application/octet-stream', 'Content-Length': str(row['bytes'])}, data=source)['item']
        if not item.get('id') or any(item.get(key) != row[key] for key in ('platform', 'filename', 'bytes', 'sha256')):
            raise ValueError('后台上传校验失败：' + row['filename'])
        uploaded.append(item)
    current = validate_records(rows, api('GET', '/admin/releases')['items'], version)
    if current != records:
        raise ValueError('发布记录在上传期间发生变化，未替换附件')
    try:
        for record, item in zip(records, uploaded):
            api('PATCH', '/admin/releases/' + record['id'], json={'assetId': item['id'], 'expectedAssetId': record['assetId']})
    except Exception as error:
        try:
            rollback_assets(api, rows, records, uploaded, version)
        except Exception as restore:
            raise RuntimeError('发布失败且自动恢复未完成：' + str(restore)) from error
        raise
    return uploaded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--platform', action='append', required=True)
    parser.add_argument('--previous', required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location('publish_backend', ROOT / 'scripts/publish-backend-update.py')
    publisher = importlib.util.module_from_spec(spec); spec.loader.exec_module(publisher)
    version, rows = publisher.collect(ROOT, args.platform)
    if len(set(args.platform)) != len(args.platform) or not re.fullmatch(r'\d+\.\d+\.\d+', args.previous) or tuple(map(int, args.previous.split('.'))) >= tuple(map(int, version.split('.'))):
        raise ValueError('平台或旧版本无效')
    if args.check:
        print(json.dumps({'passed': True, 'version': version, 'platforms': [row['platform'] for row in rows]}, ensure_ascii=False))
        return
    if args.report.exists(): raise ValueError('验收报告已存在，不能覆盖')
    credentials = json.loads((ROOT / '.upgrade-private/admin-access.json').read_text(encoding='utf-8-sig'))
    base = publisher.base_url(credentials['url']); token = None
    def api(method, route, anonymous=False, **kwargs):
        headers = kwargs.pop('headers', {})
        if token and not anonymous: headers['Authorization'] = 'Bearer ' + token
        response = requests.request(method, base + route, headers=headers, timeout=(30, 1800), allow_redirects=False, **kwargs)
        if not response.ok or response.is_redirect: raise RuntimeError('后台接口失败：' + route + '，状态码 ' + str(response.status_code))
        return response.json()
    try:
        token = api('POST', '/admin/login', json={'username': credentials['username'], 'password': credentials['password']})['token']
        existing = api('GET', '/admin/releases')['items']
        records = validate_records(rows, existing, version)
        uploaded = replace_assets(api, rows, existing, version)
        try:
            updated = api('GET', '/admin/releases')['items']
            checks = publisher.verify(api, rows, updated, version, args.previous)
            write_report(args.report, {'passed': True, 'version': version, 'checks': checks})
        except Exception as error:
            try: rollback_assets(api, rows, records, uploaded, version)
            except Exception as restore: raise RuntimeError('发布验证失败且自动恢复未完成：' + str(restore)) from error
            raise
        print('同版本更新已发布并通过匿名下载与版本查询验证。')
    finally:
        if token:
            try: api('POST', '/admin/logout')
            except (RuntimeError, requests.RequestException): pass


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try: main()
    except (ValueError, RuntimeError, OSError, KeyError, requests.RequestException) as error:
        print('后台发布中止：' + (str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
