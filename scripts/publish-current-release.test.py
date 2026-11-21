import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import importlib.util


SPEC = importlib.util.spec_from_file_location('publish_current_release', Path(__file__).with_name('publish-current-release.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseAssetsTest(unittest.TestCase):
    def test_仓库接收新附件失败时仍能下载当前附件(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / 'desktop.exe'
            file.write_bytes(b'new')
            row = {'name': file.name, 'path': file.name, 'bytes': 3, 'sha256': hashlib.sha256(b'new').hexdigest()}
            old = {'id': 2, 'name': file.name, 'size': 3, 'digest': 'sha256:' + hashlib.sha256(b'old').hexdigest()}
            release = {'id': 1, 'upload_url': 'https://uploads.github.com/upload', 'assets': [old], 'html_url': 'https://github.com/'}
            def api(_kind, method, route, **kwargs):
                if method == 'POST':
                    raise RuntimeError('上传中断')
                if method == 'DELETE':
                    release['assets'].clear()
                return release
            with patch.object(MODULE, 'api', side_effect=api), patch.object(MODULE, 'DIRECTORY', root):
                with self.assertRaisesRegex(RuntimeError, '上传中断'):
                    MODULE.github_publish([row], '版本', '说明')
            self.assertEqual(release['assets'], [old])

    def test_切换正式文件名失败时还原原附件(self):
        name = 'desktop.exe'
        row = {'name': name, 'path': name, 'bytes': 3, 'sha256': hashlib.sha256(b'new').hexdigest()}
        original = {'id': 2, 'name': name, 'size': 3, 'digest': 'sha256:' + hashlib.sha256(b'old').hexdigest()}
        staged = {'id': 3, 'name': name + '.upload-' + row['sha256'][:16], 'size': 3, 'digest': 'sha256:' + row['sha256']}
        release = {'id': 1, 'assets': [original, staged], 'html_url': 'https://github.com/'}
        def api(_kind, method, route, **kwargs):
            if route == '/releases/assets/2':
                if method == 'PATCH':
                    original.update(kwargs['json'])
                return original
            if route == '/releases/assets/3' and method == 'PATCH':
                raise RuntimeError('切换中断')
            return release
        with patch.object(MODULE, 'api', side_effect=api):
            with self.assertRaisesRegex(RuntimeError, '切换中断'):
                MODULE.github_publish([row], '版本', '说明')
        self.assertEqual(original['name'], name)

    def test_同名同大小但摘要不同的附件需要替换(self):
        row = {'name': 'SHA256SUMS.txt', 'bytes': 3, 'sha256': hashlib.sha256(b'new').hexdigest()}
        remote = {'id': 18, 'name': row['name'], 'size': 3}
        response = MagicMock()
        response.__enter__.return_value = response
        with patch.object(MODULE.requests, 'get', return_value=response):
            response.iter_content.return_value = [b'old']
            self.assertFalse(MODULE.gitcode_matches(remote, row))
            response.iter_content.return_value = [b'new']
            self.assertTrue(MODULE.gitcode_matches(remote, row))
            response.raise_for_status.side_effect = ConnectionError('下载中断')
            with self.assertRaises(ConnectionError):
                MODULE.gitcode_matches(remote, row)

    def test_定向补发只选择指定的现有成品(self):
        rows = [{'name': 'desktop.exe'}, {'name': 'mobile.apk'}, {'name': 'SHA256SUMS.txt'}]
        self.assertEqual(MODULE.select_assets(rows, ['desktop.exe', 'SHA256SUMS.txt']), [rows[0], rows[2]])
        self.assertEqual(MODULE.select_assets(rows, []), rows)
        with self.assertRaises(ValueError):
            MODULE.select_assets(rows, ['缺失文件'])

    def test_分批补发不读取另一平台仍在构建的成品(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'desktop.exe').write_bytes(b'desktop')
            (root / 'other.dmg').write_bytes(b'partial')
            digest = hashlib.sha256(b'desktop').hexdigest()
            (root / 'SHA256SUMS.txt').write_text(f'{digest}  desktop.exe\n', encoding='utf-8')
            with patch.object(MODULE, 'DIRECTORY', root), patch.object(MODULE, 'CANDIDATES', ['desktop.exe', 'other.dmg']):
                self.assertEqual([row['name'] for row in MODULE.assets(['desktop.exe'])], ['desktop.exe'])

    def test_hotfix_tag_keeps_current_version_and_uses_new_source_commit(self):
        self.assertEqual(MODULE.release_tag(None), f'v{MODULE.VERSION}')
        self.assertEqual(MODULE.release_tag(f'v{MODULE.VERSION}-hotfix-20261106'), f'v{MODULE.VERSION}-hotfix-20261106')
        with self.assertRaises(ValueError):
            MODULE.release_tag('v2.6.0')

    def test_windows_release_does_not_build_or_publish_portable(self):
        package = __import__('json').loads((Path(__file__).resolve().parent.parent / 'package.json').read_text(encoding='utf-8'))
        self.assertNotIn('portable', [item['target'] for item in package['build']['win']['target']])
        self.assertFalse(any('portable' in name for name in MODULE.CANDIDATES))

    def test_releases_only_current_installable_mobile_packages(self):
        self.assertIn(f'seal-office-{MODULE.VERSION}-android.apk', MODULE.CANDIDATES)
        self.assertIn(f'seal-office-{MODULE.VERSION}-harmony.hap', MODULE.CANDIDATES)
        self.assertFalse(any('cloud-source' in name for name in MODULE.CANDIDATES))

    def test_reads_web_and_mobile_archives_from_mobile_web(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / 'mobile-web' / 'seal-office-2.7.0-web.zip'
            web.parent.mkdir()
            web.write_bytes(b'web release')
            digest = hashlib.sha256(web.read_bytes()).hexdigest()
            (root / 'SHA256SUMS.txt').write_text(f'{digest}  mobile-web/{web.name}\n', encoding='utf-8')
            with patch.object(MODULE, 'DIRECTORY', root), patch.object(MODULE, 'CANDIDATES', [web.name]):
                rows = MODULE.assets()
            self.assertEqual(rows[0]['name'], web.name)
            self.assertEqual(rows[0]['path'], f'mobile-web/{web.name}')


if __name__ == '__main__':
    unittest.main()
