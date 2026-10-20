import type { Context } from '@deepseek-ai/cordis'
import { defineMemoryStrategy, installMemory } from 'dsh-mnemon/extension-sdk'
import { ANY_MEMORY_SOURCE_ROLE, COMPOSABLE_MEMORY_API_VERSION } from 'dsh-mnemon/contracts'

/** A Strategy that admits every available Source, so a test sees what a View would take. */
export const strategy = {
  inject: ['mnemonMemory'],
  apply(ctx: Context) {
    installMemory(ctx, { strategies: [defineMemoryStrategy({
      manifest: { apiVersion: COMPOSABLE_MEMORY_API_VERSION, kind: 'strategy', typeId: 'test',
        packageName: 'test-strategy', deterministic: true, supportedSourceRoles: [ANY_MEMORY_SOURCE_ROLE],
        maxSources: 4, maxRoutes: 4, maxActions: 4 },
      compose: (_request, sources) => ({ strategyTypeId: 'test', explanation: 'Test only.',
        sources: sources.filter(source => source.availability !== 'unavailable').map(source => ({ sourceInstanceKey: source.sourceInstanceKey,
          routeIds: source.routeIds, actionIds: source.actionIds })) }),
    })] })
  },
}
