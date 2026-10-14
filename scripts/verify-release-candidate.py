"""Verify the five platform installers and write checksums before a release."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import xml.etree.ElementTree as ET
import zipfile


ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
RELEASE = ROOT / 'release' / f'v{VERSION}'
NAMES = [f'海豹办公安装程序{VERSION}.exe', f'海豹办公{VERSION}.exe',
         f'SealOffice{VERSION}.msix', f'海豹办公Android{VERSION}.apk',
         f'海豹办公Ubuntu{VERSION}-amd64.deb']


def sha256(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def load(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main():
    paths = {name: RELEASE / name for name in NAMES}
    for name, path in paths.items():
        require(path.is_file() and path.stat().st_size > 1_000_000, f'Missing or empty installer: {name}')
    for name in NAMES[:2]:
        with paths[name].open('rb') as source:
            require(source.read(2) == b'MZ', f'Invalid Windows executable: {name}')
    with paths[NAMES[4]].open('rb') as source:
        require(source.read(8) == b'!<arch>\n', 'Invalid Debian archive')

    for kind in ['unpacked', 'portable']:
        for phase in ['first', 'repeat', 'confirm']:
            report = load(RELEASE / f'核验-{kind}-{phase}.json')
            require(report['版本'] == VERSION and report['阶段'] == phase and report['完整性']['成功'],
                    f'Windows {kind}/{phase} verification failed')
    with zipfile.ZipFile(paths[NAMES[2]]) as archive:
        names = set(archive.namelist())
        require(archive.testzip() is None, 'MSIX CRC verification failed')
        require({'AppxManifest.xml', 'AppxBlockMap.xml', '海豹办公.exe', 'resources/app.asar'} <= names,
                'MSIX has missing application files')
        manifest = ET.fromstring(archive.read('AppxManifest.xml'))
        identity = manifest.find('{http://schemas.microsoft.com/appx/manifest/foundation/windows10}Identity')
        require(identity is not None and identity.attrib.get('Version') == f'{VERSION}.0'
                and identity.attrib.get('ProcessorArchitecture') == 'x64'
                and identity.attrib.get('Name') == '45C56666.seal-office'
                and identity.attrib.get('Publisher') == 'CN=F6431C2A-EA55-468A-89D8-890511FCADF7',
                'MSIX Store identity, publisher, version or architecture mismatch')
        app_archive_sha = hashlib.sha256(archive.read('resources/app.asar')).hexdigest()
        msix_files = len(names)
    require(sha256(RELEASE / 'win-unpacked/resources/app.asar') == app_archive_sha,
            'MSIX application archive differs from tested Windows build')
    msix_report = {
        'package': str(paths[NAMES[2]]), 'version': f'{VERSION}.0',
        'identity': identity.attrib['Name'], 'publisher': identity.attrib['Publisher'],
        'architecture': 'x64', 'bytes': paths[NAMES[2]].stat().st_size,
        'sha256': sha256(paths[NAMES[2]]), 'appAsarSha256': app_archive_sha,
        'totalPayloadFilesVerified': msix_files, 'hasBlockMap': True, 'crcPassed': True,
        'signed': False, 'installationTest': 'Store-upload MSIX is unsigned',
    }
    (RELEASE / f'SealOffice{VERSION}.msix.verification.json').write_text(
        json.dumps(msix_report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    android = load(RELEASE / 'android-verification.json')
    metadata = android['sdkMetadata']
    major, minor, patch = map(int, VERSION.split('.'))
    version_code = major * 10000 + minor * 100 + patch
    require(android['sha256'] == sha256(paths[NAMES[3]]) and android['bytes'] == paths[NAMES[3]].stat().st_size,
            'Android APK bytes differ from the verification report')
    require(android['version'] == {'name': VERSION, 'code': str(version_code)}, 'Android package version mismatch')
    require(android['embeddedEditor']['matchesCurrentSourceBuild'], 'Android editor differs from the verified source build')
    require(android['signature']['verified'] and metadata['packageName'] == 'com.sealoffice.mobile',
            'Android signature or package name mismatch')
    require(metadata['minSdk'] == '28' and metadata['targetSdk'] == '36'
            and 'arm64-v8a' in metadata['abi'] and 'armeabi-v7a' in metadata['abi'],
            'Android SDK or ABI configuration mismatch')
    require(all(item['compatible'] for item in android['nativeLibraries16KiB']),
            'Android 16 KiB library alignment failed')

    ubuntu_sha = sha256(paths[NAMES[4]])
    for os_name in ['22.04', '24.04']:
        report = load(RELEASE / f'Ubuntu{os_name}Verification.json')
        require(report.get('passed') and report['version'] == VERSION
                and report['packageSha256'] == ubuntu_sha
                and report['packageBytes'] == paths[NAMES[4]].stat().st_size
                and report['sandboxBypassed'] is False,
                f'Ubuntu {os_name} verification failed')

    notes = RELEASE / f'SealOffice{VERSION}-ReleaseNotes.md'
    shutil.copyfile(ROOT / 'docs' / f'v{VERSION}-修复与验收.md', notes)
    hashes = {name: sha256(path) for name, path in paths.items()}
    integrity = {'version': VERSION, 'passed': True, 'appAsarSha256': app_archive_sha,
                 'windowsSmoke': ['unpacked', 'portable'], 'ubuntuVerifiedOn': ['22.04', '24.04'],
                 'androidMatchesCurrentBuild': True, 'packages': [
                     {'name': name, 'bytes': paths[name].stat().st_size, 'sha256': hashes[name]}
                     for name in NAMES]}
    (RELEASE / 'release-integrity.json').write_text(
        json.dumps(integrity, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    published = [*NAMES, notes.name, 'release-integrity.json',
                 f'SealOffice{VERSION}.msix.verification.json', 'android-verification.json',
                 'Ubuntu22.04Verification.json', 'Ubuntu24.04Verification.json']
    (RELEASE / 'SHA256SUMS.txt').write_text(
        ''.join(f'{sha256(RELEASE / name)}  {name}\n' for name in sorted(published)), encoding='utf-8')
    print(json.dumps({'version': VERSION, 'passed': True, 'packages': integrity['packages']},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
