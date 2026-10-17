import type { MemoryJsonValue } from 'dsh-mnemon/contracts'
import type { ClientConnectionHandle, ClientSettingsScope, ClientSettingsSnapshot, Config } from '../host/protocol.ts'
import { MnemonClient } from './api.ts'
import type { MnemonChangeSignal } from './change-signal.ts'
import type { MemoryComponentConfigurationSnapshot, MemoryComponentHost } from './component-ui.tsx'

/** What dsh-mnemon serves a shipped component whose settings it used to draw itself. */
interface Lent {
  /** Configuration keys its settings read. */
  reads: readonly string[]
  /** The ones it owns and may write. */
  owns: readonly string[]
  /** Host operations on the read and write channels, by the names the Host serves them under. */
  read: readonly string[]
  write: readonly string[]
}

const LENT: Readonly<Record<string, Lent>> = {
  // Memory Spaces' Providers and the embedding runtime only Mnemon Native reads. Where memory
  // is stored scopes a Provider, and a read-only Mnemon takes no fill.
  'dsh-mnemon-source-memory-spaces': {
    reads: ['embedding', 'storageScope', 'writeEnabled'],
    owns: ['embedding'],
    read: ['status-summary', 'embedding-status', 'provider-services'],
    write: ['embedding-fill', 'provider-service-update'],
  },
}

export interface ComponentHostServices {
  scope: ClientSettingsScope<Config>
  connection?: ClientConnectionHandle | undefined
  componentChanges?: Pick<MnemonChangeSignal, 'bump'> | undefined
}

/** The host one component's settings get on a page opened for a conversation and workspace, or none. */
export type ComponentHosts = (packageName: string, sessionId?: string, workspaceId?: string) => MemoryComponentHost | undefined

function configurationOf(scope: ClientSettingsScope<Config>, lent: Lent): MemoryComponentHost['configuration'] {
  let source: ClientSettingsSnapshot<Config> | undefined
  let snapshot: MemoryComponentConfigurationSnapshot = { status: 'loading', writable: false }
  return {
    // A snapshot that has not changed reads as the same object, as React's external stores require.
    getSnapshot() {
      const current = scope.getSnapshot()
      if (current === source) return snapshot
      source = current
      const value = current.value as Readonly<Record<string, unknown>> | undefined
      snapshot = {
        status: current.status, writable: current.writable,
        ...(current.revision === undefined ? {} : { revision: current.revision }),
        ...(value === undefined ? {} : { value: Object.fromEntries(lent.reads.flatMap(key => Object.hasOwn(value, key) ? [[key, value[key]]] : [])) }),
      }
      return snapshot
    },
    subscribe: listener => scope.subscribe(listener),
    async set(key: string, value: MemoryJsonValue) {
      if (!lent.owns.includes(key)) throw new Error(`dsh-mnemon does not lend this component the setting ${key}`)
      await scope.mutate([{ op: 'set', path: [key], value }])
    },
  }
}

/**
 * The hosts a page lends shipped components, one per component, conversation
 * and workspace, so a component's effects see the same object on every render.
 */
export function createComponentHosts(services: ComponentHostServices): ComponentHosts {
  const configurations = new Map<string, MemoryComponentHost['configuration']>()
  const hosts = new Map<string, MemoryComponentHost>()
  return (packageName, sessionId, workspaceId) => {
    const lent = LENT[packageName]
    if (lent === undefined) return undefined
    const key = [packageName, sessionId ?? '', workspaceId ?? ''].join('\u0000')
    let host = hosts.get(key)
    if (host !== undefined) return host
    let configuration = configurations.get(packageName)
    if (configuration === undefined) {
      configuration = configurationOf(services.scope, lent)
      configurations.set(packageName, configuration)
    }
    const { connection, componentChanges } = services
    const client = connection === undefined ? undefined : new MnemonClient(connection, sessionId, workspaceId)
    const call = (mode: 'read' | 'write', names: readonly string[], operation: string, input: MemoryJsonValue | undefined): Promise<unknown> => {
      if (!names.includes(operation)) return Promise.reject(new Error(`dsh-mnemon does not serve this component the ${mode} operation ${operation}`))
      if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) return Promise.reject(new Error(`${operation} takes an object`))
      return client!.componentOperation(mode, operation, input ?? {})
    }
    host = {
      configuration,
      ...(client === undefined ? {} : { operations: {
        read: (operation, input) => call('read', lent.read, operation, input),
        write: (operation, input) => call('write', lent.write, operation, input),
      } }),
      changed: () => { componentChanges?.bump() },
    }
    hosts.set(key, host)
    return host
  }
}
