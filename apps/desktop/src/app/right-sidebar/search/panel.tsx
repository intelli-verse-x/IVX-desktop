import { useStore } from '@nanostores/react'
import { useEffect, useId, useState, useEffectEvent } from 'react'

import { SidebarPanelLabel } from '@/app/shell/sidebar-label'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { ALWAYS_EXCLUDED } from '@/lib/excluded-paths'
import { readDesktopDir } from '@/lib/desktop-fs'
import { cleanPath } from '@/lib/path-compare'
import { cn } from '@/lib/utils'
import { $panesFlipped } from '@/store/layout'
import { $focusedWorkspaceCwd } from '@/store/session-states'
import { workspaceFoldersFor } from '@/store/workspace-folders'

import { PaneEmptyState, RightSidebarSectionHeader } from '../index'

const MAX_RESULTS = 200
const MAX_DIRS = 400

export interface WorkspaceSearchHit {
  name: string
  path: string
  root: string
}

async function searchFilenames(roots: string[], query: string): Promise<WorkspaceSearchHit[]> {
  const needle = query.trim().toLowerCase()

  if (!needle || roots.length === 0) {
    return []
  }

  const hits: WorkspaceSearchHit[] = []
  const queue: { dir: string; root: string }[] = roots.map(root => ({ dir: cleanPath(root), root: cleanPath(root) }))
  let dirsVisited = 0

  while (queue.length > 0 && hits.length < MAX_RESULTS && dirsVisited < MAX_DIRS) {
    const next = queue.shift()

    if (!next) {
      break
    }

    dirsVisited += 1

    let listing

    try {
      listing = await readDesktopDir(next.dir)
    } catch {
      continue
    }

    for (const entry of listing.entries) {
      if (ALWAYS_EXCLUDED.has(entry.name) || entry.name.startsWith('.')) {
        continue
      }

      const full = cleanPath(entry.path || `${next.dir}/${entry.name}`)

      if (entry.isDirectory) {
        queue.push({ dir: full, root: next.root })
        continue
      }

      if (entry.name.toLowerCase().includes(needle)) {
        hits.push({ name: entry.name, path: full, root: next.root })

        if (hits.length >= MAX_RESULTS) {
          break
        }
      }
    }
  }

  return hits
}

interface WorkspaceSearchPanelProps {
  onActivateFile: (path: string) => void
  /** When true, skip the panel title (the workbench Side Bar already titles it). */
  embedded?: boolean
}

/** Filename search across the focused workspace (+ added folders). Content search can follow. */
export function WorkspaceSearchPanel({ onActivateFile, embedded = false }: WorkspaceSearchPanelProps) {
  const { t } = useI18n()
  const panesFlipped = useStore($panesFlipped)
  const cwd = useStore($focusedWorkspaceCwd)
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<WorkspaceSearchHit[]>([])
  const [searching, setSearching] = useState(false)

  const roots = cwd ? [cwd, ...workspaceFoldersFor(cwd)] : []

  const runSearch = useEffectEvent(async (value: string) => {
    if (!value.trim() || roots.length === 0) {
      setHits([])
      setSearching(false)

      return
    }

    setSearching(true)

    try {
      setHits(await searchFilenames(roots, value))
    } finally {
      setSearching(false)
    }
  })

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(query)
    }, 220)

    return () => window.clearTimeout(handle)
  }, [query, cwd, runSearch])

  return (
    <aside
      aria-label="Search"
      className={cn(
        'before:pointer-events-none relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-(--ui-sidebar-surface-background) text-(--ui-text-tertiary)',
        embedded
          ? 'border-0 pt-0'
          : cn(
              'border-(--sidebar-edge-border) pt-(--titlebar-height)',
              panesFlipped ? 'border-r border-l-0' : 'border-l border-r-0'
            )
      )}
      data-tour="search-sidebar"
    >
      {!cwd ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center">
          <PaneEmptyState label={t.rightSidebar.noProjectOpen} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {!embedded && (
            <RightSidebarSectionHeader>
              <SidebarPanelLabel>Search</SidebarPanelLabel>
            </RightSidebarSectionHeader>
          )}
          <div className="px-2 pb-2 pt-2">
            <label className="sr-only" htmlFor={inputId}>
              Search files
            </label>
            <div className="flex items-center gap-1.5 rounded-md border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) px-2 py-1">
              <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="search" size="0.8125rem" />
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
                id={inputId}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search files by name…"
                type="search"
                value={query}
              />
              {searching && <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="loading" size="0.8125rem" spinning />}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            {!query.trim() && (
              <p className="px-2 py-3 text-[0.7rem] text-(--ui-text-quaternary)">Type a file name to search this workspace.</p>
            )}
            {query.trim() && !searching && hits.length === 0 && (
              <p className="px-2 py-3 text-[0.7rem] text-(--ui-text-quaternary)">No files match “{query.trim()}”.</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {hits.map(hit => (
                <li key={hit.path}>
                  <button
                    className="flex w-full min-w-0 flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-(--chrome-action-hover) focus-visible:bg-(--chrome-action-hover) focus-visible:outline-none"
                    onClick={() => onActivateFile(hit.path)}
                    type="button"
                  >
                    <span className="truncate text-xs text-foreground">{hit.name}</span>
                    <span className="truncate text-[0.65rem] text-(--ui-text-quaternary)">{hit.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </aside>
  )
}
