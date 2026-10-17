/**
 * The rules a Git sync setting meets, shared by the settings form, which checks a field as the user
 * types it, and the Host, which checks what it saves and what it reads back. They import nothing,
 * so the browser bundle takes them too; each side keeps its own messages.
 */

/** The longest name an installation carries; a host name past it is shortened. */
export const MNEMON_MACHINE_LABEL_MAX = 120

const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u
const HTTPS = /^https:\/\/[^\s/]+(?::\d+)?\/[^\s]+$/u
const SSH = /^ssh:\/\/[^\s/]+(?::\d+)?\/[^\s]+$/u
const SCP = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/u
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u
const EMBEDDED_CREDENTIAL = /^https:\/\/[^/]*@/u
const EMAIL = /^[^\s<>@]+@[^\s<>@]+$/u
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/u
// A name is shown on one line of a history row, so it carries no control characters.
const CONTROL = /[\p{Cc}\u2028\u2029]/u
const GITHUB_REPOSITORY = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/u

/** A Git branch name: no revision syntax, no empty path segment, no trailing dot or lock suffix. */
export function syncBranchValid(name: string): boolean {
  return name !== '' && name.length <= 200 && BRANCH.test(name) && !name.includes('..') && !name.includes('//')
    && !name.includes('@{') && !name.includes('\\') && !name.startsWith('/') && !name.endsWith('/')
    && !name.endsWith('.') && !name.endsWith('.lock') && name !== '@'
}

/** The parts of a directory inside the branch, or undefined when it is not one: relative, with no `.`, `..` or drive. */
export function syncDirectoryParts(value: string): string[] | undefined {
  const raw = value.trim().replaceAll('\\', '/')
  if (raw === '' || raw.length > 400 || /^[A-Za-z]:/u.test(raw)) return undefined
  const parts = raw.split('/').filter(part => part !== '')
  return parts.length === 0 || parts.some(part => part === '.' || part === '..' || part.includes(':')) ? undefined : parts
}

/** What is wrong with a repository address. */
export type MnemonSyncRepositoryProblem = 'format' | 'credentials'

/**
 * What is wrong with a repository address, or nothing for an https:// or ssh:// URL without
 * credentials in it, a git@host:path address, or a local path that `localPath` takes.
 */
export function syncRepositoryProblem(url: string, localPath: (path: string) => boolean): MnemonSyncRepositoryProblem | undefined {
  if (url === '' || url.length > 2000 || /\s/u.test(url)) return 'format'
  if (SCHEME.test(url)) {
    if (!HTTPS.test(url) && !SSH.test(url)) return 'format'
    return EMBEDDED_CREDENTIAL.test(url) ? 'credentials' : undefined
  }
  return SCP.test(url) || localPath(url) ? undefined : 'format'
}

/**
 * A local path that is absolute on POSIX or on Windows, for the browser, which cannot tell which
 * platform the Host runs on: a POSIX path, a Windows path on a drive, or a UNC share. The Host
 * checks a path by its own platform's rule instead.
 */
export function portableAbsolutePath(path: string): boolean {
  return path.startsWith('/') || WINDOWS_DRIVE.test(path) || path.startsWith('\\\\')
}

/** A commit author's address. */
export function syncEmailValid(email: string): boolean {
  return email.length <= 320 && EMAIL.test(email)
}

/** A name for this machine, as it is stored and shown: one line of at most MNEMON_MACHINE_LABEL_MAX characters. */
export function machineLabelValid(label: string): boolean {
  return label !== '' && label.length <= MNEMON_MACHINE_LABEL_MAX && !CONTROL.test(label)
}

/** A GitHub repository name, as GitHub accepts one. */
export function githubRepositoryNameValid(name: string): boolean {
  return GITHUB_REPOSITORY.test(name)
}
