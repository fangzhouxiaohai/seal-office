"""安卓资源校验器的独立构件回归。"""

import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).with_name('verify-apk.py')
PREFIX = 'assets/apps/__UNI__B52B65B/www/static/office/'


class ApkVerificationTest(unittest.TestCase):
    def test_校验资源目录与差异(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'office'
            source.mkdir()
            (source / 'index.html').write_bytes(b'index')
            (source / 'office.js').write_bytes(b'javascript')
            apk = root / 'test.apk'

            def check(entries):
                with zipfile.ZipFile(apk, 'w') as package:
                    for name, content in entries.items():
                        package.writestr(PREFIX + name, content)
                return subprocess.run([sys.executable, str(SCRIPT), str(apk), '--office-root', str(source)],
                                      capture_output=True)

            correct = {'index.html': b'index', 'office.js': b'javascript'}
            self.assertEqual(check(correct).returncode, 0)
            self.assertNotEqual(check({'index.html': b'index'}).returncode, 0)
            self.assertNotEqual(check({**correct, 'stale.js': b'old'}).returncode, 0)
            self.assertNotEqual(check({**correct, 'office.js': b'changed'}).returncode, 0)


if __name__ == '__main__':
    unittest.main()
