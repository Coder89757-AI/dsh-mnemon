import type { ResolvedConfig } from './protocol.ts'
import type { MemoryViewPreferences } from './view-protocol.ts'

// The main Strategy has two stored names: `memoryTopology.strategyId` in the
// legacy topology config, and `memoryView.strategyTypeId`, the profile's plugin
// choice, which wins. The Host applies the choice once, with withMainStrategy,
// and reads the result only through mainStrategyTypeId.

/** The resolved config with the profile's main Strategy choice applied; without a choice the topology's id stays. */
export function withMainStrategy(config: ResolvedConfig, view: Pick<MemoryViewPreferences, 'strategyTypeId'>): ResolvedConfig {
  const selected = view.strategyTypeId
  return selected === undefined ? config : { ...config, memoryTopology: { ...config.memoryTopology, strategyId: selected } }
}

/** The type id of the main Strategy the Host composes the View with. */
export function mainStrategyTypeId(config: Pick<ResolvedConfig, 'memoryTopology'>): string {
  return config.memoryTopology.strategyId
}
