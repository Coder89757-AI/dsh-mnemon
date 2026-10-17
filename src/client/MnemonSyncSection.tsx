import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX, type ReactNode } from 'react'
import { Button, IconChevronDownOutlineRegular, PathLabel, StateDot, Tag, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  MNEMON_SYNC_DEFAULT_AUTHOR_EMAIL,
  MNEMON_SYNC_DEFAULT_AUTHOR_NAME,
  MNEMON_SYNC_DEFAULT_BRANCH,
  MNEMON_SYNC_DEFAULT_SUBDIR,
  MNEMON_SYNC_TOKEN_ENV,
  type ClientConnectionHandle,
  type MnemonSyncGitHubRepository,
  type MnemonMachineLabelSource,
  type MnemonSyncGitHubStatus,
  type MnemonSyncPushResult,
  type MnemonSyncStatus,
} from '../host/protocol.ts'
import { MnemonClient } from './api.ts'
import type { MnemonTranslate } from './locales.ts'
import { message } from './page-kit.tsx'
import css from './MnemonSettingsCard.module.css'
import { SettingRow, SettingSelect, ToggleRow, type SettingOption } from './settings-controls.tsx'
import { SyncCompareDialog, SyncConfirmDialog, SyncHistoryDialog } from './MnemonSyncDialogs.tsx'
import {
  AUTO_SYNC_CHOICES, DEFAULT_AUTHOR, authorModeOf, branchValid, credentialText, directoryValid, emailValid, failureText,
  intervalLabel, issueText, machineNameValid, onGitHub, reasonOf, repositoryName, repositoryNameValid, repositoryProblem, transportOf, when,
  type AuthorMode,
} from './sync-view.ts'

/** How long the row waits for the Host to report the switch it just saved. */
const STATUS_SETTLE_MS = 250
const STATUS_SETTLE_ATTEMPTS = 20
/** How many repositories the picker lists before it asks for a narrower search. */
const SHOWN_REPOSITORIES = 50

type Feedback = { tone: 'success' | 'error'; text: string }

/** What an action just did, said beside the row that ran it. */
function FeedbackLine({ value }: { value: Feedback | null }): JSX.Element | null {
  if (value === null) return null
  return <span className={[css.syncFeedbackLine, value.tone === 'error' ? css.error : css.syncSuccess].join(' ')} role={value.tone === 'error' ? 'alert' : 'status'}>{value.text}</span>
}

interface MnemonSyncSectionProps {
  connection?: ClientConnectionHandle
  sessionId?: string
  workspaceId?: string
  /** Whether the Host accepts writes at all; a read-only Host only reports status. */
  disabled: boolean
  /**
   * Whether this installation syncs at all. Off is the default, and off is
   * silent: the section asks the Host nothing and runs no Git.
   */
  enabled: boolean
  /** Saves the switch's choice; the storage section above owns the stored value. */
  onEnabled: (enabled: boolean) => void
  /** A sync or a merge ran, and may have brought memory in from the repository. */
  onMerged?: () => void
  t: MnemonTranslate
}

/**
 * Git repository sync, in the order a person sets it up: connect a repository,
 * sync, choose how often it syncs on its own, look back at what it kept, and
 * only then the advanced choices of branch, directory and commit author.
 *
 * The switch is the whole gate: switched off, this is one row that asks the Host
 * nothing — no status, no repository, no Git.
 *
 * A sync merges the repository's memory into this computer and then publishes
 * the result, so it is the one primary action. "Check remote" reads what a sync
 * would change and writes nothing until a button in it is pressed.
 */
