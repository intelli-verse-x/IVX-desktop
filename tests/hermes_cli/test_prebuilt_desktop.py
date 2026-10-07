"""The prebuilt desktop update accepts only a CI zip for one commit."""
import io
import json
import zipfile
from pathlib import Path

import pytest

from hermes_cli.prebuilt_desktop import (
    APP_ASSET,
    ASSET_NAME,
    META_ASSET,
    RECEIPT_NAME,
    _extract_unpacked,
    install_prebuilt_desktop,
    pack_app_bundle,
    prebuilt_state,
    publish_ci_artifacts,
    release_tag,
    unpacked_runtime_hash,
)
from hermes_cli.source_releases import OFFICIAL_REPOSITORY


def test_release_tag_is_the_full_commit():
    sha = "a" * 40
    assert release_tag(sha) == f"desktop-{sha}"
    assert release_tag(f"  {sha.upper()}  ") == f"desktop-{sha}"


def test_missing_release_is_not_ready(monkeypatch):
    import urllib.error

    def missing(url, timeout=15):
        raise urllib.error.HTTPError(url, 404, "missing", hdrs=None, fp=io.BytesIO(b""))

    monkeypatch.setattr("hermes_cli.prebuilt_desktop.urllib.request.urlopen", missing)
    assert prebuilt_state("intelli-verse-x/IVX-desktop", "ab" * 20) is False


def test_lookup_failure_does_not_hide_the_update(monkeypatch):
    def down(url, timeout=15):
        raise TimeoutError("offline")

    monkeypatch.setattr("hermes_cli.prebuilt_desktop.urllib.request.urlopen", down)
    assert prebuilt_state("intelli-verse-x/IVX-desktop", "ab" * 20) is None


def test_published_asset_is_ready(monkeypatch):
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self, _limit):
            return (
                b'{"assets":[{"name":"desktop-win-unpacked.zip",'
                b'"browser_download_url":"https://example.test/app.zip"}]}'
            )

    monkeypatch.setattr("hermes_cli.prebuilt_desktop.urllib.request.urlopen", lambda *args, **kwargs: Response())
    assert prebuilt_state("intelli-verse-x/IVX-desktop", "ab" * 20) is True


def test_extract_rejects_a_path_outside_the_archive(tmp_path: Path):
    archive = tmp_path / ASSET_NAME
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("../Hermes.exe", b"nope")
    with pytest.raises(OSError):
        _extract_unpacked(archive, tmp_path / "out")


def test_extract_accepts_the_unpacked_app(tmp_path: Path):
    archive = tmp_path / ASSET_NAME
    with zipfile.ZipFile(archive, "w") as bundle:
        bundle.writestr("win-unpacked/IVX-Agency.exe", b"app")
    unpacked = _extract_unpacked(archive, tmp_path / "out")
    assert unpacked is not None
    assert (unpacked / "IVX-Agency.exe").read_bytes() == b"app"


def test_matching_prebuilt_receipt_skips_the_zip(tmp_path, monkeypatch):
    import hermes_cli.prebuilt_desktop as prebuilt

    monkeypatch.setattr(prebuilt.os, "name", "nt")
    digest = "b" * 64
    unpacked = tmp_path / "apps/desktop/release/win-unpacked"
    unpacked.mkdir(parents=True)
    (unpacked / "IVX-Agency.exe").write_bytes(b"MZ")
    (unpacked / RECEIPT_NAME).write_text(json.dumps({
        "schema": 1, "product": "desktop", "sha": "c" * 40, "sourceHash": digest,
    }), encoding="utf-8")
    monkeypatch.setattr(prebuilt, "_head_sha", lambda _: "a" * 40)
    monkeypatch.setattr(prebuilt, "desktop_source_hash", lambda _: digest)
    monkeypatch.setattr("hermes_cli.source_releases.source_repository", lambda *a, **k: OFFICIAL_REPOSITORY)

    def downloaded(*_args, **_kwargs):
        raise AssertionError("prebuilt zip must not download when desktop inputs match")

    monkeypatch.setattr(prebuilt, "_download", downloaded)
    assert install_prebuilt_desktop(tmp_path) is True


