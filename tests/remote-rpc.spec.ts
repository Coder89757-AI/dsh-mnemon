import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { HostRpcHandler } from '../src/host/dsh.ts'
import { MNEMON_RPC_ENDPOINTS, MNEMON_SETTINGS_CHANNEL } from '../src/host/protocol.ts'
import { MnemonRemoteService } from '../src/host/remote-rpc.ts'

function handler(value: string): HostRpcHandler {
  return vi.fn(async endpoint => ({ ok: true as const, value: `${value}:${endpoint}` }))
}

describe('Mnemon API Gateway service', () => {
  function fixture(management: boolean) {
    const handlers = {
      read: handler('read'), activation: handler('activation'), write: handler('write'), pack: handler('pack'),
      sync: handler('sync'), review: handler('review'), settings: handler('settings'), view: handler('view'), viewWrite: handler('view-write'), management,
    }
    const service = new MnemonRemoteService(new Context(), handlers)
    return { service, handlers, signal: new AbortController().signal }
  }

  it('delegates reads and narrow activation without widening management authority', async () => {
    const { service, handlers, signal } = fixture(false)
    await expect(service.read('status-summary', { workspaceId: 'workspace' }, signal)).resolves.toEqual({ ok: true, value: 'read:status-summary' })
    await expect(service.view('dashboard', {}, signal)).resolves.toEqual({ ok: true, value: 'view:dashboard' })
    await expect(service.activation('body', { active: true }, signal)).resolves.toEqual({ ok: true, value: 'activation:body' })
    vi.mocked(handlers.settings).mockResolvedValueOnce({ ok: true, value: { status: 'ready', writable: true } })
    await expect(service.settings('get', { namespace: 'mnemon' }, signal)).resolves.toEqual({ ok: true, value: { status: 'ready', writable: false } })
    await expect(service.settings('mutate', {}, signal)).resolves.toMatchObject({ ok: false, error: { code: 'bad-request' } })
    await expect(service.write('remember', {}, signal)).resolves.toMatchObject({ ok: false, error: { code: 'bad-request' } })
    await expect(service.pack('export', {}, signal)).resolves.toMatchObject({ ok: false, error: { code: 'bad-request' } })
    await expect(service.sync('status', {}, signal)).resolves.toMatchObject({ ok: false, error: { code: 'bad-request' } })
    await expect(service.viewWrite('apply', {}, signal)).resolves.toMatchObject({ ok: false, error: { code: 'bad-request' } })
    // Reading the review ledger needs the grant too, as the Interfaces reference says.
    for (const endpoint of ['view', 'opinion', 'decide', 'reopen', 'reconcile', 'apply']) {
      await expect(service.review(endpoint, {}, signal)).resolves.toMatchObject({ ok: false, error: { code: 'bad-request', message: 'remote Mnemon management requires remoteAccess: trusted-host' } })
    }
    expect(handlers.review).not.toHaveBeenCalled()
    expect(handlers.read).toHaveBeenCalledWith('status-summary', { workspaceId: 'workspace' }, signal)
    expect(handlers.view).toHaveBeenCalledWith('dashboard', {}, signal)
    expect(handlers.activation).toHaveBeenCalledWith('body', { active: true }, signal)
    expect(handlers.settings).toHaveBeenCalledWith('get', { namespace: 'mnemon' }, signal)
    expect(handlers.write).not.toHaveBeenCalled()
  })

  it('delegates management only after the explicit trusted-host grant', async () => {
    const { service, handlers, signal } = fixture(true)
    await expect(service.write('remember', {}, signal)).resolves.toEqual({ ok: true, value: 'write:remember' })
    await expect(service.pack('export', {}, signal)).resolves.toEqual({ ok: true, value: 'pack:export' })
    await expect(service.viewWrite('apply', {}, signal)).resolves.toEqual({ ok: true, value: 'view-write:apply' })
    await expect(service.settings('mutate', {}, signal)).resolves.toEqual({ ok: true, value: 'settings:mutate' })
    await expect(service.sync('status', {}, signal)).resolves.toEqual({ ok: true, value: 'sync:status' })
    expect(handlers.write).toHaveBeenCalledWith('remember', {}, signal)
    expect(handlers.sync).toHaveBeenCalledWith('status', {}, signal)
    expect(handlers.pack).toHaveBeenCalledWith('export', {}, signal)
    expect(handlers.viewWrite).toHaveBeenCalledWith('apply', {}, signal)
    expect(handlers.settings).toHaveBeenCalledWith('mutate', {}, signal)
  })

  it('reaches exactly the settings endpoints the Host serves, and writes only with the grant', async () => {
    const reader = fixture(false)
    const manager = fixture(true)
    for (const endpoint of MNEMON_RPC_ENDPOINTS[MNEMON_SETTINGS_CHANNEL]) {
      await expect(manager.service.settings(endpoint, {}, manager.signal)).resolves.toEqual({ ok: true, value: `settings:${endpoint}` })
    }
    await expect(reader.service.settings('get', {}, reader.signal)).resolves.toEqual({ ok: true, value: 'settings:get' })
    await expect(reader.service.settings('mutate', {}, reader.signal)).resolves.toMatchObject({ ok: false, error: { message: 'remote Mnemon management requires remoteAccess: trusted-host' } })
    for (const endpoint of ['reset', 'Get', 'constructor', 'toString', '__proto__']) {
      for (const { service, signal } of [reader, manager]) {
        await expect(service.settings(endpoint, {}, signal)).resolves.toEqual({
          ok: false, error: { code: 'bad-request', message: `unknown remote Mnemon settings endpoint: ${endpoint}`, details: { issues: [] } },
        })
      }
    }
    expect(reader.handlers.settings).toHaveBeenCalledTimes(1)
    expect(manager.handlers.settings).toHaveBeenCalledTimes(2)
  })

  it('refuses a settings endpoint that is not a string as unknown, without asking the settings handler', async () => {
    for (const management of [false, true]) {
      const { service, handlers, signal } = fixture(management)
      for (const endpoint of [['get'], ['mutate'], 7, null]) {
        await expect(service.settings(endpoint as unknown as string, {}, signal)).resolves.toEqual({
          ok: false, error: { code: 'bad-request', message: `unknown remote Mnemon settings endpoint: ${String(endpoint)}`, details: { issues: [] } },
        })
      }
      expect(handlers.settings).not.toHaveBeenCalled()
    }
  })
})
