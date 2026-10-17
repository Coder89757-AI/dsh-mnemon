// @vitest-environment jsdom
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { descriptor as hindsight } from 'dsh-mnemon-provider-hindsight'
import { descriptor as holographic } from 'dsh-mnemon-provider-holographic'
import { descriptor as mem0 } from 'dsh-mnemon-provider-mem0'
import { descriptor as openviking } from 'dsh-mnemon-provider-openviking'
import { createComponentHosts } from '../src/client/component-host.ts'
import { installShippedComponentSettings, MEMORY_SPACES_PACKAGE } from '../src/client/component-settings.tsx'
import { installMemoryComponentUI, MNEMON_COMPONENT_FALLBACK_PRIORITY, MNEMON_COMPONENT_SETTINGS_SLOT, renderComponentRegion, type MemoryComponentSettingsProps } from '../src/client/component-ui.tsx'
import { translateEn, translateZh, type MnemonKey } from '../src/client/locales.ts'
import type { ClientConnectionHandle } from '../src/host/protocol.ts'
import type { Config } from '../src/host/config.ts'
import { loadMemoryClientArtifact } from '../src/sdk/testing.ts'
import { settingsScope } from './helpers/settings-scope.ts'

afterEach(() => { cleanup(); vi.doUnmock('dsh-mnemon/client'); vi.resetModules(); vi.restoreAllMocks() })

/** DSH's own Slot core behind the capability the component regions use: same-key entries shadow by priority. */
class TestSlots {
  readonly core = new SlotCore()
  register(options: unknown, component: unknown): () => void {
    return (this.core.register as (options: unknown, component: unknown) => () => void)(options, component)
  }
  inject(name: string, setup: () => () => void): () => void {
    let active: (() => void) | undefined
    const reconcile = (): void => {
      if (this.core.specDynamic(name) === undefined) { active?.(); active = undefined } else if (active === undefined) active = setup()
    }
    const unsubscribe = this.core.subscribeDeclaration(name, reconcile)
    reconcile()
    return () => { unsubscribe(); active?.(); active = undefined }
  }
  getVersion(key: string): number { return this.core.getVersion(key) }
  entriesOfSlot(key: string) { return this.core.entriesOfSlot(key) }
  subscribe(key: string, listener: () => void): () => void { return this.core.subscribe(key, listener) }
}

/** The dsh-mnemon configuration declares the region, as its bundle page does. */
function page(t = translateZh) {
  const slots = new TestSlots()
  const declaration = slots.register({ name: 'root', children: { [MNEMON_COMPONENT_SETTINGS_SLOT]: { kind: 'keyed', scope: 'root' } } }, () => null)
  const ctx = { slots, locale: { bind: () => t } }
  const spaces = () => slots.entriesOfSlot(MNEMON_COMPONENT_SETTINGS_SLOT).filter(entry => entry.options.key === MEMORY_SPACES_PACKAGE)
  return { slots, ctx, declaration, spaces }
}

const scope = settingsScope<Config>({ status: 'ready', value: { storageScope: 'global' }, revision: 1, writable: true, mode: 'host' })
const owner = (host = true): MemoryComponentSettingsProps => ({
  component: { packageName: MEMORY_SPACES_PACKAGE, label: '记忆空间', enabled: true }, writable: true, language: 'zh-CN',
  ...(host ? { host: createComponentHosts({ scope })(MEMORY_SPACES_PACKAGE)! } : {}),
})
const services = { scope, t: translateZh }

/** dsh-mnemon 0.5.31 drew Memory Spaces' settings itself, registered at the default priority. */
const oldBuiltIn = () => <p>0.5.31 built-in settings</p>
const installOldStarter = (ctx: ReturnType<typeof page>['ctx']) => installMemoryComponentUI(ctx as never, { packageName: MEMORY_SPACES_PACKAGE, settings: oldBuiltIn })

