import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
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
// Every Git process here reads a configuration this suite writes, never the machine's own, and goes
// through no proxy: a remote that answers for a host by its name must never reach that host.
const PROXIES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy']
const ISOLATION = [
  'HOME', 'XDG_CONFIG_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_SYSTEM', 'GIT_SSL_CAINFO',
  'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', ...PROXIES,
]
let saved = {}
let globalConfig = ''

/**
 * A home of its own for Git: its `.gitconfig` is the global configuration, which Git before 2.32
 * reads from HOME and later Git from GIT_CONFIG_GLOBAL, and no system file is read.
 */
function isolatedHome(label) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-mnemon-' + label + '-'))
  const gitconfig = join(home, '.gitconfig')
  writeFileSync(gitconfig, '')
  return { home, gitconfig, env: { HOME: home, XDG_CONFIG_HOME: join(home, 'xdg'), GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1' } }
}

// The probes run in such a home as well, so this machine's own configuration can neither skip nor fail
// them. Git that is not installed skips the suites; Git that is installed and fails a probe fails them.
const probe = isolatedHome('credential-probe')
const probeEnvironment = { ...process.env, ...probe.env }
const gitVersion = spawnSync('git', ['--version'], { env: probeEnvironment, encoding: 'utf8' })
const gitInstalled = gitVersion.error?.code !== 'ENOENT'
// `git http-backend` answers a request without a repository with a 500 page, and exits 0.
const backend = gitInstalled ? spawnSync('git', ['http-backend'], { env: { ...probeEnvironment, REQUEST_METHOD: 'GET' }, input: '', encoding: 'utf8' }) : undefined
const [major = 0, minor = 0] = (/(\d+)\.(\d+)/u.exec(gitVersion.stdout ?? '') ?? []).slice(1).map(Number)
const gitAtLeast = (wantedMajor, wantedMinor) => major > wantedMajor || (major === wantedMajor && minor >= wantedMinor)
// From Git 2.26 the command line's user name wins; `http.curloptResolve`, which sends a host name to the
// loopback remote so that it answers for that host, came with Git 2.37.
const lastNameWins = gitAtLeast(2, 26)
const resolvesHosts = gitAtLeast(2, 37)
afterAll(() => rmSync(probe.home, { recursive: true, force: true }))

function temporary(label) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-mnemon-' + label + '-'))
  directories.push(directory)
  return directory
}

