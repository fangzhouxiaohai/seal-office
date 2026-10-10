"""Package the dependency-free converter server and its actual format registry."""
from pathlib import Path
import json
import hashlib
import zipfile
ROOT = Path(__file__).resolve().parent.parent
version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
output = ROOT / 'release' / f'v{version}' / f'SealOffice{version}-DocumentConverter.zip'
output.parent.mkdir(parents=True, exist_ok=True)
files = [ROOT / 'main/documentFormats.json', ROOT / 'LICENSE'] + sorted((ROOT / 'server/converter').glob('*'))
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        if file.is_file():
            archive.write(file, file.relative_to(ROOT).as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert len(json.loads(archive.read('main/documentFormats.json'))) == 50
    assert archive.read('server/converter/index.cjs') == (ROOT / 'server/converter/index.cjs').read_bytes()
print(json.dumps({'package': str(output), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size}))
