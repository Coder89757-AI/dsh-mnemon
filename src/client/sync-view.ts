import {
  MNEMON_SYNC_DEFAULT_AUTHOR_EMAIL,
  MNEMON_SYNC_DEFAULT_AUTHOR_NAME,
  MNEMON_SYNC_TOKEN_ENV,
  type MnemonSyncFailureReason,
  type MnemonSyncRemoteIssue,
  type MnemonSyncStatus,
} from '../host/protocol.ts'
import type { MnemonTranslate } from './locales.ts'

/** How Git reaches a repository, which decides what a credential means for it. */
export type SyncTransport = 'https' | 'ssh' | 'local'

/** The transport one repository address uses. */
export function transportOf(url: string): SyncTransport {
  const value = url.trim()
  if (/^https:\/\//iu.test(value)) return 'https'
  if (/^ssh:\/\//iu.test(value) || /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/u.test(value)) return 'ssh'
  return 'local'
}

/** Whether an address is HTTPS on github.com, the only host a GitHub sign-in is offered to. */
export function onGitHub(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'github.com'
  } catch {
    return false
  }
}

/** A repository address as a reader recognizes it: host and path, without the scheme or `.git`. */
export function repositoryName(url: string): string {
  const value = url.trim()
  if (transportOf(value) !== 'https' && !/^ssh:\/\//iu.test(value)) return value
  try {
    const parsed = new URL(value)
    return (parsed.host + parsed.pathname).replace(/\.git$/u, '').replace(/\/$/u, '')
  } catch {
    return value
  }
}

/** What is wrong with a typed repository address, the same rules the Host applies. */
export type RepositoryProblem = 'format' | 'credentials'

export function repositoryProblem(url: string): RepositoryProblem | undefined {
  const value = url.trim()
  if (value === '') return undefined
  if (value.length > 2000 || /\s/u.test(value)) return 'format'
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(value)) {
    if (!/^(https|ssh):\/\/[^\s/]+(?::\d+)?\/[^\s]+$/u.test(value)) return 'format'
    return /^https:\/\/[^/]*@/u.test(value) ? 'credentials' : undefined
  }
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/u.test(value)) return undefined
  // An absolute path on the Host: POSIX, a Windows drive, or a UNC share.
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\') ? undefined : 'format'
}

/** A Git branch name, as the Host checks it. */
export function branchValid(value: string): boolean {
  const name = value.trim()
  return name !== '' && name.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(name) && !name.includes('..') && !name.includes('//')
    && !name.includes('@{') && !name.endsWith('/') && !name.endsWith('.') && !name.endsWith('.lock')
}

/** A directory inside the branch, as the Host checks it. */
export function directoryValid(value: string): boolean {
  const raw = value.trim().replaceAll('\\', '/')
  if (raw === '' || raw.length > 400 || /^[A-Za-z]:/u.test(raw)) return false
  const parts = raw.split('/').filter(part => part !== '')
  return parts.length > 0 && !parts.some(part => part === '.' || part === '..' || part.includes(':'))
}

export function emailValid(value: string): boolean {
  const email = value.trim()
  return email.length <= 320 && /^[^\s<>@]+@[^\s<>@]+$/u.test(email)
}

/** A GitHub repository name, as GitHub accepts one. */
export function repositoryNameValid(value: string): boolean {
  return /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/u.test(value.trim())
}

/** Who a sync commit names: the channel's identity, this computer's Git identity, or a typed one. */
export type AuthorMode = 'default' | 'machine' | 'custom'

export function authorModeOf(name: string, email: string): AuthorMode {
  if (name === MNEMON_SYNC_DEFAULT_AUTHOR_NAME && email === MNEMON_SYNC_DEFAULT_AUTHOR_EMAIL) return 'default'
  if (name === '' && email === '') return 'machine'
  return 'custom'
}

/** The channel identity as a commit shows it. */
export const DEFAULT_AUTHOR = MNEMON_SYNC_DEFAULT_AUTHOR_NAME + ' <' + MNEMON_SYNC_DEFAULT_AUTHOR_EMAIL + '>'

