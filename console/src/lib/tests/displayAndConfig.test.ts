import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { getAgentModelOptions, parseModelList, providerFromModel } from '$lib/contexts/launch/adapters/localModelCatalog.server'
import { filterAllowedChildDirectories, homeWorkdirRoot, isAllowedWorkdir, isSelectableWorkdir, volumesWorkdirRoot } from '$lib/contexts/launch/adapters/localWorkdirPolicy.server'
import { colorForTone, runStatusTone, validationTone, workflowDisplayLabel } from '$lib/utils/runDisplay'

describe('run display helpers', () => {
  it('formats workflow labels without slash prefixes', () => {
    expect(workflowDisplayLabel('direct')).toBe('Direct message')
    expect(workflowDisplayLabel('native')).toBe('OpenCode CLI')
    expect(workflowDisplayLabel('feature')).toBe('Feature')
    expect(workflowDisplayLabel('mvp-spec')).toBe('Mvp spec')
  })

  it('keeps completed and stopped visually distinct', () => {
    expect(runStatusTone('completed')).toBe('success')
    expect(runStatusTone('stopped')).toBe('neutral')
    expect(colorForTone(runStatusTone('completed'))).not.toBe(colorForTone(runStatusTone('stopped')))
    expect(validationTone('not-run')).toBe('neutral')
  })
})

describe('local model catalog', () => {
  it('parses OpenCode model output', () => {
    expect(parseModelList('\nopenai/gpt-5.4\nopenai/gpt-5.5\n')).toEqual(['openai/gpt-5.4', 'openai/gpt-5.5'])
  })

  it('derives the provider from a resolved env model', () => {
    expect(providerFromModel('openai/gpt-5.5')).toBe('openai')
  })

  it('resolves agent model values from env and lists provider models once', async () => {
    const listModels = vi.fn(async () => ['openai/gpt-5.4', 'openai/gpt-5.5'])
    const result = await getAgentModelOptions(['lead', 'developer'], listModels, {
      OPENCODE_MODEL: 'openai/gpt-5.4',
      OPENCODE_LEAD_MODEL: 'openai/gpt-5.5',
      OPENCODE_DEVELOPER_MODEL: 'openai/gpt-5.4'
    })

    expect(result).toMatchObject([
      { agent: 'lead', modelEnv: 'OPENCODE_LEAD_MODEL', selected: 'openai/gpt-5.5' },
      { agent: 'developer', modelEnv: 'OPENCODE_DEVELOPER_MODEL', selected: 'openai/gpt-5.4' }
    ])
    expect(result[0].models).toContain('openai/gpt-5.5')
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(listModels).toHaveBeenCalledWith('openai')
  })
})

describe('local workdir policy', () => {
  it('allows home and volumes workdirs while rejecting unrelated system paths', () => {
    expect(homeWorkdirRoot).toBe(homedir())
    expect(isSelectableWorkdir(join(homeWorkdirRoot, 'Desarrollo'))).toBe(true)
    expect(isSelectableWorkdir(join(volumesWorkdirRoot, 'ExternalDisk'))).toBe(true)
    expect(isAllowedWorkdir('/')).toBe(true)
    expect(isSelectableWorkdir('/tmp')).toBe(false)
    expect(isAllowedWorkdir('/tmp')).toBe(false)
  })

  it('filters browser children to the allowed scope', () => {
    expect(
      filterAllowedChildDirectories([
        { name: 'juanca', path: homeWorkdirRoot },
        { name: 'Volumes', path: volumesWorkdirRoot },
        { name: 'tmp', path: '/tmp' }
      ])
    ).toEqual([
      { name: 'juanca', path: homeWorkdirRoot },
      { name: 'Volumes', path: volumesWorkdirRoot }
    ])
  })
})
