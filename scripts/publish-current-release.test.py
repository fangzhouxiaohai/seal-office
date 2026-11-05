import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import importlib.util


SPEC = importlib.util.spec_from_file_location('publish_current_release', Path(__file__).with_name('publish-current-release.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ReleaseAssetsTest(unittest.TestCase):
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
