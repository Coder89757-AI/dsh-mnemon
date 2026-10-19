// Issue #408 record harness, not part of the suite. Copy it into tests/ as credential-lookup.spec.ts and run
//   GIT_CONFIG_GLOBAL=<empty file> GIT_CONFIG_NOSYSTEM=1 pnpm exec vitest run tests/credential-lookup.spec.ts
// once on the branch and once with main's src/host/git-sync.ts, src/host/sync-rules.ts, src/client/sync-view.ts,
// src/client/MnemonSyncSection.tsx, src/client/MnemonSyncDialogs.tsx and src/client/locales.ts checked out. It prints
// one JSON line per case: what `git credential fill` finds with the exact arguments the channel hands Git, what a
// sync over a loopback HTTPS remote does and which requests that remote saw, and what the settings page says. Git
// reads only a configuration the harness writes under a temporary HOME, none from the system or the environment,
// goes through no proxy, and reaches "gitee.com" at the loopback remote through `http.curloptResolve`; an older Git
// than 2.37, which has none, would look the real host up, so the harness skips that remote there. The token is made
// up and nothing leaves the machine.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, it } from 'vitest'
// @ts-expect-error The fixture is plain JavaScript.
import { gitHttpsRemote } from '../scripts/fixtures/git-https-remote.mjs'
import { issueText } from '../src/client/sync-view.ts'
import { translateEn } from '../src/client/locales.ts'
import { resolveConfig } from '../src/host/config.ts'
import { MnemonGitSync } from '../src/host/git-sync.ts'
import { MnemonPackManager } from '../src/host/pack.ts'
import { runProcess, type ProcessRunner } from '../src/host/process.ts'
import { createStorageRoot } from '../src/host/storage-root.ts'
import { sourceFixture } from './fixtures/sources.ts'

const TOKEN = 'made-up-token-408'
const directories: string[] = []
const releases: Array<() => Promise<void>> = []
const temporary = (label: string): string => { const d = mkdtempSync(join(tmpdir(), 'mnemon-408-' + label + '-')); directories.push(d); return d }
afterAll(async () => { for (const r of releases.reverse()) await r(); for (const d of directories) rmSync(d, { recursive: true, force: true }) })

const home = temporary('home')
const globalConfig = join(home, '.gitconfig')
// The global file Git reads from HOME before 2.32 and from GIT_CONFIG_GLOBAL after, and nothing else: no system
// file, no configuration from the environment, and no proxy, as in tests/git-sync-credentials.spec.mjs.
writeFileSync(globalConfig, '')
for (const key of ['GIT_CONFIG_SYSTEM', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_SSL_CAINFO', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy']) delete process.env[key]
Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: join(home, 'xdg'), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1', NO_PROXY: '*', no_proxy: '*' })
const [major = 0, minor = 0] = (/(\d+)\.(\d+)/u.exec(spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout ?? '') ?? []).slice(1).map(Number)
const resolvesHosts = major > 2 || (major === 2 && minor >= 37)

function configure(entries: Array<[string, string]>): void {
  writeFileSync(globalConfig, '')
  for (const [key, value] of entries) spawnSync('git', ['config', '--file', globalConfig, key, value])
}

const print = (record: Record<string, unknown>): void => { console.log('PROBE ' + JSON.stringify(record)) }
const short = (text: string): string => text.replaceAll(TOKEN, '<token>').replace(/\s+/gu, ' ').trim().slice(0, 160)

async function channel(label: string, run?: ProcessRunner, withSources = false) {
  const root = temporary(label)
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: '/fake/mnemon', syncEnabled: true })
  const runner = createStorageRoot(config)
  const sources = withSources ? await sourceFixture({ dataDir: root, workspace: temporary(label + '-ws') }) : undefined
  if (sources !== undefined) releases.push(sources.dispose)
  return { root, sources, sync: new MnemonGitSync(runner, config, new MnemonPackManager(runner, config), run) }
}

