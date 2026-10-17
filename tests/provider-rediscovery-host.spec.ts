import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineMemorySpaceProvider, MEMORY_SPACE_PROVIDER_API_VERSION, NORMALIZED_RELEVANCE_SCORE } from 'dsh-mnemon-source-memory-spaces/provider-sdk'
import type { MemorySpaceCatalog } from 'dsh-mnemon-source-memory-spaces/contracts'
import { resolveConfig, type ResolvedConfig } from '../src/host/config.ts'
import { LiveMnemonRuntime, PROVIDER_REDISCOVERY_TIMING, type MnemonRuntimeGraph } from '../src/host/runtime.ts'
import type { MemoryRuntime } from '../src/core/runtime.ts'
import { compositionFixture } from './fixtures/composition.ts'

const TIMING = { ...PROVIDER_REDISCOVERY_TIMING }
afterEach(() => { Object.assign(PROVIDER_REDISCOVERY_TIMING, TIMING) })

/** A runtime graph that only records what the Host asks its Memory Spaces Source to do. */
function graph(directory: string, config: ResolvedConfig = resolveConfig({})) {
  const calls: Array<{ operation: string; input: unknown; signal: AbortSignal | undefined }> = []
  let answer: () => Promise<unknown> = async () => ({ trigger: 'startup', results: [] })
  const value = {
    config, directory,
    source: (typeId: string) => ({
      mutate: (operation: string, input: unknown, signal?: AbortSignal) => {
        calls.push({ operation: `${typeId}/${operation}`, input, signal })
        return answer()
      },
    }),
    retire: vi.fn(), dispose: vi.fn(),
  } as unknown as MnemonRuntimeGraph
  return { value, calls, answerWith: (next: () => Promise<unknown>) => { answer = next } }
}

const directory = () => join(tmpdir(), 'mnemon-rediscovery-' + randomUUID())
const live = (initial: MnemonRuntimeGraph) => new LiveMnemonRuntime(initial, undefined, undefined, {} as MemoryRuntime)
/** The default configuration with the Memory Spaces layer changed. */
const spaces = (layer: Record<string, unknown>): ResolvedConfig => {
  const config = resolveConfig({})
  const layers = config.memoryTopology.layers
  const current = layers['memory-spaces']!
  return { ...config, memoryTopology: { ...config.memoryTopology, layers: { ...layers, 'memory-spaces': { ...current, ...layer, participation: { ...current.participation, ...(layer.participation as object | undefined) } } } } }
}

describe('Provider namespaces asked for again when the Host starts serving (#373)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('asks once per data directory, a little after a runtime starts serving it', async () => {
    const shared = directory()
    const first = graph(shared)
    const runtime = live(first.value)
    try {
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs - 1)
      expect(first.calls).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(first.calls).toEqual([{ operation: 'memory-spaces/provider-rediscover', input: { trigger: 'startup' }, signal: expect.any(AbortSignal) }])

      // Settings saved for the same directory: it was asked already.
      const same = graph(shared)
      runtime.swap(same.value)
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(same.calls).toEqual([])
      // Another directory is asked in its turn.
      const other = graph(directory())
      runtime.swap(other.value)
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(other.calls).toHaveLength(1)
    } finally { runtime.dispose() }
  })

  it('asks nothing for a read-only runtime, or a Memory Spaces layer that is off or not maintained automatically', async () => {
    const readOnly = graph(directory(), resolveConfig({ writeEnabled: false }))
    const off = graph(directory(), spaces({ enabled: false }))
    const manual = graph(directory(), spaces({ participation: { maintenance: 'manual' } }))
    const noMaintenance = graph(directory(), spaces({ participation: { maintenance: 'off' } }))
    const runtimes = [readOnly, off, manual, noMaintenance].map(item => live(item.value))
    try {
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs * 2)
      for (const item of [readOnly, off, manual, noMaintenance]) expect(item.calls).toEqual([])
    } finally { for (const runtime of runtimes) runtime.dispose() }
  })

  it('leaves a pass cut short by a replaced runtime to the runtime that replaced it', async () => {
    const shared = directory()
    const first = graph(shared)
    first.answerWith(() => new Promise(() => {}))
    const runtime = live(first.value)
    try {
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(first.calls).toHaveLength(1)
      const next = graph(shared)
      runtime.swap(next.value)
      expect(first.calls[0]!.signal?.aborted).toBe(true)
      expect(first.value.retire).toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(next.calls).toHaveLength(1)
    } finally { runtime.dispose() }
  })

  it('tries again a little later when the Source cannot be reached yet, then counts the directory as asked', async () => {
    const shared = directory()
    const first = graph(shared)
    let tries = 0
    first.answerWith(async () => {
      tries += 1
      if (tries === 1) throw new Error('no memory composition generation is serving yet')
      return { trigger: 'startup', results: [] }
    })
    const runtime = live(first.value)
    try {
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(first.calls).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.retryDelayMs - 1)
      expect(first.calls).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(first.calls).toHaveLength(2)
      // Asked: a runtime built for new settings does not ask again.
      const next = graph(shared)
      runtime.swap(next.value)
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs + PROVIDER_REDISCOVERY_TIMING.retryDelayMs * 3)
      expect(next.calls).toEqual([])
    } finally { runtime.dispose() }
  })

  it('stops after its tries and leaves the directory to a later runtime', async () => {
    const shared = directory()
    const first = graph(shared)
    first.answerWith(async () => { throw new Error('memory Source management revision conflict: expected a, current b') })
    const runtime = live(first.value)
    try {
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs + PROVIDER_REDISCOVERY_TIMING.retryDelayMs * (PROVIDER_REDISCOVERY_TIMING.attempts + 2))
      expect(first.calls).toHaveLength(PROVIDER_REDISCOVERY_TIMING.attempts)
      const next = graph(shared)
      runtime.swap(next.value)
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(next.calls).toHaveLength(1)
    } finally { runtime.dispose() }
  })

  it('stops waiting when the runtime goes away, and takes a Source that cannot do it at its word', async () => {
    const waiting = graph(directory())
    const stopped = live(waiting.value)
    stopped.dispose()
    await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs * 2)
    expect(waiting.calls).toEqual([])

    const older = graph(directory())
    older.answerWith(async () => { throw new Error('unsupported Memory Spaces management mutation operation: provider-rediscover') })
    const runtime = live(older.value)
    try {
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs + PROVIDER_REDISCOVERY_TIMING.retryDelayMs * 3)
      expect(older.calls).toHaveLength(1)
      // Asked once, and not again for that directory in this process.
      runtime.swap(graph(older.value.directory).value)
      await vi.advanceTimersByTimeAsync(PROVIDER_REDISCOVERY_TIMING.delayMs)
      expect(older.calls).toHaveLength(1)
    } finally { runtime.dispose() }
  })
})