/** Memory Spaces' client as DSH loads it, with its own module state, against a dsh-mnemon/client with or without the fallback contract. */
async function spacesClient(starterYields: boolean) {
  if (!starterYields) {
    // The CommonJS bundle reads an export dsh-mnemon 0.5.31 lacks as undefined.
    vi.doMock('dsh-mnemon/client', async () => ({ ...await vi.importActual<object>('dsh-mnemon/client'), MNEMON_COMPONENT_FALLBACK_PRIORITY: undefined }))
  }
  vi.resetModules()
  return {
    ...await import('dsh-mnemon-source-memory-spaces/client'),
    // Its own settings registration, which its apply() makes beside its pages.
    installMemorySpacesSettings: (await import('../plugins/dsh-mnemon-source-memory-spaces/src/client/settings.tsx')).installMemorySpacesSettings,
  }
}

/** Exactly one Memory Spaces settings interface on its page. */
function rendered(slots: TestSlots, props = owner()) {
  return render(<>{renderComponentRegion({ slots }, MNEMON_COMPONENT_SETTINGS_SLOT, MEMORY_SPACES_PACKAGE, props)}</>)
}

describe('Memory Spaces\' settings across Starter and Memory Spaces versions', () => {
  it('new Starter and new Memory Spaces: Memory Spaces\' own registration shows', async () => {
    const { ctx, slots, spaces } = page()
    installShippedComponentSettings(ctx as never, services)
    const client = await spacesClient(true)
    const errors = vi.spyOn(console, 'error')
    client.apply(ctx as never)
    // Both are registered; DSH renders the lowest priority, Memory Spaces' own.
    expect(slots.core.entries(MNEMON_COMPONENT_SETTINGS_SLOT).filter(entry => entry.options.key === MEMORY_SPACES_PACKAGE).map(entry => entry.options.priority)).toEqual([undefined, MNEMON_COMPONENT_FALLBACK_PRIORITY])
    expect(spaces()).toHaveLength(1)
    expect(spaces()[0]!.options.priority).toBeUndefined()
    rendered(slots)
    expect(screen.getAllByRole('heading', { name: '记忆 Provider' })).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: '记忆 Provider' })).getByText('Mnemon Native')).toBeTruthy()
    expect(errors).not.toHaveBeenCalled()
  })

  it('a Memory Spaces whose own settings go leaves the Starter\'s fallback, and one that comes back replaces it again', async () => {
    const { ctx, spaces } = page()
    installShippedComponentSettings(ctx as never, services)
    const client = await spacesClient(true)
    const own = client.installMemorySpacesSettings(ctx as never)
    expect(spaces().map(entry => entry.options.priority)).toEqual([undefined])
    own()
    expect(spaces().map(entry => entry.options.priority)).toEqual([MNEMON_COMPONENT_FALLBACK_PRIORITY])
    client.installMemorySpacesSettings(ctx as never)
    expect(spaces().map(entry => entry.options.priority)).toEqual([undefined])
  })

  it('new Starter and Memory Spaces 0.5.21, which registers none: the Starter\'s fallback shows', () => {
    const { ctx, slots, spaces } = page()
    installShippedComponentSettings(ctx as never, services)
    expect(spaces()).toHaveLength(1)
    expect(spaces()[0]!.options.priority).toBe(MNEMON_COMPONENT_FALLBACK_PRIORITY)
    rendered(slots)
    expect(screen.getAllByRole('heading', { name: '记忆 Provider' })).toHaveLength(1)
    expect(screen.getByText('Mnemon Native')).toBeTruthy()
  })

  it('dsh-mnemon 0.5.31 and new Memory Spaces: Memory Spaces registers nothing, so the old built-in shows alone', async () => {
    const { ctx, slots, spaces } = page()
    installOldStarter(ctx)
    const client = await spacesClient(false)
    expect(() => client.apply(ctx as never)).not.toThrow()
    expect(slots.core.entries(MNEMON_COMPONENT_SETTINGS_SLOT)).toHaveLength(1)
    expect(spaces()).toHaveLength(1)
    rendered(slots, owner(false))
    expect(screen.getByText('0.5.31 built-in settings')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '记忆 Provider' })).toBeNull()
  })

  it('dsh-mnemon 0.5.31 and Memory Spaces 0.5.21: the old built-in shows, as before', () => {
    const { ctx, slots, spaces } = page()
    installOldStarter(ctx)
    expect(spaces()).toHaveLength(1)
    rendered(slots, owner(false))
    expect(screen.getByText('0.5.31 built-in settings')).toBeTruthy()
  })

  it('needs the check: DSH refuses a second registration for the package at the same priority', async () => {
    const { ctx } = page()
    installOldStarter(ctx)
    const client = await spacesClient(false)
    expect(() => client.installMemorySpacesSettings(ctx as never)).toThrow(/already has an entry for key "dsh-mnemon-source-memory-spaces"/u)
  })

  it('shows nothing from Memory Spaces\' own settings without what dsh-mnemon lends them', async () => {
    const client = await spacesClient(true)
    const view = render(<>{client.MemorySpacesSettings(owner(false))}</>)
    expect(view.container.textContent).toBe('')
  })
})

