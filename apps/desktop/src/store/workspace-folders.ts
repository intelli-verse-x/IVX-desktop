import { atom } from 'nanostores'

import { cleanPath } from '@/lib/path-compare'

const STORAGE_KEY = 'ivx.workspaceFolders.v1'

function readMap(): Record<string, string[]> {
  if (typeof localStorage === 'undefined') {
    return {}
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return parsed as Record<string, string[]>
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, string[]>): void {
  if (typeof localStorage === 'undefined') {
    return
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // The folder still shows for this session when storage is blocked.
  }
}

/** Extra folders the user added beside the open workspace. Keyed by that workspace path. */
export const $workspaceFolders = atom<Record<string, string[]>>(readMap())

export function workspaceFoldersFor(cwd: string): string[] {
  return $workspaceFolders.get()[cleanPath(cwd)] ?? []
}

export function addWorkspaceFolder(cwd: string, folder: string): void {
  const key = cleanPath(cwd)
  const next = cleanPath(folder)

  if (!key || !next || key === next) {
    return
  }

  const current = $workspaceFolders.get()[key] ?? []

  if (current.some(item => cleanPath(item) === next)) {
    return
  }

  const map = { ...$workspaceFolders.get(), [key]: [...current, folder] }

  $workspaceFolders.set(map)
  writeMap(map)
}
