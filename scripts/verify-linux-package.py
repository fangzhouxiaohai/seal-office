"""Read a freshly built DEB without extracting or installing it."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile
import xml.etree.ElementTree as ET


def digest(stream):
    return hashlib.file_digest(stream, "sha256").hexdigest()


def ar_members(package):
    with package.open("rb") as stream:
        if stream.read(8) != b"!<arch>\n":
            raise ValueError("DEB is not an ar archive")
        while header := stream.read(60):
            if len(header) != 60 or header[58:] != b"`\n":
                raise ValueError("Invalid DEB ar member header")
            name, size = header[:16].decode("ascii").strip().rstrip("/"), int(header[48:58])
            value = stream.read(size)
            if len(value) != size:
                raise ValueError("Truncated DEB ar member")
            yield name, value
            if size % 2:
                stream.read(1)


def verify(package, source, version):
    entries = dict(ar_members(package))
    if entries.get("debian-binary") != b"2.0\n":
        raise ValueError("DEB format marker mismatch")
    control_name = next(name for name in entries if name.startswith("control.tar"))
    data_name = next(name for name in entries if name.startswith("data.tar"))
    with tarfile.open(fileobj=io.BytesIO(entries[control_name]), mode="r:*") as archive:
        control = next(member for member in archive if member.name.lstrip("./") == "control")
        fields = dict(line.split(": ", 1) for line in archive.extractfile(control).read().decode("utf-8").splitlines() if ": " in line and not line.startswith(" "))
    if any(fields.get(key) != value for key, value in {"Package": "seal-office", "Version": version, "Architecture": "amd64"}.items()):
        raise ValueError("DEB package identity, version or architecture mismatch")
    resources = ["fonts/" + name for name in ["NotoSansSC.ttf", "NotoSerifCJKsc-Regular.otf", "OFL.txt", "NotoSerif-LICENSE.txt"]]
    resources.append("app.asar")
    expected_mime = {"sldoc": "application/vnd.seal-office.word", "slxls": "application/vnd.seal-office.sheet",
                     "slppt": "application/vnd.seal-office.presentation", "spdf": "application/vnd.seal-office.pdf"}
    with tarfile.open(fileobj=io.BytesIO(entries[data_name]), mode="r:*") as archive:
        members = {member.name.lstrip("./"): member for member in archive}
        def read(name):
            member = members.get(name)
            if member is None or not member.isfile() or member.size <= 0:
                raise ValueError(f"DEB missing or empty file: {name}")
            return archive.extractfile(member)
        desktop = read("usr/share/applications/sealoffice.desktop").read().decode("utf-8")
        if not any(line.startswith("Exec=") and "%U" in line and "sealoffice" in line for line in desktop.splitlines()):
            raise ValueError("Linux desktop launcher or URI argument missing")
        mime_xml = ET.fromstring(read("usr/share/mime/packages/sealoffice.xml").read())
        globs = {node.get("pattern"): item.get("type") for item in mime_xml.findall("{*}mime-type") for node in item.findall("{*}glob")}
        for extension, mime in expected_mime.items():
            if globs.get("*." + extension) != mime or mime not in desktop:
                raise ValueError(f"DEB native format MIME/desktop declaration mismatch: {extension}")
        hashes = {}
        for relative in resources:
            name = "opt/海豹办公/resources/" + relative
            with read(name) as stream:
                actual = digest(stream)
            with (source / "resources" / relative).open("rb") as stream:
                if actual != digest(stream):
                    raise ValueError(f"DEB payload differs from fresh Linux build: {relative}")
            hashes[relative] = actual
    with package.open("rb") as stream:
        checksum = digest(stream)
    return {"passed": True, "package": str(package.resolve()), "version": version, "bytes": package.stat().st_size,
            "sha256": checksum, "architecture": "amd64", "nativeMimeTypes": expected_mime,
            "freshPayloadSha256": hashes, "installationTest": "Not installed; archive and declaration verification only",
            "modifiesUserDefaults": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = verify(args.package, args.source, args.version)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
