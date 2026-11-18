import hashlib
import os
import tempfile
import unittest
from pathlib import Path

import macos_cross_verify as verify


class 测试(unittest.TestCase):
    def test_可识别两种架构且拒绝伪造头(self):
        for code, expected in ((0x0100000c, 'arm64'), (0x01000007, 'x64')):
            data = bytearray(32)
            data[:4] = bytes.fromhex('cffaedfe')
            data[4:8] = code.to_bytes(4, 'little')
            self.assertEqual(verify.架构(bytes(data)), {expected})
        with self.assertRaises(ValueError):
            verify.架构(b'fake')
        with self.assertRaises(ValueError):
            verify.架构(bytes.fromhex('cafebabe00000002'))

    def test_临时签名代码页应拒绝篡改和截断(self):
        import struct
        data = bytearray(160)
        struct.pack_into('<IIIIIIII', data, 0, 0xfeedfacf, 0x0100000c, 0, 2, 1, 16, 0, 0)
        struct.pack_into('<IIII', data, 32, 0x1d, 16, 64, 96)
        struct.pack_into('>IIIII', data, 64, 0xfade0cc0, 96, 1, 0, 20)
        struct.pack_into('>9I', data, 84, 0xfade0c02, 76, 0x20400, 2, 44, 0, 0, 1, 64)
        data[120:124] = bytes((32, 2, 0, 6))
        data[128:160] = hashlib.sha256(data[:64]).digest()
        self.assertEqual(verify.检查签名页(bytes(data)), 1)
        malformed = bytearray(data)
        struct.pack_into('>I', malformed, 108, 3)
        with self.assertRaises(ValueError):
            verify.检查签名页(bytes(malformed))
        data[50] ^= 1
        with self.assertRaises(ValueError):
            verify.检查签名页(bytes(data))
        with self.assertRaises(ValueError):
            verify.检查签名页(bytes(data[:100]))

    def test_信息和资源特殊槽拒绝篡改(self):
        import struct
        data = bytearray(256)
        struct.pack_into('<IIIIIIII', data, 0, 0xfeedfacf, 0x0100000c, 0, 2, 1, 16, 0, 0)
        struct.pack_into('<IIII', data, 32, 0x1d, 16, 64, 192)
        struct.pack_into('>IIIII', data, 64, 0xfade0cc0, 192, 1, 0, 20)
        struct.pack_into('>9I', data, 84, 0xfade0c02, 172, 0x20400, 2, 140, 0, 3, 1, 64)
        data[120:124] = bytes((32, 2, 0, 6))
        data[128:160] = hashlib.sha256(b'resources').digest()
        data[192:224] = hashlib.sha256(b'info').digest()
        data[224:256] = hashlib.sha256(data[:64]).digest()
        verify.检查特殊槽(bytes(data), 1, b'info')
        verify.检查特殊槽(bytes(data), 3, b'resources')
        self.assertEqual(verify.代码目录摘要(bytes(data)), hashlib.sha256(data[84:256]).digest()[:20])
        with self.assertRaises(ValueError):
            verify.检查特殊槽(bytes(data), 1, b'changed')
        with self.assertRaises(ValueError):
            verify.检查特殊槽(bytes(data), 3, b'changed')

    def test_原始二进制段检测篡改(self):
        import struct
        data = bytearray(200)
        struct.pack_into('<IIIIIIII', data, 0, 0xfeedfacf, 0x0100000c, 0, 2, 1, 152, 0, 0)
        struct.pack_into('<II', data, 32, 0x19, 152)
        struct.pack_into('<I', data, 96, 1)
        struct.pack_into('<Q', data, 144, 8)
        struct.pack_into('<I', data, 152, 192)
        data[192:200] = b'12345678'
        self.assertEqual(verify.比较二进制段(bytes(data), bytes(data)), 1)
        data2 = bytearray(data)
        data2[192] ^= 1
        with self.assertRaises(ValueError):
            verify.比较二进制段(bytes(data), bytes(data2))
        changed_header = bytearray(data)
        changed_header[8] ^= 1
        with self.assertRaises(ValueError):
            verify.比较二进制段(bytes(data), bytes(changed_header))
        changed_command = bytearray(data)
        changed_command[64] ^= 1
        with self.assertRaises(ValueError):
            verify.比较二进制段(bytes(data), bytes(changed_command))

    def test_新增加的签名命令不应掩盖头部和其他命令变化(self):
        import struct
        data = bytearray(264)
        struct.pack_into('<IIIIIIII', data, 0, 0xfeedfacf, 0x01000007, 0, 2, 1, 152, 0, 0)
        struct.pack_into('<II', data, 32, 0x19, 152)
        struct.pack_into('<I', data, 96, 1)
        struct.pack_into('<Q', data, 144, 8)
        struct.pack_into('<I', data, 152, 256)
        data[256:264] = b'12345678'
        signed = bytearray(data)
        struct.pack_into('<II', signed, 16, 2, 168)
        struct.pack_into('<IIII', signed, 184, 0x1d, 16, 264, 100)
        self.assertEqual(verify.比较二进制段(bytes(data), bytes(signed)), 1)
        signed[8] ^= 1
        with self.assertRaises(ValueError):
            verify.比较二进制段(bytes(data), bytes(signed))

    def test_原生模块签名后必须保留架构和原始代码(self):
        import struct
        from unittest.mock import patch
        data = bytearray(200)
        struct.pack_into('<IIIIIIII', data, 0, 0xfeedfacf, 0x0100000c, 0, 2, 1, 152, 0, 0)
        struct.pack_into('<II', data, 32, 0x19, 152)
        struct.pack_into('<I', data, 96, 1)
        struct.pack_into('<Q', data, 144, 8)
        struct.pack_into('<I', data, 152, 192)
        data[192:200] = b'12345678'
        with tempfile.TemporaryDirectory() as tmp, patch.object(verify, '检查签名页', return_value=1):
            source, target = Path(tmp) / 'source', Path(tmp) / 'target'
            source.write_bytes(data)
            target.write_bytes(data)
            self.assertEqual(verify.校验原生(source, target, 'arm64')['sections'], 1)
            with self.assertRaises(ValueError):
                verify.校验原生(source, target, 'x64')
            data[192] ^= 1
            target.write_bytes(data)
            with self.assertRaises(ValueError):
                verify.校验原生(source, target, 'arm64')

    def test_嵌套签名校验拒绝信息资源及新增文件篡改(self):
        import plistlib
        import struct
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / 'App.app'
            outer = app / 'Contents'
            nested = outer / 'Frameworks' / 'Helper.app' / 'Contents'
            for base in (outer, nested):
                for folder in ('MacOS', '_CodeSignature', 'Resources'):
                    (base / folder).mkdir(parents=True, exist_ok=True)
            main = bytearray(32)
            struct.pack_into('<II', main, 0, 0xfeedfacf, 0x0100000c)
            outer_main, child_main = bytes(main), bytes(main[:8] + b'\x01' + main[9:])
            (outer / 'MacOS' / 'App').write_bytes(outer_main)
            (nested / 'MacOS' / 'Helper').write_bytes(child_main)
            outer_info = plistlib.dumps({'CFBundleExecutable': 'App'})
            child_info = plistlib.dumps({'CFBundleExecutable': 'Helper'})
            (outer / 'Info.plist').write_bytes(outer_info)
            (nested / 'Info.plist').write_bytes(child_info)
            resource = nested / 'Resources' / 'value.txt'
            resource.write_bytes(b'correct')
            child_seal = plistlib.dumps({'files2': {'Resources/value.txt': {'hash2': hashlib.sha256(b'correct').digest()}}})
            outer_seal = plistlib.dumps({'files2': {'Frameworks/Helper.app': {'cdhash': b'x' * 20}}})
            (outer / '_CodeSignature' / 'CodeResources').write_bytes(outer_seal)
            (nested / '_CodeSignature' / 'CodeResources').write_bytes(child_seal)
            expected = {(outer_main, 1): outer_info, (outer_main, 3): outer_seal, (child_main, 1): child_info, (child_main, 3): child_seal}
            def slots(binary, slot, value):
                if expected[(binary, slot)] != value:
                    raise ValueError('特殊槽散列不匹配')
            with patch.object(verify, '检查签名页', return_value=1), patch.object(verify, '检查特殊槽', side_effect=slots), patch.object(verify, '代码目录摘要', return_value=b'x' * 20):
                verify.校验临时签名(app, 'arm64')
                (nested / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable': 'Helper', 'tampered': True}))
                with self.assertRaises(ValueError):
                    verify.校验临时签名(app, 'arm64')
                (nested / 'Info.plist').write_bytes(child_info)
                (nested / '_CodeSignature' / 'CodeResources').write_bytes(child_seal + b' ' )
                with self.assertRaises(ValueError):
                    verify.校验临时签名(app, 'arm64')
                (nested / '_CodeSignature' / 'CodeResources').write_bytes(child_seal)
                resource.write_bytes(b'tampered')
                with self.assertRaises(ValueError):
                    verify.校验临时签名(app, 'arm64')
                resource.write_bytes(b'correct')
                (nested / 'Resources' / 'extra.txt').write_bytes(b'extra')
                with self.assertRaises(ValueError):
                    verify.校验临时签名(app, 'arm64')

    def test_镜像文件集合不能缺失或添加(self):
        original = {'one': ('file', 'abc'), 'link': ('link', 'dir/file')}
        verify.比较文件集合(original, dict(original))
        for changed in ({'one': ('file', 'abc')}, {**original, 'extra': ('file', 'def')},
                        {'one': ('file', 'changed'), 'link': ('link', 'dir/file')},
                        {'one': ('file', 'abc'), 'link': ('link', '../outside')}):
            with self.assertRaises(ValueError):
                verify.比较文件集合(original, changed)

    def test_修复链接只接受带标记的独立目录(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / 'work'
            app = work / 'app'
            outside = Path(tmp) / 'outside'
            app.mkdir(parents=True)
            outside.mkdir()
            with self.assertRaises(ValueError):
                verify.确认隔离应用(app, work)
            (work / '.seal-macos-isolated').write_text('macos-cross-test-only', encoding='utf8')
            self.assertEqual(verify.确认隔离应用(app, work), app)
            with self.assertRaises(ValueError):
                verify.确认隔离应用(outside, work)

    def test_目录枚举拒绝越界和断开的符号链接(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'root'
            root.mkdir()
            (root / 'file').write_bytes(b'test')
            os.symlink('file', root / 'link')
            entries = verify.枚举应用(root)
            self.assertEqual(entries['file'], ('file', hashlib.sha256(b'test').hexdigest()))
            self.assertEqual(entries['link'], ('link', 'file'))
            os.symlink('../outside', root / 'bad')
            with self.assertRaises(ValueError):
                verify.枚举应用(root)

    def test_列表检查拒绝错误权限或缺失文件(self):
        entries = {'Contents/MacOS/app': ('file', 'x'), 'Contents/Frameworks/link': ('link', 'A')}
        records = {'Contents/MacOS/app': {'Mode': '-rwxr-xr-x'}, 'Contents/Frameworks/link': {'Mode': 'lrwxr-xr-x'}}
        verify.检查映像列表(entries, records, {'Contents/MacOS/app'})
        for bad in ({'Contents/MacOS/app': {'Mode': '-rw-r--r--'}, 'Contents/Frameworks/link': {'Mode': 'lrwxr-xr-x'}},
                    {'Contents/MacOS/app': {'Mode': '-rwxr-xr-x'}},
                    {**records, 'Contents/extra': {'Mode': '-rw-r--r--'}}):
            with self.assertRaises(ValueError):
                verify.检查映像列表(entries, bad, {'Contents/MacOS/app'})


if __name__ == '__main__':
    unittest.main()
