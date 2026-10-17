import type { ResolvedConfig } from './config.ts'
import type { MemoryViewPreferences } from './view-protocol.ts'

// The main Strategy has two stored names: `memoryTopology.strategyId` in the
// legacy topology config, and `memoryView.strategyTypeId`, the profile's plugin
// choice, which wins. Plugin management applies the choice with
// withMainStrategy wherever the Host resolves its config (the runtime graph and
// each View request), and the Host reads the result through mainStrategyTypeId
// to compose, to decide on idle review and for the View dashboard.

/** The resolved config with the profile's main Strategy choice applied; without a choice the topology's id stays. */
export function withMainStrategy(config: ResolvedConfig, view: Pick<MemoryViewPreferences, 'strategyTypeId'>): ResolvedConfig {
  const selected = view.strategyTypeId
  return selected === undefined ? config : { ...config, memoryTopology: { ...config.memoryTopology, strategyId: selected } }
}

/** The type id of the main Strategy the Host composes the View with. */
export function mainStrategyTypeId(config: Pick<ResolvedConfig, 'memoryTopology'>): string {
  return config.memoryTopology.strategyId
}