def test_install_stamps_the_ci_zip_next_to_the_exe(tmp_path, monkeypatch):
    import hermes_cli.prebuilt_desktop as prebuilt

    monkeypatch.setattr(prebuilt.os, "name", "nt")
    sha = "a" * 40
    digest = "b" * 64
    monkeypatch.setattr(prebuilt, "_head_sha", lambda _: sha)
    monkeypatch.setattr(prebuilt, "desktop_source_hash", lambda _: digest)
    monkeypatch.setattr("hermes_cli.source_releases.source_repository", lambda *a, **k: OFFICIAL_REPOSITORY)
    monkeypatch.setattr(prebuilt, "_release_payload", lambda *_a, **_k: {
        "assets": [{"name": ASSET_NAME, "browser_download_url": "https://example.test/app.zip"}],
    })

    def fake_download(_url, dest, max_bytes=0):
        with zipfile.ZipFile(dest, "w") as bundle:
            bundle.writestr("win-unpacked/IVX-Agency.exe", b"app")

    monkeypatch.setattr(prebuilt, "_download", fake_download)
    assert install_prebuilt_desktop(tmp_path) is True
    live = tmp_path / "apps/desktop/release/win-unpacked"
    assert (live / "IVX-Agency.exe").read_bytes() == b"app"
    receipt = json.loads((live / RECEIPT_NAME).read_text(encoding="utf-8"))
    assert receipt["schema"] == 1
    assert receipt["product"] == "desktop"
    assert receipt["sha"] == sha
    assert receipt["sourceHash"] == digest
    assert receipt["runtimeHash"] == unpacked_runtime_hash(live)


def test_runtime_hash_ignores_the_app_bundle(tmp_path: Path):
    unpacked = tmp_path / "win-unpacked"
    resources = unpacked / "resources" / "app.asar.unpacked"
    resources.mkdir(parents=True)
    (unpacked / "IVX-Agency.exe").write_bytes(b"MZ-electron")
    (unpacked / "resources" / "app.asar").write_bytes(b"old-ui")
    (resources / "index.js").write_text("old", encoding="utf-8")
    first = unpacked_runtime_hash(unpacked)
    (unpacked / "resources" / "app.asar").write_bytes(b"new-ui")
    (resources / "index.js").write_text("new", encoding="utf-8")
    (unpacked / RECEIPT_NAME).write_text("{}", encoding="utf-8")
    assert unpacked_runtime_hash(unpacked) == first
    (unpacked / "d3dcompiler_47.dll").write_bytes(b"native")
    assert unpacked_runtime_hash(unpacked) != first


def test_app_bundle_keeps_electron_when_runtime_matches(tmp_path, monkeypatch):
    import hermes_cli.prebuilt_desktop as prebuilt

    monkeypatch.setattr(prebuilt.os, "name", "nt")
    sha = "a" * 40
    digest = "b" * 64
    live = tmp_path / "apps/desktop/release/win-unpacked"
    live_resources = live / "resources" / "app.asar.unpacked"
    live_resources.mkdir(parents=True)
    (live / "IVX-Agency.exe").write_bytes(b"MZ-electron")
    (live / "d3dcompiler_47.dll").write_bytes(b"native")
    (live / "resources" / "app.asar").write_bytes(b"old-ui")
    (live_resources / "index.js").write_text("old", encoding="utf-8")
    runtime = unpacked_runtime_hash(live)
    (live / RECEIPT_NAME).write_text(json.dumps({
        "schema": 1, "product": "desktop", "sha": "c" * 40,
        "sourceHash": "d" * 64, "runtimeHash": runtime,
    }), encoding="utf-8")

    overlay = tmp_path / "overlay"
    overlay_resources = overlay / "resources" / "app.asar.unpacked"
    overlay_resources.mkdir(parents=True)
    (overlay / "resources" / "app.asar").write_bytes(b"new-ui")
    (overlay_resources / "index.js").write_text("new", encoding="utf-8")
    app_zip = tmp_path / APP_ASSET
    pack_app_bundle(overlay, app_zip)

    monkeypatch.setattr(prebuilt, "_head_sha", lambda _: sha)
    monkeypatch.setattr(prebuilt, "desktop_source_hash", lambda _: digest)
    monkeypatch.setattr("hermes_cli.source_releases.source_repository", lambda *a, **k: OFFICIAL_REPOSITORY)
    monkeypatch.setattr(prebuilt, "_release_payload", lambda *_a, **_k: {
        "assets": [
            {"name": ASSET_NAME, "browser_download_url": "https://example.test/full.zip"},
            {"name": APP_ASSET, "browser_download_url": "https://example.test/app.zip"},
            {"name": META_ASSET, "browser_download_url": "https://example.test/meta.json"},
        ],
    })
    monkeypatch.setattr(prebuilt, "_release_meta", lambda *_a, **_k: {
        "schema": 1, "product": "desktop", "sourceHash": digest, "runtimeHash": runtime,
    })

    downloaded = []

    def fake_download(url, dest, max_bytes=0):
        downloaded.append(url)
        dest.write_bytes(app_zip.read_bytes())

    monkeypatch.setattr(prebuilt, "_download", fake_download)
    assert install_prebuilt_desktop(tmp_path) is True
    assert downloaded == ["https://example.test/app.zip"]
    assert (live / "IVX-Agency.exe").read_bytes() == b"MZ-electron"
    assert (live / "resources" / "app.asar").read_bytes() == b"new-ui"
    receipt = json.loads((live / RECEIPT_NAME).read_text(encoding="utf-8"))
    assert receipt["sourceHash"] == digest
    assert receipt["runtimeHash"] == runtime


