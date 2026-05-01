import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface NativeOpenCodePaths {
  data: string
  config: string
}

let cachedPaths: Promise<NativeOpenCodePaths> | undefined

function parseDebugPaths(output: string): Partial<NativeOpenCodePaths> {
  const paths: Partial<NativeOpenCodePaths> = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\w+)\s+(.+)$/)
    if (!match) continue
    if (match[1] === 'data') paths.data = match[2]
    if (match[1] === 'config') paths.config = match[2]
  }
  return paths
}

async function resolveNativeOpenCodePaths(): Promise<NativeOpenCodePaths> {
  try {
    const { stdout } = await execFileAsync('opencode', ['debug', 'paths'])
    const parsed = parseDebugPaths(stdout)
    return {
      data: parsed.data ?? join(homedir(), '.local', 'share', 'opencode'),
      config: parsed.config ?? join(homedir(), '.config', 'opencode')
    }
  } catch {
    return {
      data: join(homedir(), '.local', 'share', 'opencode'),
      config: join(homedir(), '.config', 'opencode')
    }
  }
}

export function getNativeOpenCodePaths() {
  cachedPaths ??= resolveNativeOpenCodePaths()
  return cachedPaths
}

export function resetNativeOpenCodePathsCache() {
  cachedPaths = undefined
}
