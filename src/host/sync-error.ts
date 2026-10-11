import type { MnemonSyncFailureReason } from './protocol.ts'

/**
 * A sync failure the settings page can name in its own language. The message
 * stays the Host's own words for logs and for anything the page cannot name.
 */
export class MnemonSyncError extends Error {
  constructor(readonly reason: MnemonSyncFailureReason, message: string) {
    super(message)
    this.name = 'MnemonSyncError'
  }
}