export function MnemonSyncSection({ connection, sessionId, workspaceId, disabled, enabled, onEnabled, onMerged, t }: MnemonSyncSectionProps): JSX.Element {
  const client = useMemo(() => connection === undefined ? null : new MnemonClient(connection, sessionId, workspaceId), [connection, sessionId, workspaceId])
  const [status, setStatus] = useState<MnemonSyncStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [github, setGithub] = useState<MnemonSyncGitHubStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<'sync' | 'disconnect' | 'auto' | null>(null)
  const [syncFeedback, setSyncFeedback] = useState<Feedback | null>(null)
  const [repositoryFeedback, setRepositoryFeedback] = useState<Feedback | null>(null)
  const [autoFeedback, setAutoFeedback] = useState<Feedback | null>(null)
  const [dialog, setDialog] = useState<'compare' | 'history' | 'disconnect' | null>(null)
  const [disconnectFailed, setDisconnectFailed] = useState<string | null>(null)
  // The way the editor opens: the state line can ask for the GitHub sign-in directly.
  const [editMode, setEditMode] = useState<'github' | 'address' | undefined>(undefined)

  const readStatus = useCallback(async (): Promise<void> => {
    if (client === null) return
    setChecking(true)
    try {
      setStatus(await client.syncStatus())
      setLoadFailed(null)
    } catch (reason) {
      setLoadFailed(message(reason))
    } finally {
      setChecking(false)
      setLoaded(true)
    }
  }, [client])

  const readGitHub = useCallback(async (): Promise<void> => {
    if (client === null) return
    try {
      setGithub(await client.githubStatus())
    } catch {
      // A Host without the sign-in channel offers the address form alone.
      setGithub(null)
    }
  }, [client])

  useEffect(() => {
    if (client === null) { setLoaded(true); return }
    // Switched off there is nothing to report: reading the channel here would run
    // Git for a reader who never asked for a repository.
    if (!enabled) return
    let active = true
    // The switch saves the profile first, and until the Host's runtime has the new value
    // the channel still answers as switched off, with nothing checked. Read again for a
    // moment instead of showing that answer as the state of Git and the remote.
    setLoaded(false)
    void (async () => {
      let next = await client.syncStatus()
      for (let attempt = 0; active && next.enabled === false && attempt < STATUS_SETTLE_ATTEMPTS; attempt += 1) {
        await new Promise(settle => setTimeout(settle, STATUS_SETTLE_MS))
        next = await client.syncStatus()
      }
      return next
    })().then(
      next => { if (active) { setStatus(next); setLoadFailed(null); setLoaded(true) } },
      reason => { if (active) { setLoadFailed(message(reason)); setLoaded(true) } },
    )
    void client.githubStatus().then(
      next => { if (active) setGithub(next) },
      () => { if (active) setGithub(null) },
    )
    return () => { active = false }
  }, [client, enabled])

  const repoUrl = status?.config.repoUrl
  const connected = status !== null && status.enabled !== false && repoUrl !== undefined
  const editable = !disabled && client !== null
  const gitReady = status?.git.available === true

  /**
   * The one primary action: merge the repository here, then publish the result.
   * Answers why it did not finish, or null when it did, for a caller that shows it elsewhere.
   */
  const sync = async (): Promise<string | null> => {
    if (client === null || busy !== null || repoUrl === undefined) return null
    setBusy('sync'); setSyncFeedback(null)
    let failure: string | null = null
    try {
      const result = await client.pushSync()
      const feedback = syncResult(t, result, repoUrl)
      setSyncFeedback(feedback)
      if (feedback.tone === 'error') failure = feedback.text
    } catch (reason) {
      failure = t('config.syncFailed', { error: failureText(t, reasonOf(reason), message(reason), repoUrl) })
      setSyncFeedback({ tone: 'error', text: failure })
    } finally { setBusy(null) }
    // The branch is folded in before anything is published, so even a sync that did not
    // finish can have changed memory here.
    onMerged?.()
    // The state line follows on its own; the buttons do not wait for it.
    void readStatus()
    return failure
  }

  const setAutoSync = async (minutes: number): Promise<void> => {
    if (client === null || busy !== null) return
    setBusy('auto'); setAutoFeedback(null)
    try {
      const next = await client.configureSync({ autoBackupMinutes: minutes })
      setStatus(current => current === null ? current : { ...current, config: next })
      // The selector already shows the interval, and the hint when the next run is due.
      void readStatus()
    } catch (reason) {
      setAutoFeedback({ tone: 'error', text: message(reason) })
    } finally { setBusy(null) }
  }

  const disconnect = async (): Promise<void> => {
    if (client === null || busy !== null) return
    setBusy('disconnect'); setRepositoryFeedback(null); setSyncFeedback(null); setDisconnectFailed(null)
    try {
      // The token belonged to that repository, and the timer synced to it, so both go with it.
      await client.configureSync({ repoUrl: null, token: null, autoBackupMinutes: 0 })
      setDialog(null); setEditing(false)
      setRepositoryFeedback({ tone: 'success', text: t('config.syncDisconnected') })
      void readStatus()
    } catch (reason) {
      // The dialog is still open over the row, so the failure is said inside it.
      setDisconnectFailed(message(reason))
    } finally { setBusy(null) }
  }

  /**
   * A connection was saved: the editor closes and the repository is read again.
   * The state line under the repository is the answer, so nothing claims it is
   * connected before the Host has said whether it answers.
   */
  const connectedTo = async (): Promise<void> => {
    setEditing(false); setSyncFeedback(null); setRepositoryFeedback(null)
    await readStatus()
  }

  /** The state line's own way out: credentials are changed in the editor that set them. */
  const fixCredentials = (): void => {
    setRepositoryFeedback(null)
    setEditMode(repoUrl !== undefined && onGitHub(repoUrl) && github?.available === true ? 'github' : 'address')
    setEditing(true)
  }

  const autoBackup = status?.autoBackup
  const minutes = status?.config.autoBackupMinutes ?? 0
  const autoOptions: SettingOption<string>[] = AUTO_SYNC_CHOICES.map(choice => ({ value: String(choice), label: intervalLabel(t, choice) }))
  const autoHint: ReactNode = autoBackup?.lastError !== undefined && minutes > 0
    ? <span className={css.error}>{t('config.syncAutoFailed', { error: failureText(t, autoBackup.lastFailure, autoBackup.lastError, repoUrl ?? '') })}</span>
    : minutes <= 0
      ? t('config.syncAutoHintOff')
      : [autoBackup?.nextAt === undefined ? '' : t('config.syncAutoNext', { time: when(autoBackup.nextAt) }), autoBackup?.lastAt === undefined ? '' : t('config.syncAutoLast', { time: when(autoBackup.lastAt) })].filter(Boolean).join(' · ') || t('config.syncAutoHintOn')
  const lastRun = status?.lastRun
  const syncHint = lastRun === undefined
    ? t('config.syncNever')
    : lastRun.kind === 'merge' ? t('config.syncLastMerge', { time: when(lastRun.at) }) : t('config.syncLast', { time: when(lastRun.at) })

  return <div className={css.syncRow} role="group" aria-labelledby="mnemon-sync-heading">
    <ToggleRow id="mnemon-sync-enabled" titleId="mnemon-sync-heading" label={t('config.syncTitle')} hint={t('config.syncSimpleDescription')}
      checked={enabled} disabled={disabled} onChange={onEnabled} />
    {enabled && <div className={css.syncPanel}>
      {client === null && <p className={css.readOnly}>{t('config.syncUnavailable')}</p>}
      {client !== null && !loaded && <p className={css.syncDialogNote} role="status">{t('config.syncLoading')}</p>}
      {client !== null && loaded && status === null && <p className={css.error} role="alert">{t('config.syncUnavailableReason', { error: loadFailed ?? '' })}</p>}
      {client !== null && loaded && status !== null && <>
        {!gitReady && status.enabled !== false && <div className={css.syncWarning} role="status">
          <span>{t('config.syncGitMissing', { required: status.git.required })}</span>
          <Button variant="ghost" size="sm" disabled={checking} onClick={() => void readStatus()}>{t('config.syncRecheck')}</Button>
        </div>}
        {connected && !editing
          ? <SettingRow title={t('config.syncRepository')} titleId="mnemon-sync-repository-title"
            hint={<><RepositoryState status={status} checking={checking} t={t} onRecheck={() => void readStatus()} onFix={editable ? fixCredentials : undefined} /><FeedbackLine value={repositoryFeedback} /></>}>
            <Button variant="outline" size="sm" disabled={!editable || busy !== null} onClick={() => { setRepositoryFeedback(null); setEditMode(undefined); setEditing(true) }}>{t('config.syncChange')}</Button>
            <Button variant="ghost" size="sm" disabled={!editable || busy !== null} onClick={() => setDialog('disconnect')}>{t('config.syncDisconnect')}</Button>
          </SettingRow>
          : <div className={css.syncConnect}>
            <SettingRow title={t('config.syncRepository')} titleId="mnemon-sync-repository-title" hint={<>{t('config.syncRepositoryHint')}<FeedbackLine value={repositoryFeedback} /></>} />
            <RepositoryEditor client={client} status={status} github={github} disabled={!editable} cancellable={connected} initialMode={editMode}
              t={t} onGitHub={setGithub} onReadGitHub={readGitHub} onRefresh={readStatus}
              onCancel={() => { setEditing(false); void readStatus() }} onConnected={connectedTo} />
          </div>}
        {connected && !editing && <>
          <SettingRow title={t('config.syncRowTitle')} titleId="mnemon-sync-now-title" hint={<>{syncHint}<FeedbackLine value={syncFeedback} /></>}>
            <Button variant="outline" size="sm" disabled={!gitReady || busy !== null} onClick={() => { setSyncFeedback(null); setDialog('compare') }}>{t('config.syncCheck')}</Button>
            <Button variant="primary" size="sm" disabled={!gitReady || !editable || busy !== null} onClick={() => void sync()}>
              {busy === 'sync' ? t('config.syncNowRunning') : t('config.syncNow')}</Button>
          </SettingRow>
          <SettingRow title={t('config.syncAuto')} titleId="mnemon-sync-auto-title" hint={<>{autoHint}<FeedbackLine value={autoFeedback} /></>}>
            <SettingSelect labelledBy="mnemon-sync-auto-title" value={String(minutes)} options={autoOptions} disabled={!editable || busy !== null}
              onChange={value => void setAutoSync(Number(value))} />
          </SettingRow>
          <SettingRow title={t('config.syncHistory')} titleId="mnemon-sync-history-title" hint={t('config.syncHistoryHint')}>
            <Button variant="outline" size="sm" disabled={!gitReady} onClick={() => setDialog('history')}>{t('config.syncHistoryView')}</Button>
          </SettingRow>
        </>}
        <AdvancedSettings client={client} status={status} disabled={!editable} t={t} onSaved={readStatus} />
      </>}
    </div>}
    {client !== null && repoUrl !== undefined && dialog === 'compare' && <SyncCompareDialog client={client} repoUrl={repoUrl} writable={editable} t={t}
      onClose={() => setDialog(null)} onSync={sync} onChanged={() => { onMerged?.(); void readStatus() }} />}
    {client !== null && repoUrl !== undefined && dialog === 'history' && <SyncHistoryDialog client={client} repoUrl={repoUrl} t={t} onClose={() => setDialog(null)} />}
    {repoUrl !== undefined && dialog === 'disconnect' && <SyncConfirmDialog title={t('config.syncDisconnectTitle')}
      body={t('config.syncDisconnectBody', { repository: repositoryName(repoUrl) })} confirm={t('config.syncDisconnect')}
      busy={busy === 'disconnect'} error={disconnectFailed} t={t} onConfirm={() => void disconnect()} onClose={() => { setDialog(null); setDisconnectFailed(null) }} />}
  </div>
}

