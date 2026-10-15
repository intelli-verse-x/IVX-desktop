import { useStore } from '@nanostores/react'

import { RightSidebarPane } from '@/app/right-sidebar'
import { ReviewPane } from '@/app/right-sidebar/review'
import { WorkspaceSearchPanel } from '@/app/right-sidebar/search/panel'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { cn } from '@/lib/utils'
import {
  $codeActivityPanelOpen,
  $codeActivityView,
  type CodeActivityView,
  setCodeActivityPanelOpen
} from '@/store/code-activity'
import { openPreview } from '@/store/preview'
import { $reviewRepoCwd } from '@/store/review'
import { $focusedWorkspaceCwd } from '@/store/session-states'

const VIEW_SHELL =
  'absolute inset-0 flex min-h-0 flex-col overflow-hidden [&>aside]:h-full [&>aside]:w-full [&>aside]:border-0 [&>aside]:pt-0 [&>aside]:shadow-none'

const TITLES: Record<CodeActivityView, string> = {
  explorer: 'Explorer',
  search: 'Search',
  scm: 'Source Control'
}

function previewFile(path: string) {
  void normalizeOrLocalPreviewTarget(path, $focusedWorkspaceCwd.get() || undefined)
    .then(target => {
      if (target) {
        openPreview(target)
      }
    })
    .catch(() => undefined)
}

/**
 * View-container body hosted inside the Sessions sidebar (not a second column).
 * Matches VS Code SidebarPart: one active composite, others kept mounted/hidden.
 */
export function WorkbenchSideBar() {
  const open = useStore($codeActivityPanelOpen)
  const view = useStore($codeActivityView)
  const repoCwd = useStore($reviewRepoCwd)

  if (!open) {
    return null
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-workbench-side-bar="">
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-(--ui-stroke-quaternary) px-3 pt-[calc(var(--titlebar-height)+0.125rem)]">
        <h2 className="min-w-0 flex-1 truncate text-[0.68rem] font-semibold tracking-wide text-(--ui-text-secondary) uppercase">
          {TITLES[view]}
        </h2>
        <Tip label="Back to Sessions">
          <button
            aria-label="Back to Sessions"
            className="grid size-6 place-items-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={() => setCodeActivityPanelOpen(false)}
            type="button"
          >
            <Codicon name="close" size="0.8125rem" />
          </button>
        </Tip>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          aria-hidden={view !== 'explorer'}
          className={cn(VIEW_SHELL, view !== 'explorer' && 'pointer-events-none invisible')}
        >
          <RightSidebarPane onActivateFile={previewFile} onActivateFolder={previewFile} />
        </div>
        <div
          aria-hidden={view !== 'search'}
          className={cn(VIEW_SHELL, view !== 'search' && 'pointer-events-none invisible')}
        >
          <WorkspaceSearchPanel embedded onActivateFile={previewFile} />
        </div>
        <div aria-hidden={view !== 'scm'} className={cn(VIEW_SHELL, view !== 'scm' && 'pointer-events-none invisible')}>
          <ReviewPane embedded key={repoCwd || 'no-cwd'} />
        </div>
      </div>
    </div>
  )
}
