// @vitest-environment jsdom
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryCompositionRunner } from 'dsh-mnemon/testing'
import { descriptor, strategy } from './fixture.ts'

// Load the installed Core's actual DSH browser artifact; no repository source alias.
vi.mock('dsh-mnemon/client', async () => {
  const { createRequire } = await import('node:module')
  const { loadMemoryClientArtifact } = await import('dsh-mnemon/testing')
  return loadMemoryClientArtifact(createRequire(import.meta.url).resolve('dsh-mnemon/client'), {
    react: await vi.importActual('react'),
    'react/jsx-runtime': await vi.importActual('react/jsx-runtime'),
    'react-dom': await vi.importActual('react-dom'),
    '@deepseek-ai/dsh-client-ui-primitives': await vi.importActual('@deepseek-ai/dsh-client-ui-primitives'),
  })
})

import type { Context } from '@deepseek-ai/cordis'
import { installMemorySpaces } from '../src/index.ts'
import { defineMemorySpaceProvider, MEMORY_SPACE_PROVIDER_API_VERSION, NORMALIZED_RELEVANCE_SCORE } from '../src/provider-sdk.ts'
import { MemorySpacesSourcePage } from '../src/client.ts'

const directories: string[] = []
afterEach(() => {
  cleanup()
  globalThis.localStorage?.clear()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

type Namespace = { externalId: string; name: string }
/** How the simulated Provider answers: as listed, with an error, or once the test lets it. */
type Upstream = { error?: string; hold?: Promise<void> }

/** A Provider whose namespaces the test grows, as someone working on the Provider side would. */
function upstream(namespaces: Namespace[], behaviour: Upstream) {
  return defineMemorySpaceProvider<undefined>({ id: 'banks', apply(ctx, host) {
    host.install(ctx, {
      manifest: { apiVersion: MEMORY_SPACE_PROVIDER_API_VERSION, kind: 'provider', typeId: 'banks',
        packageName: 'dsh-mnemon-provider-banks-test', version: '1.0.0', label: 'Banks', summary: 'Simulated Provider; real Source.',
        origin: 'third-party', locality: 'remote', workspaceBinding: 'provider-global', fields: [], secrets: [], scoreSemantics: 'normalized-relevance',
        capabilities: descriptor.capabilities,
      },
      create: () => ({ id: 'banks', scoreSemantics: NORMALIZED_RELEVANCE_SCORE,
        discover: async () => {
          if (behaviour.hold !== undefined) await behaviour.hold
          if (behaviour.error !== undefined) throw new Error(behaviour.error)
          return namespaces.map(namespace => ({ ...namespace, description: 'An upstream bank.', connection: {} }))
        },
        status: async () => ({ healthy: true }), list: async () => [], search: async () => ({ results: [] }),
        graph: async () => ({ nodes: [], edges: [], generatedAt: new Date().toISOString() }), remember: async () => ({ action: 'stored' }),
      }),
    })
  } })
}

async function mounted(namespaces: Namespace[], behaviour: Upstream = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'mnemon-rediscovery-page-'))
  directories.push(directory)
  const runner = new MemoryCompositionRunner()
  await runner.mount(strategy, { instanceId: 'strategy' })
  await runner.mount({ inject: ['mnemonMemory'], async apply(ctx: Context) {
    await installMemorySpaces(ctx, [{ instanceId: 'banks', module: upstream(namespaces, behaviour), config: undefined }], { config: { dataDir: directory } })
  } }, { instanceId: 'spaces' })
  const management = await runner.managementClient('source:spaces')
  await management.mutate('provider-service-update', { providerId: 'banks', settings: {}, enabled: true }, { confirmed: true })
  return { runner, management }
}

const page = (management: Awaited<ReturnType<typeof mounted>>['management'], writable = true) =>
  render(<MemorySpacesSourcePage page="spaces" sourceTypeId="memory-spaces" sourceInstanceKey="source:spaces" sourceInstances={[]} locale="en" writable={writable} management={management} />)
/**
 * Each test renders the whole page. On a shared CI runner that installs every plugin on its own, one
 * such test has taken 5.5 seconds where it takes 0.3 s locally; the default 5 s limit is too tight.
 */
