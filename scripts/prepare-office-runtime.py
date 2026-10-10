"""Prepare a private, offline Windows conversion runtime without installing system apps."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request

VERSION = '26.8.1'
NAME = f'LibreOffice_{VERSION}_Win_x86-64.msi'
URL = f'https://download.documentfoundation.org/libreoffice/stable/{VERSION}/win/x86_64/{NAME}'
SHA256 = 'c6298b10cfa1748bcbedad94c62ce771e240e5021bfd6d7a967cd571b04b5312'
ROOT = Path(__file__).resolve().parent.parent
DESTINATION = ROOT / '.upgrade-private' / 'office-runtime'
CACHE = Path(os.environ.get('SEAL_OFFICE_RUNTIME_CACHE', str(ROOT / '.upgrade-private' / 'runtime-downloads'))).resolve()

def digest(target):
    with target.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def prepare():
    if os.name != 'nt':
        raise RuntimeError('Windows conversion runtime must be prepared on Windows')
    receipt = DESTINATION / 'seal-runtime.json'
    if receipt.exists() and (DESTINATION / 'program' / 'soffice.com').exists():
        report = json.loads(receipt.read_text(encoding='utf-8'))
        if report.get('sha256') == SHA256:
            for library in (DESTINATION / 'System64').glob('*.dll'):
                target = DESTINATION / 'program' / library.name
                if not target.exists():
                    shutil.copy2(library, target)
            print(f'Office conversion runtime {VERSION} ready', flush=True)
            return
    CACHE.mkdir(parents=True, exist_ok=True)
    installer = CACHE / NAME
    if not installer.exists() or digest(installer) != SHA256:
        print(f'Downloading LibreOffice {VERSION} from the official distribution...', flush=True)
        temporary = installer.with_suffix('.download')
        with urllib.request.urlopen(URL, timeout=120) as remote, temporary.open('wb') as output:
            shutil.copyfileobj(remote, output, 1024 * 1024)
        if digest(temporary) != SHA256:
            raise RuntimeError('Official conversion runtime SHA-256 verification failed')
        temporary.replace(installer)
    staging = ROOT / '.upgrade-private' / 'runtime-extraction'
    staging.mkdir(parents=True, exist_ok=True)
    print('Extracting conversion engine into the project (no system installation)...', flush=True)
    subprocess.run(['msiexec.exe', '/a', str(installer), '/qn', f'TARGETDIR={staging}', '/l*v', str(staging / 'extraction.log')], check=True, timeout=600)
    candidates = list(staging.rglob('soffice.com'))
    if len(candidates) != 1:
        raise RuntimeError('Extracted package is missing the conversion executable')
    runtime = candidates[0].parent.parent
    # Keep the unmodified engine, its fonts, dictionaries, license notices and source offer.
    shutil.copytree(runtime, DESTINATION, dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.msi', 'extraction.log'))
    # The administrative package keeps its VC runtimes in System64; an app-local copy
    # allows the portable build to work without requiring a machine-wide VC install.
    for library in (runtime / 'System64').glob('*.dll'):
        shutil.copy2(library, DESTINATION / 'program' / library.name)
    receipt.write_text(json.dumps({'version': VERSION, 'url': URL, 'sha256': SHA256, 'source': f'https://download.documentfoundation.org/libreoffice/src/{VERSION}/'}, indent=2) + '\n', encoding='utf-8')
    print(f'Office conversion runtime {VERSION} ready: {DESTINATION}', flush=True)

if __name__ == '__main__':
    prepare()
