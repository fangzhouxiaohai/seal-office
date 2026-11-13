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






