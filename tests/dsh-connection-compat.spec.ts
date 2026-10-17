import { Context } from '@deepseek-ai/cordis'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it, vi } from 'vitest'
import type {
  HostConnectionHandle,
  HostRpcHandler,
  HostSettingsService,
} from "../src/host/dsh.ts"
import { registerSettingsRpc } from "../src/host/settings.ts"
import { MNEMON_SETTINGS_CHANNEL } from "../src/host/protocol.ts"
import { MnemonRemoteService } from '../src/host/remote-rpc.ts'

interface RegisteredRoute {
  path: string
}

interface BranchFreeConnection {
  rpc: {
    handle(channel: string, handler: HostRpcHandler): () => Promise<void>
  }
}

type BranchFreeConnectionConstructor = new (
  context: Context,
  trustedHosts: readonly string[],
  browserAuth: {
    isAuthenticated(request: unknown): boolean
    authorizeIndex(request: unknown, response: unknown): boolean
    authenticatedUrl(baseUrl: string): string
  },
) => BranchFreeConnection

describe('DSH Connection contract', () => {
  it('registers a Mnemon channel with the real Connection service', async () => {
    const routes: RegisteredRoute[] = []
    const context = new Context()
    context.provide('webServer', {
      register(route: RegisteredRoute) {
        routes.push(route)
        return () => { routes.splice(routes.indexOf(route), 1) }
      },
    } as never)
    const Connection = HostConnectionService as unknown as BranchFreeConnectionConstructor
    const connection = new Connection(context, [], {
      isAuthenticated: () => true,
      authorizeIndex: () => true,
      authenticatedUrl: value => value,
    })

    registerSettingsRpc(
      connection as unknown as HostConnectionHandle,
      {} as HostSettingsService,
    )

    expect(routes.map(route => route.path)).toEqual([MNEMON_SETTINGS_CHANNEL])
  })

  it('dispatches a namespaced Mnemon read through the released shared API contract', async () => {
    const context = new Context()
    context.provide('webServer', { register: () => () => {}, registerUpgrade: () => () => {} } as never)
    new TypertRegistry(context)
    const Connection = HostConnectionService as unknown as BranchFreeConnectionConstructor
    const connection = new Connection(context, [], {
      isAuthenticated: () => true,
      authorizeIndex: () => true,
      authenticatedUrl: value => value,
    }) as unknown as HostConnectionService
    new TypertGatewayService(context, { websocketHeartbeatIntervalMs: 2_000 })
    const read = vi.fn(async endpoint => ({ ok: true as const, value: { endpoint, healthy: true } }))
    const unavailable: HostRpcHandler = vi.fn(async () => ({ ok: false as const, error: { code: 'internal' as const, message: 'unused', details: {} } }))
    new MnemonRemoteService(context, {
      read,
      activation: unavailable,
      write: unavailable,
      pack: unavailable,
      sync: unavailable,
      review: unavailable,
      settings: unavailable,
      view: unavailable,
      viewWrite: unavailable,
      management: false,
    })
    for (const runtime of context.registry.values()) {
      for (const fiber of runtime.fibers) await fiber.await()
    }

    const endpoint = 'dshMnemon/read'
    // DSH 0.2.1 dispatches a call for the Peer it speaks for, as the browser's owner Peer; DSH 0.2.0 takes none.
    const peer = (connection as unknown as { createPeer?(options: object): unknown }).createPeer?.({ principal: { kind: 'owner' }, interactions: 'none' })
    const handler = connection.createSharedFetchHandler('/api') as unknown as { fetch(request: Request, peer?: unknown): Promise<Response> }
    const response = await handler.fetch(new Request(`http://127.0.0.1/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId: 'compat-rpc', method: endpoint,
        payload: { args: { endpoint: 'status-summary', payload: {} } },
      }),
    }), peer)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      type: 'server-response',
      rpcId: 'compat-rpc',
      result: { ok: true, value: { ok: true, value: { endpoint: 'status-summary', healthy: true } } },
    })
    expect(read).toHaveBeenCalledWith('status-summary', {}, expect.any(AbortSignal))
  })
})
