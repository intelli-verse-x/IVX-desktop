import { useStore } from '@nanostores/react'
import { memo, useMemo } from 'react'

import { TreeSkeleton } from '@/components/chat/skeletons'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { CopyButton } from '@/components/ui/copy-button'
import type { HermesGitCommit } from '@/global'
import { useDelayedTrue } from '@/hooks/use-delayed-true'
import { useI18n } from '@/i18n'
import {
  GRAPH_BASE_REF_COLOR,
  GRAPH_COLORS,
  GRAPH_REF_COLOR,
  GRAPH_REMOTE_REF_COLOR,
  GRAPH_ROW_HEIGHT,
  type GraphRow,
  graphRowShapes,
  layoutGraph
} from '@/lib/git-graph'
import { relativeTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { repoStatusForCwd } from '@/store/coding-status'
import { $reviewRepoCwd } from '@/store/review'
import { $scmHistory, $scmHistoryCwd, $scmHistoryLoading, loadMoreScmHistory } from '@/store/scm-history'

const NO_COMMITS: HermesGitCommit[] = []
const MAX_BADGES = 2

interface RefBadgeProps {
  name: string
  current: null | string
  upstream: null | string
  base: null | string
}

function RefBadge({ name, current, upstream, base }: RefBadgeProps) {
  const tag = name.startsWith('tag: ')
  const label = tag ? name.slice('tag: '.length) : name

  const color =
    name === current
      ? GRAPH_COLORS[GRAPH_REF_COLOR]
      : name === upstream
        ? GRAPH_COLORS[GRAPH_REMOTE_REF_COLOR]
        : name === base
          ? GRAPH_COLORS[GRAPH_BASE_REF_COLOR]
          : undefined

  return (
    <span
      className="inline-flex max-w-28 min-w-0 shrink items-center gap-0.5 rounded-full border px-1.5 text-[0.6rem] leading-4"
      style={{ borderColor: color ?? 'var(--ui-stroke-secondary)', color: color ?? 'var(--ui-text-secondary)' }}
      title={name}
    >
      <Codicon name={tag ? 'tag' : name.includes('/') ? 'cloud' : 'git-branch'} size="0.6rem" />
      <span className="truncate">{label}</span>
    </span>
  )
}

interface GraphRowViewProps {
  row: GraphRow
  head: null | string
  current: null | string
  upstream: null | string
  base: null | string
  copyLabel: string
}

const GraphRowView = memo(function GraphRowView({ row, head, current, upstream, base, copyLabel }: GraphRowViewProps) {
  const { commit } = row
  const shapes = useMemo(() => graphRowShapes(row, head), [row, head])
  const when = commit.timestamp ? new Date(commit.timestamp * 1000) : null

  return (
    <li
      className="group/graph-row flex min-w-0 items-center gap-1 pr-1.5 hover:bg-(--chrome-action-hover)/40"
      style={{ height: GRAPH_ROW_HEIGHT }}
      title={`${commit.sha.slice(0, 10)} · ${commit.author}${when ? ` · ${when.toLocaleString()}` : ''}\n\n${commit.subject}`}
    >
      <svg
        aria-hidden
        className="shrink-0 overflow-visible"
        height={GRAPH_ROW_HEIGHT}
        viewBox={`0 0 ${shapes.width} ${GRAPH_ROW_HEIGHT}`}
        width={shapes.width}
      >
        {shapes.paths.map((path, index) => (
          <path
            d={path.d}
            fill="none"
            key={index}
            stroke={GRAPH_COLORS[path.color]}
            strokeLinecap="round"
            strokeWidth={1}
          />
        ))}
        {shapes.rings.map((ring, index) => (
          <circle
            cx={shapes.circle.cx}
            cy={shapes.circle.cy}
            fill={ring.fill ? GRAPH_COLORS[shapes.circle.color] : 'var(--ui-sidebar-surface-background)'}
            key={index}
            r={ring.r}
            stroke={ring.strokeWidth ? GRAPH_COLORS[shapes.circle.color] : 'none'}
            strokeWidth={ring.strokeWidth}
          />
        ))}
      </svg>
      <span
        className={cn(
          'min-w-16 flex-1 basis-1/2 truncate text-[0.72rem]',
          commit.sha === head ? 'font-medium text-foreground' : 'text-(--ui-text-secondary)'
        )}
      >
        {commit.subject}
      </span>
      {commit.refs.length > 0 ? (
        <span className="flex min-w-0 shrink items-center gap-0.5 overflow-hidden" title={commit.refs.join('\n')}>
          {commit.refs.slice(0, MAX_BADGES).map(ref => (
            <RefBadge base={base} current={current} key={ref} name={ref} upstream={upstream} />
          ))}
          {commit.refs.length > MAX_BADGES ? (
            <span className="shrink-0 text-[0.6rem] text-(--ui-text-tertiary)">+{commit.refs.length - MAX_BADGES}</span>
          ) : null}
        </span>
      ) : null}
      <span className="shrink-0 text-[0.62rem] text-(--ui-text-tertiary) tabular-nums group-hover/graph-row:hidden">
        {when ? relativeTime(when.getTime()) : ''}
      </span>
      <CopyButton
        appearance="icon"
        buttonSize="icon-xs"
        className="hidden size-4 shrink-0 text-(--ui-text-tertiary) hover:text-foreground group-hover/graph-row:inline-flex"
        iconClassName="size-3"
        label={copyLabel}
        side="left"
        stopPropagation
        text={commit.sha}
      />
    </li>
  )
})

/** Branch name that `HEAD -> x` decorated, i.e. the checked-out branch. */
function currentBranchOf(commits: HermesGitCommit[], head: null | string): null | string {
  const headCommit = head ? commits.find(commit => commit.sha === head) : undefined

  return headCommit?.refs.find(ref => !ref.startsWith('tag: ') && !ref.includes('/')) ?? null
}

/**
 * Source Control Graph (VS Code's SCM Graph): the current branch, its upstream
 * and the remote default branch drawn as swimlanes, newest first.
 */
export function ReviewGraphPanel() {
  const { t } = useI18n()
  const c = t.statusStack.coding
  const cwd = useStore($reviewRepoCwd)
  const history = useStore($scmHistory)
  const historyCwd = useStore($scmHistoryCwd)
  const loading = useStore($scmHistoryLoading)
  const status = useStore(useMemo(() => repoStatusForCwd(cwd), [cwd]))
  const commits = historyCwd === cwd ? history.commits : NO_COMMITS
  const current = useMemo(() => currentBranchOf(commits, history.head), [commits, history.head])

  const rows = useMemo(
    () => layoutGraph(commits, { base: history.base, current, upstream: history.upstream }),
    [commits, current, history.base, history.upstream]
  )

  const showSkeleton = useDelayedTrue(loading && rows.length === 0)

  if (rows.length === 0) {
    return showSkeleton ? (
      <TreeSkeleton />
    ) : loading ? (
      <div className="min-h-0 flex-1" />
    ) : (
      <p className="px-3 py-4 text-center text-[0.72rem] text-(--ui-text-tertiary)">
        {status ? c.noCommits : c.notRepo}
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1" data-suppress-pane-reveal-side="">
      <ul aria-label={c.scmGraph} className="flex flex-col">
        {rows.map(row => (
          <GraphRowView
            base={history.base}
            copyLabel={c.copySha}
            current={current}
            head={history.head}
            key={row.commit.sha}
            row={row}
            upstream={history.upstream}
          />
        ))}
      </ul>
      {history.hasMore ? (
        <Button
          className="mx-2 my-1.5 h-7 text-[0.7rem]"
          disabled={loading}
          onClick={() => void loadMoreScmHistory()}
          size="sm"
          variant="ghost"
        >
          {c.loadMoreCommits}
        </Button>
      ) : null}
    </div>
  )
}