/** What one finished sync did, said as one line. */
function syncResult(t: MnemonTranslate, result: MnemonSyncPushResult, repoUrl: string): Feedback {
  const added = result.merged?.runtime?.added ?? 0
  const commit = result.commit.slice(0, 8)
  if (result.pushed) return { tone: 'success', text: added > 0 ? t('config.syncDoneMerged', { count: added, commit }) : t('config.syncDone', { commit }) }
  if (!result.committed) return { tone: 'success', text: added > 0 ? t('config.syncUpToDateMerged', { count: added }) : t('config.syncUpToDate') }
  return { tone: 'error', text: t('config.syncPushFailed', { reason: failureText(t, result.failure, result.reason ?? '', repoUrl) }) }
}

/** Where the repository is, whether it answers, and how it is authenticated. */
function RepositoryState({ status, checking, t, onRecheck, onFix }: { status: MnemonSyncStatus; checking: boolean; t: MnemonTranslate; onRecheck: () => void; onFix?: (() => void) | undefined }): JSX.Element {
  const url = status.config.repoUrl ?? ''
  const remote = status.remote
  const credential = credentialText(t, status)
  const state = checking
    ? { dot: 'ongoing' as const, text: t('config.syncStateChecking') }
    : !status.git.available
      ? { dot: 'idle' as const, text: t('config.syncReasonGitMissing') }
      : !remote.reachable
        ? { dot: 'error' as const, text: issueText(t, remote.issue, url, remote.error) }
        : {
          // Reading an HTTPS repository can succeed without credentials while pushing to it cannot.
          dot: credential === undefined && transportOf(url) === 'https' ? 'warning' as const : 'done' as const,
          text: [
            remote.branchExists ? t('config.syncStateConnected') : t('config.syncStateNewBranch', { branch: status.config.branch }),
            ...(credential !== undefined ? [credential] : transportOf(url) === 'https' ? [onGitHub(url) ? t('config.syncNoCredential') : t('config.syncNoCredentialToken')] : []),
          ].join(' · '),
        }
  return <span className={css.syncRepositoryState}>
    <span className={css.syncRepositoryName}>{transportOf(url) === 'local' ? <PathLabel path={url} /> : repositoryName(url)}</span>
    <span className={css.syncStateLine} data-tone={state.dot}>
      <StateDot state={state.dot} />
      <span>{state.text}</span>
      {/* GitHub also answers "not found" for a repository the credentials cannot reach. */}
      {!checking && onFix !== undefined && (remote.issue === 'auth' || remote.issue === 'not-found') && transportOf(url) === 'https' && status.git.available
        && <button type="button" className={css.syncInlineAction} onClick={onFix}>{t('config.syncFixCredentials')}</button>}
      {!checking && <button type="button" className={css.syncInlineAction} onClick={onRecheck}>{t('config.syncRecheck')}</button>}
    </span>
  </span>
}

