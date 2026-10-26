import { describe, expect, it, vi } from 'vitest'
import type { ClientConnectionHandle } from '../src/host/dsh.ts'
import type { Config } from '../src/host/config.ts'
import { createComponentHosts } from '../src/client/component-host.ts'
import { MEMORY_SPACES_PACKAGE, RUNTIME_PACKAGE } from '../src/client/component-settings.tsx'
import { liveSettingsScope, settingsScope } from './helpers/settings-scope.ts'

const ready = (value: Config) => ({ status: 'ready' as const, value, base: {}, user: {}, revision: 3, writable: true, mode: 'host' as const })

describe('what the configuration lends a shipped component\'s settings', () => {
  it('lends Memory Spaces only the keys its settings read, and writes only the one it owns', async () => {
    const mutate = vi.fn(async () => {})
    const scope = liveSettingsScope<Config>(ready({ storageScope: 'workspace', writeEnabled: false, displayMode: 'builtin', embedding: { enabled: true, model: 'nomic-embed-text' } }), mutate)
    const host = createComponentHosts({ scope })(MEMORY_SPACES_PACKAGE)!
    const snapshot = host.configuration.getSnapshot()
    expect(snapshot).toEqual({ status: 'ready', writable: true, revision: 3, value: { embedding: { enabled: true, model: 'nomic-embed-text' }, storageScope: 'workspace', writeEnabled: false } })
    // An unchanged scope reads as the same object, as React's external stores require.
    expect(host.configuration.getSnapshot()).toBe(snapshot)

    await host.configuration.set('embedding', { enabled: false })
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['embedding'], value: { enabled: false } }])
    expect(host.configuration.getSnapshot()).not.toBe(snapshot)
    expect(host.configuration.getSnapshot().revision).toBe(4)
    await expect(host.configuration.set('storageScope', 'global')).rejects.toThrow('does not lend this component the setting storageScope')
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('lends nothing to a component whose settings dsh-mnemon never drew', () => {
    const hosts = createComponentHosts({ scope: settingsScope<Config>(ready({})) })
    expect(hosts(RUNTIME_PACKAGE)).toBeUndefined()
    expect(hosts('@acme/memory-notes')).toBeUndefined()
  })

  it('keeps one host per conversation and workspace, so a page\'s effects see the same one', () => {
    const connection = { rpc: { call: vi.fn() }, isLoopback: true } as unknown as ClientConnectionHandle
    const hosts = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection })
    const first = hosts(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-1')!
    expect(hosts(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-1')).toBe(first)
    expect(hosts(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-2')).not.toBe(first)
    // The configuration is one for all of them.
    expect(hosts(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-2')!.configuration).toBe(first.configuration)
  })

  it('lends no Host operations without a Host connection', () => {
    expect(createComponentHosts({ scope: settingsScope<Config>(ready({})) })(MEMORY_SPACES_PACKAGE)!.operations).toBeUndefined()
  })

  it('tells the Memory System when the component changed its data', () => {
    const bump = vi.fn()
    createComponentHosts({ scope: settingsScope<Config>(ready({})), componentChanges: { bump } })(MEMORY_SPACES_PACKAGE)!.changed()
    expect(bump).toHaveBeenCalledOnce()
  })

  it('routes Provider service settings on the write channel, in the page\'s conversation and workspace', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: { providerId: 'mem0', configured: true, settings: { endpoint: 'http://127.0.0.1:8888' }, configuredSecrets: [] } }))
    const host = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as ClientConnectionHandle })(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-1')!

    await host.operations!.write('provider-service-update', { providerId: 'mem0', settings: { endpoint: 'http://127.0.0.1:8888', mode: 'self-hosted' }, enabled: true })

    expect(call).toHaveBeenCalledWith('/dsh-mnemon-write', 'provider-service-update', {
      providerId: 'mem0', settings: { endpoint: 'http://127.0.0.1:8888', mode: 'self-hosted' }, enabled: true, sessionId: 'session-1', workspaceId: 'workspace-1',
    })
    await host.operations!.write('embedding-fill', { memoryBodyId: 'tools' })
    expect(call).toHaveBeenLastCalledWith('/dsh-mnemon-write', 'embedding-fill', { memoryBodyId: 'tools', sessionId: 'session-1', workspaceId: 'workspace-1' })
  })

  it('loads redacted Provider settings through the read channel and never masks an authentication rejection', async () => {
    const call = vi.fn(async (channel: string) => {
      if (channel === '/dsh-mnemon-read') return { ok: true as const, value: { providers: [], items: [], generatedAt: 'now' } }
      throw new Error(`unexpected channel: ${channel}`)
    })
    const host = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as ClientConnectionHandle })(MEMORY_SPACES_PACKAGE, 'session-1')!

    await host.operations!.read('provider-services')
    expect(call).toHaveBeenLastCalledWith('/dsh-mnemon-read', 'provider-services', { sessionId: 'session-1' })

    call.mockReset()
    call.mockRejectedValue(new Error('transport failure for /dsh-mnemon-write/provider-services: HTTP 403'))
    await expect(host.operations!.read('provider-services')).rejects.toThrow('HTTP 403')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('does not retry an unavailable Provider catalog on a write endpoint', async () => {
    const call = vi.fn(async () => ({ ok: false as const, error: { code: 'bad-request' as const, message: 'unknown read endpoint: provider-services', details: { issues: [] } } }))
    const host = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as ClientConnectionHandle })(MEMORY_SPACES_PACKAGE)!
    await expect(host.operations!.read('provider-services')).rejects.toThrow('unknown read endpoint')
    expect(call.mock.calls).toEqual([['/dsh-mnemon-read', 'provider-services', {}]])
  })

  it('checks Mnemon embedding status in the selected runtime scope', async () => {
    const status = { available: true, model: 'qwen3-embedding:0.6b', totalInsights: 5, embedded: 4, coverage: '80%' }
    const call = vi.fn(async () => ({ ok: true as const, value: status }))
    const host = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as ClientConnectionHandle })(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-1')!

    await expect(host.operations!.read('embedding-status')).resolves.toEqual(status)
    expect(call).toHaveBeenCalledWith('/dsh-mnemon-read', 'embedding-status', {
      sessionId: 'session-1', workspaceId: 'workspace-1',
    })
  })

  it('serves only the operations it lends, each on its own channel', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: {} }))
    const host = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as ClientConnectionHandle })(MEMORY_SPACES_PACKAGE)!
    await expect(host.operations!.read('provider-service-update')).rejects.toThrow('does not serve this component the read operation provider-service-update')
    await expect(host.operations!.write('provider-services', {})).rejects.toThrow('does not serve this component the write operation provider-services')
    await expect(host.operations!.write('body-delete', { memoryBodyId: 'default' })).rejects.toThrow('does not serve this component')
    await expect(host.operations!.write('embedding-fill', 'tools')).rejects.toThrow('embedding-fill takes an object')
    expect(call).not.toHaveBeenCalled()
  })

  it('runs every operation in the page\'s own conversation and workspace, never in ones the component names', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: {} }))
    const hosts = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as ClientConnectionHandle })
    // A page opened outside any conversation, as the Plugins page is: nothing scopes the payload, as before.
    const unscoped = hosts(MEMORY_SPACES_PACKAGE)!
    await unscoped.operations!.write('provider-service-update', { providerId: 'mem0', settings: {}, enabled: true })
    expect(call).toHaveBeenLastCalledWith('/dsh-mnemon-write', 'provider-service-update', { providerId: 'mem0', settings: {}, enabled: true })
    for (const host of [unscoped, hosts(MEMORY_SPACES_PACKAGE, 'session-1', 'workspace-1')!]) {
      await expect(host.operations!.write('provider-service-update', { providerId: 'mem0', settings: {}, enabled: true, sessionId: 'other' })).rejects.toThrow('takes no sessionId')
      await expect(host.operations!.read('provider-services', { workspaceId: 'other' })).rejects.toThrow('takes no workspaceId')
      await expect(host.operations!.read('embedding-status', { sessionId: 'other', workspaceId: 'other' })).rejects.toThrow('takes no sessionId or workspaceId')
    }
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('joins a read the settings make on their own while it is under way at the same configuration revision', async () => {
    const answers: Array<(value: { ok: true; value: { commandFound: boolean } }) => void> = []
    const call = vi.fn((_channel: string, _endpoint: string) => new Promise(resolve => { answers.push(resolve) }))
    const scope = liveSettingsScope<Config>(ready({}))
    const hosts = createComponentHosts({ scope, connection: { rpc: { call }, isLoopback: true } as unknown as ClientConnectionHandle })
    const host = hosts(MEMORY_SPACES_PACKAGE, 'session-1')!
    const first = host.operations!.read('status-summary')
    const second = host.operations!.read('status-summary')
    expect(call).toHaveBeenCalledTimes(1)
    // Once the configuration moved, a read answers for the new one: it asks the Host again.
    await scope.mutate([{ op: 'set', path: ['embedding'], value: { enabled: false } }])
    void host.operations!.read('status-summary')
    expect(call).toHaveBeenCalledTimes(2)
    answers[0]!({ ok: true, value: { commandFound: true } })
    await expect(Promise.all([first, second])).resolves.toEqual([{ commandFound: true }, { commandFound: true }])
    // An embedding test checks the connection as it is now, so it is never joined.
    void host.operations!.read('embedding-status')
    void host.operations!.read('embedding-status')
    expect(call.mock.calls.filter(([, endpoint]) => endpoint === 'embedding-status')).toHaveLength(2)
  })

  it('keeps what the settings retain across their mounts, one store per conversation and workspace', async () => {
    const call = vi.fn(async () => ({ ok: true as const, value: { commandFound: true } }))
    const hosts = createComponentHosts({ scope: settingsScope<Config>(ready({})), connection: { rpc: { call }, isLoopback: true } as unknown as ClientConnectionHandle })
    const host = hosts(MEMORY_SPACES_PACKAGE, 'session-1')!
    // Once a read answered, the next one asks the Host again.
    await host.operations!.read('status-summary')
    await host.operations!.read('status-summary')
    expect(call).toHaveBeenCalledTimes(2)
    host.retained.set('provider-services', { providers: [] })
    expect(hosts(MEMORY_SPACES_PACKAGE, 'session-1')!.retained.get('provider-services')).toEqual({ providers: [] })
    expect(hosts(MEMORY_SPACES_PACKAGE, 'session-2')!.retained.size).toBe(0)
  })
})
