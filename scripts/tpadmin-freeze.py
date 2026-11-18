"""冻结已通过浏览器验收的实际后台源码与构建，不重建或访问服务器。"""
import hashlib
import json
from pathlib import Path

def digest(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()

def _inventory(files, base):
    return {str(file.relative_to(base)).replace('\\', '/'): digest(file) for file in sorted(files)}

def _source_files(web):
    files = []
    for sub in ('src', 'public'):
        directory = web / sub
        if directory.exists():
            files.extend(file for file in directory.rglob('*') if file.is_file() and '.test.' not in file.name and '.spec.' not in file.name)
    for name in ('package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'):
        file = web / name
        if file.exists(): files.append(file)
    return files

def freeze_frontend(web, main_report, extra_report, required_reports=None):
    web, main_report, extra_report = Path(web), Path(main_report), Path(extra_report)
    dist = web / 'dist'
    index = dist / 'index.html'
    if not index.is_file(): raise ValueError('缺少后台构建入口')
    source = _source_files(web)
    if not source: raise ValueError('缺少后台源码')
    if any(file.stat().st_mtime_ns > index.stat().st_mtime_ns for file in source): raise ValueError('后台源码晚于本次构建，请重新构建并验收')
    index_hash = digest(index)
    checks = {'main': (main_report, 17), 'extra': (extra_report, 9), **(required_reports or {})}
    for file, minimum in checks.values():
        file = Path(file)
        data = json.loads(file.read_text(encoding='utf-8'))
        if not data.get('passed') or data.get('errors') or len(data.get('checks', [])) < minimum or data.get('distIndexSha256') != index_hash:
            raise ValueError('浏览器报告与当前构建不一致')
    outputs = [file for file in dist.rglob('*') if file.is_file()]
    if not outputs or any(file.is_symlink() for file in source + outputs): raise ValueError('构建包含无效文件或符号链接')
    return {'source': _inventory(source, web), 'dist': _inventory(outputs, dist), 'reports': {name: digest(file) for name, (file, _) in checks.items()}}

def verify_frontend(frozen, web, main_report, extra_report):
    if frozen != freeze_frontend(web, main_report, extra_report): raise ValueError('后台源码、构建或浏览器验收报告已发生变化')
    return True
