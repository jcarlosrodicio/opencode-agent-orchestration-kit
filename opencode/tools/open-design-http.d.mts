export type OpenDesignHttpOptions = {
  fetchImpl?: typeof fetch
  connectTimeoutMs?: number
  totalTimeoutMs?: number
  idleTimeoutMs?: number
  maxJsonBytes?: number
  maxSseBytes?: number
  maxOutputBytes?: number
  maxEvents?: number
  maxDiagnosticBytes?: number
}

export const OPEN_DESIGN_HTTP_LIMITS: Readonly<{
  connectTimeoutMs: number
  totalTimeoutMs: number
  idleTimeoutMs: number
  maxJsonBytes: number
  maxSseBytes: number
  maxOutputBytes: number
  maxEvents: number
  maxDiagnosticBytes: number
}>

export function requestJson(
  base: string,
  path: string,
  init?: RequestInit,
  options?: OpenDesignHttpOptions,
): Promise<unknown>

export function parseSseFrames(buffer: string): {
  frames: Array<{ event: string; data: unknown }>
  rest: string
}

export function streamOpenDesignChat(
  base: string,
  body: unknown,
  options?: OpenDesignHttpOptions,
): Promise<{
  stdout: string
  stderr: string
  end: unknown
  eventsCount: number
}>
