import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock

path = pathlib.Path(__file__).with_name('deploy-web.py')
spec = importlib.util.spec_from_file_location('deploy_web', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NginxPatchTest(unittest.TestCase):
    def setUp(self):
        self.original = '''server {
  listen 80;
  location ^~ /.well-known/acme-challenge/ { root /site; }
}
server {
  listen 443 ssl ;
  http2 on;
  root /site/admin;
  ssl_certificate /cert/fullchain.pem;
  ssl_certificate_key /cert/privkey.pem;
  add_header X-Frame-Options DENY always;
  location ^~ /api/office-converter/v1/ { proxy_pass http://127.0.0.1:8298/v1/; }
  location /api/ {
    proxy_pass http://127.0.0.1:8096/;
  }
  location / { try_files $uri $uri/ /index.html; }
}
'''
        self.example = (module.ROOT / 'mobile/deploy/nginx.conf.example').read_text(encoding='utf-8')

    def test_adds_only_managed_block_and_preserves_original_bytes(self):
        candidate = module.patch_nginx(self.original, self.example)
        begin, end = candidate.index(module.BEGIN), candidate.index(module.END) + len(module.END) + 1
        self.assertEqual(candidate[:begin] + candidate[end:], self.original)
        self.assertIn('/webcurrent/', candidate)
        self.assertIn('location ^~ /api/v1/conversion/', candidate)
        self.assertIn('client_max_body_size 30m;', candidate)
        self.assertIn('proxy_read_timeout 120s;', candidate)
        self.assertNotIn('unsafe-eval', candidate)

    def test_repeat_replaces_managed_block_without_duplicates(self):
        first = module.patch_nginx(self.original, self.example)
        self.assertEqual(module.patch_nginx(first, self.example), first)
        self.assertEqual(first.count('location ^~ /office/'), 1)

    def test_refuses_ambiguous_or_unmanaged_configuration(self):
        for value in [self.original + '  location /api/ {\n}', self.original.replace('listen 443 ssl', 'listen 444 ssl'), self.original + '\nlocation /office/ { alias /old/; }', self.original + '\n' + module.END + '\n' + module.BEGIN]:
            with self.assertRaises(ValueError):
                module.patch_nginx(value, self.example)

    def test_public_zip_name_is_english_and_deployments_keep_separate_archives(self):
        first = module.web_archive_path('2.0.0-web-20261018-010101')
        second = module.web_archive_path('2.0.0-web-20261018-020202')
        self.assertEqual(first.name, f'seal-office-{module.VERSION}-web.zip')
        self.assertNotEqual(first, second)
        self.assertEqual(first.parent.parent, module.PRIVATE)
        with self.assertRaises(ValueError):
            module.web_archive_path('../private')

    def test_frozen_bundle_hash_reads_unicode_html_as_utf8_on_gbk_windows(self):
        with tempfile.TemporaryDirectory(prefix='seal-deploy-utf8-') as directory:
            root = pathlib.Path(directory).resolve()
            self.assertEqual(root.parent, pathlib.Path(tempfile.gettempdir()).resolve())
            self.assertTrue(root.name.startswith('seal-deploy-utf8-'))
            folder = root / 'mobile/unpackage/web'
            (folder / 'assets').mkdir(parents=True)
            data = b'console.log("frozen bundle")'
            (folder / 'assets/index-test.js').write_bytes(data)
            (folder / 'index.html').write_text('<title>海豹办公☃</title><script src="./assets/index-test.js"></script>', encoding='utf-8')
            original = pathlib.Path.read_text

            def windows_read(path, **kwargs):
                # Simulate Windows' GBK default even when this test runs on Linux.
                kwargs.setdefault('encoding', 'gbk')
                return original(path, **kwargs)

            with mock.patch.object(module, 'ROOT', root), mock.patch.object(pathlib.Path, 'read_text', autospec=True, side_effect=windows_read) as read:
                self.assertEqual(module.current_web_main_sha(), module.sha(data))
                self.assertEqual(read.call_args.kwargs, {'encoding': 'utf-8'})


if __name__ == '__main__':
    unittest.main()