interface RepositoryEditorProps {
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

/** Connect a repository: through a GitHub sign-in, or by its address. */
function RepositoryEditor(props: RepositoryEditorProps): JSX.Element {
  const { status, github, t } = props
  const githubOffered = github?.available === true
  const saved = status.config.repoUrl
  const [mode, setMode] = useState<'github' | 'address'>(() => props.initialMode ?? (githubOffered && (saved === undefined || onGitHub(saved)) ? 'github' : 'address'))
  // A sign-in channel that answers after the editor opened still becomes the default way in.
  const chosen = useRef(props.initialMode !== undefined)
  useEffect(() => {
    if (!chosen.current && githubOffered && saved === undefined) setMode('github')
  }, [githubOffered, saved])
  const name = useId()
  return <div className={css.editor}>
    {githubOffered && <div className={css.inlineChoices} role="radiogroup" aria-label={t('config.syncConnectWith')}>
      {(['github', 'address'] as const).map(value => <label key={value}>
        <input type="radio" name={name} value={value} checked={mode === value} disabled={props.disabled}
          onChange={() => { chosen.current = true; setMode(value) }} />
        <span>{value === 'github' ? t('config.syncModeGitHub') : t('config.syncModeAddress')}</span>
      </label>)}
    </div>}
    {mode === 'github' && githubOffered && github !== null
      ? <GitHubConnect {...props} github={github} />
      : <AddressConnect {...props} />}
  </div>
}

/** Whether two HTTPS addresses name the same host, the one a saved token was saved for. */
function sameHost(left: string, right: string): boolean {
  try {
    return new URL(left.trim()).host.toLowerCase() === new URL(right.trim()).host.toLowerCase()
  } catch {
    return false
  }
}

/** The address form: a repository URL, and a token where the address is HTTPS. */
function AddressConnect({ client, status, disabled, cancellable, t, onRefresh, onCancel, onConnected }: RepositoryEditorProps): JSX.Element {
  const saved = status.config.repoUrl ?? ''
  const [url, setUrl] = useState(saved)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<'connect' | 'token' | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const tokenId = useId()
  const problem = repositoryProblem(url)
  const https = transportOf(url) === 'https'
  const environment = status.config.credentialSource === 'environment'
  // A saved token belongs to the host it was saved for; another host starts without one.
  const storedToken = status.config.credentialSource === 'token' && sameHost(url, saved)
  const changed = url.trim() !== saved || token.trim() !== ''
  const ready = url.trim() !== '' && problem === undefined && changed

  const connect = async (): Promise<void> => {
    if (!ready || busy !== null) return
    setBusy('connect'); setFeedback(null)
    try {
      const next = url.trim()
      await client.configureSync({ repoUrl: next, ...(https && token.trim() !== '' ? { token: token.trim() } : {}), ...(https ? {} : { token: null }) })
      setToken('')
      await onConnected()
    } catch (reason) {
      setFeedback({ tone: 'error', text: message(reason) })
    } finally { setBusy(null) }
  }

  const removeToken = async (): Promise<void> => {
    if (busy !== null) return
    setBusy('token'); setFeedback(null)
    try {
      await client.configureSync({ token: null })
      setFeedback({ tone: 'success', text: t('config.syncTokenRemoved') })
      void onRefresh()
    } catch (reason) {
      setFeedback({ tone: 'error', text: message(reason) })
    } finally { setBusy(null) }
  }

  return <>
    <div className={css.fieldGrid}>
      <label>{t('config.syncRepoUrl')}
        <input type="text" value={url} aria-label={t('config.syncRepoUrl')} placeholder={t('config.syncRepoUrlPlaceholder')} disabled={disabled || busy !== null}
          aria-invalid={problem === undefined ? undefined : true} autoComplete="off" spellCheck={false} autoCapitalize="none" autoCorrect="off"
          onChange={event => setUrl(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void connect() }} />
      </label>
      {https && <div className={css.syncFieldBox}>
        {/* The caption labels the input alone; Remove sits beside it, outside the label, so a
            click meant to focus the field never removes the saved token. */}
        <span className={css.syncFieldLabel}>
          <label htmlFor={tokenId}>{t('config.syncToken')}</label>
          {storedToken && <button type="button" className={css.syncInlineAction} disabled={disabled || busy !== null} onClick={() => void removeToken()}>{t('config.syncTokenRemove')}</button>}
        </span>
        <input id={tokenId} type="password" value={token} aria-label={t('config.syncToken')} disabled={disabled || busy !== null || environment}
          placeholder={environment ? t('config.syncTokenEnvironment', { env: MNEMON_SYNC_TOKEN_ENV }) : storedToken ? t('config.syncTokenSaved') : t('config.syncTokenOptional')}
          autoComplete="new-password" spellCheck={false} onChange={event => setToken(event.target.value)} />
      </div>}
    </div>
    {problem !== undefined && <p className={css.error}>{problem === 'credentials' ? t('config.syncRepoUrlCredentials') : t('config.syncRepoUrlInvalid')}</p>}
    {https && problem === undefined && <p className={css.editorNote}>{t('config.syncTokenHint')}</p>}
    <div className={css.memoryConfigFooter}>
      <div className={css.configFeedback} aria-live="polite"><FeedbackLine value={feedback} /></div>
      <div>
        {cancellable && <Button variant="ghost" size="sm" disabled={busy !== null} onClick={onCancel}>{t('common.cancel')}</Button>}
        <Button variant="primary" size="sm" disabled={disabled || !ready || busy !== null} onClick={() => void connect()}>
          {busy === 'connect' ? t('config.syncConnecting') : saved === '' ? t('config.syncConnect') : t('config.syncSave')}</Button>
      </div>
    </div>
  </>
}

/** Sign in with the GitHub device flow, then pick or create the repository. */
function GitHubConnect(props: RepositoryEditorProps & { github: MnemonSyncGitHubStatus }): JSX.Element {
  const { client, github, disabled, cancellable, t, onGitHub, onReadGitHub, onCancel, onConnected } = props
  const [busy, setBusy] = useState<'start' | 'cancel' | 'signout' | 'choose' | 'create' | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // The device flow is polled on the cadence GitHub asked for; a counter re-runs the effect.
  const [pollTick, setPollTick] = useState(0)
  const [pollMs, setPollMs] = useState(5_000)
  const flow = github.flow
  const signedIn = github.signedIn

  const start = async (): Promise<void> => {
    if (busy !== null) return
    setBusy('start'); setFailed(null); setCopied(false)
    try {
      const next = await client.githubStart()
      onGitHub(next)
      setPollMs(next.flow?.intervalMs ?? 5_000)
      setPollTick(0)
    } catch (reason) {
      setFailed(t('config.syncGitHubFailed', { error: message(reason) }))
    } finally { setBusy(null) }
  }

  const cancel = async (): Promise<void> => {
    if (busy !== null) return
    setBusy('cancel'); setFailed(null)
    try {
      onGitHub(await client.githubCancel())
    } catch (reason) {
      setFailed(message(reason))
    } finally { setBusy(null) }
  }

  const signOut = async (): Promise<void> => {
    if (busy !== null) return
    setBusy('signout'); setFailed(null)
    try {
      onGitHub(await client.githubSignOut())
    } catch (reason) {
      setFailed(message(reason))
    } finally { setBusy(null) }
  }

  /** A grant GitHub stopped honouring is replaced: sign out, then start a new sign-in. */
  const signInAgain = async (): Promise<void> => {
    await signOut()
    await start()
  }

  /**
   * One click copies the code and opens the page it is typed into. The copy starts
   * first, while this page still has focus, and the page opens within the same click,
   * so neither the clipboard nor a popup blocker refuses it.
   */
  const copyAndOpen = async (): Promise<void> => {
    if (flow === undefined) return
    const copying = writeClipboard(flow.userCode).catch(() => false)
    // `noopener` would make `open` answer null even when the page did open, so the
    // opener is cut afterwards and null keeps meaning that the browser blocked it.
    const opened = window.open(flow.verificationUri, '_blank')
    if (opened !== null) opened.opener = null
    setCopied(await copying)
    if (opened === null) setFailed(t('config.syncGitHubOpenBlocked', { url: flow.verificationUri }))
  }

  useEffect(() => {
    if (flow === undefined || signedIn) return
    let active = true
    const timer = setTimeout(() => {
      void (async (): Promise<void> => {
        try {
          const answer = await client.githubPoll()
          if (!active) return
          setFailed(null)
          if (answer.status === 'pending') {
            if (answer.intervalMs !== undefined) setPollMs(answer.intervalMs)
            setPollTick(current => current + 1)
            return
          }
          await onReadGitHub()
          if (!active) return
          if (answer.status === 'expired') setFailed(t('config.syncGitHubExpired'))
          else if (answer.status === 'denied') setFailed(t('config.syncGitHubDenied'))
          else if (answer.status === 'error') setFailed(t('config.syncGitHubFailed', { error: answer.message ?? '' }))
        } catch (reason) {
          // One failed call is not the end of the sign-in: say so and ask again on the same cadence.
          if (active) { setFailed(message(reason)); setPollTick(current => current + 1) }
        }
      })()
    }, Math.max(pollMs, 1_000))
    return () => { active = false; clearTimeout(timer) }
  }, [client, flow?.userCode, signedIn, pollMs, pollTick, onReadGitHub, t])

  /** Choosing a repository connects it; the GitHub grant then authenticates, so no token is kept. */
  const choose = async (repository: MnemonSyncGitHubRepository): Promise<void> => {
    setBusy('choose'); setFailed(null)
    try {
      await client.configureSync({ repoUrl: repository.url, token: null })
      await onConnected()
    } catch (reason) {
      setFailed(message(reason))
    } finally { setBusy(null) }
  }

  const create = async (name: string): Promise<void> => {
    setBusy('create'); setFailed(null)
    try {
      const created = await client.githubCreateRepository(name, true)
      await client.configureSync({ repoUrl: created.url, token: null })
      await onConnected()
    } catch (reason) {
      setFailed(failureText(t, reasonOf(reason), message(reason), ''))
    } finally { setBusy(null) }
  }

  return <>
    {!signedIn && flow === undefined && <>
      <p className={css.editorNote}>{github.writable ? t('config.syncGitHubHint') : t('config.syncGitHubReadOnly')}</p>
      <div className={css.rowActions}>
        <Button variant="primary" size="sm" disabled={disabled || !github.writable || busy !== null} onClick={() => void start()}>
          {busy === 'start' ? t('config.syncGitHubStarting') : t('config.syncGitHubSignIn')}</Button>
        {cancellable && <Button variant="ghost" size="sm" disabled={busy !== null} onClick={onCancel}>{t('common.cancel')}</Button>}
      </div>
    </>}
    {!signedIn && flow !== undefined && <div className={css.syncDevice}>
      <p className={css.editorNote}>{t('config.syncGitHubCode')}</p>
      <div className={css.syncCode}>
        <code>{flow.userCode}</code>
        <Button variant="primary" size="sm" onClick={() => void copyAndOpen()}>{t('config.syncGitHubCopyOpen')}</Button>
        <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void cancel()}>{t('common.cancel')}</Button>
      </div>
      <p className={css.editorNote} role="status">{copied ? t('config.syncGitHubCopied') : t('config.syncGitHubWaiting')}</p>
    </div>}
    {signedIn && <>
      <div className={css.syncAccount}>
        <span>{github.login === undefined ? t('config.syncViaGitHubAnonymous') : t('config.syncGitHubSignedIn', { login: github.login })}</span>
        <Button variant="ghost" size="sm" disabled={disabled || busy !== null} onClick={() => void signOut()}>{t('config.syncGitHubSignOut')}</Button>
      </div>
      <RepositoryPicker client={client} login={github.login} current={props.status.config.repoUrl} disabled={disabled || busy !== null}
        creating={busy === 'create'} t={t} onChoose={choose} onCreate={create} onSignInAgain={() => void signInAgain()} />
      {cancellable && <div className={css.rowActions}><Button variant="ghost" size="sm" disabled={busy !== null} onClick={onCancel}>{t('common.cancel')}</Button></div>}
    </>}
    {failed !== null && <p className={css.error} role="alert">{failed}</p>}
  </>
}