beforeEach(() => {
  saved = Object.fromEntries(ISOLATION.map(key => [key, process.env[key]]))
  const home = isolatedHome('credential-home')
  directories.push(home.home)
  globalConfig = home.gitconfig
  Object.assign(process.env, home.env)
  for (const key of ['GIT_CONFIG_SYSTEM', 'GIT_SSL_CAINFO', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', ...PROXIES]) delete process.env[key]
  Object.assign(process.env, { NO_PROXY: '*', no_proxy: '*' })
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

describe.skipIf(!gitInstalled)('the credential Git sync hands Git', { timeout: 60_000 }, () => {
  it('runs Git in a home of its own', () => {
    expect(gitVersion.error, gitVersion.stderr).toBeUndefined()
    expect(gitVersion.status, gitVersion.stderr).toBe(0)
  })

  it('is found under the user name the store holds, whatever this machine configures for the host', async () => {
    // Every host keeps x-access-token, which it has always been offered, except one known to refuse it.
    for (const [origin, user] of [['https://github.com', 'x-access-token'], ['https://git.example.com', 'x-access-token'], ['https://gitee.com', 'oauth2']]) {
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
    // Each place in a form every Git reads, and a place only on a Git that reads it: GIT_CONFIG_COUNT
    // came with Git 2.31. A system file is read only with GIT_CONFIG_NOSYSTEM off, and a Git before 2.32
    // ignores GIT_CONFIG_SYSTEM and would read this machine's own, so that place waits for Git 2.32.
    const sources = {
      'an included file': ['carol', () => configure([['include.path', included]])],
      'GIT_CONFIG_PARAMETERS': ['dave', () => { process.env.GIT_CONFIG_PARAMETERS = "'credential.https://github.com.username=dave'" }],
      ...gitAtLeast(2, 31) ? { 'GIT_CONFIG_COUNT': ['erin', () => Object.assign(process.env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.https://github.com.username', GIT_CONFIG_VALUE_0: 'erin' })] } : {},
      ...gitAtLeast(2, 32) ? { 'the system file': ['grace', () => Object.assign(process.env, { GIT_CONFIG_SYSTEM: system, GIT_CONFIG_NOSYSTEM: '0' })] } : {},
    }
    for (const [source, [name, set]] of Object.entries(sources)) {
      configure([])
      set()
      // Git reads the name from that place, and only from it.
      const configured = spawnSync('git', ['config', '--get-urlmatch', 'credential.username', 'https://github.com/octocat/memory.git'], { encoding: 'utf8' })
      expect(configured.stdout.trim(), source + ': ' + configured.stderr).toBe(name)
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
    for (const [repoUrl, name] of [['https://x-token-auth@git.example.com/team/memory.git', 'x-token-auth'], ['https://alice%2Dsmith@git.example.com/team/memory.git', 'alice-smith']]) {
      const filled = []
      const { sync } = await channel('credential-named', fillingRunner(filled))
      await sync.configure({ repoUrl, token: TOKEN })
      await sync.status()
      expect(fields(filled[0].output), repoUrl).toMatchObject({ host: 'git.example.com', username: name, password: TOKEN })
      if (lastNameWins) {
        // The name goes on the command line and the address without it, so Git never offers the name
        // alone first, as it does for a name it finds in the address.
        expect(filled[0].args).toContain('https://git.example.com/team/memory.git')
        expect(filled[0].args).toContain('credential.username=' + name)
      } else {
        expect(filled[0].args).toContain(repoUrl)
      }
    }
  })

  it('stores the host as the address writes it and a token as Git reads it back', async () => {
    const filled = []
    const { sync } = await channel('credential-literal', fillingRunner(filled))
    // Git compares hosts as text, its case and port included, and decodes the stored password.
    await sync.configure({ repoUrl: 'https://Git.Example.com:443/team/memory.git', token: 'p@ss/w%rd:408' })
    await sync.status()
    expect(fields(filled[0].output)).toMatchObject({ host: 'Git.Example.com:443', username: 'x-access-token', password: 'p@ss/w%rd:408' })
  })

  it('names the user on the command line from Git 2.26, and before only where the configuration would name another', async () => {
    const lsRemote = async (version, configured, repoUrl = 'https://git.example.com/team/memory.git') => {
      const commands = []
      const run = async (_command, args) => {
        commands.push([...args])
        if (args.includes('--version')) return { stdout: 'git version ' + version + '\n', stderr: '', exitCode: 0 }
        if (args.includes('--get-urlmatch')) return { stdout: configured, stderr: '', exitCode: configured === '' ? 1 : 0 }
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      const { sync } = await channel('credential-version', run)
      await sync.configure({ repoUrl, token: TOKEN })
      await sync.status()
      const args = commands.find(command => command.includes('ls-remote'))
      expect(args.some(argument => argument.includes(TOKEN)), version).toBe(false)
      return { args, probed: commands.some(command => command.includes('--get-urlmatch')), credential: args.filter(argument => argument.startsWith('credential.')) }
    }
    for (const version of ['2.50.1', '2.26.0']) {
      const plain = await lsRemote(version, '')
      expect(plain.probed, version).toBe(false)
      expect(plain.credential.slice(2), version).toEqual(['credential.useHttpPath=false', 'credential.username=x-access-token'])
      expect(plain.args, version).toContain('https://git.example.com/team/memory.git')
      const named = await lsRemote(version, '', 'https://x-token-auth@git.example.com/team/memory.git')
      expect(named.credential.slice(2), version).toEqual(['credential.useHttpPath=false', 'credential.username=x-token-auth'])
      expect(named.args, version).toContain('https://git.example.com/team/memory.git')
    }
    for (const version of ['2.25.1', '2.20.0']) {
      // Nothing configured for the address: the command main has always run.
      const plain = await lsRemote(version, '')
      expect(plain.probed, version).toBe(true)
      expect(plain.credential, version).toEqual(['credential.helper=', expect.stringMatching(/^credential\.helper=store --file=/u)])
      expect(plain.args, version).toContain('https://git.example.com/team/memory.git')
      // A user name configured for it: the store's name goes into the address, which every Git takes first.
      expect((await lsRemote(version, 'credential.helper manager\ncredential.username alice\n')).args, version).toContain('https://x-access-token@git.example.com/team/memory.git')
      // An empty name is a name too, which this Git would look the token up under.
      expect((await lsRemote(version, 'credential.username \n')).args, version).toContain('https://x-access-token@git.example.com/team/memory.git')
      // The store's own name configured, as a setup that works today may have it: the command main ran.
      for (const [configured, repoUrl] of [['x-access-token', 'https://git.example.com/team/memory.git'], ['oauth2', 'https://gitee.com/someone/memory.git']]) {
        const same = await lsRemote(version, 'credential.username ' + configured + '\n', repoUrl)
        expect(same.credential, version + ' ' + configured).toEqual(['credential.helper=', expect.stringMatching(/^credential\.helper=store --file=/u)])
        expect(same.args, version + ' ' + configured).toContain(repoUrl)
      }
      expect((await lsRemote(version, 'credential.username x-access-token\n', 'https://gitee.com/someone/memory.git')).args, version).toContain('https://oauth2@gitee.com/someone/memory.git')
      // A path added to the lookup, read as Git reads a boolean: it is taken out again, and the address stays as it is.
      for (const [value, added] of [['true', true], ['Yes', true], ['2', true], ['false', false], ['0', false], ['', false]]) {
        const path = await lsRemote(version, 'credential.usehttppath ' + value + '\n')
        expect(path.credential.slice(2), version + ' ' + JSON.stringify(value)).toEqual(added ? ['credential.useHttpPath=false'] : [])
        expect(path.args, version).toContain('https://git.example.com/team/memory.git')
      }
      // An address that names its user is passed as written.
      expect((await lsRemote(version, 'credential.username alice\n', 'https://x-token-auth@git.example.com/team/memory.git')).args, version).toContain('https://x-token-auth@git.example.com/team/memory.git')
    }
  })

  it('takes the address\'s own user name first, oauth2 for gitee.com and x-access-token for every other host', () => {
    expect(credentialTarget('https://github.com/octocat/memory.git')).toEqual({ user: 'x-access-token', name: 'x-access-token', named: false, host: 'github.com', address: 'https://github.com/octocat/memory.git' })
    expect(credentialTarget('https://GitHub.com/octocat/memory.git')).toMatchObject({ user: 'x-access-token', host: 'GitHub.com' })
    expect(credentialTarget('https://alice@github.com/octocat/memory.git')).toEqual({ user: 'alice', name: 'alice', named: true, host: 'github.com', address: 'https://github.com/octocat/memory.git' })
    expect(credentialTarget('https://gitee.com/someone/memory.git')).toMatchObject({ user: 'oauth2', named: false, host: 'gitee.com' })
    expect(credentialTarget('https://Gitee.com:8443/someone/memory.git')).toMatchObject({ user: 'oauth2', host: 'Gitee.com:8443' })
    // A fully qualified name is the same host, and Git still compares it as the address writes it.
    expect(credentialTarget('https://gitee.com./someone/memory.git')).toMatchObject({ user: 'oauth2', host: 'gitee.com.' })
    expect(credentialTarget('https://gitee.example.com/someone/memory.git')).toMatchObject({ user: 'x-access-token' })
    expect(credentialTarget('https://gitlab.example.com:8443/team/memory.git')).toMatchObject({ user: 'x-access-token', host: 'gitlab.example.com:8443' })
    expect(credentialTarget('https://x-token-auth@bitbucket.org/team/memory.git')).toEqual({ user: 'x-token-auth', name: 'x-token-auth', named: true, host: 'bitbucket.org', address: 'https://bitbucket.org/team/memory.git' })
    expect(credentialTarget('https://alice%2Dsmith@git.example.com/memory.git')).toMatchObject({ user: 'alice%2Dsmith', name: 'alice-smith' })
    // A host named like an object's own property is still just a host.
    expect(credentialTarget('https://constructor/team/memory.git')).toMatchObject({ user: 'x-access-token', host: 'constructor' })
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
describe.skipIf(!gitInstalled || !opensslAvailable())('Git sync over HTTPS', { timeout: 120_000 }, () => {
  async function remote(options, host) {
    const requests = []
    const server = gitHttpsRemote({ ...options, report: event => requests.push(event) })
    const port = await server.start()
    releases.push(() => server.close())
    process.env.GIT_SSL_CAINFO = server.certificate
    return { ...server.repository('team/memory.git', host), port, requests }
  }

  /** What one remote saw from Git: the user names it was asked with, and whether a password came along. */
  const signed = requests => requests.filter(request => request.user !== undefined)

  it('serves Git over HTTP with git http-backend', () => {
    expect(backend?.status, backend?.stderr).toBe(0)
  })

  it('syncs past the user name this machine configures for the host, asking as x-access-token alone', async () => {
    const { url, requests } = await remote({ accounts: [{ user: '*', token: TOKEN }] })
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

    // Git asked as x-access-token each time, never as another name, and the token was taken each time
    // it came. From Git 2.26 it always came; an older Git, given the name in the address, first offers
    // the name with an empty password.
    const asked = signed(requests)
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.every(request => request.user === 'x-access-token')).toBe(true)
    expect(asked.filter(request => request.password).every(request => request.status === 200)).toBe(true)
    if (lastNameWins) expect(asked.every(request => request.password)).toBe(true)
    // The token stays in the settings file it was saved to and goes nowhere else, and the user name
    // Git was given stays nowhere at all: not in the mirror's config, its FETCH_HEAD or its logs.
    for (const machine of [machineA, machineB]) {
      expect(holding(join(machine.root, 'state'), TOKEN)).toEqual(['sync-git.json'])
      expect(holding(join(machine.root, 'state'), 'x-access-token')).toEqual([])
      expect(readdirSync(join(machine.root, 'state')).filter(name => name.startsWith('.credentials.'))).toEqual([])
    }
  })

  it.skipIf(!resolvesHosts)('syncs with gitee.com under oauth2, which it takes where it refuses x-access-token', async () => {
    const { url, port, requests } = await remote({ accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'], names: ['gitee.com'] }, 'gitee.com')
    // Git reaches gitee.com here at the loopback remote, which answers for it as the issue's comment found it does.
    configure([['http.curloptResolve', 'gitee.com:' + String(port) + ':127.0.0.1'], ['credential.https://gitee.com:' + String(port) + '.username', 'alice']])
    const machineA = await channel('https-gitee', undefined, true)
    await machineA.sync.configure({ repoUrl: url, token: TOKEN })
    expect((await machineA.sync.status()).remote).toEqual({ reachable: true, branchExists: false })
    expect(await machineA.sync.push({ message: 'To gitee.com' })).toMatchObject({ committed: true, pushed: true })
    expect(signed(requests).every(request => request.user === 'oauth2' && request.password && request.status === 200)).toBe(true)
  })

  it('reports a credential the host refuses as an authentication failure with a credential offered', async () => {
    // A wrong token, and a right one under a name the host will not take it with: Gitee's answer to
    // x-access-token, which a host Git sync knows nothing of gets, as it always did.
    for (const [policy, token] of [[{ accounts: [{ user: '*', token: TOKEN }] }, 'not-' + TOKEN], [{ accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'] }, TOKEN]]) {
      const { url } = await remote(policy)
      const machineA = await channel('https-refused', undefined, true)
      await machineA.sync.configure({ repoUrl: url, token })
      const status = await machineA.sync.status()
      expect(status.remote).toMatchObject({ reachable: false, issue: 'auth' })
      expect(status.config).toMatchObject({ hasToken: true, credentialSource: 'token' })
      expect(status.remote.error).not.toContain(token)
      await expect(machineA.sync.push({ message: 'Refused' })).rejects.toMatchObject({ reason: 'remote-auth' })
    }
  })

  it('publishes under the user name the address names, without offering it alone first', async () => {
    const { url, requests } = await remote({ accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'] })
    const machineA = await channel('https-named', undefined, true)
    await machineA.sync.configure({ repoUrl: url.replace('https://', 'https://oauth2@'), token: TOKEN })
    expect(await machineA.sync.push({ message: 'Named in the address' })).toMatchObject({ committed: true, pushed: true })
    expect(signed(requests).every(request => request.user === 'oauth2')).toBe(true)
    // Given the name on the command line, Git sends it with the token or not at all.
    if (lastNameWins) expect(signed(requests).every(request => request.password)).toBe(true)
  })
})
