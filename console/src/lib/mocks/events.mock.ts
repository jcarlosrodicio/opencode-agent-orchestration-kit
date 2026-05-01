import type { LogEventView } from '$lib/contexts/agent-sessions/read-models/agentSession'

export interface MockRunEvent {
  id: string
  runId: string
  type: 'agent_started' | 'agent_completed' | 'barrier_created' | 'approval_created' | 'metric_update' | 'log'
  agent: string
  stageId: string
  message: string
  timestamp: string
  tokens?: number
}

export const initialLogs: LogEventView[] = [
  { id: 'log_1', runId: 'run_92', timestamp: '10:21:03', agent: 'lead', stageId: 'lead', kind: 'log', message: 'Analyzing request and coordinating team…' },
  { id: 'log_2', runId: 'run_92', timestamp: '10:21:44', agent: 'lead', stageId: 'designer', kind: 'log', message: 'Delegating to designer because UI impact was detected.' },
  { id: 'log_3', runId: 'run_92', timestamp: '10:24:15', agent: 'designer', stageId: 'designer', kind: 'thinking', message: 'Wireframes and design system outlined.' },
  { id: 'log_4', runId: 'run_92', timestamp: '10:27:32', agent: 'researcher', stageId: 'researcher', kind: 'log', message: 'Research complete; findings documented.' },
  { id: 'log_5', runId: 'run_92', timestamp: '10:29:33', agent: 'specifier', stageId: 'specifier', kind: 'warning', message: 'Barrier: spec review required.' },
  { id: 'log_6', runId: 'run_92', timestamp: '10:31:05', agent: 'developer', stageId: 'developer', kind: 'log', message: 'Starting implementation.' }
]

export const mockRunEvents: MockRunEvent[] = [
  { id: 'evt_1', runId: 'run_92', type: 'log', agent: 'developer', stageId: 'developer', message: 'Writing auth endpoint tests…', timestamp: '10:31:41', tokens: 1200 },
  { id: 'evt_2', runId: 'run_92', type: 'log', agent: 'developer', stageId: 'developer', message: 'Implementing validation path…', timestamp: '10:32:05', tokens: 1600 },
  { id: 'evt_3', runId: 'run_92', type: 'metric_update', agent: 'developer', stageId: 'developer', message: 'Token and duration metrics updated.', timestamp: '10:32:22', tokens: 2200 },
  { id: 'evt_4', runId: 'run_92', type: 'approval_created', agent: 'lead', stageId: 'reviewer', message: 'Reviewer handoff will require diff confirmation.', timestamp: '10:33:10', tokens: 900 },
  { id: 'evt_5', runId: 'run_92', type: 'agent_completed', agent: 'developer', stageId: 'developer', message: 'Developer produced implementation summary.', timestamp: '10:34:30', tokens: 3000 }
]
