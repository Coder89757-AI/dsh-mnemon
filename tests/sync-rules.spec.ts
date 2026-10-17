import { posix, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { branchValid, directoryValid, emailValid, machineNameValid, repositoryNameValid, repositoryProblem } from '../src/client/sync-view.ts'
import { machineLabel } from '../src/host/machine-identity.ts'
import { githubRepositoryNameValid, MNEMON_MACHINE_LABEL_MAX, portableAbsolutePath, syncRepositoryProblem } from '../src/host/protocol.ts'
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
      'https://user:secret@github.com/example/memory.git': 'credentials', 'https://token@github.com/example/memory.git': 'credentials',
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

  it('name a machine and a GitHub repository by one rule on both sides', () => {
    const names = ['Studio', '  Studio  ', '', '   ', 'two\nlines', 'tab\tbed', 'line\u2028separated', 'x'.repeat(MNEMON_MACHINE_LABEL_MAX), 'x'.repeat(MNEMON_MACHINE_LABEL_MAX + 1)]
    for (const name of names) expect(machineNameValid(name), name).toBe(takes(machineLabel, name))
    expect(names.filter(machineNameValid)).toEqual(['Studio', '  Studio  ', 'x'.repeat(MNEMON_MACHINE_LABEL_MAX)])
    const repositories = ['mnemon-memory', ' memory ', 'a.b_c-d', '.', '..', '...', 'a/b', 'has space', '', 'x'.repeat(100), 'x'.repeat(101)]
    for (const name of repositories) expect(repositoryNameValid(name), name).toBe(githubRepositoryNameValid(name.trim()))
    expect(repositories.filter(repositoryNameValid)).toEqual(['mnemon-memory', ' memory ', 'a.b_c-d', '...', 'x'.repeat(100)])
  })
})
