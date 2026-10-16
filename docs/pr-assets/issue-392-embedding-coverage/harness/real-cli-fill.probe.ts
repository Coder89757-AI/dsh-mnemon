// Issue #392 record harness, not part of the suite. Copy it into plugins/dsh-mnemon-source-memory-spaces/tests/ as
// real-cli-fill.spec.ts, start harness/fake-ollama.py three times (ok; missing; slow 0.75) with their port files
// port-ok, port-missing and port-slow in one directory, and run
//   MNEMON_CLI_PATH=/absolute/path/to/mnemon PROBE392_PORTS=<that directory> pnpm exec vitest run tests/real-cli-fill.spec.ts
// The real Mnemon CLI behind the Memory Spaces service's embedding status and fill; each case prints what it saw.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { resolveMemorySpacesConfig } from '../src/config.ts'
import { createRunner } from '../src/runner.ts'
import { createRegistry, createService } from './providers.ts'

const CLI = process.env.MNEMON_CLI_PATH ?? 'mnemon'
const PORTS = process.env.PROBE392_PORTS!
const endpoint = (mode: string) => `http://127.0.0.1:${readFileSync(join(PORTS, `port-${mode}`), 'utf8').trim()}`
const DOWN = 'http://127.0.0.1:9'
const at = '2026-10-17T00:00:00.000Z'
const directories: string[] = []
afterAll(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }) })

function root(label: string): string {
  const directory = mkdtempSync(join(tmpdir(), `mnemon-392-${label}-`))
  directories.push(directory)
  return directory
}
function cli(dataDir: string, store: string, args: string[], url = DOWN): string {
  const result = spawnSync(CLI, ['--data-dir', dataDir, '--store', store, ...args], { encoding: 'utf8', env: { ...process.env, MNEMON_EMBED_ENDPOINT: url, MNEMON_EMBED_PROTOCOL: 'ollama' } })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}
// Memories written while no embedding service answers have no vector.
function remember(dataDir: string, store: string, count: number): void {
  for (let index = 0; index < count; index += 1) cli(dataDir, store, ['remember', `${store} note ${index}: the deploy of service ${index} runs on host ${index * 7}`, '--no-diff'])
}
function registry(dataDir: string, bodies: Array<{ id: string; name: string; active?: boolean }>, active: string): void {
  mkdirSync(join(dataDir, 'data'), { recursive: true })
  writeFileSync(join(dataDir, 'data', '.dsh-memory-bodies.json'), JSON.stringify({ version: 1, bodies: bodies.map(body => ({ active: true, ...body, description: '', createdAt: at, updatedAt: at })) }))
  writeFileSync(join(dataDir, 'active'), `${active}\n`)
}
function service(dataDir: string, url: string) {
  const config = resolveMemorySpacesConfig({ cliPath: CLI, dataDir, embedding: { enabled: true, endpoint: url, model: 'nomic-embed-text', protocol: 'ollama' } })
  return createService(createRunner(config), config, createRegistry(createRunner(config), true))
}
const stores = (dataDir: string) => readdirSync(join(dataDir, 'data')).filter(name => !name.startsWith('.')).sort()

it('counts every Mnemon Native space, and creates no Store doing so', async () => {
  const dataDir = root('status')
  remember(dataDir, 'default', 3)
  remember(dataDir, 'work', 2)
  cli(dataDir, 'work', ['embed', '--all'], endpoint('ok'))
  remember(dataDir, 'work', 1)
  remember(dataDir, 'notes', 1)
  mkdirSync(join(dataDir, 'data', 'broken'), { recursive: true })
  writeFileSync(join(dataDir, 'data', 'broken', 'mnemon.db'), 'not a database')
  // The active file names a Store that does not exist, and Gone is registered without a database.
  registry(dataDir, [{ id: 'default', name: 'Default' }, { id: 'work', name: 'Work' }, { id: 'notes', name: 'Notes', active: false }, { id: 'broken', name: 'Broken' }, { id: 'gone', name: 'Gone' }], 'ghost')
  const before = stores(dataDir)
  const status = await service(dataDir, endpoint('ok')).embeddingStatus()
  console.log('status', JSON.stringify(status))
  console.log('stores before', JSON.stringify(before), 'after', JSON.stringify(stores(dataDir)))
  expect(stores(dataDir)).toEqual(before)
}, 60_000)

it('asks for the runtime in a scratch directory while no space has a database', async () => {
  const dataDir = root('empty')
  registry(dataDir, [{ id: 'gone', name: 'Gone' }], 'ghost')
  const status = await service(dataDir, endpoint('ok')).embeddingStatus()
  console.log('no database', JSON.stringify(status), 'stores', JSON.stringify(stores(dataDir)))
  expect(stores(dataDir)).toEqual([])
}, 60_000)

it('fills in more than one call\'s hundred vectors', async () => {
  const dataDir = root('many')
  remember(dataDir, 'work', 130)
  registry(dataDir, [{ id: 'work', name: 'Work' }], 'work')
  const started = Date.now()
  const result = await service(dataDir, endpoint('ok')).embedMissing('work')
  console.log('130 missing', JSON.stringify(result), `${Date.now() - started} ms`)
  expect(result).toMatchObject({ filled: 130, remaining: 0 })
}, 120_000)

it('says the service returned no vector when it does not serve the model', async () => {
  const dataDir = root('missing')
  remember(dataDir, 'work', 4)
  registry(dataDir, [{ id: 'work', name: 'Work' }], 'work')
  const result = await service(dataDir, endpoint('missing')).embedMissing('work')
  console.log('model missing', JSON.stringify(result))
  expect(result).toMatchObject({ filled: 0, remaining: 4, stopped: 'refused' })
}, 60_000)

it('keeps only Mnemon\'s reason when the service is down', async () => {
  const dataDir = root('down')
  remember(dataDir, 'work', 2)
  registry(dataDir, [{ id: 'work', name: 'Work' }], 'work')
  const failure = await service(dataDir, DOWN).embedMissing('work').then(() => 'resolved', (error: Error) => error.message)
  console.log('service down', JSON.stringify(failure))
  expect(failure).toMatch(/^Ollama embedding provider not available at http:\/\/127\.0\.0\.1:9/u)
}, 60_000)

it('lets other memory work run between the steps of a slow fill, and stops once its minute is up', async () => {
  const dataDir = root('slow')
  remember(dataDir, 'work', 130)
  remember(dataDir, 'notes', 2)
  registry(dataDir, [{ id: 'work', name: 'Work' }, { id: 'notes', name: 'Notes' }], 'work')
  const spaces = service(dataDir, endpoint('slow'))
  const started = Date.now()
  const fill = spaces.embedMissing('work').then(value => ({ value, ms: Date.now() - started }))
  await new Promise(resolve => setTimeout(resolve, 1000))
  // What a recall in a turn, or the Memory Spaces page, does meanwhile: a CLI call on the same storage root.
  const asked = Date.now()
  const found = await spaces.search({ query: 'deploy host', memoryBodyIds: ['notes'] })
  const waited = Date.now() - asked
  const filled = await fill
  console.log('slow fill', JSON.stringify(filled), 'search waited', waited, 'ms and found', found.results.length)
  expect(waited).toBeLessThan(15_000)
  expect(filled.value).toMatchObject({ stopped: 'time' })
}, 180_000)
