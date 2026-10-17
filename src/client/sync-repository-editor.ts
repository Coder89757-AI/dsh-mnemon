import type { MnemonSyncGitHubStatus, MnemonSyncStatus } from '../host/protocol.ts'
import type { MnemonClient } from './api.ts'
import type { MnemonTranslate } from './locales.ts'

/** What the repository editor and the GitHub sign-in it opens take. */
export interface RepositoryEditorProps {
  client: MnemonClient
  status: MnemonSyncStatus
  github: MnemonSyncGitHubStatus | null
  disabled: boolean
  /** Whether a saved connection stays in place when the editor closes. */
  cancellable: boolean
  /** The way in the editor opens with, when the page asked for one. */
  initialMode?: 'github' | 'address' | undefined
  t: MnemonTranslate
  onGitHub: (status: MnemonSyncGitHubStatus | null) => void
  onReadGitHub: () => Promise<void>
  /** Read the Host's state again after a change the editor made on its own. */
  onRefresh: () => Promise<void>
  onCancel: () => void
  onConnected: () => Promise<void>
}