/** A Host connection whose reads answer when the test lets them, recording what the page asks. */
function host(options: { held?: boolean } = {}) {
  const endpoints: string[] = []
  const held: Array<() => void> = []
  const answer = (endpoint: string) => {
    if (endpoint === 'status-summary') return { ok: true, value: { commandFound: false } }
    if (endpoint === 'provider-services') return { ok: true, value: { providers: [openviking], items: [{ providerId: 'openviking', enabled: true, configured: true, settings: {}, configuredSecrets: [] }], generatedAt: 'now' } }
    return { ok: false, error: { code: 'bad-request', message: endpoint, details: {} } }
  }
  const connection = { isLoopback: true, rpc: { call: vi.fn(async (_channel: string, endpoint: string) => {
    endpoints.push(endpoint)
    if (options.held === true) await new Promise<void>(resolve => { held.push(resolve) })
    return answer(endpoint)
  }) } } as unknown as ClientConnectionHandle
  const lent = createComponentHosts({ scope, connection })(MEMORY_SPACES_PACKAGE)!
  return { lent, endpoints, release: () => { for (const resolve of held.splice(0)) resolve() } }
}

const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }

describe('turning Memory Spaces on from its page', () => {
  // DSH loads Memory Spaces' client only while its entry is on, so the Starter's fallback draws the page first and
  // Memory Spaces' own settings, from another bundle with its own module state, replace it once that client loads.
  async function swap(options: { held?: boolean }) {
    const { ctx, slots } = page(translateEn)
    const { lent, endpoints, release } = host(options)
    const props: MemoryComponentSettingsProps = { component: { packageName: MEMORY_SPACES_PACKAGE, label: 'Memory Spaces', enabled: true }, writable: true, language: 'en', host: lent }
    const region = () => <>{renderComponentRegion({ slots }, MNEMON_COMPONENT_SETTINGS_SLOT, MEMORY_SPACES_PACKAGE, props)}</>
    installShippedComponentSettings(ctx as never, { scope, t: translateEn })
    const view = render(region())
    const card = () => within(view.container).queryByRole('group', { name: `OpenViking ${translateEn('config.providerServiceTitle' as MnemonKey)}` })
    const native = () => within(view.container).queryByText(translateEn('config.nativeCliMissing' as MnemonKey))
    return { ctx, view, region, card, native, endpoints, release, replace: async () => {
      const client = await spacesClient(true)
      client.installMemorySpacesSettings(ctx as never)
      view.rerender(region())
    } }
  }

  it('keeps the Providers and the Native card as they were when Memory Spaces\' own settings replace the fallback', async () => {
    const settings = await swap({})
    await settle()
    expect(settings.card()).not.toBeNull()
    expect(settings.native()).not.toBeNull()
    const fallback = settings.view.container.querySelector('section')
    await settings.replace()
    // Another implementation mounts, and starts where the first one was: nothing empties or resets.
    expect(settings.view.container.querySelector('section')).not.toBe(fallback)
    expect(settings.card()).not.toBeNull()
    expect(settings.native()).not.toBeNull()
    expect(within(settings.view.container).queryByText(translateEn('config.loadingProviders' as MnemonKey))).toBeNull()
    await settle()
    expect(settings.card()).not.toBeNull()
    expect(settings.native()).not.toBeNull()
    // It reads both again in the background, as a page opened again does.
    expect(settings.endpoints).toEqual(['provider-services', 'status-summary', 'provider-services', 'status-summary'])
  })

  it('joins the reads the fallback started when Memory Spaces\' own settings replace it while they load', async () => {
    const settings = await swap({ held: true })
    await settle()
    expect(settings.endpoints).toEqual(['provider-services', 'status-summary'])
    await settings.replace()
    await settle()
    settings.release()
    await settle()
    expect(settings.card()).not.toBeNull()
    expect(settings.native()).not.toBeNull()
    expect(settings.endpoints).toEqual(['provider-services', 'status-summary'])
  })
})