describe('The start-up pass on a real composition (#373)', () => {
  const capabilities = { search: true, browse: true, graph: false, entities: false, related: false, remember: true, link: false, forget: false, writeMode: 'exact', deletionMode: 'unsupported' } as const

  /** A Provider whose namespaces grow on its side, as when someone creates a bank there. */
  function upstream(namespaces: Array<{ externalId: string; name: string }>) {
    return defineMemorySpaceProvider<undefined>({ id: 'banks', apply(ctx, host) {
      host.install(ctx, {
        manifest: { apiVersion: MEMORY_SPACE_PROVIDER_API_VERSION, kind: 'provider', typeId: 'banks',
          packageName: 'dsh-mnemon-provider-banks-host-test', version: '1.0.0', label: 'Banks', summary: 'Simulated Provider; real Host and Source.',
          origin: 'third-party', locality: 'remote', workspaceBinding: 'provider-global', fields: [], secrets: [], scoreSemantics: 'normalized-relevance',
          capabilities,
        },
        create: () => ({ id: 'banks', scoreSemantics: NORMALIZED_RELEVANCE_SCORE,
          discover: async () => namespaces.map(namespace => ({ ...namespace, description: 'An upstream bank.', connection: {} })),
          status: async () => ({ healthy: true }), list: async () => [], search: async () => ({ results: [] }),
          graph: async () => ({ nodes: [], edges: [], generatedAt: new Date().toISOString() }), remember: async () => ({ action: 'stored' }),
        }),
      })
    } })
  }

  it('mounts a namespace created on the Provider side while the Host was stopped, inactive', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'mnemon-rediscovery-host-'))
    const namespaces = [{ externalId: 'alice', name: 'Alice' }]
    const providers = () => [{ instanceId: 'banks', module: upstream(namespaces), config: undefined }]
    try {
      // The Host as it ran before: the settings are saved, and it stops before it would ask.
      PROVIDER_REDISCOVERY_TIMING.delayMs = 60_000
      const before = await compositionFixture({ dataDir }, { providers: providers() })
      try {
        await before.graph.source('memory-spaces').mutate('provider-service-update', { providerId: 'banks', settings: {}, enabled: true })
      } finally { await before.dispose() }

      // Created on the Provider side meanwhile; the Host starts again.
      namespaces.push({ externalId: 'research', name: 'Research' })
      PROVIDER_REDISCOVERY_TIMING.delayMs = 50
      PROVIDER_REDISCOVERY_TIMING.retryDelayMs = 200
      const after = await compositionFixture({ dataDir }, { providers: providers() })
      try {
        const source = after.graph.source('memory-spaces')
        await vi.waitFor(async () => {
          const catalog = await source.read<MemorySpaceCatalog>('body-directory')
          expect(catalog.items.map(item => [item.name, item.active])).toEqual([['Alice', true], ['Research', false]])
          expect(catalog.rediscovery).toMatchObject({ running: false, last: { trigger: 'startup', results: [{ providerId: 'banks', found: 2, added: [{ name: 'Research' }] }] } })
        }, { timeout: 10_000, interval: 100 })
      } finally { await after.dispose() }
    } finally { rmSync(dataDir, { recursive: true, force: true }) }
  }, 30_000)
})
