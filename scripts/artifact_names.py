"""Repository-controlled distribution names; application branding is separate."""
import json
from pathlib import Path
import re

TEMPLATES = json.loads((Path(__file__).resolve().parents[1] / 'build/artifact-names.json').read_text(encoding='utf-8'))


def artifact_name(platform, version):
    if platform not in TEMPLATES:
        raise ValueError('Unknown package platform: ' + str(platform))
    if not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+', version, flags=re.ASCII):
        raise ValueError('Package version must contain three numeric components')
    return TEMPLATES[platform].replace('${version}', version)
