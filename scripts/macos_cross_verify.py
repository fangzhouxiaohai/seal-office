"""macOS 隔离候选的跨平台结构校验；不替代苹果系统签名或运行验收。"""
import hashlib
import os
import struct
from pathlib import Path


def 架构(data):
    if len(data) < 8:
        raise ValueError('二进制头不完整')
    names = {0x0100000c: 'arm64', 0x01000007: 'x64'}
    if data[:4] == bytes.fromhex('cffaedfe'):
        if len(data) < 32:
            raise ValueError('Mach-O 头不完整')
        cpu = struct.unpack_from('<I', data, 4)[0]
        if cpu not in names:
            raise ValueError('不支持的 Mach-O 架构')
        return {names[cpu]}
    if data[:4] == bytes.fromhex('cafebabe'):
        count = struct.unpack_from('>I', data, 4)[0]
        if not 1 <= count <= 64 or len(data) < 8 + count * 20:
            raise ValueError('通用 Mach-O 头不完整')
        result = set()
        for i in range(count):
            cpu, _, offset, size, _ = struct.unpack_from('>IIIII', data, 8 + i * 20)
            if cpu not in names or not size or offset + size > len(data):
                raise ValueError('通用 Mach-O 切片无效')
            result.add(names[cpu])
        return result
    raise ValueError('不是可识别的 Mach-O')


def 文件摘要(p):
    with Path(p).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def 枚举应用(root):
    root = Path(root).resolve(strict=True)
    entries = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in list(dirs) + files:
            p = Path(directory) / name
            rel = p.relative_to(root).as_posix()
            if p.is_symlink():
                target = os.readlink(p).replace('\\', '/')
                try:
                    inside = (p.parent / target).resolve(strict=True).is_relative_to(root)
                except OSError as error:
                    raise ValueError(f'符号链接损坏：{rel}') from error
                if os.path.isabs(target) or not inside:
                    raise ValueError(f'符号链接越界：{rel}')
                entries[rel] = ('link', target)
                if name in dirs:
                    dirs.remove(name)
            elif p.is_file():
                entries[rel] = ('file', 文件摘要(p))
            elif not p.is_dir():
                raise ValueError(f'不支持的文件类型：{rel}')
    return entries


def 比较文件集合(expected, actual):
    if expected != actual:
        missing, extra = sorted(expected.keys() - actual.keys()), sorted(actual.keys() - expected.keys())
        changed = sorted(k for k in expected.keys() & actual.keys() if expected[k] != actual[k])
        raise ValueError(f'映像文件不一致：缺失 {missing}，新增 {extra}，变化 {changed}')


def 检查映像列表(entries, records, executable_files):
    if set(entries) != set(records):
        raise ValueError('映像文件集合不一致')
    for rel, (kind, _) in entries.items():
        mode = records[rel].get('Mode', '')
        if kind == 'link' and not mode.startswith('l'):
            raise ValueError(f'映像链接类型错误：{rel}')
        if kind == 'file' and not mode.startswith('-'):
            raise ValueError(f'映像文件类型错误：{rel}')
        if rel in executable_files and mode != '-rwxr-xr-x':
            raise ValueError(f'Mach-O 权限不是 0755：{rel}')

def 读取代码目录(data):
    if len(data) < 32 or struct.unpack_from('<I', data)[0] != 0xfeedfacf:
        raise ValueError('仅支持小端 64 位 Mach-O')
    count = struct.unpack_from('<I', data, 16)[0]
    if count > 10000:
        raise ValueError('装载命令数量异常')
    position, signature = 32, None
    for _ in range(count):
        if position + 8 > len(data):
            raise ValueError('装载命令不完整')
        command, size = struct.unpack_from('<II', data, position)
        if size < 8 or position + size > len(data):
            raise ValueError('装载命令长度异常')
        if command == 0x1d:
            if size < 16 or signature is not None:
                raise ValueError('签名命令异常')
            signature = struct.unpack_from('<II', data, position + 8)
        position += size
    if signature is None:
        raise ValueError('缺少签名命令')
    offset, length = signature
    if length < 12 or offset + length > len(data):
        raise ValueError('签名范围异常')
    magic, total, count = struct.unpack_from('>III', data, offset)
    if magic != 0xfade0cc0 or total > length or 12 + count * 8 > total:
        raise ValueError('签名容器异常')
    directories = []
    for index in range(count):
        slot, relative = struct.unpack_from('>II', data, offset + 12 + index * 8)
        if slot == 0:
            directories.append(offset + relative)
    if len(directories) != 1 or directories[0] < offset + 12 + count * 8 or directories[0] + 40 > offset + total:
        raise ValueError('代码目录缺失或重复')
    cd = directories[0]
    magic, size, version, flags, hash_offset, ident, special, slots, limit = struct.unpack_from('>9I', data, cd)
    hash_size, hash_type, platform, shift = struct.unpack_from('4B', data, cd + 36)
    if magic != 0xfade0c02 or size < 40 or cd + size > offset + total or flags & 2 == 0:
        raise ValueError('非临时签名代码目录')
    if hash_type != 2 or hash_size != 32 or shift > 20:
        raise ValueError('不支持的签名散列格式')
    page = 1 << shift if shift else limit
    if (not page or not slots or slots != (limit + page - 1) // page or limit > offset or
            hash_offset < 40 + special * hash_size or hash_offset + slots * hash_size > size):
        raise ValueError('代码页或特殊槽范围异常')
    return cd, size, hash_offset, special, slots, limit, page


