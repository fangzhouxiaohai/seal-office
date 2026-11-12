"""核对本机安卓包中完整工作台资源与当前构建是否逐字节一致。"""

import argparse
import hashlib
import zipfile
from pathlib import Path


def main() -> None:
    project = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description='逐文件核验安卓安装包中的办公资源')
    parser.add_argument('apk', nargs='?', type=Path, default=project / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--office-root', type=Path, default=project.parent / "mobile" / "static" / "office")
    args = parser.parse_args()
    source, apk = args.office_root.resolve(), args.apk.resolve()
    files = [item for item in source.rglob("*") if item.is_file() and not any(part.startswith(".") for part in item.relative_to(source).parts)]
    if not files or not apk.is_file():
        raise SystemExit("安卓包或构建资源不存在，请先完成本机编译")

    with zipfile.ZipFile(apk) as package:
        prefix = 'assets/apps/__UNI__B52B65B/www/static/office/'
        archived = [name for name in package.namelist() if name.startswith(prefix) and not name.endswith('/')]
        if len(archived) != len(set(archived)):
            raise SystemExit('安卓包中存在重复的工作台资源')
        names = set(archived)
        expected = {prefix + item.relative_to(source).as_posix() for item in files}
        if names != expected:
            raise SystemExit('安卓包工作台资源清单不一致：缺少 ' + str(sorted(expected - names)) + '，多出 ' + str(sorted(names - expected)))
        for item in files:
            archive_name = prefix + item.relative_to(source).as_posix()
            if package.read(archive_name) != item.read_bytes():
                raise SystemExit(f"安卓包资源与最新构建不同：{archive_name}")

    total = sum(item.stat().st_size for item in files)
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    print(f"工作台资源逐文件一致：{len(files)} 个文件，{total} 字节")
    print(f"安装包：{apk.name}，{apk.stat().st_size} 字节，SHA-256 {digest}")


if __name__ == "__main__":
    main()
