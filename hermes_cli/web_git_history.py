"""Commit history + remote sync for the desktop Source Control Branch / Graph views.

Remote-gateway mirror of ``apps/desktop/electron/git-history-ops.ts``. History walks
VS Code's SCM Graph "Auto" refs (HEAD, its upstream, the remote default branch) in
topological order; reads degrade to an empty payload, mutations raise RuntimeError
so the route maps them to a 400 the renderer toasts. ``cwd`` is already hardened.
"""

from __future__ import annotations

import re

from hermes_cli.web_git import _default_branch_name, _git, _git_line, _git_ok, _is_dir, _ref_exists

_HISTORY_DEFAULT_LIMIT = 200
_HISTORY_MAX_LIMIT = 1000
_FIELD_SEP = "\x1f"
_RECORD_SEP = "\x1e"
_LOG_FORMAT = "%x1f".join(("%H", "%P", "%an", "%ae", "%at", "%s", "%D")) + "%x1e"
_SHA_RE = re.compile(r"^[0-9a-f]{7,64}$", re.IGNORECASE)


def _empty_history() -> dict:
    return {"commits": [], "head": None, "upstream": None, "base": None, "hasMore": False}


def _clamp_limit(limit: int | None) -> int:
    if not limit or limit <= 0:
        return _HISTORY_DEFAULT_LIMIT
    return min(int(limit), _HISTORY_MAX_LIMIT)


def parse_refs(raw: str) -> list[str]:
    """``%D`` decorations → names; ``HEAD -> x`` collapses to ``x``, bare/remote HEAD drops."""
    refs = []
    for ref in (part.strip() for part in (raw or "").split(",")):
        if not ref or ref == "HEAD" or ref.endswith("/HEAD"):
            continue
        refs.append(ref[len("HEAD -> "):] if ref.startswith("HEAD -> ") else ref)
    return refs


def parse_log(raw: str) -> list[dict]:
    commits = []
    for record in (raw or "").split(_RECORD_SEP):
        fields = record.lstrip().split(_FIELD_SEP)
        if len(fields) < 7 or not _SHA_RE.match(fields[0]):
            continue
        sha, parents, author, email, at, subject, refs = fields[:7]
        commits.append({
            "sha": sha,
            "parents": parents.split(),
            "author": author,
            "email": email,
            "timestamp": int(at) if at.isdigit() else 0,
            "subject": subject,
            "refs": parse_refs(refs),
        })
    return commits


def _upstream(cwd: str) -> str | None:
    return _git_line(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) or None


def history_log(cwd: str, limit: int | None = None) -> dict:
    if not _is_dir(cwd):
        return _empty_history()
    head = _git_line(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"])
    if not head:
        return _empty_history()
    upstream = _upstream(cwd)
    trunk = _default_branch_name(cwd)
    base = f"origin/{trunk}" if trunk and _ref_exists(cwd, f"origin/{trunk}") else None
    refs = list(dict.fromkeys(r for r in ("HEAD", upstream, base) if r))
    max_count = _clamp_limit(limit)
    code, raw, _ = _git(cwd, ["log", "--topo-order", f"--max-count={max_count + 1}", f"--format={_LOG_FORMAT}", *refs, "--"])
    if code != 0:
        return _empty_history()
    commits = parse_log(raw)
    return {
        "commits": commits[:max_count],
        "head": head,
        "upstream": upstream,
        "base": base,
        "hasMore": len(commits) > max_count,
    }


def sync_fetch(cwd: str) -> dict:
    _git_ok(cwd, ["fetch", "--prune"])
    return {"ok": True}


def sync_pull(cwd: str) -> dict:
    """Fast-forward only: a diverged branch needs a deliberate merge or rebase."""
    if not _upstream(cwd):
        raise RuntimeError("This branch has no upstream branch to pull from. Publish it first.")
    _git_ok(cwd, ["pull", "--ff-only"])
    return {"ok": True}


def sync_branch(cwd: str) -> dict:
    """VS Code's Sync: publish a branch with no upstream, otherwise pull then push."""
    branch = _git_line(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"])
    if not branch:
        raise RuntimeError("Cannot sync a detached HEAD. Switch to a branch first.")
    if not _upstream(cwd):
        _git_ok(cwd, ["push", "-u", "origin", branch])
        return {"ok": True}
    _git_ok(cwd, ["pull", "--ff-only"])
    ahead = _git_line(cwd, ["rev-list", "--count", "@{u}..HEAD"])
    if ahead.isdigit() and int(ahead) > 0:
        _git_ok(cwd, ["push"])
    return {"ok": True}
