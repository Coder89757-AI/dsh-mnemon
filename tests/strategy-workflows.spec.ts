import { describe, expect, it } from 'vitest'
import { COMPOSABLE_MEMORY_API_VERSION, MEMORY_STRATEGY_WORKFLOWS, type MemoryStrategyManifest } from '../src/core/contracts/index.ts'
import { defineMemoryStrategy } from '../src/sdk/index.ts'
import { runtimeCapacityWrite, strategyDrives, viewStrategy } from '../src/host/strategy-workflows.ts'

const manifest: MemoryStrategyManifest = {
  apiVersion: COMPOSABLE_MEMORY_API_VERSION, kind: 'strategy', typeId: 'personal-notes', packageName: 'personal-notes-strategy',
  deterministic: true, supportedSourceRoles: ['*'], maxSources: 4, maxRoutes: 4, maxActions: 4,
}
const define = (value: Partial<MemoryStrategyManifest> & Record<string, unknown>) => defineMemoryStrategy({
  manifest: { ...manifest, ...value } as MemoryStrategyManifest,
  compose: () => ({ strategyTypeId: manifest.typeId, sources: [], explanation: 'none' }),
})

describe('Strategy workflow declarations', () => {
  it('names the workflows a Host can run', () => {
    expect(MEMORY_STRATEGY_WORKFLOWS).toEqual(['idle-review', 'runtime-capacity'])
  })

  it('keeps what a Strategy declares, and nothing when it declares nothing', () => {
    expect(define({ workflows: ['runtime-capacity', 'idle-review'] }).manifest.workflows).toEqual(['runtime-capacity', 'idle-review'])
    expect(define({ workflows: [] }).manifest.workflows).toEqual([])
    expect('workflows' in define({}).manifest).toBe(false)
  })

  it('rejects a malformed or repeated workflow id but loads one this Core does not know', () => {
    expect(() => define({ workflows: ['Idle Review'] as never })).toThrow(/memory Strategy workflow/)
    expect(() => define({ workflows: 'idle-review' as never })).toThrow(/workflows must be a list/)
    expect(() => define({ workflows: ['idle-review', 'idle-review'] })).toThrow(/duplicated: idle-review/)
    // A newer Strategy may declare work a later Host runs; this one ignores it instead of refusing the Strategy.
    const newer = define({ workflows: ['idle-review', 'nightly-digest'] as never })
    expect(newer.manifest.workflows).toEqual(['idle-review', 'nightly-digest'])
    expect(strategyDrives(newer.manifest, 'idle-review')).toBe(true)
    expect(strategyDrives(newer.manifest, 'runtime-capacity')).toBe(false)
  })
})

describe('the workflows the Host runs for a Strategy', () => {
  it('follows the declaration, for the Layered strategy too', () => {
    expect(strategyDrives({ typeId: 'personal-notes', workflows: ['idle-review'] }, 'idle-review')).toBe(true)
    expect(strategyDrives({ typeId: 'personal-notes', workflows: ['idle-review'] }, 'runtime-capacity')).toBe(false)
    expect(strategyDrives({ typeId: 'default-three-tier', workflows: ['runtime-capacity'] }, 'idle-review')).toBe(false)
    expect(strategyDrives({ typeId: 'default-three-tier', workflows: [] }, 'runtime-capacity')).toBe(false)
  })

  it('reads an undeclared Layered strategy, as a copy before 0.5.10 is, as driving both', () => {
    for (const workflow of MEMORY_STRATEGY_WORKFLOWS) {
      expect(strategyDrives({ typeId: 'default-three-tier' }, workflow)).toBe(true)
      expect(strategyDrives({ typeId: 'personal-notes' }, workflow)).toBe(false)
    }
  })

  it('takes over only the Runtime Source mutate Action for capacity maintenance', () => {
    const strategy = { typeId: 'personal-notes', workflows: ['runtime-capacity' as const] }
    expect(runtimeCapacityWrite(strategy, 'runtime', 'mutate')).toBe(true)
    expect(runtimeCapacityWrite(strategy, 'runtime', 'import')).toBe(false)
    expect(runtimeCapacityWrite(strategy, 'documents', 'mutate')).toBe(false)
    expect(runtimeCapacityWrite({ typeId: 'personal-notes' }, 'runtime', 'mutate')).toBe(false)
  })

  it('reads the Strategy that composed a View from the generation holding its definition', () => {
    const view = { strategyInstanceKey: 'strategy:notes', strategyTypeId: 'personal-notes' }
    const declared = { ...manifest, workflows: ['idle-review' as const] }
    expect(viewStrategy({ strategy: { instanceKey: 'strategy:notes', definition: { manifest: declared } } }, view)).toBe(declared)
    // Without that definition at hand, the View's own type id is all there is to go by.
    expect(viewStrategy({ strategy: { instanceKey: 'strategy:other', definition: { manifest: declared } } }, view)).toEqual({ typeId: 'personal-notes' })
    expect(viewStrategy(undefined, view)).toEqual({ typeId: 'personal-notes' })
  })
})
