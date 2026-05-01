import type { ConfigPresetView, SkillView, ToolHealthView } from '$lib/contexts/presets-configuration/read-models/configuration'

export const skills: SkillView[] = [
  { id: 'open-design', label: 'open-design', source: 'local', status: 'active', description: 'Editable visual projects and design handoffs through OPEN_DESIGN_URL.' },
  { id: 'superpowers', label: 'superpowers', source: 'plugin', status: 'active', description: 'Workflow discipline plugin referenced from opencode.json.' },
  { id: 'impeccable', label: 'impeccable', source: 'optional', status: 'available', description: 'Optional design context skill when PRODUCT.md or DESIGN.md is missing.' }
]

export const tools: ToolHealthView[] = [
  { id: 'filesystem', label: 'filesystem', status: 'active', description: 'Read/list/edit permissions from OpenCode config.' },
  { id: 'git', label: 'git', status: 'active', description: 'Status and diff commands available to agents.' },
  { id: 'http', label: 'http', status: 'active', description: 'Web fetch/search gated by permissions.' },
  { id: 'open-design', label: 'open-design', status: 'active', description: 'Open Design tool surface configured by OPEN_DESIGN_URL.' },
  { id: 'mcp-registry', label: 'MCP registry', status: 'degraded', description: 'Mock metadata only in this frontend-first slice.' }
]

export const presets: ConfigPresetView[] = [
  {
    id: 'preset_feature',
    name: 'Feature Flow',
    workflowId: 'feature',
    promptTemplate: 'Build a feature with design/research/spec/dev/review barriers.',
    modelOverrides: { lead: 'OPENCODE_LEAD_MODEL', developer: 'OPENCODE_DEVELOPER_MODEL' },
    skills: ['superpowers'],
    tools: ['filesystem', 'git', 'http'],
    updatedAt: '2026-05-01T08:00:00.000Z'
  },
  {
    id: 'preset_design',
    name: 'Open Design Handoff',
    workflowId: 'design',
    promptTemplate: 'Create an editable Open Design project and developer handoff.',
    modelOverrides: { designer: 'OPENCODE_DESIGNER_MODEL' },
    skills: ['open-design', 'impeccable'],
    tools: ['open-design'],
    updatedAt: '2026-04-30T17:00:00.000Z'
  }
]
