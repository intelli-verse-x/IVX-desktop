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

When only the packaged renderer/main process changed, Electron itself is
unchanged. CI then also publishes a small app bundle; the installer keeps
the live exe and swaps ``resources`` instead of re-fetching the full unpack.
"""
from __future__ import annotations

import hashlib
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
APP_ASSET = "desktop-win-app.zip"
META_ASSET = "desktop-win-meta.json"
RECEIPT_NAME = "hermes-prebuilt.json"
_UNPACKED_DIR = "win-unpacked"
_MAX_BYTES = 800 * 1024 * 1024
_MAX_APP_BYTES = 150 * 1024 * 1024
_EXE_NAMES = ("Hermes.exe", "IVX-Agency.exe")
_APP_RESOURCE_FILES = ("resources/install-stamp.json", "resources/icon.ico")


def release_tag(sha: str) -> str:
    return f"desktop-{sha.strip().lower()}"


def prebuilt_state(repository: str, sha: str) -> bool | None:
    """True when the CI zip is published, False on 404, None when the check failed."""
    payload = _release_payload(repository, sha)
    if payload is None:
        return None
    if payload is False:
        return False
    return _named_asset(payload, ASSET_NAME) is not None


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


def unpacked_runtime_hash(unpacked: Path) -> str:
    """Hash of the installed Electron/native tree, excluding the app bundle."""
    if not unpacked.is_dir():
        return ""
    digest = hashlib.sha256()
    root = unpacked.resolve()
    files = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        if _is_app_payload(rel):
            continue
        files.append(path)
    for path in sorted(files, key=lambda item: item.relative_to(root).as_posix()):
        rel = path.relative_to(root).as_posix()
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(_file_sha256(path))
    return digest.hexdigest()


def receipt_matches(unpacked: Path, project_root: Path) -> bool:
    """True when this unpacked app was installed from CI for the current desktop inputs."""
    if not unpacked.is_dir() or not any((unpacked / name).is_file() for name in _EXE_NAMES):
        return False
    payload = _read_receipt(unpacked)
    if payload is None:
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
        "runtimeHash": unpacked_runtime_hash(unpacked),
        "repository": OFFICIAL_REPOSITORY,
    }) + "\n", encoding="utf-8")


def stamp_ci_unpacked(unpacked: Path, sha: str, source_hash: str, repository: str) -> None:
    """Write the CI receipt using the already-computed desktop source hash."""
    digest = source_hash.strip().lower()
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise OSError("desktop source hash missing")
    (unpacked / RECEIPT_NAME).write_text(json.dumps({
        "schema": 1,
        "product": "desktop",
        "sha": sha.strip().lower(),
        "sourceHash": digest,
        "runtimeHash": unpacked_runtime_hash(unpacked),
        "repository": repository,
    }) + "\n", encoding="utf-8")


def write_prebuilt_meta(unpacked: Path, dest: Path, sha: str, source_hash: str, repository: str) -> None:
    dest.write_text(json.dumps({
        "schema": 1,
        "product": "desktop",
        "sha": sha.strip().lower(),
        "sourceHash": source_hash.strip().lower(),
        "runtimeHash": unpacked_runtime_hash(unpacked),
        "repository": repository,
    }) + "\n", encoding="utf-8")


def pack_app_bundle(unpacked: Path, dest: Path) -> None:
    """Zip only the renderer/main payload so an update can keep Electron on disk."""
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for path in unpacked.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(unpacked).as_posix()
            if _is_app_payload(rel):
                bundle.write(path, rel)


def publish_ci_artifacts(
    unpacked: Path, sha: str, source_hash: str, repository: str, dest_dir: Path,
) -> None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp_ci_unpacked(unpacked, sha, source_hash, repository)
    write_prebuilt_meta(unpacked, dest_dir / META_ASSET, sha, source_hash, repository)
    pack_app_bundle(unpacked, dest_dir / APP_ASSET)


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
    if not isinstance(payload, dict):
        return False
    full = _named_asset(payload, ASSET_NAME)
    if not full:
        return False
    try:
        if _install_app_bundle(project_root, sha, payload):
            print("  ✓ Updating the desktop UI (Electron kept)")
            return True
        url = str(full.get("browser_download_url") or "")
        if not url.startswith("https://"):
            return False
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


def _install_app_bundle(project_root: Path, sha: str, payload: dict) -> bool:
    live = live_unpacked_dir(project_root)
    if not any((live / name).is_file() for name in _EXE_NAMES):
        return False
    app = _named_asset(payload, APP_ASSET)
    url = str(app.get("browser_download_url") or "") if app else ""
    if not url.startswith("https://"):
        return False
    meta = _release_meta(payload)
    remote_runtime = str((meta or {}).get("runtimeHash") or "").strip().lower()
    local_runtime = _local_runtime_hash(live)
    if not remote_runtime or remote_runtime != local_runtime:
        return False
    with tempfile.TemporaryDirectory(prefix="hermes-prebuilt-app-") as tmp:
        archive = Path(tmp) / APP_ASSET
        _download(url, archive, max_bytes=_MAX_APP_BYTES)
        overlay = _extract_overlay(archive, Path(tmp) / "overlay")
        if overlay is None:
            return False
        _apply_app_overlay(live, overlay)
        write_prebuilt_receipt(live, project_root, sha)
    return True


def _local_runtime_hash(unpacked: Path) -> str:
    receipt = _read_receipt(unpacked)
    recorded = str((receipt or {}).get("runtimeHash") or "").strip().lower()
    if len(recorded) == 64 and all(c in "0123456789abcdef" for c in recorded):
        return recorded
    return unpacked_runtime_hash(unpacked)


def _read_receipt(unpacked: Path) -> dict | None:
    try:
        payload = json.loads((unpacked / RECEIPT_NAME).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None
    if not isinstance(payload, dict) or payload.get("schema") != 1 or payload.get("product") != "desktop":
        return None
    return payload


def _is_app_payload(rel: str) -> bool:
    name = rel.replace("\\", "/").lstrip("./")
    if name == RECEIPT_NAME:
        return True
    if name == "resources/app.asar":
        return True
    if name == "resources/app.asar.unpacked" or name.startswith("resources/app.asar.unpacked/"):
        return True
    return name in _APP_RESOURCE_FILES


def _file_sha256(path: Path) -> bytes:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.digest()


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


def _named_asset(payload: dict, name: str) -> dict | None:
    assets = payload.get("assets")
    if not isinstance(assets, list):
        return None
    for item in assets:
        if isinstance(item, dict) and item.get("name") == name:
            return item
    return None


def _asset(payload: dict) -> dict | None:
    return _named_asset(payload, ASSET_NAME)


def _release_meta(payload: dict) -> dict | None:
    asset = _named_asset(payload, META_ASSET)
    url = str(asset.get("browser_download_url") or "") if asset else ""
    if not url.startswith("https://"):
        return None
    try:
        parsed = json.loads(_http_text(url))
    except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError):
        return None
    if not isinstance(parsed, dict) or parsed.get("schema") != 1 or parsed.get("product") != "desktop":
        return None
    runtime = str(parsed.get("runtimeHash") or "").strip().lower()
    source = str(parsed.get("sourceHash") or "").strip().lower()
    if len(runtime) != 64 or len(source) != 64:
        return None
    return parsed


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


def _download(url: str, dest: Path, max_bytes: int = _MAX_BYTES) -> None:
    request = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(request, timeout=120) as response, dest.open("wb") as handle:
        remaining = max_bytes
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
    _extract_zip(archive, dest)
    unpacked = dest / _UNPACKED_DIR
    if not unpacked.is_dir():
        return None
    if not any((unpacked / name).is_file() for name in _EXE_NAMES):
        return None
    return unpacked


def _extract_overlay(archive: Path, dest: Path) -> Path | None:
    dest.mkdir(parents=True, exist_ok=True)
    _extract_zip(archive, dest)
    if not (dest / "resources" / "app.asar").is_file():
        return None
    return dest


def _extract_zip(archive: Path, dest: Path) -> None:
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            target = (dest / member.filename).resolve()
            if not _within(dest, target) or member.filename.startswith(("/", "\\")):
                raise OSError("prebuilt desktop archive has an unsafe path")
        bundle.extractall(dest)


def _apply_app_overlay(live: Path, overlay: Path) -> None:
    dest_resources = live / "resources"
    dest_resources.mkdir(parents=True, exist_ok=True)
    src_asar = overlay / "resources" / "app.asar"
    if src_asar.is_file():
        shutil.copy2(src_asar, dest_resources / "app.asar")
    src_unpacked = overlay / "resources" / "app.asar.unpacked"
    if src_unpacked.is_dir():
        dest_unpacked = dest_resources / "app.asar.unpacked"
        if dest_unpacked.exists():
            shutil.rmtree(dest_unpacked)
        shutil.copytree(src_unpacked, dest_unpacked)
    for name in ("install-stamp.json", "icon.ico"):
        src = overlay / "resources" / name
        if src.is_file():
            shutil.copy2(src, dest_resources / name)
    src_receipt = overlay / RECEIPT_NAME
    if src_receipt.is_file():
        shutil.copy2(src_receipt, live / RECEIPT_NAME)


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