def 检查签名页(data):
    cd, _, hash_offset, _, slots, limit, page = 读取代码目录(data)
    for index in range(slots):
        digest = hashlib.sha256(data[index * page:min((index + 1) * page, limit)]).digest()
        expected = data[cd + hash_offset + index * 32:cd + hash_offset + (index + 1) * 32]
        if digest != expected:
            raise ValueError(f'代码页 {index} 散列不匹配')
    return slots


def 检查特殊槽(data, slot, contents):
    检查签名页(data)
    cd, _, hash_offset, special, _, _, _ = 读取代码目录(data)
    if slot < 1 or slot > special:
        raise ValueError('缺少特殊槽')
    expected = data[cd + hash_offset - slot * 32:cd + hash_offset - (slot - 1) * 32]
    if hashlib.sha256(contents).digest() != expected:
        raise ValueError('特殊槽散列不匹配')


def 代码目录摘要(data):
    检查签名页(data)
    cd, size, _, _, _, _, _ = 读取代码目录(data)
    return hashlib.sha256(data[cd:cd + size]).digest()[:20]

def 读取原始链接(archive):
    import zipfile
    result = {}
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            if item.filename.startswith('Electron.app/') and (item.external_attr >> 16) & 0o170000 == 0o120000:
                rel = item.filename[len('Electron.app/'):]
                target = z.read(item).decode('utf8')
                if not rel or rel.startswith('/') or '..' in Path(rel).parts or target.startswith('/'):
                    raise ValueError('原始 Electron 链接无效')
                result[rel] = target
    if not result:
        raise ValueError('原始 Electron 压缩包未包含符号链接')
    return result


def 校验原始链接(entries, archive):
    expected = 读取原始链接(archive)
    actual = {key: value for key, (kind, value) in entries.items() if kind == 'link'}
    if actual != expected:
        raise ValueError('应用符号链接与 Electron 压缩包不一致')
    return len(expected)


def 读取映像列表(seven, dmg, prefix):
    import subprocess
    result = subprocess.run([str(seven), 'l', '-slt', '-ba', '-sccUTF-8', str(dmg)], check=True, capture_output=True)
    records = {}
    for block in result.stdout.decode('utf8').replace('\r\n', '\n').split('\n\n'):
        item = dict(line.split(' = ', 1) for line in block.splitlines() if ' = ' in line)
        path = item.get('Path', '').replace('\\', '/')
        if path.startswith(prefix) and item.get('Folder') == '-':
            relative = path[len(prefix):]
            if not relative or relative in records or '..' in Path(relative).parts:
                raise ValueError('映像路径无效或重复')
            records[relative] = item
    if not records:
        raise ValueError('映像中未找到应用文件')
    return records


