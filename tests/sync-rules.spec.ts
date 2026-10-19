import { posix, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { branchValid, directoryValid, emailValid, machineNameValid, repositoryNameValid, repositoryProblem } from '../src/client/sync-view.ts'
import { MNEMON_GITHUB_DEFAULT_CLIENT_ID, MnemonGitHubAuth } from '../src/host/github-auth.ts'
import { machineLabel } from '../src/host/machine-identity.ts'
import { MNEMON_MACHINE_LABEL_MAX, portableAbsolutePath, syncRepositoryProblem } from '../src/host/protocol.ts'
import { syncAuthorEmail, syncBranch, syncRepositoryUrl, syncSubdirectory } from '../src/host/sync-config.ts'

/** Whether a Host check takes a value, which it refuses by throwing. */
function takes(check: (value: unknown) => unknown, value: string): boolean {
  try {
    check(value)
    return true
  } catch {
    return false
  }
}

const BRANCHES = ['mnemon-sync', 'user/mnemon-sync', 'v1.2', 'a', ' padded ', '', ' ', '-x', '.x', 'x.', 'x.lock', 'x/', '/x', 'a//b', 'a..b', 'a@{1}', '@', 'a\\b', 'a b', 'ä', 'x'.repeat(200), 'x'.repeat(201)]
const DIRECTORIES = ['mnemon', 'mnemon/', '/nested/memory/', 'a\\b', ' a ', '', '/', '.', '..', 'a/../b', 'a/./b', 'C:/x', 'c:x', 'a:b', 'x'.repeat(400), 'x'.repeat(401)]
const ADDRESSES = ['me@example.com', ' me@example.com ', 'a@b', 'me', '@example.com', 'me@', 'me@@example.com', 'me @example.com', '<me>@example.com', 'x'.repeat(310) + '@example.com']

describe('sync setting rules shared by the form and the Host', () => {
  it('take the same branch names, directories and author addresses on both sides', () => {
    for (const name of BRANCHES) expect(branchValid(name), name).toBe(takes(syncBranch, name))
    expect(BRANCHES.filter(branchValid)).toEqual(['mnemon-sync', 'user/mnemon-sync', 'v1.2', 'a', ' padded ', 'x'.repeat(200)])
    for (const directory of DIRECTORIES) expect(directoryValid(directory), directory).toBe(takes(syncSubdirectory, directory))
    expect(DIRECTORIES.filter(directoryValid)).toEqual(['mnemon', 'mnemon/', '/nested/memory/', 'a\\b', ' a ', 'x'.repeat(400)])
    // An empty author address means this machine's own Git identity, which the form offers as a choice of its own.
    for (const address of ADDRESSES) expect(emailValid(address), address).toBe(takes(syncAuthorEmail, address))
    expect(syncAuthorEmail('')).toBe('')
  })

  it('check a repository address alike, except a local path, which only the Host can check by its platform', () => {
    const remote = {
      'https://github.com/example/memory.git': undefined, 'ssh://git@github.com:22/example/memory.git': undefined, 'git@github.com:example/memory.git': undefined,
      'https://user:secret@github.com/example/memory.git': 'credentials', 'https://user:@github.com/example/memory.git': 'credentials',
      // A user name the host wants a token under may stay in the address (#408); a password or a token may not.
      'https://x-token-auth@bitbucket.org/team/memory.git': undefined, 'https://alice@git.example.com:8443/memory.git': undefined,
      'https://gitlab+deploy-token-7@gitlab.com/team/memory.git': undefined, 'https://al!ce@github.com/example/memory.git': undefined,
      'https://alice%2Dsmith@git.example.com/memory.git': undefined,
      // A long Azure DevOps organization name, 50 letters and digits, the most it allows.
      ['https://' + 'contoso'.repeat(7) + 'w@dev.azure.com/contoso/memory/_git/memory']: undefined,
      ['https://' + 'z'.repeat(51) + '@git.example.com/memory.git']: undefined,
      'https://ghp_0123456789abcdefABCDEF0123456789abcd@github.com/example/memory.git': 'credentials',
      'https://github_pat_11ABCDEFG0123456789_abcdefghij@github.com/example/memory.git': 'credentials',
      'https://glpat-abcdefghij0123456789@gitlab.com/team/memory.git': 'credentials',
      'https://gldt-abcdefghij0123456789@gitlab.com/team/memory.git': 'credentials',
      'https://glcbt-abcdefghij0123456789@gitlab.com/team/memory.git': 'credentials',
      'https://hf_abcdefghijklmnopqrstuvwxyz0123456@huggingface.co/team/memory': 'credentials',
      'https://0123456789abcdef0123456789abcdef@gitee.com/team/memory.git': 'credentials',
      ['https://' + 'z'.repeat(52) + '@git.example.com/memory.git']: 'credentials',
      'https://@github.com/example/memory.git': 'credentials', 'https://a@b@github.com/example/memory.git': 'credentials',
      ['https://' + 'a-'.repeat(51) + '@github.com/example/memory.git']: 'credentials', 'https://al#ce@github.com/example/memory.git': 'credentials',
      // Escapes are read as Git reads them: an escaped colon is a password, an escaped prefix a token.
      'https://alice%3Ahunter2@git.example.com/memory.git': 'credentials', 'https://alice%40example.com@git.example.com/memory.git': 'credentials',
      'https://%67hp_0123456789abcdefABCDEF0123456789abcd@github.com/example/memory.git': 'credentials',
      'https://alice%0A@git.example.com/memory.git': 'credentials', 'https://alice%0D@git.example.com/memory.git': 'credentials',
      'https://alice%20smith@git.example.com/memory.git': 'credentials', 'https://alice%zz@git.example.com/memory.git': 'credentials',
      'https://%C3@git.example.com/memory.git': 'credentials',
      'ssh://user@github.com/example/memory.git': undefined, 'ftp://host/repo': 'format', 'file:///srv/memory.git': 'format',
      'https://github.com': 'format', 'github.com/example/memory': 'format', 'https://github.com/example/memory.git extra': 'format', ['https://x/' + 'y'.repeat(2000)]: 'format',
    } as const
    for (const [address, problem] of Object.entries(remote)) {
      expect(repositoryProblem(address), address).toBe(problem)
      expect(syncRepositoryProblem(address, posix.isAbsolute), address).toBe(problem)
      expect(syncRepositoryProblem(address, win32.isAbsolute), address).toBe(problem)
    }
    // The form takes a path that is absolute on either platform; the Host takes one by its own.
    const local = [
      ['/srv/memory.git', true, true, true], ['C:\\memory\\repo.git', true, false, true], ['C:/memory/repo.git', true, false, true],
      ['\\\\server\\share\\repo.git', true, false, true], ['//server/share/repo.git', true, true, true],
      // A Windows path from the root of the current drive: absolute to Node on Windows, not to the form.
      ['\\memory\\repo.git', false, false, true], ['C:repo.git', false, false, false], ['relative/path', false, false, false], ['~/memory.git', false, false, false],
    ] as const
    for (const [path, form, onPosix, onWindows] of local) {
      expect(portableAbsolutePath(path), path).toBe(form)
      expect(repositoryProblem(path), path).toBe(form ? undefined : 'format')
      expect(syncRepositoryProblem(path, posix.isAbsolute), path).toBe(onPosix ? undefined : 'format')
      expect(syncRepositoryProblem(path, win32.isAbsolute), path).toBe(onWindows ? undefined : 'format')
    }
    // An empty address clears the repository in the form; the Host never stores one.
    expect(repositoryProblem('  ')).toBeUndefined()
    expect(() => syncRepositoryUrl('  ')).toThrow('sync repository must be an https:// or ssh:// URL')
  })

  it('leave refusing a NUL byte to the Host, with the messages it gives', () => {
    expect(repositoryProblem('/srv/memory\0.git')).toBeUndefined()
    expect(() => syncRepositoryUrl('/srv/memory\0.git')).toThrow('sync repository must be an https:// or ssh:// URL, a git@host:path address, or an absolute local path')
    expect(() => syncRepositoryUrl('https://user@github.com/memory\0.git')).toThrow('sync repository must be an https:// or ssh:// URL')
    expect(directoryValid('mnemon\0')).toBe(true)
    expect(() => syncSubdirectory('mnemon\0')).toThrow('sync directory must be a relative path inside the branch')
  })

  it('name a machine and a GitHub repository by one rule on both sides', async () => {
    const names = ['Studio', '  Studio  ', '', '   ', 'two\nlines', 'tab\tbed', 'line\u2028separated', 'x'.repeat(MNEMON_MACHINE_LABEL_MAX), 'x'.repeat(MNEMON_MACHINE_LABEL_MAX + 1)]
    for (const name of names) expect(machineNameValid(name), name).toBe(takes(machineLabel, name))
    expect(names.filter(machineNameValid)).toEqual(['Studio', '  Studio  ', 'x'.repeat(MNEMON_MACHINE_LABEL_MAX)])
    // GitHub sign-in checks the name before it asks GitHub, which answers here with a created repository.
    const grant = { version: 1 as const, accessToken: 'gho_rules', savedAt: 'now' }
    const port = { available: () => true, describe: async () => ({ configured: true, writable: true }), read: async () => grant, write: async () => {}, clear: async () => {} }
    const created = { name: 'memory', full_name: 'octocat/memory', clone_url: 'https://github.com/octocat/memory.git', private: true, default_branch: 'main', owner: { login: 'octocat' }, permissions: { push: true } }
    const request = (async () => new Response(JSON.stringify(created), { status: 201, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const github = new MnemonGitHubAuth(port, MNEMON_GITHUB_DEFAULT_CLIENT_ID, () => 0, request)
    const repositories = ['mnemon-memory', ' memory ', 'a.b_c-d', '.', '..', '...', 'a/b', 'has space', '', 'x'.repeat(100), 'x'.repeat(101)]
    for (const name of repositories) {
      const accepted = await github.create(name, true).then(() => true, (error: Error) => {
        expect(error.message).toBe('a GitHub repository name holds letters, digits, dots, dashes and underscores')
        return false
      })
      expect(repositoryNameValid(name), name).toBe(accepted)
    }
    expect(repositories.filter(repositoryNameValid)).toEqual(['mnemon-memory', ' memory ', 'a.b_c-d', '...', 'x'.repeat(100)])
  })
})
