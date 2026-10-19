import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitHttpsRemote, opensslAvailable } from '../scripts/fixtures/git-https-remote.mjs'
import { resolveConfig } from '../src/host/config.ts'
import { MnemonGitSync, credentialTarget } from '../src/host/git-sync.ts'
import { MnemonPackManager } from '../src/host/pack.ts'
import { runProcess } from '../src/host/process.ts'
import { createStorageRoot } from '../src/host/storage-root.ts'
import { sourceFixture } from './fixtures/sources.ts'

const TOKEN = 'made-up-token-408'
const directories = []
const releases = []
// Every Git process here reads a configuration this suite writes, never the machine's own.
const ISOLATION = [
  'HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_SYSTEM', 'GIT_SSL_CAINFO',
  'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0',
]
let saved = {}
let globalConfig = ''

const gitAvailable = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0
// `git http-backend` answers a request without a repository with a 500 page, and exits 0.
const httpsAvailable = gitAvailable && opensslAvailable() && spawnSync('git', ['http-backend'], { stdio: 'ignore', env: { ...process.env, REQUEST_METHOD: 'GET' } }).status === 0

function temporary(label) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-mnemon-' + label + '-'))
  directories.push(directory)
  return directory
}

beforeEach(() => {
  saved = Object.fromEntries(ISOLATION.map(key => [key, process.env[key]]))
  const home = temporary('credential-home')
  globalConfig = join(home, 'gitconfig')
  writeFileSync(globalConfig, '')
  Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: join(home, 'xdg'), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' })
  delete process.env.GIT_CONFIG_SYSTEM
  delete process.env.GIT_SSL_CAINFO
})

