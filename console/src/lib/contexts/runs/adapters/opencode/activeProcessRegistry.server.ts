import type { ChildProcess } from 'node:child_process'

const processes = new Map<string, ChildProcess>()

export const activeProcessRegistry = {
  set(runId: string, process: ChildProcess) {
    processes.set(runId, process)
  },
  get(runId: string) {
    return processes.get(runId)
  },
  delete(runId: string) {
    processes.delete(runId)
  },
  ids() {
    return new Set(processes.keys())
  }
}
