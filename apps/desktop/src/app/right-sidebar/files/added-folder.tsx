import { useState } from 'react'

import { cleanPath } from '@/lib/path-compare'

import { readProjectDir } from './ipc'
import type { TreeNode } from './use-project-tree'

function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean)

  return parts[parts.length - 1] || path
}

function inside(root: string, path: string): boolean {
  const parent = cleanPath(root)
  const child = cleanPath(path)

  return child === parent || child.startsWith(`${parent}/`)
}

function setChildren(node: TreeNode, id: string, children: TreeNode[]): TreeNode {
  if (cleanPath(node.id) === cleanPath(id)) {
    return { ...node, children }
  }

  if (!node.children?.length) {
    return node
  }

  return { ...node, children: node.children.map(child => setChildren(child, id, children)) }
}

/** One file list. Added folders are roots in the same tree as the open folder. */
export function useWorkspaceRoots(
  cwd: string,
  contents: TreeNode[],
  extras: string[],
  onLoadChildren: (id: string) => void | Promise<void>,
  onNodeOpenChange: (id: string, open: boolean) => void,
  openState: Record<string, boolean>
) {
  const [extraNodes, setExtraNodes] = useState<Record<string, TreeNode>>({})
  const [extraOpen, setExtraOpen] = useState<Record<string, boolean>>({})
  const multi = extras.length > 0

  const data = multi
    ? [
        { children: contents, id: cwd, isDirectory: true, name: folderName(cwd) },
        ...extras.map(
          folder => extraNodes[cleanPath(folder)] ?? { id: folder, isDirectory: true, name: folderName(folder) }
        )
      ]
    : contents

  const loadChildren = async (id: string) => {
    const root = extras.find(folder => inside(folder, id))

    if (!root) {
      await onLoadChildren(id)

      return
    }

    const key = cleanPath(root)

    try {
      const result = await readProjectDir(id, root)
      const children = (result.entries ?? []).map(entry => ({
        id: entry.path,
        isDirectory: entry.isDirectory,
        name: entry.name
      }))

      setExtraNodes(current => {
        const node = current[key] ?? { id: root, isDirectory: true, name: folderName(root) }

        return { ...current, [key]: setChildren(node, id, children) }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'read-error'

      setExtraNodes(current => {
        const node = current[key] ?? { id: root, isDirectory: true, name: folderName(root) }

        return {
          ...current,
          [key]: setChildren(node, id, [{ id: `${id}::error`, isDirectory: false, name: message, placeholder: 'error' }])
        }
      })
    }
  }

  return {
    data,
    loadChildren,
    openState: multi ? { ...openState, [cwd]: true, ...extraOpen } : openState,
    setOpen: (id: string, open: boolean) => {
      if (extras.some(folder => inside(folder, id))) {
        setExtraOpen(current => ({ ...current, [id]: open }))
      } else {
        onNodeOpenChange(id, open)
      }
    }
  }
}
