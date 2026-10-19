// Issue #408 record harness, not part of the suite. Copy it into tests/ as credential-lookup.spec.ts and run
//   GIT_CONFIG_GLOBAL=<empty file> GIT_CONFIG_NOSYSTEM=1 pnpm exec vitest run tests/credential-lookup.spec.ts
// once on the branch and once with main's src/host/git-sync.ts, src/host/sync-rules.ts, src/client/sync-view.ts
// and src/client/locales.ts checked out. It prints one JSON line per case: what `git credential fill` finds
// with the exact arguments the channel hands Git, what a sync over a loopback HTTPS remote does, and what
// the settings page says. It writes its own Git configuration under a temporary HOME and reads none of
// the machine's; the token is made up and nothing leaves the machine.
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
const globalConfig = join(home, 'gitconfig')
Object.assign(process.env, { HOME: home, XDG_CONFIG_HOME: join(home, 'xdg'), GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' })

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

it('reports what Git finds and what a sync does', async () => {
  // 1. `git credential fill` with the arguments the status check's ls-remote is given.
  const fills: Array<[string, string, Array<[string, string]>]> = [
    ['GCM user name for github.com', 'https://github.com/octocat/memory.git', [['credential.https://github.com.username', 'alice']]],
    ['user name for one owner', 'https://github.com/octocat/memory.git', [['credential.https://github.com/octocat.username', 'alice']]],
    ['credential.username', 'https://github.com/octocat/memory.git', [['credential.username', 'alice']]],
    ['GCM useHttpPath for dev.azure.com', 'https://dev.azure.com/contoso/project/_git/memory', [['credential.https://dev.azure.com.useHttpPath', 'true']]],
    ['no configuration, Gitee', 'https://gitee.com/someone/memory.git', []],
    ['host written GitHub.com:443', 'https://GitHub.com:443/octocat/memory.git', []],
  ]
  for (const [label, repoUrl, entries] of fills) {
    configure(entries)
    let found = ''
    const run: ProcessRunner = async (command, args, options) => {
      const at = args.indexOf('ls-remote')
      if (at === -1) return runProcess(command, args, options)
      const result = spawnSync(command, [...args.slice(0, at), 'credential', 'fill'], { env: options.env, input: 'url=' + args[at + 2] + '\n\n', encoding: 'utf8' })
      found = result.status === 0
        ? result.stdout.split('\n').filter(line => /^(host|username|password)=/u.test(line)).join(' ')
        : 'exit ' + String(result.status) + ': ' + result.stderr
      return { stdout: '', stderr: '', exitCode: 0 }
    }
    const { sync } = await channel('fill', run)
    await sync.configure({ repoUrl, token: TOKEN })
    await sync.status()
    print({ case: 'credential fill: ' + label, outcome: short(found) })
  }

  // 2. A real sync over a loopback HTTPS remote that takes only the credentials it is told to.
  const remotes: Array<[string, Record<string, unknown>, Array<[string, string]>, string]> = [
    ['takes the token under any name; GCM user name configured', { accounts: [{ user: '*', token: TOKEN }] }, [['credential.https://127.0.0.1.username', 'alice']], ''],
    ['refuses x-access-token, takes oauth2, as Gitee does', { accounts: [{ user: 'oauth2', token: TOKEN }], refuse: ['x-access-token'] }, [], ''],
    ['wants x-token-auth, named in the address, as Bitbucket does', { accounts: [{ user: 'x-token-auth', token: TOKEN }] }, [], 'x-token-auth@'],
  ]
  for (const [label, policy, entries, user] of remotes) {
    const server = gitHttpsRemote(policy)
    const port: number = await server.start()
    releases.push(() => server.close())
    process.env.GIT_SSL_CAINFO = server.certificate
    const { url } = server.repository('team/memory.git') as { url: string }
    configure(entries.map(([key, value]) => [key.replace('https://127.0.0.1', 'https://127.0.0.1:' + String(port)), value]))
    const { sync, sources } = await channel('https', undefined, true)
    let outcome: string
    try {
      await sync.configure({ repoUrl: url.replace('https://', 'https://' + user), token: TOKEN })
      const remote = (await sync.status()).remote
      if (!remote.reachable) outcome = 'status: ' + String(remote.issue) + ', ' + short(remote.error ?? '')
      else {
        await sources!.runtime.mutate('mutate', { action: 'add', target: 'user', content: 'Probe entry', importance: 'normal' }, { confirmed: true })
        const pushed = await sync.push({ message: 'Probe' })
        outcome = 'status reachable; push ' + (pushed.pushed ? 'published ' + pushed.commit.slice(0, 8) : 'not published: ' + short(pushed.reason ?? ''))
      }
    } catch (error) {
      outcome = 'refused: ' + short(error instanceof Error ? error.message : String(error))
    }
    print({ case: 'https: ' + label, outcome })
  }

  // 3. What the page says for an HTTPS remote that refused authentication, with and without a credential.
  for (const [label, url] of [['github.com', 'https://github.com/octocat/memory.git'], ['another host', 'https://gitee.com/someone/memory.git']]) {
    const call = issueText as unknown as (...args: unknown[]) => string
    print({ case: 'page, ' + label + ', credential offered', outcome: call(translateEn, 'auth', url, 'Authentication failed', true) })
    print({ case: 'page, ' + label + ', no credential', outcome: call(translateEn, 'auth', url, 'Authentication failed', false) })
  }
}, 120_000)
