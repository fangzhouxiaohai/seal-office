"""Refresh the Android and HarmonyOS assets on the existing 1.9.15 releases.

Keep the seven established asset names stable. Stage and verify new bytes before
replacing a public attachment. GitCode's old bytes are backed up locally before
its delete-and-upload step; GitHub's old assets are renamed before replacement.
Credentials come from Git Credential Manager and are never printed or saved.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import quote, urlsplit

import requests


ROOT = Path(__file__).resolve().parent.parent
TAG = "v1.9.15"
RELEASE = ROOT / "release" / "v1.9.15-review-fix-20261016"
BACKUP = ROOT / ".upgrade-private" / "release-backups-20261016"
OLD_SUMS = ROOT / "release" / "v1.9.15-mobile-fix-20261015" / "SHA256SUMS.txt"
NEW_SUMS = RELEASE / "SHA256SUMS-release.txt"
GITHUB = "https://api.github.com/repos/fangzhouxiaohai/seal-office"
GITCODE = "https://api.gitcode.com/api/v5/repos/gcw_pGfMiWVg/seal-office"
FILES = {
    "SealOffice-1.9.15-Android.apk": RELEASE / "海豹办公Android1.9.15.apk",
    "SealOffice-1.9.15-HarmonyOS.app.zip": RELEASE / "SealOffice-1.9.15-HarmonyOS.app.zip",
    "SHA256SUMS.txt": NEW_SUMS,
}
SUFFIX = ".new-20261016"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def parse_sums(path):
    rows = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        checksum, name = line.split("  ", 1)
        if name in rows or not re.fullmatch(r"[a-f0-9]{64}", checksum):
            raise RuntimeError("Invalid checksum file")
        rows[name] = checksum
    return rows


def credential(host):
    result = subprocess.run(
        ["git", "credential", "fill"],
        input=f"protocol=https\nhost={host}\n\n",
        capture_output=True,
        text=True,
        cwd=ROOT,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"},
        check=True,
    )
    fields = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    if not fields.get("password"):
        raise RuntimeError(f"Credential unavailable for {host}")
    return fields["password"]


def check_local():
    old, new = parse_sums(OLD_SUMS), parse_sums(NEW_SUMS)
    if set(old) != set(new) or len(new) != 7 or not set(FILES).issubset(set(new) | {"SHA256SUMS.txt"}):
        raise RuntimeError("Release checksum inventory changed unexpectedly")
    if any(new[name] != old[name] for name in new if name not in FILES):
        raise RuntimeError("Desktop asset checksum changed during mobile refresh")
    old["SHA256SUMS.txt"] = digest(OLD_SUMS)
    new["SHA256SUMS.txt"] = digest(NEW_SUMS)
    for name, path in FILES.items():
        if not path.is_file() or digest(path) != new[name]:
            raise RuntimeError(f"Local package checksum mismatch: {name}")
    # The checksum file covers every binary, but never itself.
    if set(new) != set(old) or len(new) != 8:
        raise RuntimeError("Expected seven installer checksums and one checksum file")
    return old, new


def checked(response, operation):
    if not response.ok:
        raise RuntimeError(f"{operation}: HTTP {response.status_code}")
    return response


class GitCode:
    def __init__(self):
        self.token = credential("gitcode.com")
        self.session = requests.Session()

    def api(self, method, endpoint, **kwargs):
        params = {"access_token": self.token, **kwargs.pop("params", {})}
        try:
            response = self.session.request(
                method, GITCODE + endpoint, params=params,
                timeout=kwargs.pop("timeout", 90), **kwargs,
            )
        except requests.RequestException:
            raise RuntimeError(f"GitCode {method} {endpoint}: network failure") from None
        checked(response, f"GitCode {method} {endpoint}")
        return response.json() if response.content else None

    def release(self):
        release = self.api("GET", "/releases/" + TAG)
        if release.get("tag_name") != TAG:
            raise RuntimeError("Unexpected GitCode release")
        return release

    def asset(self, name):
        return next((a for a in self.release()["assets"] if a["name"] == name), None)

    def wait_asset(self, name):
        for _ in range(15):
            item = self.asset(name)
            if item:
                return item
            time.sleep(2)
        raise RuntimeError(f"GitCode asset not registered: {name}")

    def download_digest(self, name, destination=None):
        url = GITCODE + f"/releases/{TAG}/attach_files/{quote(name, safe='')}/download"
        try:
            response = requests.get(url, stream=True, timeout=(30, 120))
            checked(response, f"GitCode public download {name}")
            sha, size = hashlib.sha256(), 0
            output = destination.open("wb") if destination else None
            try:
                for chunk in response.iter_content(4 * 1024 * 1024):
                    if chunk:
                        sha.update(chunk)
                        size += len(chunk)
                        if output:
                            output.write(chunk)
            finally:
                if output:
                    output.close()
                response.close()
        except requests.RequestException:
            raise RuntimeError(f"GitCode public download failed: {name}") from None
        return sha.hexdigest(), size

    def upload(self, name, path):
        info = self.api("GET", f"/releases/{TAG}/upload_url", params={"file_name": name})
        target = urlsplit(info["url"])
        if target.scheme != "https" or not (
            target.hostname == "file.gitcode.com"
            or target.hostname.endswith(".myhuaweicloud.com")
        ):
            raise RuntimeError("Unexpected GitCode upload host")
        print(json.dumps({"site": "gitcode", "phase": "upload", "name": name,
                          "bytes": path.stat().st_size}), flush=True)
        try:
            with path.open("rb") as stream:
                response = requests.put(
                    info["url"], data=stream,
                    headers={**info["headers"], "Content-Length": str(path.stat().st_size)},
                    timeout=(30, 900),
                )
        except requests.RequestException:
            raise RuntimeError(f"GitCode storage upload failed: {name}") from None
        checked(response, f"GitCode storage upload {name}")
        self.wait_asset(name)

    def delete(self, name, expected_id):
        item = self.asset(name)
        if not item or item.get("id") != expected_id:
            raise RuntimeError(f"GitCode asset changed concurrently: {name}")
        self.api("DELETE", f"/releases/{TAG}/attach_files/{expected_id}")


class GitHub:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": "Bearer " + credential("github.com"),
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "SealOffice-release-refresh",
        })

    def api(self, method, endpoint, **kwargs):
        try:
            response = self.session.request(
                method, GITHUB + endpoint, timeout=kwargs.pop("timeout", 90), **kwargs,
            )
        except requests.RequestException:
            raise RuntimeError(f"GitHub {method} {endpoint}: network failure") from None
        checked(response, f"GitHub {method} {endpoint}")
        return response.json() if response.content else None

    def release(self):
        release = self.api("GET", "/releases/tags/" + TAG)
        if release["tag_name"] != TAG or release["draft"] or release["prerelease"]:
            raise RuntimeError("Unexpected GitHub release")
        return release

    def asset(self, name):
        return next((a for a in self.release()["assets"] if a["name"] == name), None)

    def upload(self, name, path):
        upload_url = self.release()["upload_url"].split("{", 1)[0]
        print(json.dumps({"site": "github", "phase": "upload", "name": name,
                          "bytes": path.stat().st_size}), flush=True)
        try:
            with path.open("rb") as stream:
                response = self.session.post(
                    upload_url, params={"name": name}, data=stream,
                    headers={"Content-Type": "application/octet-stream",
                             "Content-Length": str(path.stat().st_size)},
                    timeout=(30, 900),
                )
        except requests.RequestException:
            raise RuntimeError(f"GitHub upload failed: {name}") from None
        checked(response, f"GitHub upload {name}")
        return response.json()


def github_matches(asset, name, new):
    return bool(asset and asset.get("name") == name
                and asset.get("state") == "uploaded"
                and asset.get("size") == FILES[name].stat().st_size
                and asset.get("digest") == "sha256:" + new[name])


def preflight(old, new):
    github, gitcode = GitHub(), GitCode()
    gh = github.release()
    gc = gitcode.release()
    gh_names = {a["name"] for a in gh["assets"]}
    gc_names = {a["name"] for a in gc["assets"] if a["type"] != "source"}
    expected_names = set(old)
    allowed_names = expected_names | {name + SUFFIX for name in FILES}
    allowed_names |= {name + ".previous-" + str(a["id"])
                      for a in gh["assets"] for name in FILES if a["name"] == name}
    if not gh_names <= allowed_names or not gc_names <= allowed_names:
        raise RuntimeError("Release contains unexpected attachments")
    for asset in gh["assets"]:
        name = asset["name"]
        if name in old and name not in FILES and asset.get("digest") != "sha256:" + old[name]:
            raise RuntimeError("Desktop asset changed: " + name)
        if name in FILES and asset.get("digest") not in (
            "sha256:" + old[name], "sha256:" + new[name]
        ):
            raise RuntimeError("Mobile asset has an unexpected checksum: " + name)
    print(json.dumps({"phase": "preflight", "tag": TAG, "githubRelease": gh["html_url"],
                      "gitcodeAssets": len(gc_names), "newAssets": {
                          name: {"sha256": new.get(name, digest(path)),
                                 "bytes": path.stat().st_size}
                          for name, path in FILES.items()}}, ensure_ascii=False), flush=True)
    return github, gitcode


def publish_gitcode(gitcode, old, new):
    BACKUP.mkdir(parents=True, exist_ok=True)
    baseline = {name: gitcode.asset(name) for name in FILES}
    for name in FILES:
        item = baseline[name]
        if item is None:
            if not (BACKUP / name).is_file():
                raise RuntimeError("Missing old asset without a local backup: " + name)
            continue
        backup = BACKUP / name
        if backup.is_file() and digest(backup) == old[name]:
            continue
        if backup.is_file() and digest(backup) == new[name]:
            if digest(backup) == old[name]:
                continue
            backup.unlink()
        observed, _ = gitcode.download_digest(name, backup)
        if observed not in (old[name], new[name]):
            raise RuntimeError("Unexpected GitCode bytes: " + name)
        if observed == new[name]:
            # Already refreshed. The backup is not needed for this asset.
            backup.unlink()
        elif digest(backup) != old[name]:
            raise RuntimeError("Backup failed verification: " + name)

    # Stage all three new files and verify their public download before deleting
    # even one old attachment.
    for name, path in FILES.items():
        temporary = name + SUFFIX
        if gitcode.asset(temporary) is None:
            gitcode.upload(temporary, path)
        observed, size = gitcode.download_digest(temporary)
        if observed != new[name] or size != path.stat().st_size:
            raise RuntimeError("GitCode staged bytes differ: " + name)
        print(json.dumps({"site": "gitcode", "phase": "staged-verified", "name": name}), flush=True)

    for name, path in FILES.items():
        existing = gitcode.asset(name)
        if existing:
            observed, size = gitcode.download_digest(name)
            if observed == new[name] and size == path.stat().st_size:
                continue
            if observed != old[name]:
                raise RuntimeError("GitCode old asset changed: " + name)
            if not (BACKUP / name).is_file() or digest(BACKUP / name) != old[name]:
                raise RuntimeError("Old GitCode bytes are not backed up: " + name)
            gitcode.delete(name, existing["id"])
        gitcode.upload(name, path)
        observed, size = gitcode.download_digest(name)
        if observed != new[name] or size != path.stat().st_size:
            raise RuntimeError("GitCode replacement failed verification: " + name)
        print(json.dumps({"site": "gitcode", "phase": "published-verified", "name": name}), flush=True)
    for name in FILES:
        temporary = name + SUFFIX
        staged = gitcode.asset(temporary)
        if staged:
            gitcode.delete(temporary, staged["id"])


def publish_github(github, old, new):
    for name, path in FILES.items():
        if github_matches(github.asset(name), name, new):
            continue
        temporary = name + SUFFIX
        staged = github.asset(temporary)
        if staged is None:
            staged = github.upload(temporary, path)
        if not (staged.get("size") == path.stat().st_size
                and staged.get("digest") == "sha256:" + new[name]
                and staged.get("state") == "uploaded"):
            raise RuntimeError("GitHub staged bytes differ: " + name)
        print(json.dumps({"site": "github", "phase": "staged-verified", "name": name}), flush=True)

    for name in FILES:
        if github_matches(github.asset(name), name, new):
            continue
        old_asset = github.asset(name)
        staged = github.asset(name + SUFFIX)
        if not staged:
            raise RuntimeError("GitHub staged asset vanished: " + name)
        if old_asset:
            allowed = "sha256:" + old[name]
            if old_asset.get("digest") != allowed:
                raise RuntimeError("GitHub old asset changed: " + name)
            previous = name + ".previous-" + str(old_asset["id"])
            github.api("PATCH", f"/releases/assets/{old_asset['id']}", json={"name": previous})
        renamed = github.api("PATCH", f"/releases/assets/{staged['id']}", json={"name": name})
        if not github_matches(renamed, name, new):
            raise RuntimeError("GitHub replacement failed verification: " + name)
        if old_asset:
            github.api("DELETE", f"/releases/assets/{old_asset['id']}")
        print(json.dumps({"site": "github", "phase": "published-verified", "name": name}), flush=True)


def verify(github, gitcode, old, new):
    gh_assets = {a["name"]: a for a in github.release()["assets"]}
    gc_assets = {a["name"]: a for a in gitcode.release()["assets"] if a["type"] != "source"}
    expected = set(old)
    if set(gh_assets) != expected or set(gc_assets) != expected:
        raise RuntimeError("Remote release inventory is incomplete or has stale staging files")
    for name in expected:
        if name in FILES:
            if not github_matches(gh_assets[name], name, new):
                raise RuntimeError("GitHub digest mismatch: " + name)
            observed, size = gitcode.download_digest(name)
            if observed != new[name] or size != FILES[name].stat().st_size:
                raise RuntimeError("GitCode download differs: " + name)
        elif gh_assets[name].get("digest") != "sha256:" + old[name]:
            raise RuntimeError("Desktop attachment changed: " + name)
    print(json.dumps({"complete": True, "tag": TAG,
                      "github": "https://github.com/fangzhouxiaohai/seal-office/releases/tag/" + TAG,
                      "gitcode": "https://gitcode.com/gcw_pGfMiWVg/seal-office/releases/" + TAG,
                      "mobileSha256": {name: new[name] for name in FILES}}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["preflight", "gitcode", "github", "verify"])
    args = parser.parse_args()
    old, new = check_local()
    github, gitcode = preflight(old, new)
    if args.mode == "gitcode":
        publish_gitcode(gitcode, old, new)
    elif args.mode == "github":
        publish_github(github, old, new)
    elif args.mode == "verify":
        verify(github, gitcode, old, new)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=__import__("sys").stderr)
        raise SystemExit(1) from None