afterEach(async () => {
  for (const release of releases.splice(0).reverse()) await release()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** This machine's global Git configuration, as a credential manager or a person left it. */
function configure(entries) {
  writeFileSync(globalConfig, '')
  for (const [key, value] of entries) {
    const result = spawnSync('git', ['config', '--file', globalConfig, key, value], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error('git config failed: ' + result.stderr)
  }
}

/** The credential fields `git credential fill` printed. */
function fields(output) {
  return Object.fromEntries(output.split('\n').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}

/**
 * A runner that answers the authenticated `ls-remote` of a status check by asking Git which
 * credential that very argument list finds, while the one-command store exists, and reports no
 * branch, so nothing leaves the machine. Every other command runs as it would.
 */
function fillingRunner(filled) {
  return async (command, args, options) => {
    const at = args.indexOf('ls-remote')
    if (at === -1) return runProcess(command, args, options)
    const result = spawnSync(command, [...args.slice(0, at), 'credential', 'fill'], { env: options.env, input: 'url=' + args[at + 2] + '\n\n', encoding: 'utf8' })
    filled.push({ args: [...args], exitCode: result.status, output: result.stdout + result.stderr })
    return { stdout: '', stderr: '', exitCode: 0 }
  }
}

/** One storage root's sync channel; with Sources when it is to publish memory. */
async function channel(label, run, withSources = false) {
  const root = temporary(label)
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: '/fake/mnemon', syncEnabled: true })
  const runner = createStorageRoot(config)
  let sources
  if (withSources) {
    sources = await sourceFixture({ dataDir: root, workspace: temporary(label + '-workspace') })
    releases.push(sources.dispose)
  }
  const sync = new MnemonGitSync(runner, config, new MnemonPackManager(runner, config), run)
  return { root, sync, sources }
}

describe.skipIf(!gitAvailable)('the credential Git sync hands Git', { timeout: 60_000 }, () => {
  it('is found under the user name the store holds, whatever this machine configures for the host', async () => {
    for (const [origin, user] of [['https://github.com', 'x-access-token'], ['https://git.example.com', 'oauth2']]) {
      const configurations = [
        [], [['credential.username', 'alice']], [['credential.' + origin + '.username', 'alice']],
        [['credential.' + origin + '/team.username', 'alice']], [['credential.' + origin + '/team/memory.git.username', 'alice']],
        [['credential.useHttpPath', 'true']], [['credential.' + origin + '.useHttpPath', 'true'], ['credential.' + origin + '.username', 'alice']],
      ]
      for (const entries of configurations) {
        configure(entries)
        const filled = []
        const { sync } = await channel('credential-fill', fillingRunner(filled))
        await sync.configure({ repoUrl: origin + '/team/memory.git', token: TOKEN })
        await sync.status()
        const label = origin + ' with ' + JSON.stringify(entries)
        expect(filled, label).toHaveLength(1)
        expect(fields(filled[0].output), label + ': ' + filled[0].output).toMatchObject({ protocol: 'https', username: user, password: TOKEN })
      }
    }
  })

  it('is found past a user name from every other place Git reads configuration', async () => {
    const included = join(temporary('credential-included'), 'gitconfig')
    writeFileSync(included, '[credential "https://github.com"]\n\tusername = carol\n')
    const system = join(temporary('credential-system'), 'gitconfig')
    writeFileSync(system, '[credential "https://github.com"]\n\tusername = grace\n')
    const sources = {
      'an included file': () => configure([['include.path', included]]),
      'the system file': () => { delete process.env.GIT_CONFIG_NOSYSTEM; process.env.GIT_CONFIG_SYSTEM = system },
      'GIT_CONFIG_PARAMETERS': () => { process.env.GIT_CONFIG_PARAMETERS = "'credential.https://github.com.username'='dave'" },
      'GIT_CONFIG_COUNT': () => Object.assign(process.env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.https://github.com.username', GIT_CONFIG_VALUE_0: 'erin' }),
    }
    for (const [source, set] of Object.entries(sources)) {
      configure([])
      set()
      const filled = []
      const { sync } = await channel('credential-source', fillingRunner(filled))
      await sync.configure({ repoUrl: 'https://github.com/octocat/memory.git', token: TOKEN })
      await sync.status()
      expect(fields(filled[0].output), source + ': ' + filled[0].output).toMatchObject({ username: 'x-access-token', password: TOKEN })
      for (const key of ['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_SYSTEM']) delete process.env[key]
      process.env.GIT_CONFIG_NOSYSTEM = '1'
    }
  })

  it('gives the GitHub sign-in to github.com under x-access-token, past a configured user name', async () => {
    configure([['credential.https://github.com.username', 'alice']])
    const filled = []
    const { sync } = await channel('credential-grant', fillingRunner(filled))
    sync.useGitHubAuth({ grant: async () => ({ version: 1, accessToken: 'gho_made_up_408', login: 'octocat', savedAt: '2026-10-19T00:00:00.000Z' }) })
    await sync.configure({ repoUrl: 'https://github.com/octocat/memory.git' })
    expect((await sync.status()).config.credentialSource).toBe('github')
    expect(fields(filled[0].output)).toMatchObject({ host: 'github.com', username: 'x-access-token', password: 'gho_made_up_408' })
  })

  it('offers the token under the user name an address names, as Bitbucket addresses do', async () => {
    configure([['credential.https://git.example.com.username', 'alice']])
    const filled = []
    const { sync } = await channel('credential-named', fillingRunner(filled))
    await sync.configure({ repoUrl: 'https://x-token-auth@git.example.com/team/memory.git', token: TOKEN })
    await sync.status()
    expect(fields(filled[0].output)).toMatchObject({ host: 'git.example.com', username: 'x-token-auth', password: TOKEN })
    // The address goes to Git as it was written, and no other name comes with it.
    expect(filled[0].args).toContain('https://x-token-auth@git.example.com/team/memory.git')
    expect(filled[0].args.some(argument => argument.startsWith('credential.username='))).toBe(false)
  })

  it('stores the host as the address writes it and a token as Git reads it back', async () => {
    const filled = []
    const { sync } = await channel('credential-literal', fillingRunner(filled))
    // Git compares hosts as text, its case and port included, and decodes the stored password.
    await sync.configure({ repoUrl: 'https://Git.Example.com:443/team/memory.git', token: 'p@ss/w%rd:408' })
    await sync.status()
    expect(fields(filled[0].output)).toMatchObject({ host: 'Git.Example.com:443', username: 'oauth2', password: 'p@ss/w%rd:408' })
  })

  it('names the user on the command line from Git 2.26, and in the address before, where a configured name came first', async () => {
    for (const [version, expected] of [['2.50.1', 'command line'], ['2.26.0', 'command line'], ['2.25.1', 'address'], ['2.20.0', 'address']]) {
      const commands = []
      const run = async (_command, args) => {
        commands.push([...args])
        return { stdout: args.includes('--version') ? 'git version ' + version + '\n' : '', stderr: '', exitCode: 0 }
      }
      const { sync } = await channel('credential-version', run)
      await sync.configure({ repoUrl: 'https://git.example.com/team/memory.git', token: TOKEN })
      await sync.status()
      const lsRemote = commands.find(args => args.includes('ls-remote'))
      expect(lsRemote, version).toBeDefined()
      expect(lsRemote.includes('credential.username=oauth2'), version).toBe(expected === 'command line')
      expect(lsRemote.includes('https://oauth2@git.example.com/team/memory.git'), version).toBe(expected === 'address')
      expect(lsRemote.includes('credential.useHttpPath=false'), version).toBe(true)
      // The token itself never reaches an argument.
      expect(lsRemote.some(argument => argument.includes(TOKEN)), version).toBe(false)
    }
  })

  it('takes x-access-token for github.com, the address\'s own user name first, and oauth2 for any other host', () => {
    expect(credentialTarget('https://github.com/octocat/memory.git')).toEqual({ user: 'x-access-token', named: false, host: 'github.com' })
    expect(credentialTarget('https://GitHub.com/octocat/memory.git')).toEqual({ user: 'x-access-token', named: false, host: 'GitHub.com' })
    expect(credentialTarget('https://alice@github.com/octocat/memory.git')).toEqual({ user: 'alice', named: true, host: 'github.com' })
    expect(credentialTarget('https://gitee.com/someone/memory.git')).toEqual({ user: 'oauth2', named: false, host: 'gitee.com' })
    expect(credentialTarget('https://gitlab.example.com:8443/team/memory.git')).toEqual({ user: 'oauth2', named: false, host: 'gitlab.example.com:8443' })
    expect(credentialTarget('https://x-token-auth@bitbucket.org/team/memory.git')).toEqual({ user: 'x-token-auth', named: true, host: 'bitbucket.org' })
    expect(credentialTarget('https://alice%40example.com@git.example.com/memory.git')).toEqual({ user: 'alice%40example.com', named: true, host: 'git.example.com' })
  })
})

/** Every file below one directory that holds `text`, by path relative to it. */
function holding(directory, text) {
  const found = []
  const walk = path => {
    for (const name of readdirSync(path)) {
      const file = join(path, name)
      if (statSync(file).isDirectory()) walk(file)
      else if (readFileSync(file, 'latin1').includes(text)) found.push(file.slice(directory.length + 1))
    }
  }
  walk(directory)
  return found
}

// A real Git against a real HTTPS remote on loopback, which takes only the credentials it is given.
describe.skipIf(!httpsAvailable)('Git sync over HTTPS', { timeout: 120_000 }, () => {
  async function remote(options) {
    const requests = []
    const server = gitHttpsRemote({ ...options, report: event => requests.push(event) })
    await server.start()
    releases.push(() => server.close())
    process.env.GIT_SSL_CAINFO = server.certificate
    return { ...server.repository('team/memory.git'), requests }
  }

  it('syncs through a host that refuses x-access-token, past the user name this machine configures for it', async () => {
    const { url, requests } = await remote({ accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'] })
    configure([['credential.' + new URL(url).origin + '.username', 'alice'], ['credential.useHttpPath', 'true']])
    const machineA = await channel('https-a', undefined, true)
    await machineA.sync.configure({ repoUrl: url, token: TOKEN })
    expect((await machineA.sync.status()).remote).toEqual({ reachable: true, branchExists: false })
    await machineA.sources.runtime.mutate('mutate', { action: 'add', target: 'user', content: 'Synced over HTTPS with a token', importance: 'normal' }, { confirmed: true })
    expect(await machineA.sync.push({ message: 'Over HTTPS' })).toMatchObject({ committed: true, pushed: true })

    const machineB = await channel('https-b', undefined, true)
    await machineB.sync.configure({ repoUrl: url, token: TOKEN })
    expect(await machineB.sync.pull()).toMatchObject({ imported: true })
    expect(readFileSync(join(machineB.root, 'runtime', 'USER.md'), 'utf8')).toContain('Synced over HTTPS with a token')

    // Git asked as oauth2 with the token each time, and never as another name or without the token.
    const signed = requests.filter(request => request.user !== undefined)
    expect(signed.length).toBeGreaterThan(0)
    expect(signed.every(request => request.user === 'oauth2' && request.password && request.status === 200)).toBe(true)
    // The token stays in the settings file it was saved to and goes nowhere else, and the user name
    // Git was given stays nowhere at all: not in the mirror's config, its FETCH_HEAD or its logs.
    for (const machine of [machineA, machineB]) {
      expect(holding(join(machine.root, 'state'), TOKEN)).toEqual(['sync-git.json'])
      expect(holding(join(machine.root, 'state'), 'oauth2')).toEqual([])
      expect(readdirSync(join(machine.root, 'state')).filter(name => name.startsWith('.credentials.'))).toEqual([])
    }
  })

  it('reports a credential the host refuses as an authentication failure with a credential offered', async () => {
    const { url } = await remote({ accounts: [{ user: 'oauth2', token: TOKEN }] })
    const machineA = await channel('https-refused', undefined, true)
    await machineA.sync.configure({ repoUrl: url, token: 'not-' + TOKEN })
    const status = await machineA.sync.status()
    expect(status.remote).toMatchObject({ reachable: false, issue: 'auth' })
    expect(status.config).toMatchObject({ hasToken: true, credentialSource: 'token' })
    expect(status.remote.error).not.toContain('not-' + TOKEN)
    await expect(machineA.sync.push({ message: 'Refused' })).rejects.toMatchObject({ reason: 'remote-auth' })
  })

  it('publishes under the user name the address names', async () => {
    const { url, requests } = await remote({ accounts: [{ user: 'x-token-auth', token: TOKEN }] })
    const machineA = await channel('https-named', undefined, true)
    await machineA.sync.configure({ repoUrl: url.replace('https://', 'https://x-token-auth@'), token: TOKEN })
    expect(await machineA.sync.push({ message: 'Named in the address' })).toMatchObject({ committed: true, pushed: true })
    expect(requests.filter(request => request.status === 200).every(request => request.user === 'x-token-auth')).toBe(true)
  })
})