const PAGE_TEST_TIMEOUT_MS = 15_000
/** One card of the space directory, by the name it shows. */
const card = (name: string) => [...document.querySelectorAll('article')].find(article => article.querySelector('strong')?.textContent === name)
const shown = async (name: string, timeout?: number) => { await waitFor(() => expect(card(name)).toBeTruthy(), timeout === undefined ? undefined : { timeout }); return card(name)! }

describe('Rediscover on the Memory Spaces page (#373)', () => {
  it('asks the Providers again, and says what it found until the news is dismissed', async () => {
    const namespaces = [{ externalId: 'alice', name: 'Alice' }]
    const { runner, management } = await mounted(namespaces)
    try {
      page(management)
      await shown('Alice')
      // Created on the Provider side after its settings were saved.
      namespaces.push({ externalId: 'research', name: 'Research' })
      fireEvent.click(screen.getByRole('button', { name: 'Rediscover' }))
      expect(await screen.findByText('New spaces found: 1. They join recall once you switch them on.')).toBeTruthy()
      await waitFor(async () => expect(within(await shown('Research')).getByText('New')).toBeTruthy())
      expect(within(card('Research')!).getByRole('switch').getAttribute('aria-checked')).toBe('false')
      expect(within(card('Alice')!).queryByText('New')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByText(/New spaces found/u)).toBeNull()
      expect(within(card('Research')!).queryByText('New')).toBeNull()
      // Asked again with nothing new, the page still answers.
      fireEvent.click(screen.getByRole('button', { name: 'Rediscover' }))
      expect(await screen.findByText('No new spaces.')).toBeTruthy()
    } finally {
      await runner.dispose()
    }
  }, PAGE_TEST_TIMEOUT_MS)

  it('shows what a pass the page did not start found, and why a Provider could not finish', async () => {
    const behaviour: Upstream = {}
    const namespaces = [{ externalId: 'alice', name: 'Alice' }]
    const { runner, management } = await mounted(namespaces, behaviour)
    try {
      behaviour.error = 'connect ECONNREFUSED 127.0.0.1:18889'
      // As the Host asks when it starts.
      await management.mutate('provider-rediscover', { trigger: 'startup' }, { confirmed: true })
      page(management)
      expect(await screen.findByText('Banks could not finish discovery: connect ECONNREFUSED 127.0.0.1:18889')).toBeTruthy()
      await shown('Alice')
    } finally {
      await runner.dispose()
    }
  }, PAGE_TEST_TIMEOUT_MS)

  it('follows a pass the Host is running when the page opens, and its switches keep working', async () => {
    let release!: () => void
    const behaviour: Upstream = {}
    const namespaces = [{ externalId: 'alice', name: 'Alice' }]
    const { runner, management } = await mounted(namespaces, behaviour)
    try {
      behaviour.hold = new Promise(resolve => { release = resolve })
      // The Host's start-up pass, still waiting for the Provider when the page opens.
      const startup = management.mutate('provider-rediscover', { trigger: 'startup' }, { confirmed: true })
      page(management)
      await shown('Alice')
      const button = await screen.findByRole('button', { name: 'Rediscovering…' })
      expect(button.getAttribute('aria-busy')).toBe('true')
      expect(button.hasAttribute('disabled')).toBe(false)

      namespaces.push({ externalId: 'research', name: 'Research' })
      release()
      await startup
      // The page looks again on its own and shows what the pass found.
      expect(await screen.findByText('New spaces found: 1. They join recall once you switch them on.', undefined, { timeout: 6_000 })).toBeTruthy()
      expect(within(await shown('Research')).getByText('New')).toBeTruthy()
      await screen.findByRole('button', { name: 'Rediscover' })
      // The directory changed under the page; a switch still answers instead of failing on a stale revision.
      fireEvent.click(within(card('Research')!).getByRole('switch'))
      await waitFor(() => expect(within(card('Research')!).getByRole('switch').getAttribute('aria-checked')).toBe('true'))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      await runner.dispose()
    }
  }, PAGE_TEST_TIMEOUT_MS)

  it('offers no rediscovery on a read-only page', async () => {
    const { runner, management } = await mounted([{ externalId: 'alice', name: 'Alice' }])
    try {
      page(management, false)
      await shown('Alice')
      expect(screen.queryByRole('button', { name: 'Rediscover' })).toBeNull()
    } finally {
      await runner.dispose()
    }
  }, PAGE_TEST_TIMEOUT_MS)
})
