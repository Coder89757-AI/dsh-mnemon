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
const HTTPS_USER = /^https:\/\/([^/]*)@/u
// The characters RFC 3986 lets the user part of a URL carry, its password's colon aside, or escaped ones.
const USER_TEXT = /^(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})+$/u
// What a user name never holds once read as Git reads it: a password's colon, another `@`, a control
// character or a space.
const NOT_A_NAME = /[:@\s\p{Cc}]/u
// What a user name never is: a token as GitHub, GitLab, Hugging Face and Atlassian prefix theirs; 32 or
// more hexadecimal digits, as Gitee's and Gitea's tokens are; or 52 or more letters and digits, as
// Azure DevOps' tokens are, which is longer than a user or organization name those hosts allow.
const TOKEN_SHAPE = /^(?:gh[opsru]_|github_pat_|glpat-|gldt-|glcbt-|hf_|ATBB|ATCTT|ATATT)|^[0-9A-Fa-f]{32,}$|^[A-Za-z0-9]{52,}$/u
const USER_NAME_MAX = 100
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
 * credentials in it, a git@host:path address, or a local path that `localPath` takes. An HTTPS
 * address may name the user a host wants its token offered under, as Bitbucket's do, but never a
 * password, nor a token written where that name goes.
 */
export function syncRepositoryProblem(url: string, localPath: (path: string) => boolean): MnemonSyncRepositoryProblem | undefined {
  if (url === '' || url.length > 2000 || /\s/u.test(url)) return 'format'
  if (SCHEME.test(url)) {
    if (!HTTPS.test(url) && !SSH.test(url)) return 'format'
    const user = HTTPS_USER.exec(url)?.[1]
    return user === undefined || syncUserName(user) ? undefined : 'credentials'
  }
  return SCP.test(url) || localPath(url) ? undefined : 'format'
}

/**
 * Whether the user part of an HTTPS address is a user name. It is judged as Git reads it, with its
 * escapes decoded, so an escaped colon, an escaped token prefix or an escaped line break counts as what
 * it decodes to; one that does not decode is no name at all.
 */
function syncUserName(written: string): boolean {
  if (!USER_TEXT.test(written)) return false
  let name: string
  try {
    name = decodeURIComponent(written)
  } catch {
    return false
  }
  return name.length <= USER_NAME_MAX && !NOT_A_NAME.test(name) && !TOKEN_SHAPE.test(name)
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
