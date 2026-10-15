// Commit history + remote sync for the Source Control Branch / Graph views.
// History mirrors VS Code's SCM Graph "Auto" ref scope: the current branch, its
// upstream, and the remote default branch, walked in topological order so the
// renderer can lay commits out into swimlanes. Reads degrade to an empty
// result off-repo; sync mutations reject so the renderer can toast.

import fs from 'node:fs/promises'

import { defaultBranchName, gitFor } from './git-review-ops'
import { resolveRequestedPathForIpc } from './hardening'

const HISTORY_DEFAULT_LIMIT = 200
const HISTORY_MAX_LIMIT = 1_000
const FIELD_SEP = '\x1f'
const RECORD_SEP = '\x1e'
const LOG_FORMAT = ['%H', '%P', '%an', '%ae', '%at', '%s', '%D'].join('%x1f') + '%x1e'

const EMPTY_HISTORY = { commits: [], head: null, upstream: null, base: null, hasMore: false }

function clampLimit(limit) {
  const n = Number(limit)

  if (!Number.isFinite(n) || n <= 0) {
    return HISTORY_DEFAULT_LIMIT
  }

  return Math.min(Math.floor(n), HISTORY_MAX_LIMIT)
}

// `%D` decorations: "HEAD -> main, origin/main, tag: v1.0". The `HEAD -> x`
// arrow collapses to the branch name; a bare detached `HEAD` is dropped (the
// payload's `head` sha already marks it).
function parseRefs(raw) {
  return String(raw || '')
    .split(',')
    .map(ref => ref.trim())
    .filter(ref => ref && ref !== 'HEAD' && !ref.endsWith('/HEAD'))
    .map(ref => (ref.startsWith('HEAD -> ') ? ref.slice('HEAD -> '.length) : ref))
}

function parseLog(raw) {
  return String(raw || '')
    .split(RECORD_SEP)
    .map(record => record.replace(/^\s+/, ''))
    .filter(Boolean)
    .map(record => {
      const [sha, parents, author, email, at, subject, refs] = record.split(FIELD_SEP)

      return {
        sha,
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        author: author || '',
        email: email || '',
        timestamp: Number(at) || 0,
        subject: subject || '',
        refs: parseRefs(refs)
      }
    })
    .filter(commit => /^[0-9a-f]{7,64}$/i.test(commit.sha))
}

async function existingDir(cwd) {
  try {
    return (await fs.stat(cwd)).isDirectory()
  } catch {
    return false
  }
}

async function revName(git, args) {
  try {
    return (await git.raw(args)).trim() || null
  } catch {
    return null
  }
}

async function upstreamOf(git) {
  return revName(git, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
}

async function historyLog(repoPath, limit, gitBin) {
  let cwd

  try {
    cwd = resolveRequestedPathForIpc(repoPath, { purpose: 'Git history' })
  } catch {
    return EMPTY_HISTORY
  }

  if (!(await existingDir(cwd))) {
    return EMPTY_HISTORY
  }

  let git

  try {
    git = gitFor(cwd, gitBin)
  } catch {
    return EMPTY_HISTORY
  }

  const head = await revName(git, ['rev-parse', '--verify', '--quiet', 'HEAD'])

  if (!head) {
    // Not a repo, or a repo with no commits yet.
    return EMPTY_HISTORY
  }

  const upstream = await upstreamOf(git)
  const trunk = await defaultBranchName(git)
  const baseCandidate = trunk ? `origin/${trunk}` : null

  const base =
    baseCandidate && (await revName(git, ['rev-parse', '--verify', '--quiet', baseCandidate])) ? baseCandidate : null

  const refs = [...new Set(['HEAD', upstream, base].filter(Boolean))]
  const max = clampLimit(limit)

  let raw

  try {
    raw = await git.raw(['log', '--topo-order', `--max-count=${max + 1}`, `--format=${LOG_FORMAT}`, ...refs, '--'])
  } catch {
    return EMPTY_HISTORY
  }

  const commits = parseLog(raw)

  return {
    commits: commits.slice(0, max),
    head,
    upstream,
    base,
    hasMore: commits.length > max
  }
}

function syncGit(repoPath, purpose, gitBin) {
  const cwd = resolveRequestedPathForIpc(repoPath, { purpose })

  return gitFor(cwd, gitBin)
}

async function syncFetch(repoPath, gitBin) {
  const git = syncGit(repoPath, 'Git fetch', gitBin)

  await git.raw(['fetch', '--prune'])

  return { ok: true }
}

// Fast-forward only: a diverged branch needs a deliberate merge or rebase, which
// a one-click Sync must never pick on the user's behalf.
async function syncPull(repoPath, gitBin) {
  const git = syncGit(repoPath, 'Git pull', gitBin)

  if (!(await upstreamOf(git))) {
    throw new Error('This branch has no upstream branch to pull from. Publish it first.')
  }

  await git.raw(['pull', '--ff-only'])

  return { ok: true }
}

// VS Code's Sync: publish a branch with no upstream, otherwise pull then push.
async function syncBranch(repoPath, gitBin) {
  const git = syncGit(repoPath, 'Git sync', gitBin)
  const branch = await revName(git, ['symbolic-ref', '--quiet', '--short', 'HEAD'])

  if (!branch) {
    throw new Error('Cannot sync a detached HEAD. Switch to a branch first.')
  }

  if (!(await upstreamOf(git))) {
    await git.raw(['push', '-u', 'origin', branch])

    return { ok: true }
  }

  await git.raw(['pull', '--ff-only'])

  const ahead = Number(await revName(git, ['rev-list', '--count', '@{u}..HEAD'])) || 0

  if (ahead > 0) {
    await git.raw(['push'])
  }

  return { ok: true }
}

export { historyLog, parseLog, parseRefs, syncBranch, syncFetch, syncPull }
