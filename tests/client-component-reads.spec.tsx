// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { descriptor as mem0 } from 'dsh-mnemon-provider-mem0'
import { descriptor as openviking } from 'dsh-mnemon-provider-openviking'
import { MemorySpacesSettings } from 'dsh-mnemon-source-memory-spaces/client'
import { createComponentHosts } from '../src/client/component-host.ts'
import { MEMORY_SPACES_PACKAGE } from '../src/client/component-settings.tsx'
import { translateEn, type MnemonKey } from '../src/client/locales.ts'
import type { Config } from '../src/host/config.ts'
import type { ClientConnectionHandle } from '../src/host/protocol.ts'
import { liveSettingsScope } from './helpers/settings-scope.ts'

afterEach(cleanup)

const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
const t = (key: string, params?: Record<string, unknown>) => translateEn(key as MnemonKey, params)
const embedding = (endpoint: string) => ({ enabled: true, endpoint, model: 'nomic-embed-text', protocol: 'auto', apiKey: '' })
const catalog = (provider: typeof mem0) => ({ providers: [provider], items: [{ providerId: provider.id, enabled: true, configured: true, settings: {}, configuredSecrets: [] }], generatedAt: 'now' })

/** A Host whose reads of the named operations answer only when the test lets them, in any order. */
function host(held: readonly string[], answer: (endpoint: string, index: number) => unknown) {
  const sent: Array<{ endpoint: string; answer: () => void }> = []
  const call = vi.fn((_channel: string, endpoint: string) => {
    const index = sent.filter(entry => entry.endpoint === endpoint).length
    const value = { ok: true, value: answer(endpoint, index) }
    if (!held.includes(endpoint)) { sent.push({ endpoint, answer: () => {} }); return Promise.resolve(value) }
    return new Promise(resolve => { sent.push({ endpoint, answer: () => resolve(value) }) })
  })
  const scope = liveSettingsScope<Config>({ status: 'ready', revision: 1, writable: true, mode: 'host', base: {}, user: {},
    value: { storageScope: 'global', embedding: embedding('http://old-host:11434') } } as never)
  const lent = createComponentHosts({ scope, connection: { isLoopback: true, rpc: { call } } as unknown as ClientConnectionHandle })(MEMORY_SPACES_PACKAGE)!
  const view = render(<MemorySpacesSettings component={{ packageName: MEMORY_SPACES_PACKAGE, label: 'Memory Spaces', enabled: true }} writable language="en" host={lent} />)
  return { sent, scope, lent, view, ui: within(view.container), requests: (endpoint: string) => sent.filter(entry => entry.endpoint === endpoint) }
}

describe('reads the settings make across a configuration change', () => {
  it('asks the Host again for an embedding test after the connection changed, and shows that answer', async () => {
    const page = host(['embedding-status'], (endpoint, index) => endpoint === 'status-summary' ? { commandFound: true }
      : endpoint === 'provider-services' ? { providers: [], items: [], generatedAt: 'now' }
      : index === 0 ? { available: false, model: 'old-endpoint-answer', totalInsights: 1, embedded: 0, coverage: '0%' }
      : { available: true, model: 'nomic-embed-text', totalInsights: 1, embedded: 1, coverage: '100%' })
    await settle()
    fireEvent.click(page.ui.getByRole('button', { name: t('config.embeddingTest') }))
    await settle()
    // While that test runs, the endpoint is corrected and applied, then tested again.
    fireEvent.change(page.ui.getByLabelText(t('config.embeddingEndpoint')), { target: { value: 'http://new-host:11434' } })
    fireEvent.click(page.ui.getByRole('button', { name: t('options.apply') }))
    await settle()
    fireEvent.click(page.ui.getByRole('button', { name: t('config.embeddingTest') }))
    await settle()
    expect(page.requests('embedding-status')).toHaveLength(2)
    // The Host answers the test made against the old endpoint last.
    page.requests('embedding-status')[1]!.answer()
    page.requests('embedding-status')[0]!.answer()
    await settle()
    expect(page.view.container.textContent).not.toContain('old-endpoint-answer')
  })

  it('reads the Providers again for a storage scope applied while the first list loads, and keeps that list', async () => {
    const page = host(['provider-services'], (endpoint, index) => endpoint === 'status-summary' ? { commandFound: true }
      : endpoint === 'provider-services' ? catalog(index === 0 ? mem0 : openviking) : {})
    await settle()
    expect(page.requests('provider-services')).toHaveLength(1)
    await act(async () => { await page.scope.mutate([{ op: 'set', path: ['storageScope'], value: 'workspace' }]) })
    await settle()
    expect(page.requests('provider-services')).toHaveLength(2)
    // The list read for the old scope answers last.
    page.requests('provider-services')[1]!.answer()
    await settle()
    page.requests('provider-services')[0]!.answer()
    await settle()
    expect(page.ui.queryByRole('group', { name: `OpenViking ${t('config.providerServiceTitle')}` })).not.toBeNull()
    expect(page.ui.queryByRole('group', { name: `Mem0 ${t('config.providerServiceTitle')}` })).toBeNull()
    expect((page.lent.retained.get('provider-services') as { providers: { id: string }[] }).providers.map(provider => provider.id)).toEqual(['openviking'])
  })
})