def 校验映像(app, extracted, dmg, archive, seven, name):
    import subprocess
    root, extracted = Path(app).resolve(strict=True), Path(extracted).resolve(strict=True)
    entries = 枚举应用(root)
    links = 校验原始链接(entries, archive)
    prefix = f'{name}/{name}.app/'
    records = 读取映像列表(seven, dmg, prefix)
    macho, actual = set(), {}
    for rel, (kind, digest) in entries.items():
        p = root / rel
        if kind == 'file':
            target = extracted / rel
            if not target.is_file():
                raise ValueError(f'映像文件缺失：{rel}')
            actual[rel] = ('file', 文件摘要(target))
            with p.open('rb') as stream:
                magic = stream.read(4)
            if magic in (b'\xcf\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
                macho.add(rel)
        else:
            result = subprocess.run([str(seven), 'e', '-so', '-sccUTF-8', str(dmg), (prefix + rel).replace('/', '\\')], check=True, capture_output=True)
            actual[rel] = ('link', result.stdout.decode('utf8'))
    比较文件集合(entries, actual)
    检查映像列表(entries, records, macho)
    return {'files': sum(kind == 'file' for kind, _ in entries.values()), 'links': links, 'mach_o': len(macho), 'sha256': 文件摘要(dmg)}


def 修复链接(app, archive):
    root = Path(app).resolve(strict=True)
    links = 读取原始链接(archive)
    # 先修复指向具体版本的链接，再处理依赖它们的资源链接。
    for rel, target in sorted(links.items(), key=lambda item: len(item[1])):
        link = root / rel
        if not link.is_symlink() or os.readlink(link).replace('\\', '/') != target:
            raise ValueError(f'原始链接缺失或目标不符：{rel}')
        dest = (link.parent / target).resolve(strict=True)
        if not dest.is_relative_to(root):
            raise ValueError(f'原始链接越界：{rel}')
        if os.name == 'nt':
            desired = dest.is_dir()
            attributes = os.lstat(link).st_file_attributes
            actual = bool(attributes & 16)
            if desired != actual or '/' in os.readlink(link):
                os.unlink(link)
                os.symlink(target.replace('/', os.sep), link, target_is_directory=desired)
    校验原始链接(枚举应用(root), archive)
    return len(links)


def 校验临时签名(app, arch, archive=None):
    import plistlib
    root = Path(app).resolve(strict=True)
    entries = 枚举应用(root)
    if archive is not None:
        校验原始链接(entries, archive)
    elif any(kind == 'link' for kind, _ in entries.values()):
        raise ValueError('验证符号链接需要原始 Electron 压缩包')
    pages, binaries = 0, 0
    for rel, (kind, _) in entries.items():
        if kind != 'file':
            continue
        p = root / rel
        with p.open('rb') as stream:
            magic = stream.read(4)
        if magic == b'\xcf\xfa\xed\xfe':
            data = p.read_bytes()
            if 架构(data) != {arch}:
                raise ValueError(f'二进制架构不符：{rel}')
            pages += 检查签名页(data)
            binaries += 1
        elif magic in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
            raise ValueError(f'不支持的通用二进制：{rel}')
    if not binaries:
        raise ValueError('应用不含签名二进制')
    covered, visited = set(), set()
    sealed_files = nested_count = 0

    def read_file(file):
        file = Path(file)
        if file.is_symlink() or not file.is_file() or not file.resolve(strict=True).is_relative_to(root):
            raise ValueError(f'封存文件缺失或越界：{file}')
        covered.add(file.relative_to(root).as_posix())
        return file.read_bytes()

    def verify_bundle(container, framework=False):
        nonlocal sealed_files, nested_count
        container = Path(container)
        if container.is_symlink() or not container.resolve(strict=True).is_relative_to(root):
            raise ValueError('嵌套组件路径越界')
        key = str(container.resolve(strict=True))
        if key in visited:
            raise ValueError('嵌套组件重复或循环')
        visited.add(key)
        base = container / 'Versions' / 'A' if framework else container / 'Contents'
        info_path = base / 'Resources' / 'Info.plist' if framework else base / 'Info.plist'
        info = read_file(info_path)
        metadata = plistlib.loads(info)
        executable = metadata.get('CFBundleExecutable')
        if not isinstance(executable, str) or not executable or Path(executable).name != executable or '\\' in executable:
            raise ValueError('组件可执行文件名无效')
        binary_path = base / executable if framework else base / 'MacOS' / executable
        binary = read_file(binary_path)
        resources = read_file(base / '_CodeSignature' / 'CodeResources')
        检查特殊槽(binary, 1, info)
        检查特殊槽(binary, 3, resources)
        package_info = base / 'PkgInfo'
        if package_info.exists():
            if read_file(package_info) != b'APPL????':
                raise ValueError('未签名的 PkgInfo 内容不符')
        seals = plistlib.loads(resources).get('files2')
        if not isinstance(seals, dict):
            raise ValueError('资源封存清单无效')
        for name, value in seals.items():
            if not isinstance(name, str) or not name or Path(name).is_absolute() or '..' in Path(name).parts or '\\' in name:
                raise ValueError('资源封存路径越界')
            item = base / name
            if isinstance(value, dict) and 'hash2' in value:
                if hashlib.sha256(read_file(item)).digest() != value['hash2']:
                    raise ValueError(f'资源封存不符：{name}')
                sealed_files += 1
            elif isinstance(value, dict) and 'cdhash' in value:
                if item.suffix == '.app' and item.is_dir():
                    nested_binary = verify_bundle(item)
                    nested_count += 1
                elif item.suffix == '.framework' and item.is_dir():
                    nested_binary = verify_bundle(item, framework=True)
                    nested_count += 1
                elif item.is_file() and not item.is_symlink():
                    nested_binary = read_file(item)
                else:
                    raise ValueError(f'未知嵌套组件：{name}')
                if 代码目录摘要(nested_binary) != value['cdhash']:
                    raise ValueError(f'嵌套组件摘要不符：{name}')
            else:
                raise ValueError(f'不支持的资源封存项目：{name}')
        return binary

    verify_bundle(root)
    actual_files = {rel for rel, (kind, _) in entries.items() if kind == 'file'}
    if actual_files != covered:
        raise ValueError(f'存在未封存或多余文件：{sorted(actual_files - covered)}；缺失 {sorted(covered - actual_files)}')
    return {'binaries': binaries, 'pages': pages, 'sealed_files': sealed_files, 'nested': nested_count,
            'system_signature': '未在 macOS 验证', 'notarization': '未公证', 'launch': '未在 macOS 运行'}

def 读取段(data):
    if len(data) < 32 or data[:4] != b'\xcf\xfa\xed\xfe':
        raise ValueError('不支持的 Mach-O 格式')
    commands = struct.unpack_from('<I', data, 16)[0]
    if commands > 10000:
        raise ValueError('装载命令数量异常')
    position, sections = 32, []
    for _ in range(commands):
        if position + 8 > len(data):
            raise ValueError('装载命令缺失')
        command, size = struct.unpack_from('<II', data, position)
        if size < 8 or position + size > len(data):
            raise ValueError('装载命令范围无效')
        if command == 0x19:
            if size < 72:
                raise ValueError('段命令过短')
            count = struct.unpack_from('<I', data, position + 64)[0]
            if 72 + 80 * count > size:
                raise ValueError('数据段数量错误')
            for index in range(count):
                current = position + 72 + index * 80
                name = data[current:current + 32]
                length = struct.unpack_from('<Q', data, current + 40)[0]
                offset = struct.unpack_from('<I', data, current + 48)[0]
                flags = struct.unpack_from('<I', data, current + 64)[0]
                if length and flags & 0xff not in (1, 12, 18):
                    if offset + length > len(data):
                        raise ValueError('数据段越界')
                    sections.append((name, length, offset))
        position += size
    if not sections:
        raise ValueError('无数据段')
    return sections


def 读取规范化命令(data):
    if len(data) < 32 or data[:4] != b'\xcf\xfa\xed\xfe':
        raise ValueError('不支持的 Mach-O 格式')
    count = struct.unpack_from('<I', data, 16)[0]
    if count > 10000:
        raise ValueError('装载命令数量异常')
    position, result, signatures = 32, [], 0
    for _ in range(count):
        if position + 8 > len(data):
            raise ValueError('装载命令缺失')
        command, size = struct.unpack_from('<II', data, position)
        if size < 8 or position + size > len(data):
            raise ValueError('装载命令范围无效')
        record = bytearray(data[position:position + size])
        if command == 0x19 and record[8:24].rstrip(b'\0') == b'__LINKEDIT':
            if size < 72:
                raise ValueError('链接段命令过短')
            # 重签只允许改变链接段的内存大小与文件大小。
            record[32:40] = bytes(8)
            record[48:56] = bytes(8)
        elif command == 0x1d:
            if size != 16 or signatures:
                raise ValueError('签名装载命令异常')
            signatures += 1
            position += size
            continue
        result.append(bytes(record))
        position += size
    header = bytearray(data[:32])
    ncmds, sizeofcmds = struct.unpack_from('<II', header, 16)
    struct.pack_into('<II', header, 16, ncmds - signatures, sizeofcmds - signatures * 16)
    return bytes(header), result

def 比较二进制段(original, signed):
    if 读取规范化命令(original) != 读取规范化命令(signed):
        raise ValueError('Mach-O 文件头或非签名装载命令不同')
    before, after = 读取段(original), 读取段(signed)
    if [(item[0], item[1]) for item in before] != [(item[0], item[1]) for item in after]:
        raise ValueError('数据段布局不同')
    for left, right in zip(before, after):
        if original[left[2]:left[2] + left[1]] != signed[right[2]:right[2] + right[1]]:
            raise ValueError('数据段不一致')
    return len(before)

def 确认隔离应用(app, work):
    work = Path(work).resolve(strict=True)
    app = Path(app).resolve(strict=True)
    marker = work / '.seal-macos-isolated'
    if not app.is_relative_to(work) or app == work or not marker.is_file() or marker.is_symlink() or marker.read_text(encoding='utf8') != 'macos-cross-test-only':
        raise ValueError('只允许修改带标记的独立工作目录内应用')
    return app

def 校验原始数据(app, archive, product):
    import zipfile
    root = Path(app).resolve(strict=True)
    regular = binaries = sections = skipped = 0
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            if not item.filename.startswith('Electron.app/') or item.is_dir() or (item.external_attr >> 16) & 0o170000 == 0o120000:
                continue
            rel = item.filename[len('Electron.app/'):]
            if not rel or rel.startswith('/') or '..' in Path(rel).parts:
                raise ValueError('Electron 归档路径无效')
            original = z.read(item)
            if original[:4] == b'\xcf\xfa\xed\xfe':
                mapped = rel.replace('Electron Helper', product + ' Helper')
                if mapped == 'Contents/MacOS/Electron':
                    mapped = 'Contents/MacOS/' + product
                target = root / mapped
                if not target.is_file():
                    raise ValueError(f'缺少原始二进制：{mapped}')
                sections += 比较二进制段(original, target.read_bytes())
                binaries += 1
            elif ('_CodeSignature/' in rel or rel.endswith('Info.plist') or 'Electron Helper' in rel or
                  rel in ('Contents/Resources/electron.icns', 'Contents/Resources/default_app.asar')):
                skipped += 1
            elif original[:4] in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
                raise ValueError(f'不支持的通用 Electron 二进制：{rel}')
            else:
                target = root / rel
                if not target.is_file() or hashlib.sha256(original).hexdigest() != 文件摘要(target):
                    raise ValueError(f'原始 Electron 资源不同：{rel}')
                regular += 1
    if not regular or not binaries:
        raise ValueError('没有可验证的 Electron 文件')
    return {'resources': regular, 'binaries': binaries, 'sections': sections, 'expected_changes_skipped': skipped}

def 校验原生(source, target, arch):
    original = Path(source).read_bytes()
    signed = Path(target).read_bytes()
    if 架构(original) != {arch} or 架构(signed) != {arch}:
        raise ValueError('原生模块架构不符')
    pages = 检查签名页(signed)
    sections = 比较二进制段(original, signed)
    return {'pages': pages, 'sections': sections}

def main():
    import argparse
    import json
    parser = argparse.ArgumentParser(description='仅供 macOS 隔离测试候选的跨平台检查，不代表发行验收通过。')
    sub = parser.add_subparsers(dest='command', required=True)
    repair = sub.add_parser('repair-links')
    repair.add_argument('--app', required=True)
    repair.add_argument('--work', required=True)
    repair.add_argument('--electron-zip', required=True)
    sign = sub.add_parser('signature')
    sign.add_argument('--app', required=True)
    sign.add_argument('--arch', required=True, choices=['arm64', 'x64'])
    sign.add_argument('--electron-zip', required=True)
    native = sub.add_parser('native')
    native.add_argument('--source', required=True)
    native.add_argument('--target', required=True)
    native.add_argument('--arch', required=True, choices=['arm64', 'x64'])
    original = sub.add_parser('original')
    original.add_argument('--app', required=True)
    original.add_argument('--electron-zip', required=True)
    original.add_argument('--name', required=True)
    image = sub.add_parser('image')
    for key in ('app', 'extracted', 'dmg', 'electron-zip', 'seven', 'name'):
        image.add_argument('--' + key, required=True)
    args = parser.parse_args()
    if args.command == 'repair-links':
        result = {'links': 修复链接(确认隔离应用(args.app, args.work), args.electron_zip)}
    elif args.command == 'signature':
        result = 校验临时签名(args.app, args.arch, args.electron_zip)
    elif args.command == 'native':
        result = 校验原生(args.source, args.target, args.arch)
    elif args.command == 'original':
        result = 校验原始数据(args.app, args.electron_zip, args.name)
    else:
        result = 校验映像(args.app, args.extracted, args.dmg, args.electron_zip, args.seven, args.name)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
