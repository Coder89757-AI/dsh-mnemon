import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/host/config.ts'
import { mainStrategyTypeId, withMainStrategy } from '../src/host/main-strategy.ts'

describe('the main Strategy id', () => {
  it('takes the profile plugin choice over the legacy topology id', () => {
    const legacy = resolveConfig({ memoryTopology: { strategyId: 'scoped' } })
    expect(mainStrategyTypeId(resolveConfig({}))).toBe('default-three-tier')
    expect(mainStrategyTypeId(legacy)).toBe('scoped')
    const chosen = withMainStrategy(legacy, { strategyTypeId: 'general' })
    expect(mainStrategyTypeId(chosen)).toBe('general')
    expect(chosen).toEqual({ ...legacy, memoryTopology: { ...legacy.memoryTopology, strategyId: 'general' } })
    expect(mainStrategyTypeId(legacy)).toBe('scoped')
  })

  it('returns the resolved config itself when the profile has no choice', () => {
    const config = resolveConfig({ memoryTopology: { strategyId: 'scoped' } })
    expect(withMainStrategy(config, {})).toBe(config)
  })
})
