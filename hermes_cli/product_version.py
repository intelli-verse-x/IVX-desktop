"""IVX-Agency product version for desktop About / prebuilt receipts.

Each published desktop update bumps patch until it would pass 5, then rolls
to the next minor (and the same rule for major)::

    1.0.0 → 1.0.1 → … → 1.0.5 → 1.1.0 → … → 1.1.5 → 1.2.0
    … → 1.5.5 → 2.0.0

The seed in ``apps/desktop/product-version.json`` is only the first release.
Later CI publishes read the previous release's ``productVersion`` and bump.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path

from hermes_cli.source_releases import OFFICIAL_REPOSITORY

PRODUCT_VERSION_FILE = Path("apps") / "desktop" / "product-version.json"
_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
_MAX_SEGMENT = 5


def parse_product_version(value: str) -> tuple[int, int, int] | None:
    match = _VERSION_RE.fullmatch((value or "").strip())
    if not match:
        return None
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def format_product_version(major: int, minor: int, patch: int) -> str:
    return f"{major}.{minor}.{patch}"


def bump_product_version(version: str) -> str:
    """Advance one published update under the 0–5 segment rule."""
    parsed = parse_product_version(version)
    if parsed is None:
        raise ValueError(f"invalid product version: {version!r}")
    major, minor, patch = parsed
    patch += 1
    if patch > _MAX_SEGMENT:
        patch = 0
        minor += 1
        if minor > _MAX_SEGMENT:
            minor = 0
            major += 1
    return format_product_version(major, minor, patch)


def read_seed_product_version(project_root: Path) -> str:
    path = project_root / PRODUCT_VERSION_FILE
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return "1.0.0"
    if not isinstance(payload, dict):
        return "1.0.0"
    version = str(payload.get("version") or "").strip()
    return version if parse_product_version(version) else "1.0.0"


def write_seed_product_version(project_root: Path, version: str) -> None:
    if parse_product_version(version) is None:
        raise ValueError(f"invalid product version: {version!r}")
    path = project_root / PRODUCT_VERSION_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"version": version}, indent=2) + "\n", encoding="utf-8")


def previous_release_product_version(repository: str = OFFICIAL_REPOSITORY) -> str | None:
    """Newest ``desktop-*`` release meta's productVersion, if published."""
    if repository != OFFICIAL_REPOSITORY:
        return None
    url = f"https://api.github.com/repos/{repository}/releases?per_page=30"
    try:
        releases = json.loads(_http_text(url))
    except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError):
        return None
    if not isinstance(releases, list):
        return None
    for release in releases:
        if not isinstance(release, dict):
            continue
        tag = str(release.get("tag_name") or "")
        if not tag.startswith("desktop-"):
            continue
        version = _meta_product_version(release)
        if version:
            return version
    return None


def resolve_ci_product_version(project_root: Path, repository: str = OFFICIAL_REPOSITORY) -> str:
    """Version embossed into this CI publish: seed for the first, else bump."""
    previous = previous_release_product_version(repository)
    if previous:
        return bump_product_version(previous)
    return read_seed_product_version(project_root)


def prepare_ci_product_version(project_root: Path, repository: str = OFFICIAL_REPOSITORY) -> str:
    """Bump (when needed), write the seed file for the pack, return the version."""
    version = resolve_ci_product_version(project_root, repository)
    write_seed_product_version(project_root, version)
    return version


def _meta_product_version(release: dict) -> str | None:
    assets = release.get("assets")
    if not isinstance(assets, list):
        return None
    for asset in assets:
        if not isinstance(asset, dict) or asset.get("name") != "desktop-win-meta.json":
            continue
        url = str(asset.get("browser_download_url") or "")
        if not url.startswith("https://"):
            return None
        try:
            payload = json.loads(_http_text(url))
        except (OSError, ValueError, urllib.error.URLError, urllib.error.HTTPError):
            return None
        if not isinstance(payload, dict):
            return None
        version = str(payload.get("productVersion") or "").strip()
        return version if parse_product_version(version) else None
    return None


def _http_text(url: str) -> str:
    from hermes_cli.github_api import github_token

    headers = {"Accept": "application/vnd.github+json", "User-Agent": "hermes-product-version"}
    token = github_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read(1024 * 1024).decode("utf-8-sig")
