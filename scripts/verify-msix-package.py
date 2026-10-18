"""Verify a Store-upload MSIX against its freshly built Windows directory."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile
from urllib.parse import unquote


def digest(stream):
    return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(package, source, version):
    with zipfile.ZipFile(package) as archive:
        # MakeAppx stores non-ASCII payload names as percent-encoded OPC part URIs.
        # The manifest and block map refer to the decoded Windows file names.
        parts = {unquote(name, encoding="utf-8", errors="strict"): name for name in archive.namelist()}
        if len(parts) != len(archive.namelist()):
            raise ValueError("Duplicate decoded MSIX part names")
        names = set(parts)
        required = {"AppxManifest.xml", "AppxBlockMap.xml", "海豹办公.exe", "resources/app.asar"}
        if not required <= names:
            raise ValueError(f"MSIX missing files: {required - names}")
        if archive.testzip() is not None:
            raise ValueError("MSIX CRC verification failed")
        manifest = ET.fromstring(archive.read("AppxManifest.xml"))
        identity = manifest.find("{*}Identity")
        expected = {"Name": "45C56666.seal-office",
                    "Publisher": "CN=F6431C2A-EA55-468A-89D8-890511FCADF7",
                    "Version": version, "ProcessorArchitecture": "x64"}
        if identity is None or any(identity.get(k) != v for k, v in expected.items()):
            raise ValueError("MSIX identity, publisher, version or architecture mismatch")
        display = manifest.find("{*}Properties/{*}DisplayName")
        visual = manifest.find("{*}Applications/{*}Application/{*}VisualElements")
        if display is None or display.text != "seal-office" or visual is None or visual.get("DisplayName") != "seal-office":
            raise ValueError("MSIX must use reserved Store display name seal-office")
        application = manifest.find("{*}Applications/{*}Application")
        if application is None or application.get("Executable") != "海豹办公.exe":
            raise ValueError("MSIX executable should retain the Chinese application name")
        blockmap = ET.fromstring(archive.read("AppxBlockMap.xml"))
        if blockmap.get("HashMethod") != "http://www.w3.org/2001/04/xmlenc#sha256":
            raise ValueError("Unexpected MSIX block-map hash algorithm")
        verified = 0
        for record in blockmap.findall("{*}File"):
            name = record.attrib["Name"].replace("\\", "/")
            if name not in names or archive.getinfo(parts[name]).file_size != int(record.attrib["Size"]):
                raise ValueError(f"MSIX block-map file or size mismatch: {name}")
            with archive.open(parts[name]) as stream:
                for block in record.findall("{*}Block"):
                    actual = base64.b64encode(hashlib.sha256(stream.read(65536)).digest()).decode("ascii")
                    if actual != block.attrib["Hash"]:
                        raise ValueError(f"MSIX block hash mismatch: {name}")
                if stream.read(1):
                    raise ValueError(f"MSIX block-map does not cover whole file: {name}")
            verified += 1
        with archive.open("resources/app.asar") as stream:
            asar_hash = digest(stream)
        with (source / "resources/app.asar").open("rb") as stream:
            if digest(stream) != asar_hash:
                raise ValueError("MSIX app.asar differs from the tested Windows build")
        signed = "AppxSignature.p7x" in names
    with package.open("rb") as stream:
        package_hash = digest(stream)
    return {"passed": True, "package": str(package.resolve()), "bytes": package.stat().st_size,
            "sha256": package_hash, "identity": expected, "displayNames": "seal-office",
            "crcPassed": True, "blockMapFilesVerified": verified, "blockMapSha256Passed": True,
            "appAsarSha256": asar_hash, "asarMatchesFreshWindowsBuild": True,
            "signed": signed, "installationTest": "Not installed; this is an unsigned Store-upload package"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("source", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = verify(args.package, args.source, args.version)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
