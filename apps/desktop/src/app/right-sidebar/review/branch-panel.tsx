import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Input } from '@/components/ui/input'
import type { HermesGitBranch } from '@/global'
import { useI18n } from '@/i18n'
import { desktopGit } from '@/lib/desktop-git'
import { cn } from '@/lib/utils'
import { $scmView } from '@/store/code-activity'
import { refreshRepoStatus, repoStatusForCwd } from '@/store/coding-status'
import { notifyError } from '@/store/notifications'
import { $reviewRepoCwd, $reviewShipBusy, $reviewShipInfo, createOrOpenPr, refreshShipInfo } from '@/store/review'
import { $scmSyncBusy, fetchScmRepo, pullScmRepo, switchScmBranch, syncScmRepo } from '@/store/scm-history'

const ICON = '0.85rem'
const BRANCH_FILTER_THRESHOLD = 8

const SECTION_LABEL = 'text-[0.62rem] font-semibold tracking-wide text-(--ui-text-tertiary) uppercase'

/** Local branches first (current on top), then remote-only refs; filtered by name. */
export function orderBranches(branches: HermesGitBranch[], query: string): HermesGitBranch[] {
  const needle = query.trim().toLowerCase()

  return branches
    .filter(branch => !needle || branch.name.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        Number(b.checkedOut) - Number(a.checkedOut) ||
        Number(a.isRemote) - Number(b.isRemote) ||
        Number(b.isDefault) - Number(a.isDefault) ||
        a.name.localeCompare(b.name)
    )
}

function useBranches(cwd: null | string, branch: null | string | undefined) {
  const [branches, setBranches] = useState<HermesGitBranch[]>([])

  useEffect(() => {
    const git = desktopGit()

    if (!cwd || !git?.branchList) {
      setBranches([])

      return
    }

    let live = true

    git
      .branchList(cwd)
      .then(list => live && setBranches(list))
      .catch(() => live && setBranches([]))

    return () => {
      live = false
    }
  }, [cwd, branch])

  return branches
}

/**
 * Branch tab (VS Code / Cursor shape): the checked-out branch, its upstream
 * tracking (ahead / behind, Sync / Publish, Fetch, Pull), the branch's PR, and a
 * switcher over local + remote branches. File diffs belong on Changes.
 */
