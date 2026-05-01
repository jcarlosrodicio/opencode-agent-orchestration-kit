import { dirname, resolve, sep } from 'node:path'
import { homedir } from 'node:os'

export const homeWorkdirRoot = homedir()
export const volumesWorkdirRoot = '/Volumes'

const bridgeDirectories = new Set(['/', dirname(homeWorkdirRoot)])

function isInside(path: string, root: string) {
  return path === root || path.startsWith(`${root}${sep}`)
}

export function normalizeWorkdirPath(path?: string) {
  return resolve(path?.trim() || homeWorkdirRoot)
}

export function isAllowedWorkdir(path: string) {
  const current = resolve(path)
  return bridgeDirectories.has(current) || isInside(current, homeWorkdirRoot) || isInside(current, volumesWorkdirRoot)
}

export function isSelectableWorkdir(path: string) {
  const current = resolve(path)
  return isInside(current, homeWorkdirRoot) || isInside(current, volumesWorkdirRoot)
}

export function filterAllowedChildDirectories(entries: Array<{ name: string; path: string }>) {
  return entries.filter((entry) => isAllowedWorkdir(entry.path))
}

export function workdirScopeLabel() {
  return `${homeWorkdirRoot} or ${volumesWorkdirRoot}`
}
