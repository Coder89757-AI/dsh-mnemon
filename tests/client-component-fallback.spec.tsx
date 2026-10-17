// @vitest-environment jsdom
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createComponentHosts } from '../src/client/component-host.ts'
import { installShippedComponentSettings, MEMORY_SPACES_PACKAGE } from '../src/client/component-settings.tsx'
import { installMemoryComponentUI, MNEMON_COMPONENT_FALLBACK_PRIORITY, MNEMON_COMPONENT_SETTINGS_SLOT, renderComponentRegion, type MemoryComponentSettingsProps } from '../src/client/component-ui.tsx'
import { translateZh } from '../src/client/locales.ts'
import type { Config } from '../src/host/config.ts'
import { settingsScope } from './helpers/settings-scope.ts'

afterEach(() => { cleanup(); vi.doUnmock('dsh-mnemon/client'); vi.resetModules() })

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
function page() {
  const slots = new TestSlots()
  const declaration = slots.register({ name: 'root', children: { [MNEMON_COMPONENT_SETTINGS_SLOT]: { kind: 'keyed', scope: 'root' } } }, () => null)
  const ctx = { slots, locale: { bind: () => translateZh } }
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

/** Memory Spaces' client as DSH loads it, against a dsh-mnemon/client with or without the fallback contract. */
async function spacesClient(starterYields: boolean) {
  if (!starterYields) {
    // The CommonJS bundle reads an export dsh-mnemon 0.5.31 lacks as undefined.
    vi.doMock('dsh-mnemon/client', async () => ({ ...await vi.importActual<object>('dsh-mnemon/client'), MNEMON_COMPONENT_FALLBACK_PRIORITY: undefined }))
  }
  vi.resetModules()
  return import('dsh-mnemon-source-memory-spaces/client')
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