export function ReviewBranchPanel() {
  const { t } = useI18n()
  const c = t.statusStack.coding
  const cwd = useStore($reviewRepoCwd)
  const status = useStore(useMemo(() => repoStatusForCwd(cwd), [cwd]))
  const ship = useStore($reviewShipInfo)
  const shipBusy = useStore($reviewShipBusy)
  const syncBusy = useStore($scmSyncBusy)
  const [query, setQuery] = useState('')
  const branches = useBranches(cwd, status?.branch)
  const visible = useMemo(() => orderBranches(branches, query), [branches, query])

  useEffect(() => {
    if (cwd) {
      void refreshRepoStatus(cwd)
      void refreshShipInfo()
    }
  }, [cwd])

  if (!status) {
    return <p className="px-3 py-4 text-center text-[0.72rem] text-(--ui-text-tertiary)">{c.notRepo}</p>
  }

  const pr = ship.pr
  const prLabel = pr?.url ? `${c.openPr} #${pr.number}` : c.createPr
  const branchLabel = status.detached ? c.detached : status.branch || c.noBranch
  const published = Boolean(status.upstream)
  const busy = Boolean(syncBusy)

  const run = (action: () => Promise<void>, label: string) => () => void action().catch(err => notifyError(err, label))

  const syncLabel = published ? c.syncChanges : c.publishBranch

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-suppress-pane-reveal-side="">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        <section className="flex flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2 text-foreground">
            <Codicon className="shrink-0 text-(--ui-green)" name="git-branch" size="0.95rem" />
            <span className="min-w-0 truncate text-[0.8125rem] font-medium" title={branchLabel}>
              {branchLabel}
            </span>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[0.7rem]">
            <dt className="text-(--ui-text-tertiary)">{c.upstream}</dt>
            <dd className="min-w-0 truncate text-(--ui-text-secondary)" title={status.upstream ?? undefined}>
              {status.upstream ?? c.notPublished}
            </dd>
            {status.defaultBranch ? (
              <>
                <dt className="text-(--ui-text-tertiary)">{c.baseBranch}</dt>
                <dd className="min-w-0 truncate text-(--ui-text-secondary)">{status.defaultBranch}</dd>
              </>
            ) : null}
          </dl>

          {published ? (
            status.ahead > 0 || status.behind > 0 ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-(--ui-text-secondary) tabular-nums">
                {status.ahead > 0 ? (
                  <span className="inline-flex items-center gap-1" title={c.ahead(status.ahead)}>
                    <Codicon name="arrow-up" size="0.7rem" />
                    {c.ahead(status.ahead)}
                  </span>
                ) : null}
                {status.behind > 0 ? (
                  <span className="inline-flex items-center gap-1" title={c.behind(status.behind)}>
                    <Codicon name="arrow-down" size="0.7rem" />
                    {c.behind(status.behind)}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="text-[0.7rem] text-(--ui-text-tertiary)">{c.upToDate(status.upstream ?? '')}</p>
            )
          ) : null}

          {status.changed > 0 ? (
            <button
              className="flex items-center gap-1 self-start text-[0.7rem] text-(--ui-text-secondary) hover:text-foreground"
              onClick={() => $scmView.set('changes')}
              type="button"
            >
              <Codicon name="diff" size="0.75rem" />
              {c.uncommittedChanges(status.changed)}
              <span className="text-(--ui-text-tertiary)">· {c.viewChanges}</span>
            </button>
          ) : null}
        </section>

        <section className="flex flex-col gap-1.5">
          <Button
            className="h-8 w-full justify-center gap-1.5 text-[0.72rem]"
            disabled={busy || status.detached}
            onClick={run(syncScmRepo, c.syncFailed)}
            size="sm"
          >
            <Codicon name={published ? 'sync' : 'cloud-upload'} size={ICON} spinning={syncBusy === 'sync'} />
            <span className="truncate">{syncLabel}</span>
            {published && (status.ahead > 0 || status.behind > 0) ? (
              <span className="text-[0.66rem] tabular-nums opacity-80">
                {status.behind}↓ {status.ahead}↑
              </span>
            ) : null}
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              className="h-7 justify-center gap-1 text-[0.7rem]"
              disabled={busy}
              onClick={run(fetchScmRepo, c.fetch)}
              size="sm"
              variant="secondary"
            >
              <Codicon name="repo-fetch" size="0.8rem" spinning={syncBusy === 'fetch'} />
              {c.fetch}
            </Button>
            <Button
              className="h-7 justify-center gap-1 text-[0.7rem]"
              disabled={busy || !published}
              onClick={run(pullScmRepo, c.pull)}
              size="sm"
              variant="secondary"
            >
              <Codicon name="repo-pull" size="0.8rem" spinning={syncBusy === 'pull'} />
              {c.pull}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-1">
          <Button
            className={cn('h-8 w-full justify-center gap-1.5 text-[0.72rem]')}
            disabled={!ship.ghReady || shipBusy || status.detached}
            onClick={() => void createOrOpenPr().catch(err => notifyError(err, prLabel))}
            size="sm"
            variant="secondary"
          >
            <Codicon name="git-pull-request" size={ICON} />
            <span className="truncate">{prLabel}</span>
            {pr?.state ? <span className="text-[0.66rem] capitalize opacity-70">· {pr.state}</span> : null}
          </Button>
          {!ship.ghReady ? (
            <p className="px-0.5 text-center text-[0.64rem] leading-snug text-(--ui-text-tertiary)">{c.ghMissing}</p>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-col gap-1">
          <h3 className={SECTION_LABEL}>{c.branches}</h3>
          {branches.length > BRANCH_FILTER_THRESHOLD ? (
            <Input
              aria-label={c.filterBranches}
              className="h-7 text-[0.72rem]"
              onChange={event => setQuery(event.target.value)}
              placeholder={c.filterBranches}
              value={query}
            />
          ) : null}
          <ul className="flex flex-col">
            {visible.map(branch => {
              const elsewhere = !branch.checkedOut && Boolean(branch.worktreePath)

              return (
                <li key={`${branch.isRemote ? 'r' : 'l'}:${branch.name}`}>
                  <button
                    className={cn(
                      'flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[0.72rem]',
                      branch.checkedOut
                        ? 'text-foreground'
                        : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover)/50 hover:text-foreground',
                      'disabled:cursor-default disabled:hover:bg-transparent'
                    )}
                    disabled={branch.checkedOut || elsewhere || busy}
                    onClick={run(() => switchScmBranch(branch.name), c.switchFailed(branch.name))}
                    title={elsewhere ? `${c.checkedOutElsewhere}: ${branch.worktreePath}` : c.switchTo(branch.name)}
                    type="button"
                  >
                    <Codicon
                      className="shrink-0 text-(--ui-text-tertiary)"
                      name={branch.checkedOut ? 'check' : branch.isRemote ? 'cloud' : 'git-branch'}
                      size="0.75rem"
                    />
                    <span className="min-w-0 truncate">{branch.name}</span>
                    {branch.checkedOut ? (
                      <span className="ml-auto shrink-0 text-[0.62rem] text-(--ui-text-tertiary)">
                        {c.currentBranch}
                      </span>
                    ) : branch.isRemote ? (
                      <span className="ml-auto shrink-0 text-[0.62rem] text-(--ui-text-tertiary)">
                        {c.remoteBranch}
                      </span>
                    ) : elsewhere ? (
                      <Codicon className="ml-auto shrink-0 text-(--ui-text-tertiary)" name="worktree" size="0.7rem" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