/** The intervals automatic sync offers, in minutes; off first, then an hour up to a week. */
export const AUTO_SYNC_CHOICES: readonly number[] = [0, 60, 180, 360, 720, 1_440, 4_320, 10_080]

/** One interval as a reader reads it. */
export function intervalLabel(t: MnemonTranslate, minutes: number): string {
  if (minutes <= 0) return t('config.syncAutoOff')
  if (minutes === 60) return t('config.syncAutoHour')
  if (minutes === 1_440) return t('config.syncAutoDay')
  if (minutes % 1_440 === 0) return t('config.syncAutoDays', { days: minutes / 1_440 })
  return t('config.syncAutoHours', { hours: minutes / 60 })
}

/** A time as a short local stamp: the time alone today, the date beside it otherwise. */
export function when(value: string | undefined, now: Date = new Date()): string {
  if (value === undefined) return ''
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return value
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  return sameDay
    ? at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : at.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Why a remote could not be read, said for the transport the repository uses. */
export function issueText(t: MnemonTranslate, issue: MnemonSyncRemoteIssue | undefined, url: string, error?: string): string {
  const transport = transportOf(url)
  switch (issue) {
    case 'auth':
      // A GitHub sign-in is offered to github.com alone; any other HTTPS host takes a token.
      if (transport === 'https') return onGitHub(url) ? t('config.syncIssueAuthHttps') : t('config.syncIssueAuthToken')
      return transport === 'ssh' ? t('config.syncIssueAuthSsh') : t('config.syncIssueAuth')
    case 'not-found':
      return onGitHub(url) ? t('config.syncIssueNotFoundGitHub') : t('config.syncIssueNotFound')
    case 'network': return t('config.syncIssueNetwork')
    case 'timeout': return t('config.syncIssueTimeout')
    default: return t('config.syncIssueUnknown', { error: error ?? '' })
  }
}

const REMOTE_ISSUE: Partial<Record<MnemonSyncFailureReason, MnemonSyncRemoteIssue>> = {
  'remote-auth': 'auth',
  'remote-not-found': 'not-found',
  'remote-network': 'network',
  'remote-timeout': 'timeout',
}

/** A failure the Host named, in this page's language; anything it could not name keeps its own words. */
export function failureText(t: MnemonTranslate, reason: string | undefined, message: string, url: string): string {
  const issue = reason === undefined ? undefined : REMOTE_ISSUE[reason as MnemonSyncFailureReason]
  if (issue !== undefined) return issueText(t, issue, url, message)
  switch (reason) {
    case 'busy': return t('config.syncReasonBusy')
    case 'no-repository': return t('config.syncReasonNoRepository')
    case 'git-missing': return t('config.syncReasonGitMissing')
    case 'remote-empty': return t('config.syncReasonRemoteEmpty')
    case 'push-rejected': return t('config.syncReasonRejected')
    case 'github-unauthorized': return t('config.syncGitHubExpiredGrant')
    default: return message
  }
}

/** The reason a thrown failure carries, when the Host named one. */
export function reasonOf(error: unknown): string | undefined {
  const reason = error instanceof Error ? (error as { reason?: unknown }).reason : undefined
  return typeof reason === 'string' ? reason : undefined
}

/** How a connected repository is authenticated, said as briefly as the state line allows. */
export function credentialText(t: MnemonTranslate, status: MnemonSyncStatus): string | undefined {
  const url = status.config.repoUrl ?? ''
  const transport = transportOf(url)
  if (transport === 'ssh') return t('config.syncViaSsh')
  if (transport === 'local') return undefined
  switch (status.config.credentialSource) {
    case 'github': return status.config.credentialLogin === undefined ? t('config.syncViaGitHubAnonymous') : t('config.syncViaGitHub', { login: status.config.credentialLogin })
    case 'environment': return t('config.syncViaEnvironment', { env: MNEMON_SYNC_TOKEN_ENV })
    case 'token': return t('config.syncViaToken')
    default: return undefined
  }
}
