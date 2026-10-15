import { atom } from 'nanostores'

import { persistBoolean, persistString, storedBoolean, storedString } from '@/lib/storage'

export type CodeActivityView = 'explorer' | 'search' | 'scm'

const VIEW_KEY = 'ivx.desktop.codeActivityView'
const OPEN_KEY = 'ivx.desktop.codeActivityPanelOpen'
const VIEWS = new Set<CodeActivityView>(['explorer', 'search', 'scm'])

function readView(): CodeActivityView {
  const raw = storedString(VIEW_KEY)

  return raw && VIEWS.has(raw as CodeActivityView) ? (raw as CodeActivityView) : 'explorer'
}

/** Which tool panel is shown beside the activity bar (VS Code–style). */
export const $codeActivityView = atom<CodeActivityView>(readView())

/** Whether the left code tool panel (Explorer / Search / SCM) is open. */
export const $codeActivityPanelOpen = atom<boolean>(storedBoolean(OPEN_KEY, false))

$codeActivityView.subscribe(view => persistString(VIEW_KEY, view))
$codeActivityPanelOpen.subscribe(open => persistBoolean(OPEN_KEY, open))

export function setCodeActivityView(view: CodeActivityView): void {
  $codeActivityView.set(view)
}

export function setCodeActivityPanelOpen(open: boolean): void {
  $codeActivityPanelOpen.set(open)
}

/** VS Code behavior: same icon toggles closed; other icons switch and open. */
export function activateCodeActivity(view: CodeActivityView): void {
  if ($codeActivityPanelOpen.get() && $codeActivityView.get() === view) {
    $codeActivityPanelOpen.set(false)

    return
  }

  $codeActivityView.set(view)
  $codeActivityPanelOpen.set(true)
}

export type ScmView = 'branch' | 'changes' | 'graph'

const SCM_VIEW_KEY = 'ivx.desktop.scmView'
const SCM_VIEWS = new Set<ScmView>(['branch', 'changes', 'graph'])

function readScmView(): ScmView {
  const raw = storedString(SCM_VIEW_KEY)

  return raw && SCM_VIEWS.has(raw as ScmView) ? (raw as ScmView) : 'changes'
}

/** Source Control tab: working-tree Changes, Branch tracking, or commit Graph. */
export const $scmView = atom<ScmView>(readScmView())

$scmView.subscribe(view => persistString(SCM_VIEW_KEY, view))

/** Repository the user picked in Source Control's Repositories list when the
 *  chat has several folders. Null follows the focused chat's folder. */
export const $scmRepo = atom<null | string>(null)

export function selectScmRepo(path: null | string): void {
  $scmRepo.set(path?.trim() || null)
}
