import { useCallback, useRef, useState } from 'react'
import type { StatusView } from '../host/protocol.ts'
import type { MnemonClient } from './api.ts'
import { message } from './page-kit.tsx'

/**
 * The Memory System's status for one view context and the read that loads it: the summary first, then the full
 * status while the summary still waits for a space or the CLI version. Another view context starts empty, and only
 * the latest read answers.
 */
export function useWorkspaceStatus(client: MnemonClient, viewContextKey: string): {
  status: StatusView | null
  statusLoading: boolean
  statusError: string | null
  loadStatus: () => Promise<void>
} {
  const [statusState, setStatusState] = useState<{ contextKey: string; value: StatusView | null; loading: boolean; error: string | null }>(() => ({ contextKey: viewContextKey, value: null, loading: true, error: null }))
  const currentStatusState = statusState.contextKey === viewContextKey
    ? statusState
    : { contextKey: viewContextKey, value: null, loading: true, error: null }
  const status = currentStatusState.value
  const statusLoading = currentStatusState.loading
  const statusError = currentStatusState.error
  const statusRequest = useRef(0)

  const loadStatus = useCallback(async () => {
    const request = ++statusRequest.current
    setStatusState(current => ({ contextKey: viewContextKey, value: current.contextKey === viewContextKey ? current.value : null, loading: true, error: null }))
    try {
      const summary = await client.statusSummary()
      if (request !== statusRequest.current) return
      // A full status also reads the CLI version, which the summary has only after one did.
      const needsDeepStatus = summary.memoryBodies?.some(body => body.statusLoading === true) === true
        || summary.commandFound === true && summary.version === undefined
      setStatusState({ contextKey: viewContextKey, value: summary, loading: needsDeepStatus, error: null })
      if (!needsDeepStatus) return
      try {
        const next = await client.status()
        if (request === statusRequest.current) setStatusState({ contextKey: viewContextKey, value: next, loading: false, error: null })
      } catch (reason) {
        if (request === statusRequest.current) setStatusState({ contextKey: viewContextKey, value: summary, loading: false, error: message(reason) })
      }
    } catch (reason) {
      if (request === statusRequest.current) setStatusState({ contextKey: viewContextKey, value: null, loading: false, error: message(reason) })
    }
  }, [client, viewContextKey])
  return { status, statusLoading, statusError, loadStatus }
}