interface RepositoryPickerProps {
  client: MnemonClient
  login: string | undefined
  current: string | undefined
  disabled: boolean
  creating: boolean
  t: MnemonTranslate
  onChoose: (repository: MnemonSyncGitHubRepository) => Promise<void>
  onCreate: (name: string) => Promise<void>
  onSignInAgain: () => void
}

/**
 * The account's repositories, searched by name. A name that matches none can be
 * created on the spot, private; a public repository is used only after the
 * reader confirms that anyone can then read the memory.
 */
function RepositoryPicker({ client, login, current, disabled, creating, t, onChoose, onCreate, onSignInAgain }: RepositoryPickerProps): JSX.Element {
  const [repositories, setRepositories] = useState<MnemonSyncGitHubRepository[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<{ text: string; expired: boolean } | null>(null)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<MnemonSyncGitHubRepository | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true); setFailed(null)
    try {
      setRepositories((await client.githubRepositories()).repositories)
    } catch (reason) {
      const expired = reasonOf(reason) === 'github-unauthorized'
      setFailed({ text: expired ? t('config.syncGitHubExpiredGrant') : t('config.syncRepositoriesFailed', { error: message(reason) }), expired })
    } finally { setLoading(false) }
  }, [client, t])

  useEffect(() => { void load() }, [load])

  const needle = query.trim().toLowerCase()
  const matches = (repositories ?? []).filter(repository => needle === '' || repository.fullName.toLowerCase().includes(needle))
  // A name is taken only under the account it would be created in; another owner's repository of that name is not.
  const exact = (repositories ?? []).some(repository => repository.name.toLowerCase() === needle && (login === undefined || repository.owner.toLowerCase() === login.toLowerCase()))
  const creatable = needle !== '' && !exact && repositoryNameValid(query) && !query.includes('/')

  const pick = (repository: MnemonSyncGitHubRepository): void => {
    if (!repository.private) { setConfirming(repository); return }
    void onChoose(repository)
  }

  return <div className={css.syncPicker}>
    <div className={css.fieldGrid}>
      <label>{t('config.syncRepositoryLabel')}
        <input type="search" value={query} aria-label={t('config.syncRepositorySearch')} placeholder={t('config.syncRepositorySearch')} disabled={disabled}
          autoComplete="off" spellCheck={false} autoCapitalize="none" autoCorrect="off" onChange={event => setQuery(event.target.value)} />
      </label>
    </div>
    {loading && repositories === null && <p className={css.editorNote} role="status">{t('config.syncRepositoriesLoading')}</p>}
    {failed !== null && <div className={css.syncWarning} role="alert">
      <span>{failed.text}</span>
      {failed.expired
        ? <Button variant="ghost" size="sm" onClick={onSignInAgain}>{t('config.syncGitHubSignInAgain')}</Button>
        : <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>{t('config.syncRepositoriesRetry')}</Button>}
    </div>}
    {repositories !== null && <ul className={css.syncRepositoryList} aria-label={t('config.syncRepositoryLabel')}>
      {creatable && <li>
        <button type="button" className={css.syncRepositoryOption} disabled={disabled} onClick={() => void onCreate(query.trim())}>
          <span>{creating ? t('config.syncRepositoryCreating') : t('config.syncRepositoryCreate', { name: (login === undefined ? '' : login + '/') + query.trim() })}</span>
          <Tag tone="quiet">{t('config.syncRepositoryPrivate')}</Tag>
        </button>
      </li>}
      {matches.slice(0, SHOWN_REPOSITORIES).map(repository => <li key={repository.fullName}>
        <button type="button" className={css.syncRepositoryOption} disabled={disabled || !repository.push} aria-current={repository.url === current ? 'true' : undefined}
          onClick={() => pick(repository)}>
          <span>{repository.fullName}</span>
          {repository.url === current && <Tag tone="outline">{t('config.syncRepositoryCurrent')}</Tag>}
          {!repository.push && <Tag tone="quiet">{t('config.syncRepositoryNoPush')}</Tag>}
          <Tag tone="quiet">{repository.private ? t('config.syncRepositoryPrivate') : t('config.syncRepositoryPublic')}</Tag>
        </button>
      </li>)}
      {matches.length === 0 && !creatable && <li className={css.editorNote}>{needle === '' ? t('config.syncRepositoriesNone') : t('config.syncRepositoriesEmpty')}</li>}
      {matches.length > SHOWN_REPOSITORIES && <li className={css.editorNote}>{t('config.syncRepositoriesMore', { count: matches.length - SHOWN_REPOSITORIES })}</li>}
    </ul>}
    {needle !== '' && !creatable && !exact && !repositoryNameValid(query) && !query.includes('/') && <p className={css.error}>{t('config.syncRepositoryNameInvalid')}</p>}
    {confirming !== null && <SyncConfirmDialog title={t('config.syncPublicTitle')} body={t('config.syncPublicBody', { name: confirming.fullName })}
      confirm={t('config.syncPublicConfirm')} t={t} onClose={() => setConfirming(null)}
      onConfirm={() => { const repository = confirming; setConfirming(null); void onChoose(repository) }} />}
  </div>
}

