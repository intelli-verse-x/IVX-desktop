"""Install the Windows desktop app CI already built for this commit.

A source update otherwise compiles the desktop app on the user's machine.
When main's GitHub Action published ``desktop-<sha>``, the update downloads
that zip and skips the local desktop build. A missing release means CI has
not passed yet, so the update check stays quiet. Any other lookup failure
leaves the existing local build in place.

The zip is identified by desktop *source inputs* (``hermes-prebuilt.json``),
not by git SHA and not by the local compiler receipt. A Python-only commit
must not re-download hundreds of megabytes, and a CI zip must verify without
a machine-local ``hermes-build.json``.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from hermes_cli.source_releases import OFFICIAL_REPOSITORY

ASSET_NAME = "desktop-win-unpacked.zip"
RECEIPT_NAME = "hermes-prebuilt.json"
_UNPACKED_DIR = "win-unpacked"
_MAX_BYTES = 800 * 1024 * 1024
_EXE_NAMES = ("Hermes.exe", "IVX-Agency.exe")


def release_tag(sha: str) -> str:
    return f"desktop-{sha.strip().lower()}"


def prebuilt_state(repository: str, sha: str) -> bool | None:
    """True when the CI zip is published, False on 404, None when the check failed."""
    payload = _release_payload(repository, sha)
    if payload is None:
        return None
    if payload is False:
        return False
    return _asset(payload) is not None


def live_unpacked_dir(project_root: Path) -> Path:
    return project_root / "apps" / "desktop" / "release" / _UNPACKED_DIR


def desktop_source_hash(project_root: Path) -> str:
    """Hash of desktop compiler inputs. Empty when PM Node cannot read them."""
    from pm import env_for, installed_package

    installed = installed_package("node")
    if installed is None or installed.binary is None:
        return ""
    script = project_root / "scripts" / "build" / "freshness.mjs"
    try:
        result = subprocess.run(
            [str(installed.binary), str(script),
             "--source", str(project_root), "--product", "desktop", "--source-hash"],
            cwd=project_root, env=env_for("node"), capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=120, stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    digest = result.stdout.strip().lower()
    return digest if result.returncode == 0 and len(digest) == 64 and all(
        c in "0123456789abcdef" for c in digest
    ) else ""


def receipt_matches(unpacked: Path, project_root: Path) -> bool:
    """True when this unpacked app was installed from CI for the current desktop inputs."""
    if not unpacked.is_dir() or not any((unpacked / name).is_file() for name in _EXE_NAMES):
        return False
    try:
        payload = json.loads((unpacked / RECEIPT_NAME).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return False
    if not isinstance(payload, dict) or payload.get("schema") != 1 or payload.get("product") != "desktop":
        return False
    recorded = str(payload.get("sourceHash") or "").strip().lower()
    current = desktop_source_hash(project_root)
    return bool(current) and recorded == current


def prebuilt_desktop_current(project_root: Path) -> bool:
    return receipt_matches(live_unpacked_dir(project_root), project_root)


def write_prebuilt_receipt(unpacked: Path, project_root: Path, sha: str) -> None:
    digest = desktop_source_hash(project_root)
    if not digest:
        raise OSError("desktop source hash unavailable")
    (unpacked / RECEIPT_NAME).write_text(json.dumps({
        "schema": 1,
        "product": "desktop",
        "sha": sha,
        "sourceHash": digest,
        "repository": OFFICIAL_REPOSITORY,
    }) + "\n", encoding="utf-8")


def install_prebuilt_desktop(project_root: Path) -> bool:
    """Replace ``apps/desktop/release/win-unpacked`` from CI. False keeps the local build."""
    if os.name != "nt":
        return False
    sha = _head_sha(project_root)
    if not sha:
        return False
    from hermes_cli.source_releases import source_repository

    repository = source_repository(["git"], project_root)
    if repository != OFFICIAL_REPOSITORY:
        return False
    if prebuilt_desktop_current(project_root):
        print("  ✓ Desktop app already matches this commit")
        return True
    payload = _release_payload(repository, sha)
    asset = _asset(payload) if isinstance(payload, dict) else None
    if not asset:
        return False
    url = str(asset.get("browser_download_url") or "")
    if not url.startswith("https://"):
        return False
    try:
        with tempfile.TemporaryDirectory(prefix="hermes-prebuilt-") as tmp:
            archive = Path(tmp) / ASSET_NAME
            _download(url, archive)
            unpacked = _extract_unpacked(archive, Path(tmp) / "out")
            if unpacked is None:
                return False
            write_prebuilt_receipt(unpacked, project_root, sha)
            _replace_unpacked(project_root / "apps" / "desktop" / "release", unpacked)
    except (OSError, urllib.error.URLError, zipfile.BadZipFile) as exc:
        print(f"  ⚠ Prebuilt desktop download failed ({exc}); building locally")
        return False
    print("  ✓ Using the desktop build that already passed CI")
    return True


def _release_payload(repository: str, sha: str):
    if repository != OFFICIAL_REPOSITORY or len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha.lower()):
        return None
    url = f"https://api.github.com/repos/{repository}/releases/tags/{release_tag(sha)}"
    try:
        return json.loads(_http_text(url))
    except urllib.error.HTTPError as exc:
        return False if exc.code == 404 else None
    except (OSError, ValueError, urllib.error.URLError):
        return None


def _asset(payload: dict) -> dict | None:
    assets = payload.get("assets")
    if not isinstance(assets, list):
        return None
    for item in assets:
        if isinstance(item, dict) and item.get("name") == ASSET_NAME:
            return item
    return None


def _head_sha(project_root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=project_root, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=10, stdin=subprocess.DEVNULL,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    sha = result.stdout.strip().lower()
    return sha if result.returncode == 0 and len(sha) == 40 else ""


def _download(url: str, dest: Path) -> None:
    request = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as handle:
        remaining = _MAX_BYTES
        while True:
            chunk = response.read(min(1024 * 1024, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            if remaining < 0:
                raise OSError("prebuilt desktop archive is too large")
            handle.write(chunk)


def _extract_unpacked(archive: Path, dest: Path) -> Path | None:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            target = (dest / member.filename).resolve()
            if not _within(dest, target) or member.filename.startswith(("/", "\\")):
                raise OSError("prebuilt desktop archive has an unsafe path")
        bundle.extractall(dest)
    unpacked = dest / _UNPACKED_DIR
    if not unpacked.is_dir():
        return None
    if not any((unpacked / name).is_file() for name in _EXE_NAMES):
        return None
    return unpacked


def _replace_unpacked(release_dir: Path, unpacked: Path) -> None:
    release_dir.mkdir(parents=True, exist_ok=True)
    live = release_dir / _UNPACKED_DIR
    previous = release_dir / f"{_UNPACKED_DIR}.previous"
    if previous.exists():
        shutil.rmtree(previous)
    if live.exists():
        _relocate(live, previous)
    _relocate(unpacked, live)


def _relocate(src: Path, dest: Path) -> None:
    """Rename when the volume allows it; copy when Windows reports a cross-drive move."""
    try:
        os.rename(src, dest)
        return
    except OSError:
        if dest.exists():
            shutil.rmtree(dest) if dest.is_dir() else dest.unlink()
        if src.is_dir():
            shutil.copytree(src, dest)
            shutil.rmtree(src)
        else:
            shutil.copy2(src, dest)
            src.unlink()


def _within(root: Path, path: Path) -> bool:
    try:
        path.relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _http_text(url: str) -> str:
    request = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read(1024 * 1024).decode("utf-8-sig")


def _headers() -> dict[str, str]:
    from hermes_cli.github_api import github_token

    headers = {"Accept": "application/vnd.github+json", "User-Agent": "hermes-update-check"}
    token = github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers
