// Issue #370 record harness, not part of the suite. Copy it into tests/ as real-cli-sync.spec.ts and run
//   MNEMON_CLI_PATH=/absolute/path/to/mnemon pnpm exec vitest run tests/real-cli-sync.spec.ts
// The real Mnemon CLI writes and reads one space on two machines that sync through a real bare repository
// with the Git sync channel, and the spaces each machine holds are printed after every round.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, it } from 'vitest'
import { resolveConfig } from '../src/host/config.ts'
import { MnemonPackManager } from '../src/host/pack.ts'
import { createStorageRoot } from '../src/host/storage-root.ts'
import { MnemonGitSync } from '../src/host/git-sync.ts'
import { sourceFixture } from './fixtures/sources.ts'

const CLI = process.env.MNEMON_CLI_PATH ?? 'mnemon'
const directories: string[] = []
const releases: Array<() => Promise<void>> = []
const temporary = (label: string) => { const d = mkdtempSync(join(tmpdir(), 'mnemon-370-' + label + '-')); directories.push(d); return d }
afterAll(async () => { for (const r of releases) await r(); for (const d of directories) rmSync(d, { recursive: true, force: true }) })

async function machine(label: string, repository: string) {
  const root = temporary(label)
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: CLI, syncEnabled: true })
  const runner = createStorageRoot(config)
  const sources = await sourceFixture({ dataDir: root, workspace: temporary(label + '-ws') })
  releases.push(sources.dispose)
  const packs = new MnemonPackManager(runner, config)
  const sync = new MnemonGitSync(runner, config, packs)
  sync.configure({ repoUrl: repository, authorName: 'Mnemon Test', authorEmail: 'test@localhost' })
  return { root, sync }
}
const cli = (root: string, ...args: string[]) => execFileSync(CLI, ['--data-dir', root, ...args], { encoding: 'utf8' })
const spaces = (root: string) => (JSON.parse(readFileSync(join(root, 'data', '.dsh-memory-bodies.json'), 'utf8')) as { bodies: Array<{ id: string; name: string }> }).bodies

it('counts the spaces two machines hold while they recall and sync', async () => {
  const repository = join(temporary('remote'), 'sync.git')
  execFileSync('git', ['init', '--bare', '--quiet', repository])
  const a = await machine('a', repository)
  const b = await machine('b', repository)
  // A real space on A, written by the CLI the Native provider runs.
  cli(a.root, 'store', 'create', 'gateway')
  for (const fact of ['The gateway routes by model family', 'Accounts warm up for a week before routing', 'Routing falls back to the cheaper model at night']) cli(a.root, '--store', 'gateway', 'remember', fact, '--cat', 'fact')
  mkdirSync(join(a.root, 'data'), { recursive: true })
  const at = new Date().toISOString()
  writeFileSync(join(a.root, 'data', '.dsh-memory-bodies.json'), JSON.stringify({ version: 1, bodies: [{ id: 'gateway', name: 'AI Gateway routing', description: '', active: true, createdAt: at, updatedAt: at }] }, null, 2) + '\n')
  await a.sync.push({})
  await b.sync.push({})
  const rows: string[] = ['start: A ' + spaces(a.root).length + ', B ' + spaces(b.root).length]
  for (let round = 1; round <= 3; round += 1) {
    for (const id of spaces(b.root).map(space => space.id)) cli(b.root, '--store', id, 'recall', 'routing')
    await b.sync.push({})
    for (const id of spaces(a.root).map(space => space.id)) cli(a.root, '--store', id, 'recall', 'routing')
    await a.sync.push({})
    rows.push('round ' + round + ': A ' + spaces(a.root).length + ', B ' + spaces(b.root).length)
  }
  console.log('COUNTS ' + rows.join(' | '))
}, 240_000)

it('counts the spaces while one machine remembers something each round and the other only recalls', async () => {
  const repository = join(temporary('remote-w'), 'sync.git')
  execFileSync('git', ['init', '--bare', '--quiet', repository])
  const a = await machine('aw', repository)
  const b = await machine('bw', repository)
  cli(a.root, 'store', 'create', 'gateway')
  for (const fact of ['The gateway routes by model family', 'Accounts warm up for a week before routing']) cli(a.root, '--store', 'gateway', 'remember', fact, '--cat', 'fact')
  mkdirSync(join(a.root, 'data'), { recursive: true })
  const at = new Date().toISOString()
  writeFileSync(join(a.root, 'data', '.dsh-memory-bodies.json'), JSON.stringify({ version: 1, bodies: [{ id: 'gateway', name: 'AI Gateway routing', description: '', active: true, createdAt: at, updatedAt: at }] }, null, 2) + '\n')
  await a.sync.push({})
  await b.sync.push({})
  const count = (root: string) => spaces(root).map(space => (JSON.parse(cli(root, '--store', space.id, 'status')) as { total_insights?: number; active_insights?: number }))
  const rows: string[] = ['start: A ' + spaces(a.root).length + ', B ' + spaces(b.root).length]
  for (let round = 1; round <= 4; round += 1) {
    cli(a.root, '--store', 'gateway', 'remember', 'Learned in round ' + round + ': routing rule number ' + round, '--cat', 'fact')
    await a.sync.push({})
    for (const id of spaces(b.root).map(space => space.id)) cli(b.root, '--store', id, 'recall', 'routing')
    await b.sync.push({})
    await a.sync.push({})
    rows.push('round ' + round + ': A ' + spaces(a.root).length + ', B ' + spaces(b.root).length)
  }
  console.log('WRITES ' + rows.join(' | '))
  console.log('B STATUS ' + JSON.stringify(count(b.root)))
}, 300_000)

async function pair(label: string) {
  const repository = join(temporary('remote-' + label), 'sync.git')
  execFileSync('git', ['init', '--bare', '--quiet', repository])
  const a = await machine(label + 'a', repository)
  const b = await machine(label + 'b', repository)
  cli(a.root, 'store', 'create', 'gateway')
  for (const fact of ['The gateway routes by model family', 'Accounts warm up for a week before routing']) cli(a.root, '--store', 'gateway', 'remember', fact, '--cat', 'fact')
  mkdirSync(join(a.root, 'data'), { recursive: true })
  const at = new Date().toISOString()
  writeFileSync(join(a.root, 'data', '.dsh-memory-bodies.json'), JSON.stringify({ version: 1, bodies: [{ id: 'gateway', name: 'AI Gateway routing', description: '', active: true, createdAt: at, updatedAt: at }] }, null, 2) + '\n')
  await a.sync.push({})
  await b.sync.push({})
  return { a, b }
}
const totals = (root: string) => spaces(root).map(space => { const s = JSON.parse(cli(root, '--store', space.id, 'status')) as { total_insights: number; deleted_insights?: number }; return String(s.total_insights) + (s.deleted_insights ? '+' + String(s.deleted_insights) + 'd' : '') }).join('/')

it('counts the spaces while both machines remember something each round', async () => {
  const { a, b } = await pair('both')
  const rows: string[] = ['start: A ' + spaces(a.root).length + ', B ' + spaces(b.root).length]
  for (let round = 1; round <= 4; round += 1) {
    cli(a.root, '--store', 'gateway', 'remember', 'Machine A learned rule ' + round + ' about routing windows', '--cat', 'fact')
    for (const id of spaces(b.root).map(space => space.id)) cli(b.root, '--store', id, 'remember', 'Machine B learned rule ' + round + ' about account warmup', '--cat', 'fact')
    await a.sync.push({})
    await b.sync.push({})
    await a.sync.push({})
    rows.push('round ' + round + ': A ' + spaces(a.root).length + ' (' + totals(a.root) + '), B ' + spaces(b.root).length + ' (' + totals(b.root) + ')')
  }
  console.log('BOTH ' + rows.join(' | '))
}, 300_000)

it('counts the spaces while one machine forgets once, remembers each round, and the other recalls', async () => {
  const { a, b } = await pair('forget')
  const rows: string[] = ['start: A ' + spaces(a.root).length + ', B ' + spaces(b.root).length]
  for (let round = 1; round <= 4; round += 1) {
    if (round === 2) {
      const first = (JSON.parse(cli(a.root, '--store', 'gateway', 'search', 'Accounts warm up', '--limit', '1')) as { results?: Array<{ id: string }> } | Array<{ id: string }>)
      const id = Array.isArray(first) ? first[0]?.id : first.results?.[0]?.id
      if (id) cli(a.root, '--store', 'gateway', 'forget', id)
    }
    cli(a.root, '--store', 'gateway', 'remember', 'Machine A learned rule ' + round + ' about routing windows', '--cat', 'fact')
    await a.sync.push({})
    for (const id of spaces(b.root).map(space => space.id)) cli(b.root, '--store', id, 'recall', 'routing')
    await b.sync.push({})
    await a.sync.push({})
    rows.push('round ' + round + ': A ' + spaces(a.root).length + ' (' + totals(a.root) + '), B ' + spaces(b.root).length + ' (' + totals(b.root) + ')')
  }
  console.log('FORGET ' + rows.join(' | '))
}, 300_000)