def test_full_zip_when_electron_runtime_changed(tmp_path, monkeypatch):
    import hermes_cli.prebuilt_desktop as prebuilt

    monkeypatch.setattr(prebuilt.os, "name", "nt")
    sha = "a" * 40
    digest = "b" * 64
    live = tmp_path / "apps/desktop/release/win-unpacked"
    live.mkdir(parents=True)
    (live / "IVX-Agency.exe").write_bytes(b"old-electron")
    (live / RECEIPT_NAME).write_text(json.dumps({
        "schema": 1, "product": "desktop", "sourceHash": "d" * 64, "runtimeHash": "e" * 64,
    }), encoding="utf-8")
    monkeypatch.setattr(prebuilt, "_head_sha", lambda _: sha)
    monkeypatch.setattr(prebuilt, "desktop_source_hash", lambda _: digest)
    monkeypatch.setattr("hermes_cli.source_releases.source_repository", lambda *a, **k: OFFICIAL_REPOSITORY)
    monkeypatch.setattr(prebuilt, "_release_payload", lambda *_a, **_k: {
        "assets": [
            {"name": ASSET_NAME, "browser_download_url": "https://example.test/full.zip"},
            {"name": APP_ASSET, "browser_download_url": "https://example.test/app.zip"},
            {"name": META_ASSET, "browser_download_url": "https://example.test/meta.json"},
        ],
    })
    monkeypatch.setattr(prebuilt, "_release_meta", lambda *_a, **_k: {
        "schema": 1, "product": "desktop", "sourceHash": digest, "runtimeHash": "f" * 64,
    })

    def fake_download(url, dest, max_bytes=0):
        assert url == "https://example.test/full.zip"
        with zipfile.ZipFile(dest, "w") as bundle:
            bundle.writestr("win-unpacked/IVX-Agency.exe", b"new-electron")

    monkeypatch.setattr(prebuilt, "_download", fake_download)
    assert install_prebuilt_desktop(tmp_path) is True
    live = tmp_path / "apps/desktop/release/win-unpacked"
    assert (live / "IVX-Agency.exe").read_bytes() == b"new-electron"


def test_ci_artifacts_include_meta_and_app_zip(tmp_path: Path):
    unpacked = tmp_path / "win-unpacked"
    resources = unpacked / "resources" / "app.asar.unpacked"
    resources.mkdir(parents=True)
    (unpacked / "IVX-Agency.exe").write_bytes(b"MZ")
    (unpacked / "resources" / "app.asar").write_bytes(b"ui")
    (resources / "index.js").write_text("ui", encoding="utf-8")
    dest = tmp_path / "out"
    digest = "b" * 64
    publish_ci_artifacts(unpacked, "A" * 40, digest, "intelli-verse-x/IVX-desktop", dest, "1.0.3")
    receipt = json.loads((unpacked / RECEIPT_NAME).read_text(encoding="utf-8"))
    meta = json.loads((dest / META_ASSET).read_text(encoding="utf-8"))
    assert receipt["runtimeHash"] == unpacked_runtime_hash(unpacked)
    assert meta["runtimeHash"] == receipt["runtimeHash"]
    assert meta["sourceHash"] == digest
    assert receipt["productVersion"] == meta["productVersion"] == "1.0.3"
    with zipfile.ZipFile(dest / APP_ASSET) as bundle:
        names = set(bundle.namelist())
    assert "resources/app.asar" in names
    assert "IVX-Agency.exe" not in names
