// Issue #392 record harness, not part of the suite. Copy it into tests/ as fill-then-sync.spec.ts, start
// harness/fake-ollama.py in ok mode with its port file port-ok in a directory, and run
//   MNEMON_CLI_PATH=/absolute/path/to/mnemon PROBE392_PORTS=<that directory> pnpm exec vitest run tests/fill-then-sync.spec.ts
// A fill rewrites the update time of every memory it gives a vector. A sync merges the space published before
// the fill into the space after it, and must keep one space: this branch is built on #391, which leaves that
// time out of the comparison.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { resolveConfig } from '../src/host/config.ts'
import { MnemonPackManager } from '../src/host/pack.ts'
import { createStorageRoot } from '../src/host/storage-root.ts'

const CLI = process.env.MNEMON_CLI_PATH ?? 'mnemon'
const OK = `http://127.0.0.1:${readFileSync(join(process.env.PROBE392_PORTS!, 'port-ok'), 'utf8').trim()}`
const directories: string[] = []
afterAll(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }) })

function cli(root: string, args: string[], endpoint: string): string {
  const result = spawnSync(CLI, ['--data-dir', root, '--store', 'gateway', ...args], { encoding: 'utf8', env: { ...process.env, MNEMON_EMBED_ENDPOINT: endpoint, MNEMON_EMBED_PROTOCOL: 'ollama' } })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

it('keeps one space when a sync merges the version published before a fill', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mnemon-392-sync-'))
  directories.push(root)
  for (const text of ['The gateway routes by model family', 'Accounts warm up for a week before routing', 'Keys rotate every quarter']) {
    cli(root, ['remember', text, '--no-diff'], 'http://127.0.0.1:9')
  }
  const at = '2026-10-17T00:00:00.000Z'
  mkdirSync(join(root, 'data'), { recursive: true })
  writeFileSync(join(root, 'data', '.dsh-memory-bodies.json'), JSON.stringify({ version: 1, bodies: [{ id: 'gateway', name: 'AI Gateway routing', description: '', active: true, createdAt: at, updatedAt: at }] }))
  writeFileSync(join(root, 'active'), 'gateway\n')
  const config = resolveConfig({ storageScope: 'custom', dataDir: root, cliPath: CLI })
  const manager = new MnemonPackManager(createStorageRoot(config), config)
  const published = (await manager.exportPack('memory-spaces')).base64
  // Mnemon writes times to the second, so the fill's update time differs from the published one.
  await new Promise(resolve => setTimeout(resolve, 1100))
  console.log('fill', cli(root, ['embed', '--all'], OK).replace(/\s+/gu, ' '))
  await manager.importPack(published, { mode: 'merge' })
  const bodies = (JSON.parse(readFileSync(join(root, 'data', '.dsh-memory-bodies.json'), 'utf8')) as { bodies: Array<{ id: string; name: string }> }).bodies
  console.log('spaces after the merge', JSON.stringify(bodies.map(body => [body.id, body.name])))
  expect(bodies.map(body => body.name)).toEqual(['AI Gateway routing'])
}, 60_000)
