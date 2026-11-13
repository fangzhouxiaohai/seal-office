import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('republish', Path(__file__).with_name('republish-backend-update.py'))
republish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(republish)


class RepublishTests(unittest.TestCase):
    def test_upload_all_before_rebinding_and_keep_other_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / 'test.apk'
            data.write_bytes(b'new')
            rows = [{'platform': 'android', 'filename': 'test.apk', 'path': str(data), 'bytes': 3, 'sha256': 'newhash'}]
            old = [{'id': 'record', 'platform': 'android', 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old', 'withdrawn': False, 'notes': '原说明'}]
            calls = []
            def api(method, route, **kwargs):
                calls.append((method, route, kwargs.get('json')))
                if method == 'POST': return {'item': {'id': 'new', 'platform': 'android', 'filename': 'test.apk', 'bytes': 3, 'sha256': 'newhash'}}
                if method == 'GET': return {'items': old}
                return {'item': {'id': 'record'}}
            republish.replace_assets(api, rows, old, '2.7.2')
            self.assertEqual(calls, [('POST', '/admin/release-assets', None), ('GET', '/admin/releases', None), ('PATCH', '/admin/releases/record', {'assetId': 'new', 'expectedAssetId': 'old'})])

    def test_reject_missing_withdrawn_and_duplicate_records_before_upload(self):
        row = {'platform': 'android', 'sha256': 'newhash', 'bytes': 3}
        for records in [[], [{'id': 'a', 'platform': 'android', 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old', 'withdrawn': True}], [{'id': 'a', 'platform': 'android', 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old'}, {'id': 'b', 'platform': 'android', 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old'}]]:
            with self.subTest(records=records):
                with self.assertRaises(ValueError): republish.validate_records([row], records, '2.7.2')

    def test_incorrect_upload_never_rebinds(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / 'test.apk'; data.write_bytes(b'new')
            rows = [{'platform': 'android', 'filename': 'test.apk', 'path': str(data), 'bytes': 3, 'sha256': 'newhash'}]
            records = [{'id': 'record', 'platform': 'android', 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old', 'withdrawn': False}]
            calls = []
            def api(method, route, **kwargs):
                calls.append(method)
                return {'item': {'id': 'new', 'platform': 'android', 'filename': 'test.apk', 'bytes': 3, 'sha256': 'wrong'}}
            with self.assertRaises(ValueError): republish.replace_assets(api, rows, records, '2.7.2')
            self.assertEqual(calls, ['POST'])

    def test_partial_failure_restores_only_our_replacements(self):
        with tempfile.TemporaryDirectory() as directory:
            files = [Path(directory) / 'one', Path(directory) / 'two']
            for file in files: file.write_bytes(b'x')
            rows = [{'platform': p, 'filename': p, 'path': str(f), 'bytes': 1, 'sha256': p} for p, f in zip(['android', 'linux'], files)]
            records = [{'id': p, 'platform': p, 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old-' + p, 'withdrawn': False} for p in ['android', 'linux']]
            live = [dict(record) for record in records]
            calls = []
            def api(method, route, **kwargs):
                if method == 'POST':
                    p = kwargs['params']['platform']; return {'item': {'id': 'new-' + p, 'platform': p, 'filename': p, 'bytes': 1, 'sha256': p}}
                if method == 'GET': return {'items': [dict(record) for record in live]}
                p = route.rsplit('/', 1)[-1]; asset = kwargs['json']['assetId']; calls.append((p, asset))
                if p == 'linux': raise RuntimeError('模拟发布失败')
                next(record for record in live if record['id'] == p)['assetId'] = asset
                return {'item': {'id': p}}
            with self.assertRaises(RuntimeError): republish.replace_assets(api, rows, records, '2.7.2')
            self.assertEqual(calls, [('android', 'new-android'), ('linux', 'new-linux'), ('android', 'old-android')])
            self.assertEqual(live, records)

    def test_concurrent_replacement_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            data = Path(directory) / 'one'; data.write_bytes(b'x')
            row = {'platform': 'android', 'filename': 'one', 'path': str(data), 'bytes': 1, 'sha256': 'hash'}
            record = {'id': 'record', 'platform': 'android', 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old', 'withdrawn': False}
            def api(method, route, **kwargs):
                if method == 'POST': return {'item': {'id': 'new', 'platform': 'android', 'filename': 'one', 'bytes': 1, 'sha256': 'hash'}}
                if method == 'GET': return {'items': [{**record, 'assetId': 'someone-else'}]}
                self.fail('不得覆盖其他人的修改')
            with self.assertRaises(ValueError): republish.replace_assets(api, [row], [record], '2.7.2')

    def test_rollback_continues_after_conflict(self):
        rows = [{'platform': p} for p in ['android', 'linux']]
        records = [{'id': p, 'platform': p, 'version': '2.7.2', 'channel': 'stable', 'assetId': 'old-' + p, 'withdrawn': False} for p in ['android', 'linux']]
        uploaded = [{'id': 'new-android'}, {'id': 'new-linux'}]
        current = [{**records[0], 'assetId': 'new-android'}, {**records[1], 'assetId': 'someone-else'}]
        calls = []
        def api(method, route, **kwargs):
            if method == 'GET': return {'items': current}
            calls.append((route, kwargs['json']))
        with self.assertRaises(RuntimeError): republish.rollback_assets(api, rows, records, uploaded, '2.7.2')
        self.assertEqual(calls, [('/admin/releases/android', {'assetId':'old-android', 'expectedAssetId':'new-android'})])

    def test_report_is_complete_and_never_replaces_existing_file(self):
        import json
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'
            republish.write_report(report, {'passed': True})
            self.assertEqual(json.loads(report.read_text(encoding='utf-8')), {'passed': True})
            with self.assertRaises(FileExistsError): republish.write_report(report, {'passed': False})
            self.assertEqual(json.loads(report.read_text(encoding='utf-8')), {'passed': True})
            self.assertEqual([p.name for p in Path(directory).iterdir()], ['report.json'])

    def test_report_cleanup_failure_does_not_reverse_successful_publish(self):
        import json
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / 'report.json'
            with patch.object(republish.os, 'unlink', side_effect=PermissionError('模拟失败')):
                republish.write_report(report, {'passed': True})
            self.assertTrue(json.loads(report.read_text(encoding='utf-8'))['passed'])


if __name__ == '__main__': unittest.main()