/**
 * What this computer is called, where on the branch the memory goes and whose name
 * its commits carry. Each field shows the value in use; the computer's name is the
 * host name or a typed one, and the author an explicit choice between the channel's
 * own identity, this computer's Git identity, and a typed one.
 */
function AdvancedSettings({ client, status, disabled, t, onSaved }: { client: MnemonClient; status: MnemonSyncStatus; disabled: boolean; t: MnemonTranslate; onSaved: () => Promise<void> }): JSX.Element {
  const [open, setOpen] = useState(false)
  const config = status.config
  const savedMode = authorModeOf(config.authorName, config.authorEmail)
  const [branch, setBranch] = useState(config.branch)
  const [subdir, setSubdir] = useState(config.subdir)
  const [mode, setMode] = useState<AuthorMode>(savedMode)
  const [name, setName] = useState(savedMode === 'custom' ? config.authorName : '')
  const [email, setEmail] = useState(savedMode === 'custom' ? config.authorEmail : '')
  // This computer's name: its host name, which it then follows, or one typed here.
  const savedLabel = status.machine?.label ?? ''
  const savedSource: MnemonMachineLabelSource = status.machineLabel?.source ?? 'hostname'
  const hostname = status.machineLabel?.hostname ?? savedLabel
  const [nameSource, setNameSource] = useState<MnemonMachineLabelSource>(savedSource)
  const [machineName, setMachineName] = useState(savedSource === 'custom' ? savedLabel : '')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const radio = useId()
  const nameRadio = useId()

  // The saved values seed the form again whenever the Host reports new ones.
  useEffect(() => {
    setBranch(config.branch); setSubdir(config.subdir)
    const next = authorModeOf(config.authorName, config.authorEmail)
    setMode(next)
    setName(next === 'custom' ? config.authorName : ''); setEmail(next === 'custom' ? config.authorEmail : '')
  }, [config.branch, config.subdir, config.authorName, config.authorEmail])
  useEffect(() => {
    setNameSource(savedSource); setMachineName(savedSource === 'custom' ? savedLabel : '')
  }, [savedSource, savedLabel])

  const author = mode === 'default'
    ? { authorName: MNEMON_SYNC_DEFAULT_AUTHOR_NAME, authorEmail: MNEMON_SYNC_DEFAULT_AUTHOR_EMAIL }
    : mode === 'machine' ? { authorName: '', authorEmail: '' } : { authorName: name.trim(), authorEmail: email.trim() }
  const branchOk = branchValid(branch)
  const subdirOk = directoryValid(subdir)
  // A saved author kept as it is never blocks another change, even one an older version
  // stored with a single field; a typed custom author needs both.
  const authorChanged = author.authorName !== config.authorName || author.authorEmail !== config.authorEmail
  const customOk = mode !== 'custom' || !authorChanged || (name.trim() !== '' && emailValid(email))
  const normalizedSubdir = subdir.trim().replaceAll('\\', '/').split('/').filter(part => part !== '').join('/') + '/'
  const moved = branch.trim() !== config.branch || normalizedSubdir !== config.subdir
  const nameOk = nameSource === 'hostname' || machineNameValid(machineName)
  const renamed = nameSource !== savedSource || (nameSource === 'custom' && machineName.trim() !== savedLabel)
  const changed = moved || renamed || author.authorName !== config.authorName || author.authorEmail !== config.authorEmail
  const ready = changed && branchOk && subdirOk && customOk && nameOk
  // The name a version will carry once this form is saved, as history will show it.
  const shownName = nameSource === 'hostname' ? hostname : machineName.trim()

  const save = async (): Promise<void> => {
    if (!ready || busy) return
    setBusy(true); setFeedback(null)
    try {
      await client.configureSync({
        branch: branch.trim(), subdir: subdir.trim(), ...author,
        ...(renamed ? { machineLabel: nameSource === 'hostname' ? null : machineName.trim() } : {}),
      })
      setFeedback({ tone: 'success', text: t('config.syncAdvancedSaved') })
      void onSaved()
    } catch (reason) {
      setFeedback({ tone: 'error', text: message(reason) })
    } finally { setBusy(false) }
  }

  return <div className={css.syncAdvanced}>
    <button type="button" className={css.syncDisclosure} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>{t('config.syncAdvanced')}</span>
      <small>{[savedLabel, config.branch, config.subdir, savedMode === 'default' ? t('config.syncAuthorDefault') : savedMode === 'machine' ? t('config.syncAuthorMachine') : config.authorName || config.authorEmail || t('config.syncAuthorCustom')].filter(part => part !== '').join(' · ')}</small>
      <IconChevronDownOutlineRegular className={css.providerChevron} size={14} />
    </button>
    {open && <div className={css.editor}>
      {status.machine !== undefined && <div className={css.syncChoice}>
        <span className={css.syncFieldLabel} id={nameRadio + '-label'}>{t('config.syncMachineName')}</span>
        <div className={css.inlineChoices} role="radiogroup" aria-labelledby={nameRadio + '-label'}>
          {(['hostname', 'custom'] as const).map(value => <label key={value}>
            <input type="radio" name={nameRadio} value={value} checked={nameSource === value} disabled={disabled || busy} onChange={() => setNameSource(value)} />
            <span>{value === 'hostname' ? t('config.syncMachineHostname') : t('config.syncMachineCustom')}</span>
          </label>)}
        </div>
        {nameSource === 'custom' && <div className={css.fieldGrid}>
          <label>{t('config.syncMachineNameLabel')}
            <input type="text" value={machineName} aria-label={t('config.syncMachineName')} disabled={disabled || busy}
              aria-invalid={machineName.trim() === '' || nameOk ? undefined : true} autoComplete="off" spellCheck={false}
              onChange={event => setMachineName(event.target.value)} />
            {machineName.trim() !== '' && !nameOk && <small className={css.error}>{t('config.syncMachineNameInvalid')}</small>}
          </label>
        </div>}
        {(nameSource === 'hostname' || nameOk) && <p className={css.editorNote}>
          {nameSource === 'hostname' ? t('config.syncMachineHostnameNote', { name: shownName }) : t('config.syncMachineCustomNote', { name: shownName })}
        </p>}
      </div>}
      <div className={css.fieldGrid}>
        <label>{t('config.syncBranch')}
          <input type="text" value={branch} aria-label={t('config.syncBranch')} disabled={disabled || busy} aria-invalid={branchOk ? undefined : true}
            autoComplete="off" spellCheck={false} autoCapitalize="none" autoCorrect="off" onChange={event => setBranch(event.target.value)} />
          <small>{branchOk ? t('config.syncDefaultValue', { value: MNEMON_SYNC_DEFAULT_BRANCH }) : t('config.syncBranchInvalid')}</small>
        </label>
        <label>{t('config.syncSubdir')}
          <input type="text" value={subdir} aria-label={t('config.syncSubdir')} disabled={disabled || busy} aria-invalid={subdirOk ? undefined : true}
            autoComplete="off" spellCheck={false} autoCapitalize="none" autoCorrect="off" onChange={event => setSubdir(event.target.value)} />
          <small>{subdirOk ? t('config.syncDefaultValue', { value: MNEMON_SYNC_DEFAULT_SUBDIR }) : t('config.syncSubdirInvalid')}</small>
        </label>
      </div>
      <div className={css.syncChoice}>
        <span className={css.syncFieldLabel} id={radio + '-label'}>{t('config.syncAuthor')}</span>
        <div className={css.inlineChoices} role="radiogroup" aria-labelledby={radio + '-label'}>
          {(['default', 'machine', 'custom'] as const).map(value => <label key={value}>
            <input type="radio" name={radio} value={value} checked={mode === value} disabled={disabled || busy} onChange={() => setMode(value)} />
            <span>{value === 'default' ? t('config.syncAuthorDefault') : value === 'machine' ? t('config.syncAuthorMachine') : t('config.syncAuthorCustom')}</span>
          </label>)}
        </div>
        {mode === 'default' && <p className={css.editorNote}>{t('config.syncAuthorDefaultNote', { identity: DEFAULT_AUTHOR })}</p>}
        {mode === 'machine' && <p className={css.editorNote}>{t('config.syncAuthorMachineNote')}</p>}
        {mode === 'custom' && <div className={css.fieldGrid}>
          <label>{t('config.syncAuthorName')}
            <input type="text" value={name} aria-label={t('config.syncAuthorName')} disabled={disabled || busy} autoComplete="off" spellCheck={false} onChange={event => setName(event.target.value)} />
          </label>
          <label>{t('config.syncAuthorEmail')}
            <input type="email" value={email} aria-label={t('config.syncAuthorEmail')} disabled={disabled || busy} aria-invalid={email.trim() === '' || emailValid(email) ? undefined : true}
              autoComplete="off" spellCheck={false} onChange={event => setEmail(event.target.value)} />
            {email.trim() !== '' && !emailValid(email) && <small className={css.error}>{t('config.syncAuthorEmailInvalid')}</small>}
          </label>
        </div>}
      </div>
      <div className={css.memoryConfigFooter}>
        <div className={css.configFeedback} aria-live="polite">
          {feedback !== null ? <FeedbackLine value={feedback} />
            : moved && branchOk && subdirOk ? <span className={css.editorNote}>{t('config.syncAdvancedNote')}</span>
              : renamed && nameOk ? <span className={css.editorNote}>{t('config.syncMachineRenameNote')}</span> : null}
        </div>
        <div>
          <Button variant="primary" size="sm" disabled={disabled || !ready || busy} onClick={() => void save()}>{busy ? t('config.syncSaving') : t('config.syncSave')}</Button>
        </div>
      </div>
    </div>}
  </div>
}
