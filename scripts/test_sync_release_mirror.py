import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('release_mirror', HERE / 'sync-release-mirror.py')
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)


class MirrorGuards(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((HERE / 'release-mirror.json').read_text())

    def test_pinned_manifest_is_valid(self):
        self.assertIs(mirror.validate_manifest(self.config), self.config)

    def test_rejects_path_traversal_and_another_release(self):
        for name in ['../secret.p12', '/tmp/private', 'SealOffice-1.9.14-Android.apk']:
            config = copy.deepcopy(self.config)
            config['assets'][0]['name'] = name
            with self.assertRaises(ValueError):
                mirror.validate_manifest(config)

    def test_rejects_weak_hash_invalid_size_and_duplicate(self):
        for key, value in [('sha256', '0' * 32), ('size', 0), ('size', True)]:
            config = copy.deepcopy(self.config)
            config['assets'][0][key] = value
            with self.assertRaises(ValueError):
                mirror.validate_manifest(config)
        self.config['assets'].append(self.config['assets'][0])
        with self.assertRaises(ValueError):
            mirror.validate_manifest(self.config)

    def test_size_alone_cannot_validate_an_upload(self):
        expected = self.config['assets'][0]
        actual = {'state': 'uploaded', 'size': expected['size'], 'digest': 'sha256:' + expected['sha256']}
        self.assertTrue(mirror.matches(actual, expected))
        for key, value in [('state', 'starter'), ('size', expected['size'] + 1), ('digest', 'sha256:' + '0' * 64)]:
            self.assertFalse(mirror.matches({**actual, key: value}, expected))

    def test_unchanged_installers_skip_download_but_checksums_are_still_checked(self):
        assets = [{**asset, 'state': 'uploaded', 'digest': 'sha256:' + asset['sha256']} for asset in self.config['assets']]
        published = {'tag_name': self.config['tag'], 'html_url': 'https://github.com/example/release', 'assets': assets}
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            sums = directory / 'SHA256SUMS.txt'
            sums.write_text(''.join(f"{a['sha256']}  {a['name']}\n" for a in self.config['assets'] if a['name'] != sums.name))
            with patch.object(mirror, 'release', return_value=published), \
                 patch.object(mirror, 'download', return_value=sums) as download, \
                 patch.object(mirror, 'replace', return_value={'verified': True}) as replace, \
                 patch('builtins.print'), \
                 patch('sys.argv', ['mirror', '--directory', str(directory)]):
                mirror.main()
            self.assertEqual(download.call_count, 1)
            self.assertEqual(download.call_args.args[1]['name'], sums.name)
            self.assertEqual(replace.call_count, 1)
            self.assertTrue(json.loads((directory / 'mirror-report.json').read_text())['complete'])


if __name__ == '__main__':
    unittest.main()
