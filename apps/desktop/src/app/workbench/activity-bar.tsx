import { useStore } from '@nanostores/react'

import { setTerminalTakeover } from '@/app/right-sidebar/store'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  $codeActivityPanelOpen,
  $codeActivityView,
  activateCodeActivity,
  type CodeActivityView,
  setCodeActivityPanelOpen
} from '@/store/code-activity'
import { setFileBrowserOpen } from '@/store/layout'
import { closeReview } from '@/store/review'

import { ACTIVITY_ACTION_HEIGHT_PX, ACTIVITY_BAR_WIDTH_PX, ACTIVITY_ICON_SIZE_PX } from './constants'

interface ActivityItem {
  icon: string
  id: CodeActivityView | 'sessions'
  label: string
}

/**
 * VS Code ActivitybarPart analogue, hosted inside the Sessions sidebar column
 * so we do not open a second side bar.
 */
export function WorkbenchActivityBar() {
  const { t } = useI18n()
  const active = useStore($codeActivityView)
  const panelOpen = useStore($codeActivityPanelOpen)

  const items: ActivityItem[] = [
    { id: 'sessions', icon: 'comment-discussion', label: t.sidebar.sessions },
    { id: 'explorer', icon: 'files', label: t.sidebar.files },
    { id: 'search', icon: 'search', label: 'Search' },
    { id: 'scm', icon: 'source-control', label: t.sidebar.review }
  ]

  return (
    <nav
      aria-label="Activity Bar"
      className="z-20 flex h-full shrink-0 flex-col items-center border-r border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) pt-[calc(var(--titlebar-height)+0.25rem)]"
      data-suppress-pane-reveal=""
      data-workbench-activity-bar=""
      role="toolbar"
      style={{ width: ACTIVITY_BAR_WIDTH_PX }}
    >
      <ul className="flex w-full min-h-0 flex-1 flex-col items-stretch overflow-y-auto">
        {items.map(item => {
          const isActive = item.id === 'sessions' ? !panelOpen : panelOpen && item.id === active

          return (
            <li className="relative flex w-full justify-center" key={item.id}>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-0 h-6 w-0.5 -translate-y-1/2 rounded-r bg-foreground"
                />
              )}
              <Tip label={item.label} placement="left-rail">
                <button
                  aria-label={item.label}
                  aria-pressed={isActive}
                  className={cn(
                    'grid w-full place-items-center text-(--ui-text-tertiary) transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring [-webkit-app-region:no-drag]',
                    isActive && 'bg-(--chrome-action-hover)/40 text-foreground'
                  )}
                  onClick={() => {
                    setTerminalTakeover(false)
                    setFileBrowserOpen(false)
                    // Keep the classic ⌘G right-rail Review zone closed so SCM
                    // only shows in this workbench column. Refresh still runs
                    // via `$reviewSurfaceActive` when view === 'scm'.
                    closeReview()

                    if (item.id === 'sessions') {
                      setCodeActivityPanelOpen(false)

                      return
                    }

                    activateCodeActivity(item.id)
                  }}
                  style={{ height: ACTIVITY_ACTION_HEIGHT_PX }}
                  type="button"
                >
                  <Codicon name={item.icon} size={ACTIVITY_ICON_SIZE_PX} />
                </button>
              </Tip>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
