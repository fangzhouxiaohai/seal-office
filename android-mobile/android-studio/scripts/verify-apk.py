"""核对本机安卓包中完整工作台资源与当前构建是否逐字节一致。"""

import hashlib
import sys
import zipfile
from pathlib import Path


def main() -> None:
    project = Path(__file__).resolve().parents[1]
    source = project.parents[1] / "mobile" / "static" / "office"
    apk = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else project / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
    files = [item for item in source.rglob("*") if item.is_file() and not any(part.startswith(".") for part in item.relative_to(source).parts)]
    if not files or not apk.is_file():
        raise SystemExit("安卓包或构建资源不存在，请先完成本机编译")

    with zipfile.ZipFile(apk) as package:
        names = set(package.namelist())
        for item in files:
            archive_name = "assets/apps/__UNI__B52B65B/www/static/office/" + item.relative_to(source).as_posix()
            if archive_name not in names:
                raise SystemExit(f"安卓包缺少工作台资源：{archive_name}")
            if package.read(archive_name) != item.read_bytes():
                raise SystemExit(f"安卓包资源与最新构建不同：{archive_name}")

    total = sum(item.stat().st_size for item in files)
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    print(f"工作台资源逐文件一致：{len(files)} 个文件，{total} 字节")
    print(f"安装包：{apk.name}，{apk.stat().st_size} 字节，SHA-256 {digest}")


if __name__ == "__main__":
    main()
