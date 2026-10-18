"""Inspect the built DEB, including the actual archived app bytes, without installing it."""
import hashlib
import io
import json
from pathlib import Path
import tarfile
from artifact_names import artifact_name

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
PACKAGE = ROOT / 'release' / f'v{VERSION}' / artifact_name('ubuntu', VERSION)


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def inspect():
    report = {'version': VERSION, 'mode': 'static-deb-inspection', 'package': PACKAGE.name, 'checks': [],
              'limitations': ['No Linux installation or runtime/UI test was performed on this Windows host.']}
    with PACKAGE.open('rb') as source:
        assert source.read(8) == b'!<arch>\n', 'DEB ar signature'
        entries = {}
        while header := source.read(60):
            assert len(header) == 60 and header[58:60] == b'`\n', 'ar member header'
            name = header[:16].decode('ascii').strip().rstrip('/')
            size = int(header[48:58])
            entries[name] = source.read(size)
            if size % 2:
                source.read(1)
    assert entries['debian-binary'] == b'2.0\n'
    assert set(entries) == {'debian-binary', 'control.tar.xz', 'data.tar.xz'}
    report['checks'].append('Debian ar structure and version')
    with tarfile.open(fileobj=io.BytesIO(entries['control.tar.xz']), mode='r:xz') as archive:
        control = archive.extractfile(next(item for item in archive if item.name.lstrip('./') == 'control')).read().decode('utf-8')
        fields = dict(line.split(': ', 1) for line in control.splitlines() if ': ' in line and not line.startswith(' '))
        assert fields['Version'] == VERSION and fields['Architecture'] == 'amd64'
        assert '海豹办公' in fields['Description']
        for package in ['libreoffice-writer', 'libreoffice-calc', 'libreoffice-impress', 'fonts-noto-cjk']:
            assert package in fields['Depends']
    report['checks'].append(f'{VERSION} amd64 control metadata and conversion dependencies')
    expected = digest(ROOT / 'release/ubuntu/linux-unpacked/resources/app.asar')
    found = {}
    with tarfile.open(fileobj=io.BytesIO(entries['data.tar.xz']), mode='r|xz') as archive:
        for item in archive:
            name = item.name.removeprefix('./')
            if name.endswith('/resources/app.asar'):
                assert name == 'opt/海豹办公/resources/app.asar'
                found['appAsarSha256'] = hashlib.file_digest(archive.extractfile(item), 'sha256').hexdigest()
            elif name == 'usr/share/applications/sealoffice.desktop':
                desktop = archive.extractfile(item).read().decode('utf-8')
                assert 'Name=海豹办公\n' in desktop and 'Exec=/opt/海豹办公/sealoffice %U' in desktop
                found['desktopName'] = '海豹办公'
            elif name == 'opt/海豹办公/sealoffice':
                assert item.mode & 0o111
                assert archive.extractfile(item).read(4) == b'\x7fELF'
                found['executable'] = name
    assert found.get('appAsarSha256') == expected
    assert found.get('desktopName') and found.get('executable')
    report['checks'].append('Archived ELF, Chinese desktop name, and app.asar SHA-256 match the inspected unpacked build')
    report.update(found, sha256=digest(PACKAGE), bytes=PACKAGE.stat().st_size, passed=True)
    output = ROOT / 'docs/verification' / f'v{VERSION}' / 'linux-deb.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    inspect()
