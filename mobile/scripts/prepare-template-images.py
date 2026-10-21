"""Generate mobile-only derivatives; desktop originals and complete fonts stay intact."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parents[2]
target = root / 'mobile/assets/template-images'
records = []
for group in ['market', 'presentation-templates']:
    metadata = json.loads((root / 'renderer/src/assets' / group / 'metadata.json').read_text(encoding='utf-8'))
    for source in sorted((root / 'renderer/src/assets' / group).glob('*.png')):
        image = Image.open(source)
        if group == 'market':
            output = target / group / source.name
            result = image.quantize(colors=256)
            options = dict(format='PNG', optimize=True)
        else:
            output = target / group / (source.stem + '.jpg')
            result = image.convert('RGB')
            result.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
            options = dict(format='JPEG', quality=85, optimize=True)
        output.parent.mkdir(parents=True, exist_ok=True)
        result.save(output, **options)
        metadata[source.stem].update(id=hashlib.sha256(output.read_bytes()).hexdigest(), bytes=output.stat().st_size,
                                     type='image/jpeg' if output.suffix == '.jpg' else 'image/png',
                                     width=result.width, height=result.height, file=output.name)
        records.append(dict(source=source.relative_to(root).as_posix(), sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                            output=output.relative_to(target).as_posix(), sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                            originalSize=image.size, size=result.size, bytes=output.stat().st_size))
    (target / group / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
(target / 'manifest.json').write_text(json.dumps(records, indent=2) + '\n', encoding='utf-8')
print(json.dumps(dict(images=len(records), bytes=sum(r['bytes'] for r in records))))
