import { useEffect, useMemo, useState } from 'react'
import type { JsonValue, MemorySourceManagementCatalog, MemorySourceManagementInstance } from '../host/protocol.ts'
import type { MnemonClient } from './api.ts'
import type { MnemonSourceManagementClient } from './dsh-context.ts'
import { message } from './page-kit.tsx'
import type { MemorySourcePageEntry } from './source-pages.tsx'

function bindSourceManagementClient(client: MnemonClient, instance: MemorySourceManagementInstance, taskClient: MnemonClient): MnemonSourceManagementClient {
  return {
    sourceInstanceKey: instance.sourceInstanceKey,
    revision: instance.revision,
    ...(instance.assistance === undefined || instance.assistance.length === 0 ? {} : { assistance: {
      operations: instance.assistance,
      execute: (operation: string, input: JsonValue, options: { expectedRevision: string; confirmed: boolean }) => {
        // These clean task-Agent workflows follow the inspected Sidebar root;
        // normal Source edits keep their existing session-aware write path.
        const task = ['agent-search', 'supervise', 'body-create', 'body-metadata-maintain'].includes(operation)
        return (task ? taskClient : client).assistSource(instance.sourceInstanceKey, operation, input, options.expectedRevision, options.confirmed)
      },
    } }),
    read: (operation, input = null) => client.readSourceManagement(instance.sourceInstanceKey, operation, input),
    mutate: (operation, input, options) => client.mutateSourceManagement(
      instance.sourceInstanceKey,
      operation,
      input,
      options.expectedRevision ?? instance.revision,
      options.confirmed,
    ),
  }
}

/**
 * The Source instances that run in one view context, read again whenever `revision` moves: a management client
 * bound to each, the registered pages whose Source runs, and the Source types the descriptor-driven management
 * page shows, those without a page of their own or with configuration fields.
 */
export function useSourceCatalog(client: MnemonClient, taskClient: MnemonClient, revision: number, viewContextKey: string, sourcePageEntries: readonly MemorySourcePageEntry[]): {
  sourceCatalogState: { contextKey: string; value: MemorySourceManagementCatalog | null; error: string | null }
  sourceCatalog: MemorySourceManagementCatalog | null
  sourceInstances: MemorySourceManagementInstance[]
  sourceManagementClients: Map<string, MnemonSourceManagementClient>
  visibleSourcePages: MemorySourcePageEntry[]
  managedSourceTypes: [string, MemorySourceManagementInstance[]][]
} {
  const [sourceCatalogState, setSourceCatalogState] = useState<{ contextKey: string; value: MemorySourceManagementCatalog | null; error: string | null }>(() => ({ contextKey: viewContextKey, value: null, error: null }))

  useEffect(() => {
    let active = true
    void client.sourceManagementCatalog().then(value => {
      if (active) setSourceCatalogState({ contextKey: viewContextKey, value, error: null })
    }).catch(reason => {
      if (active) setSourceCatalogState({ contextKey: viewContextKey, value: null, error: message(reason) })
    })
    return () => { active = false }
  }, [client, revision, viewContextKey])

  const sourceCatalog = sourceCatalogState.contextKey === viewContextKey ? sourceCatalogState.value : null
  const sourceInstances = sourceCatalog?.sources ?? []
  const sourceManagementClients = useMemo(() => new Map(sourceInstances
    .map(source => [source.sourceInstanceKey, bindSourceManagementClient(client, source, taskClient)])), [client, sourceInstances, taskClient])
  const visibleSourcePages = useMemo(() => {
    const visibleTypes = new Set(sourceInstances.map(source => source.sourceTypeId))
    return sourcePageEntries.filter(entry => visibleTypes.has(entry.sourceTypeId))
  }, [sourceInstances, sourcePageEntries])
  const managedSourceTypes = useMemo(() => {
    const byType = new Map<string, MemorySourceManagementInstance[]>()
    for (const source of sourceInstances) {
      if (sourcePageEntries.some(entry => entry.sourceTypeId === source.sourceTypeId) && (source.management.fields?.length ?? 0) === 0) continue
      const current = byType.get(source.sourceTypeId)
      if (current === undefined) byType.set(source.sourceTypeId, [source])
      else current.push(source)
    }
    return [...byType.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [sourceInstances, sourcePageEntries])
  return { sourceCatalogState, sourceCatalog, sourceInstances, sourceManagementClients, visibleSourcePages, managedSourceTypes }
}
