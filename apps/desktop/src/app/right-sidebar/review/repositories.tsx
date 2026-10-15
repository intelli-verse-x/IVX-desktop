import { useStore } from '@nanostores/react'
import { useEffect, useMemo } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { cleanPath, comparisonPath } from '@/lib/path-compare'
import { cn } from '@/lib/utils'
import { selectScmRepo } from '@/store/code-activity'
import { registerRepoStatusCwd, repoStatusForCwd } from '@/store/coding-status'
import { $reviewRepoCwd, scmRepoCandidates } from '@/store/review'
import { $focusedWorkspaceCwd } from '@/store/session-states'
import { $workspaceFolders } from '@/store/workspace-folders'

const folderName = (path: string) => cleanPath(path).split('/').pop() || path

const samePath = (a: null | string, b: string) =>
  Boolean(a) && comparisonPath(cleanPath(a as string)) === comparisonPath(cleanPath(b))

interface RepositoryRowProps {
  path: string
  selected: boolean
  onSelect: () => void
}

function RepositoryRow({ path, selected, onSelect }: RepositoryRowProps) {
  const { t } = useI18n()
  const c = t.statusStack.coding
  const status = useStore(useMemo(() => repoStatusForCwd(path), [path]))

  useEffect(() => registerRepoStatusCwd(path), [path])

  const branch = status ? (status.detached ? c.detached : status.branch || c.noBranch) : c.notRepo

  return (
    <button
      aria-pressed={selected}
      className={cn(
        'flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-[0.72rem] hover:bg-(--chrome-action-hover)/50',
        selected ? 'bg-(--chrome-action-hover)/70 text-foreground' : 'text-(--ui-text-secondary)'
      )}
      onClick={onSelect}
      title={path}
      type="button"
    >
      <Codicon className="shrink-0 text-(--ui-text-tertiary)" name="repo" size="0.8rem" />
      <span className="min-w-0 truncate font-medium">{folderName(path)}</span>
      <span className="flex min-w-0 shrink items-center gap-0.5 text-[0.66rem] text-(--ui-text-tertiary)">
        {status ? <Codicon className="shrink-0" name="git-branch" size="0.66rem" /> : null}
        <span className="truncate">{branch}</span>
      </span>
      {status && status.changed > 0 ? (
        <span className="ml-auto shrink-0 rounded-full bg-(--chrome-action-hover) px-1.5 text-[0.62rem] tabular-nums">
          {status.changed}
        </span>
      ) : null}
    </button>
  )
}

/**
 * VS Code's Source Control Repositories list: one row per folder in the focused
 * chat (workspace + added folders). Hidden for a single-folder chat.
 */
export function ScmRepositories() {
  const { t } = useI18n()
  const focused = useStore($focusedWorkspaceCwd)
  const folders = useStore($workspaceFolders)
  const active = useStore($reviewRepoCwd)
  const candidates = useMemo(() => scmRepoCandidates(focused, folders), [focused, folders])

  if (candidates.length < 2) {
    return null
  }

  return (
    <section
      aria-label={t.statusStack.coding.repositories}
      className="flex shrink-0 flex-col gap-0.5 border-b border-(--ui-stroke-quaternary) px-1.5 py-1.5"
      data-suppress-pane-reveal-side=""
    >
      <h3 className="px-1.5 pb-0.5 text-[0.62rem] font-semibold tracking-wide text-(--ui-text-tertiary) uppercase">
        {t.statusStack.coding.repositories}
      </h3>
      {candidates.map((path, index) => (
        <RepositoryRow
          key={path}
          onSelect={() => selectScmRepo(index === 0 ? null : path)}
          path={path}
          selected={samePath(active, path)}
        />
      ))}
    </section>
  )
}