it('reports what Git finds, what a sync does and what the page says', async () => {
  // 1. `git credential fill` with the arguments the status check's ls-remote is given.
  const fills: Array<[string, string, Array<[string, string]>]> = [
    ['GCM user name for github.com', 'https://github.com/octocat/memory.git', [['credential.https://github.com.username', 'alice']]],
    ['user name for one owner', 'https://github.com/octocat/memory.git', [['credential.https://github.com/octocat.username', 'alice']]],
    ['credential.username', 'https://github.com/octocat/memory.git', [['credential.username', 'alice']]],
    ['GCM useHttpPath for dev.azure.com', 'https://dev.azure.com/contoso/project/_git/memory', [['credential.https://dev.azure.com.useHttpPath', 'true']]],
    ['no configuration, gitee.com', 'https://gitee.com/someone/memory.git', []],
    ['no configuration, another host', 'https://git.example.com/team/memory.git', []],
    ['host written GitHub.com:443', 'https://GitHub.com:443/octocat/memory.git', []],
  ]
  for (const [label, repoUrl, entries] of fills) {
    configure(entries)
    let found = ''
    let given = ''
    const run: ProcessRunner = async (command, args, options) => {
      const at = args.indexOf('ls-remote')
      if (at === -1) return runProcess(command, args, options)
      given = args.slice(0, at).filter(argument => argument.startsWith('credential.') && !argument.startsWith('credential.helper')).join(' ') + ' ' + String(args[at + 2])
      const result = spawnSync(command, [...args.slice(0, at), 'credential', 'fill'], { env: options.env, input: 'url=' + args[at + 2] + '\n\n', encoding: 'utf8' })
      found = result.status === 0
        ? result.stdout.split('\n').filter(line => /^(host|username|password)=/u.test(line)).join(' ')
        : 'exit ' + String(result.status) + ': ' + result.stderr
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    const { sync } = await channel('fill', run)
    await sync.configure({ repoUrl, token: TOKEN })
    await sync.status()
    print({ case: 'credential fill: ' + label, given: given.trim(), outcome: short(found) })
  }

  // 2. A real sync over a loopback HTTPS remote that takes only the credentials it is told to.
  const remotes: Array<[string, Record<string, unknown>, Array<[string, string]>, string, string]> = [
    ['takes the token under any name; GCM user name configured', { accounts: [{ user: '*', token: TOKEN }] }, [['credential.https://127.0.0.1:PORT.username', 'alice']], '127.0.0.1', ''],
    ['gitee.com: refuses x-access-token, takes oauth2', { accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'], names: ['gitee.com'] }, [['http.curloptResolve', 'gitee.com:PORT:127.0.0.1']], 'gitee.com', ''],
    ['a host like it under another name', { accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'] }, [], '127.0.0.1', ''],
    ['the same, oauth2 named in the address', { accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'] }, [], '127.0.0.1', 'oauth2@'],
    ['wants x-token-auth, named in the address, as Bitbucket does', { accounts: [{ user: 'x-token-auth', token: TOKEN }] }, [], '127.0.0.1', 'x-token-auth@'],
  ]
  for (const [label, policy, entries, host, user] of remotes) {
    if (host !== '127.0.0.1' && !resolvesHosts) {
      print({ case: 'https: ' + label, outcome: 'skipped: Git ' + String(major) + '.' + String(minor) + ' has no http.curloptResolve' })
      continue
    }
    const requests: Array<{ user?: string; password: boolean; status: number }> = []
    const server = gitHttpsRemote({ ...policy, report: (event: { user?: string; password: boolean; status: number }) => requests.push(event) })
    const port: number = await server.start()
    releases.push(() => server.close())
    process.env.GIT_SSL_CAINFO = server.certificate
    const { url } = server.repository('team/memory.git', host) as { url: string }
    configure(entries.map(([key, value]) => [key.replace('PORT', String(port)), value.replace('PORT', String(port))]))
    const { sync, sources } = await channel('https', undefined, true)
    let outcome: string
    try {
      await sync.configure({ repoUrl: url.replace('https://', 'https://' + user), token: TOKEN })
      const remote = (await sync.status()).remote
      if (!remote.reachable) outcome = 'status: ' + String(remote.issue) + ', ' + short(remote.error ?? '')
      else {
        await sources!.runtime.mutate('mutate', { action: 'add', target: 'user', content: 'Probe entry', importance: 'normal' }, { confirmed: true })
        const pushed = await sync.push({ message: 'Probe' })
        outcome = 'status reachable; push ' + (pushed.pushed ? 'published' : 'not published: ' + short(pushed.reason ?? ''))
      }
    } catch (error) {
      outcome = 'refused: ' + short(error instanceof Error ? error.message : String(error))
    }
    const seen = [...new Set(requests.filter(request => request.user !== undefined).map(request => request.user + (request.password ? ':<token>' : ':<empty>') + ' ' + String(request.status)))]
    print({ case: 'https: ' + label, outcome, requests: seen })
  }

  // 3. What the page says for an HTTPS remote that refused authentication, by where the credential came from.
  const call = issueText as unknown as (...args: unknown[]) => string
  for (const [label, url] of [['github.com', 'https://github.com/octocat/memory.git'], ['another host', 'https://gitee.com/someone/memory.git']] as const) {
    for (const source of ['github', 'token', 'environment', 'none'] as const) {
      if (source === 'github' && label !== 'github.com') continue
      print({ case: 'page, ' + label + ', ' + source, outcome: call(translateEn, 'auth', url, 'Authentication failed', source) })
    }
  }
}, 180_000)
