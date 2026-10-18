"""Read installed WPS command metadata; keep vendor resources in the private QA folder.

This is a static inventory, not a claim that commands were executed or that the
native document engines were decompiled. No vendor code/assets enter app builds.
"""
import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def repair_attribute_literals(text):
    # WPS 的部分 .kuip 属性包含未转义的 <，标准 XML 解析器会拒绝。
    # 仅在分析副本中修复引号内的 XML 字面量，并显式记录，原字节和哈希不变。
    output, quote, in_tag, repairs = [], None, False, 0
    for index, char in enumerate(text):
        if quote:
            if char == quote:
                quote = None
            elif char == '<':
                char, repairs = '&lt;', repairs + 1
            elif char == '&' and not re.match(r'&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);', text[index:]):
                char, repairs = '&amp;', repairs + 1
        elif in_tag and char in ('"', "'"):
            quote = char
        elif char == '<':
            in_tag = True
        elif char == '>':
            in_tag = False
        output.append(char)
    return ''.join(output), repairs


def analyze(root, output):
    if not (root / 'wps.exe').is_file() or not (root / 'res').is_dir():
        raise ValueError('Selected directory must contain wps.exe and res/')
    output.mkdir(parents=True, exist_ok=True)
    files, commands, errors, recoveries = [], [], [], []
    with zipfile.ZipFile(output / 'command-resources.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for source in sorted((root / 'res').rglob('*')):
            if not source.is_file() or source.suffix.lower() not in ('.kui', '.kuip'):
                continue
            data = source.read_bytes()
            relative = source.relative_to(root).as_posix()
            files.append({'path': relative, 'bytes': len(data), 'sha256': digest(data)})
            archive.writestr(relative, data)
            try:
                try:
                    document = ET.fromstring(data)
                except ET.ParseError:
                    repaired, count = repair_attribute_literals(data.decode('utf-8-sig'))
                    document = ET.fromstring(repaired)
                    recoveries.append({'path': relative, 'attributeLiteralRepairs': count})
                component = document.get('component') or next((name for name in ('wps', 'et', 'wpp', 'pdf')
                    if relative.startswith(f'res/{name}') or f'/commands/{name}/' in f'/{relative}'), 'shared')
                for node in document.iter():
                    command_id = node.get('id')
                    if not command_id or not (node.get('ksoCmd') or 'Command' in node.tag or node.get('shortcutHint')):
                        continue
                    command = {'component': component, 'id': command_id, 'source': relative}
                    for attr in ('text', 'shortcutHint', 'ksoCmd'):
                        if node.get(attr):
                            command[attr] = node.get(attr)
                    commands.append(command)
            except ET.ParseError as error:
                errors.append({'path': relative, 'error': str(error)})
    unique = {(item['component'], item['id']) for item in commands}
    shortcuts = {(item['component'], item['id'], item['shortcutHint'])
                 for item in commands if item.get('shortcutHint')}
    report = {
        'observedAt': datetime.now(timezone.utc).isoformat(), 'installation': str(root),
        'authority': 'installed-resource-static-inventory',
        'executables': [{'name': name, 'sha256': digest((root / name).read_bytes()),
                         'bytes': (root / name).stat().st_size}
                        for name in ('wps.exe', 'et.exe', 'wpp.exe') if (root / name).is_file()],
        'summary': {'resourceFiles': len(files), 'commandDeclarations': len(commands),
                    'uniqueCommandIds': len(unique), 'uniqueShortcutDeclarations': len(shortcuts),
                    'commandsByComponent': dict(Counter(component for component, _ in unique)),
                    'parseErrors': len(errors), 'recoveredResourceFiles': len(recoveries)},
        'limitations': [
            'Declarations may be conditional, duplicated, disabled, paid, or unloaded; runtime availability is not established.',
            'hotKey/rbHotKey are menu access keys and are not treated as keyboard shortcuts.',
            'Shortcut hints do not establish complete bindings, conflict precedence, or native command behavior.',
            'Native import/export engines, cloud services and mobile WPS are not covered by this resource inventory.',
            'Non-XML attribute literals are repaired only in analysis memory; repair counts are retained separately.',
        ],
        'files': files, 'commands': commands, 'parseErrors': errors, 'parseRecoveries': recoveries,
    }
    (output / 'resource-inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: report[key] for key in ('summary', 'limitations')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wps-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    options = parser.parse_args()
    analyze(options.wps_dir.resolve(), options.output.resolve())
