"""IVX product versions bump patch to 5, then roll minor, then major."""

from hermes_cli.product_version import bump_product_version, resolve_ci_product_version


def test_bump_rolls_patch_then_minor_then_major():
    assert bump_product_version("1.0.0") == "1.0.1"
    assert bump_product_version("1.0.4") == "1.0.5"
    assert bump_product_version("1.0.5") == "1.1.0"
    assert bump_product_version("1.1.5") == "1.2.0"
    assert bump_product_version("1.5.5") == "2.0.0"


def test_first_ci_publish_keeps_the_seed(tmp_path, monkeypatch):
    seed = tmp_path / "apps/desktop/product-version.json"
    seed.parent.mkdir(parents=True)
    seed.write_text('{"version": "1.0.0"}\n', encoding="utf-8")
    monkeypatch.setattr(
        "hermes_cli.product_version.previous_release_product_version",
        lambda *_a, **_k: None,
    )
    assert resolve_ci_product_version(tmp_path) == "1.0.0"


def test_later_ci_publish_bumps_the_previous_release(tmp_path, monkeypatch):
    seed = tmp_path / "apps/desktop/product-version.json"
    seed.parent.mkdir(parents=True)
    seed.write_text('{"version": "1.0.0"}\n', encoding="utf-8")
    monkeypatch.setattr(
        "hermes_cli.product_version.previous_release_product_version",
        lambda *_a, **_k: "1.0.5",
    )
    assert resolve_ci_product_version(tmp_path) == "1.1.0"
