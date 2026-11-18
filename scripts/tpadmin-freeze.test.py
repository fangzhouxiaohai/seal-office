import importlib.util
import json
import os
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('freeze', pathlib.Path(__file__).with_name('tpadmin-freeze.py'))
freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeze)

class FreezeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='seal-tpadmin-freeze-')
        self.root = pathlib.Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        def write(name, data):
            p = self.root / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(data, encoding='utf-8')
            return p
        write('web/src/app.ts', 'source')
        write('web/package.json', '{}')
        write('web/dist/assets/a.js', 'js')
        self.index = write('web/dist/index.html', '<script src="/admin-assets/assets/a.js"></script>')
        self.main = write('main.json', json.dumps({'passed': True, 'checks': list(range(17)), 'errors': [], 'distIndexSha256': freeze.digest(self.index)}))
        self.extra = write('extra.json', json.dumps({'passed': True, 'checks': list(range(9)), 'errors': [], 'distIndexSha256': freeze.digest(self.index)}))
        now = self.index.stat().st_mtime
        os.utime(self.root/'web/src/app.ts', (now-10, now-10))
        os.utime(self.root/'web/package.json', (now-10, now-10))

    def build(self):
        return freeze.freeze_frontend(self.root/'web', self.main, self.extra)

    def test_reports_and_files_bound(self):
        value = self.build()
        freeze.verify_frontend(value, self.root/'web', self.main, self.extra)
        (self.root/'web/dist/assets/a.js').write_text('changed', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '变化'):
            freeze.verify_frontend(value, self.root/'web', self.main, self.extra)

    def test_wrong_or_failed_browser_reports_rejected(self):
        self.extra.write_text(json.dumps({'passed': True, 'checks': list(range(9)), 'errors': [], 'distIndexSha256': '0'*64}), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '浏览器'):
            self.build()

    def test_source_newer_than_build_is_rejected(self):
        src = self.root/'web/src/app.ts'
        now = self.index.stat().st_mtime
        os.utime(src, (now+5, now+5))
        with self.assertRaisesRegex(ValueError, '源码'):
            self.build()

    def test_required_extra_reports_must_match_current_build(self):
        report = self.root/'dark.json'
        report.write_text(json.dumps({'passed': True, 'checks': list(range(47)), 'errors': [], 'distIndexSha256': freeze.digest(self.index)}), encoding='utf-8')
        frozen = freeze.freeze_frontend(self.root/'web', self.main, self.extra, {'dark': (report, 47)})
        self.assertIn('dark', frozen['reports'])
        report.write_text(json.dumps({'passed': True, 'checks': list(range(47)), 'errors': [], 'distIndexSha256': '0'*64}), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '浏览器'):
            freeze.freeze_frontend(self.root/'web', self.main, self.extra, {'dark': (report, 47)})

if __name__ == '__main__': unittest.main()
