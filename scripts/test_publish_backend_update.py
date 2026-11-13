"""用隔离文件与模拟接口验证后台发布，禁止测试连接生产环境。"""
import importlib.util
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-backend-update.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class 发布测试(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'package.json').write_text(json.dumps({'version': '2.7.2'}))
        self.directory = self.root / 'release' / 'v2.7.2'
        self.directory.mkdir(parents=True)
        self.name = 'seal-office-2.7.2-android.apk'
        self.data = b'isolated-test-package'
        (self.directory / self.name).write_bytes(self.data)
        self.digest = hashlib.sha256(self.data).hexdigest()
        (self.directory / 'SHA256SUMS.txt').write_text(self.digest + '  ' + self.name)

    def test_可选平台只收集实际包(self):
        version, rows = publisher.collect(self.root)
        self.assertEqual(version, '2.7.2')
        self.assertEqual([row['platform'] for row in rows], ['android'])
        self.assertEqual(rows[0]['sha256'], self.digest)

    def test_明确选择缺失平台时拒绝(self):
        with self.assertRaisesRegex(ValueError, '缺少'):
            publisher.collect(self.root, ['windows'])

    def test_macOS_仅在真实文件与校验值齐全时参与发布(self):
        with self.assertRaisesRegex(ValueError, '缺少'):
            publisher.collect(self.root, ['macos'])
        name = 'seal-office-2.7.2-macos.dmg'
        (self.directory / name).write_bytes(self.data)
        with (self.directory / 'SHA256SUMS.txt').open('a') as handle:
            handle.write('\n' + self.digest + '  ' + name)
        _, rows = publisher.collect(self.root, ['macos'])
        self.assertEqual([row['platform'] for row in rows], ['macos'])
        self.assertEqual(rows[0]['filename'], name)

    def test_文件在校验后改变则拒绝(self):
        (self.directory / self.name).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, '校验'):
            publisher.collect(self.root)

    def test_同版本已发包仅字节相同才能复用(self):
        _, rows = publisher.collect(self.root)
        existing = [{'version': '2.7.2', 'channel': 'stable', 'platform': 'android',
                     'sha256': self.digest, 'bytes': len(self.data), 'withdrawn': False, 'assetId': 'saved'}]
        self.assertEqual(publisher.pending(rows, existing, '2.7.2'), [])
        for change in [{'sha256': '0' * 64}, {'withdrawn': True}, {'assetId': None}]:
            with self.assertRaisesRegex(ValueError, '已有'):
                publisher.pending(rows, [{**existing[0], **change}], '2.7.2')

    def test_上传校验失败不得发布(self):
        _, rows = publisher.collect(self.root)
        calls = []
        def api(method, route, **kwargs):
            calls.append(route)
            return {'item': {'id': 'isolated', 'sha256': '0' * 64, 'bytes': len(self.data)}}
        with self.assertRaisesRegex(ValueError, '上传校验'):
            publisher.upload_and_publish(api, rows, '2.7.2', '本轮升级')
        self.assertEqual(calls, ['/admin/release-assets'])

    def test_商店保留包并使用商店链接(self):
        _, rows = publisher.collect(self.root)
        row = {**rows[0], 'platform': 'windows-store'}
        payloads = []
        def api(method, route, **kwargs):
            if route == '/admin/release-assets':
                return {'item': {**row, 'id': 'store-file'}}
            payloads.append(kwargs['json'])
            return {'items': []}
        publisher.upload_and_publish(api, [row], '2.7.2', '本轮升级')
        selected = payloads[0]['platforms']
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0]['assetId'], 'store-file')
        self.assertEqual(selected[0]['url'], 'ms-windows-store://pdp/?productid=9NGPL705R5Z3')

    def test_凭据只允许无用户信息的安全站点(self):
        self.assertEqual(publisher.base_url('https://seal.xingmasoft.com/'), 'https://seal.xingmasoft.com/api/v1')
        for value in ['http://example.com', 'https://user:secret@example.com', 'https://example.com/?token=secret']:
            with self.assertRaises(ValueError):
                publisher.base_url(value)


if __name__ == '__main__':
    unittest.main()
