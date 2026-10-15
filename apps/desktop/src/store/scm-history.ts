import { atom } from 'nanostores'

import type { HermesGitHistory } from '@/global'
import { desktopGit } from '@/lib/desktop-git'

import { $scmView } from './code-activity'
import { refreshRepoStatus } from './coding-status'
import { switchBranchInRepo } from './projects'
import { $reviewRepoCwd, $reviewSurfaceActive, refreshReview, refreshShipInfo, reviewRepoCwd } from './review'
import { $busy } from './session'
import { $workspaceChangeTick } from './workspace-events'

// Source Control Graph + Branch sync state. The graph is the commit history of
// the repo Source Control is reading (`reviewRepoCwd`), re-read on the same
// structural edges as the Changes list while the Graph tab is showing.

const PAGE_SIZE = 200
const MAX_PAGE_SIZE = 1_000

export const EMPTY_HISTORY: HermesGitHistory = { base: null, commits: [], hasMore: false, head: null, upstream: null }

export const $scmHistory = atom<HermesGitHistory>(EMPTY_HISTORY)
export const $scmHistoryLoading = atom(false)
// The repo the loaded history belongs to, so a switch never paints the old graph.
export const $scmHistoryCwd = atom<null | string>(null)

export type ScmSyncAction = 'fetch' | 'pull' | 'switch' | 'sync'

/** The remote/branch operation in flight; disables the Branch view's actions. */
export const $scmSyncBusy = atom<null | ScmSyncAction>(null)

let historySeq = 0
let historyLimit = PAGE_SIZE

function graphShowing(): boolean {
  return $reviewSurfaceActive.get() && $scmView.get() === 'graph'
}

export async function refreshScmHistory(limit = historyLimit): Promise<void> {
  const cwd = reviewRepoCwd()
  const git = desktopGit()
  const seq = (historySeq += 1)

  historyLimit = Math.min(Math.max(limit, PAGE_SIZE), MAX_PAGE_SIZE)

  if (!cwd || !git?.history) {
    $scmHistory.set(EMPTY_HISTORY)
    $scmHistoryCwd.set(cwd)
    $scmHistoryLoading.set(false)

    return
  }

  if ($scmHistoryCwd.get() !== cwd) {
    $scmHistory.set(EMPTY_HISTORY)
  }

  $scmHistoryLoading.set(true)

  try {
    const history = await git.history(cwd, historyLimit)

    if (seq === historySeq) {
      $scmHistory.set(history)
      $scmHistoryCwd.set(cwd)
    }
  } catch {
    if (seq === historySeq) {
      $scmHistory.set(EMPTY_HISTORY)
      $scmHistoryCwd.set(cwd)
    }
  } finally {
    if (seq === historySeq) {
      $scmHistoryLoading.set(false)
    }
  }
}

export function loadMoreScmHistory(): Promise<void> {
  return refreshScmHistory(historyLimit + PAGE_SIZE)
}

/** Re-read everything a remote/branch change can move: status, list, PR, graph. */
async function refreshAfterSync(cwd: string): Promise<void> {
  await Promise.all([refreshRepoStatus(cwd), refreshReview(), refreshShipInfo(), refreshScmHistory()])
}

async function runSync(action: ScmSyncAction, op: (cwd: string) => Promise<unknown>): Promise<void> {
  const cwd = reviewRepoCwd()

  if (!cwd || $scmSyncBusy.get()) {
    return
  }

  $scmSyncBusy.set(action)

  try {
    await op(cwd)
  } finally {
    $scmSyncBusy.set(null)
    await refreshAfterSync(cwd)
  }
}

function requireGit() {
  const git = desktopGit()

  if (!git) {
    throw new Error('Git is unavailable in this window')
  }

  return git
}

export const fetchScmRepo = () => runSync('fetch', cwd => requireGit().fetch(cwd))

export const pullScmRepo = () => runSync('pull', cwd => requireGit().pull(cwd))

export const syncScmRepo = () => runSync('sync', cwd => requireGit().sync(cwd))

export const switchScmBranch = (branch: string) => runSync('switch', cwd => switchBranchInRepo(cwd, branch))

// ── Triggers ─────────────────────────────────────────────────────────────────

let prevGraphShowing = graphShowing()
let prevCwd = reviewRepoCwd()

function onGraphInputs(): void {
  const showing = graphShowing()
  const cwd = reviewRepoCwd()

  if (showing && (!prevGraphShowing || cwd !== prevCwd)) {
    historyLimit = PAGE_SIZE
    void refreshScmHistory()
  }

  prevGraphShowing = showing
  prevCwd = cwd
}

$reviewSurfaceActive.subscribe(onGraphInputs)
$scmView.subscribe(onGraphInputs)
$reviewRepoCwd.subscribe(onGraphInputs)

// A file-mutating tool finished; it may have committed.
$workspaceChangeTick.subscribe(() => {
  if (graphShowing()) {
    void refreshScmHistory()
  }
})

let prevBusy = $busy.get()

$busy.subscribe(busy => {
  if (prevBusy && !busy && graphShowing()) {
    void refreshScmHistory()
  }

  prevBusy = busy
})

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    if (graphShowing()) {
      void refreshScmHistory()
    }
  })
}