describe('the built Memory Spaces client beside dsh-mnemon 0.5.31', () => {
  const require = createRequire(import.meta.url)
  // The browser bundles as DSH loads them: build the Starter, then Memory Spaces, first.
  const bundle = (entry: string) => {
    const path = require.resolve(entry)
    if (!existsSync(path)) throw new Error(`Build ${entry} first`)
    return path
  }
  const names = (require('./fixtures/dsh-mnemon-client-0.5.31-exports.json') as { exports: string[] }).exports

  async function load() {
    const react = { react: await import('react'), 'react/jsx-runtime': await import('react/jsx-runtime'), 'react-dom': await import('react-dom'),
      '@deepseek-ai/dsh-client-ui-primitives': await import('@deepseek-ai/dsh-client-ui-primitives') }
    const current = loadMemoryClientArtifact<Record<string, unknown>>(bundle('dsh-mnemon/client'), react)
    // A dsh-mnemon/client with exactly the names 0.5.31 exports: every newer one reads as undefined, as it would there.
    // Those names carry this branch's implementations, not 0.5.31's, so this checks which exports the bundle needs,
    // not how 0.5.31's behave.
    const old = Object.fromEntries(names.map(name => [name, current[name]]))
    expect(names.every(name => current[name] !== undefined)).toBe(true)
    return loadMemoryClientArtifact<Record<string, unknown>>(bundle('dsh-mnemon-source-memory-spaces/client'), { ...react, 'dsh-mnemon/client': old })
  }

  it('registers its pages and no settings', async () => {
    const spaces = await load()
    const registered: string[] = []
    const ctx = {
      locale: { bind: () => translateEn },
      slots: { inject: (_name: string, setup: () => () => void) => setup(), register: (options: { name: string }) => { registered.push(options.name); return () => {} } },
    }
    ;(spaces.apply as (ctx: unknown) => void)(ctx)
    expect(registered.filter(name => name === 'mnemon.source.page')).toHaveLength(5)
    expect(registered.filter(name => name === MNEMON_COMPONENT_SETTINGS_SLOT)).toEqual([])
  })

  it('draws the dialogs that share the Provider field', async () => {
    const spaces = await load()
    const providers = [mem0, hindsight, holographic].map(descriptor => ({ ...descriptor, serviceConfigured: true }))
    const read = vi.fn(async (operation: string) => ({ revision: 'r1', value: operation === 'status-summary'
      ? { writeEnabled: true, memoryBodies: [], defaultRecallLimit: 12 }
      : operation === 'body-directory' || operation === 'bodies' ? { items: [], providers, total: 0, activeCount: 0, directory: '', generatedAt: '2026-10-17T00:00:00.000Z' }
      : operation === 'graph' ? { nodes: [], edges: [], generatedAt: '2026-10-17T00:00:00.000Z' }
      : [] }))
    const Page = spaces.MemorySpacesSourcePage as ComponentType<Record<string, unknown>>
    render(<Page page="spaces" sourceTypeId="memory-spaces" sourceInstanceKey="source:spaces" sourceInstances={[]} locale="en" writable management={{ sourceInstanceKey: 'source:spaces', revision: 'r1', read, mutate: vi.fn() }} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Create Memory Space' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Memory Space' })
    // Each Provider's own fields: Mem0 a switch and text, Hindsight a choice and text, Holographic numbers.
    for (const [descriptor, control] of [[mem0, 'input[type="checkbox"]'], [hindsight, 'button'], [holographic, 'input[type="number"]']] as const) {
      fireEvent.click(within(dialog).getByRole('radio', { name: new RegExp(descriptor.label, 'u') }))
      expect(dialog.querySelector(`[data-provider="${descriptor.id}"] ${control}`)).not.toBeNull()
    }
  })
})
