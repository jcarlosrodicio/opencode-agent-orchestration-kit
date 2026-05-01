import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { filterAllowedChildDirectories, homeWorkdirRoot, isAllowedWorkdir, isSelectableWorkdir, normalizeWorkdirPath, workdirScopeLabel } from './localWorkdirPolicy.server'

export interface WorkdirEntry {
  name: string
  path: string
}

export interface WorkdirBrowserView {
  root: string
  current: string
  parent: string | null
  selectable: boolean
  entries: WorkdirEntry[]
}

const hiddenNames = new Set(['.data', '.git', '.svelte-kit', 'node_modules'])

export async function browseWorkdirs(path?: string): Promise<WorkdirBrowserView> {
  const current = normalizeWorkdirPath(path)
  if (!isAllowedWorkdir(current)) throw new Error(`Workdir must be inside ${workdirScopeLabel()}`)

  const entries = filterAllowedChildDirectories(
    (await readdir(current, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !hiddenNames.has(entry.name))
      .map((entry) => ({ name: entry.name, path: resolve(current, entry.name) }))
  ).sort((left, right) => left.name.localeCompare(right.name))

  return {
    root: homeWorkdirRoot,
    current,
    parent: current === '/' ? null : dirname(current),
    selectable: isSelectableWorkdir(current),
    entries
  }
}
